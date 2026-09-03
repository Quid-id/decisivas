// DECISIVAS — quem é quem no painel de edição (etapa 9).
//
// O painel não tem login próprio: quem autentica é o **Cloudflare Access**, com
// e-mail e código de uso único, sobre uma lista de e-mails que a equipe
// administra no painel do Cloudflare. Não há senha para guardar, não há
// cadastro novo e não há usuário no banco.
//
// O que este módulo faz é a outra metade dessa história: **conferir**, dentro do
// Worker, o crachá que o Access emite. Sem isso, bastaria alguém chamar
// `/api/cms/*` direto (sem passar pelo Access) para gravar no repositório: o
// Access protege o caminho, e o Worker protege a rota.
//
// O crachá é um JWT assinado (RS256) que chega em `Cf-Access-Jwt-Assertion` ou
// no cookie `CF_Authorization`. Confere-se, em ordem:
//
//   1. o emissor (`iss`) é um domínio de equipe do Access;
//   2. a assinatura fecha com uma das chaves públicas que esse emissor publica
//      em `/cdn-cgi/access/certs`;
//   3. o `aud` é o da aplicação do Access que protege o /admin (`ACCESS_AUD`,
//      segredo no painel) — é o que impede o crachá de OUTRA aplicação da mesma
//      conta de servir aqui;
//   4. não expirou (`exp`), e já vale (`nbf`).
//
// O e-mail sai do próprio JWT, não do cabeçalho de conveniência: cabeçalho se
// escreve à mão, assinatura não. Ele é usado para o autor do commit — que é a
// auditoria de quem editou — e para nada além disso. Nenhum dado de quem edita
// é gravado em banco (regra 5).
//
// SIMULAR_ACESSO é instrumento de desenvolvimento, como SIMULAR_MODELO: vive em
// `.dev.vars`, nunca em `wrangler.toml`, e vale um e-mail para exercitar as
// rotas sem Access na frente.

const CABECALHO_JWT = "Cf-Access-Jwt-Assertion";
const COOKIE_JWT = "CF_Authorization";
// O e-mail que o Access também manda por cabeçalho. Serve para conferir
// coerência com o JWT, nunca como fonte de identidade.
const CABECALHO_EMAIL = "Cf-Access-Authenticated-User-Email";

// As chaves públicas do emissor mudam de tempo em tempo. Guardadas na memória
// do isolate por uma hora: sem isso, toda chamada ao painel buscaria o JWKS.
const CHAVES = new Map();
const VALIDADE_DAS_CHAVES = 60 * 60 * 1000;

class ErroDeAcesso extends Error {
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo;
  }
}

function deBase64Url(texto) {
  const base = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const cheio = base + "=".repeat((4 - (base.length % 4)) % 4);
  const bruto = atob(cheio);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function jsonDeBase64Url(texto) {
  return JSON.parse(new TextDecoder().decode(deBase64Url(texto)));
}

function doCookie(request, nome) {
  const cru = request.headers.get("Cookie") ?? "";
  for (const parte of cru.split(";")) {
    const [chave, ...resto] = parte.trim().split("=");
    if (chave === nome) return resto.join("=");
  }
  return null;
}

function crachaDaRequisicao(request) {
  return request.headers.get(CABECALHO_JWT) ?? doCookie(request, COOKIE_JWT);
}

// Emissor aceitável: só um domínio de equipe do Access. Sem isto, um JWT
// assinado por qualquer servidor que o atacante controle passaria — bastaria
// apontar o `iss` para lá.
function emissorValido(iss) {
  try {
    const url = new URL(iss);
    return url.protocol === "https:" && url.hostname.endsWith(".cloudflareaccess.com");
  } catch (e) {
    return false;
  }
}

async function chavesDoEmissor(iss) {
  const guardado = CHAVES.get(iss);
  const agora = Date.now();
  if (guardado && agora - guardado.desde < VALIDADE_DAS_CHAVES) return guardado.keys;

  const r = await fetch(`${iss}/cdn-cgi/access/certs`);
  if (!r.ok) throw new ErroDeAcesso(`certificados do Access indisponíveis (HTTP ${r.status})`);
  const corpo = await r.json();
  const keys = Array.isArray(corpo?.keys) ? corpo.keys : [];
  if (!keys.length) throw new ErroDeAcesso("o Access não devolveu chave pública nenhuma");
  CHAVES.set(iss, { desde: agora, keys });
  return keys;
}

async function assinaturaFecha(jwk, dados, assinatura) {
  const chave = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, assinatura, dados);
}

// Devolve o e-mail de quem está autenticado, ou lança ErroDeAcesso. Nunca
// devolve "anônimo": rota do CMS sem crachá é 401, e ponto.
async function identifica(request, env) {
  // Desenvolvimento: sem Access na frente, um e-mail declarado em .dev.vars.
  if (env.SIMULAR_ACESSO) return { email: String(env.SIMULAR_ACESSO), simulado: true };

  const cracha = crachaDaRequisicao(request);
  if (!cracha) throw new ErroDeAcesso("sem crachá do Access na requisição");

  const partes = String(cracha).split(".");
  if (partes.length !== 3) throw new ErroDeAcesso("crachá do Access malformado");

  let cabecalho;
  let corpo;
  try {
    cabecalho = jsonDeBase64Url(partes[0]);
    corpo = jsonDeBase64Url(partes[1]);
  } catch (e) {
    throw new ErroDeAcesso("crachá do Access ilegível");
  }

  if (cabecalho.alg !== "RS256") throw new ErroDeAcesso(`assinatura em ${cabecalho.alg}, não RS256`);
  if (!emissorValido(corpo.iss)) throw new ErroDeAcesso("emissor fora do Access");

  const aud = env.ACCESS_AUD;
  if (!aud) throw new ErroDeAcesso("ACCESS_AUD não configurado no Worker");
  const audDoCracha = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud];
  if (!audDoCracha.includes(aud)) throw new ErroDeAcesso("crachá de outra aplicação do Access");

  const agora = Math.floor(Date.now() / 1000);
  // Trinta segundos de folga: relógio de servidor não bate ao segundo.
  const folga = 30;
  if (typeof corpo.exp === "number" && corpo.exp + folga < agora) throw new ErroDeAcesso("crachá expirado");
  if (typeof corpo.nbf === "number" && corpo.nbf - folga > agora) throw new ErroDeAcesso("crachá ainda não vale");

  const dados = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
  const assinatura = deBase64Url(partes[2]);
  const chaves = await chavesDoEmissor(corpo.iss);
  const candidatas = cabecalho.kid ? chaves.filter((k) => k.kid === cabecalho.kid) : chaves;
  let fechou = false;
  for (const jwk of candidatas.length ? candidatas : chaves) {
    if (await assinaturaFecha(jwk, dados, assinatura)) {
      fechou = true;
      break;
    }
  }
  if (!fechou) throw new ErroDeAcesso("assinatura do crachá não fecha");

  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!email) throw new ErroDeAcesso("crachá sem e-mail");

  // Coerência com o cabeçalho de conveniência, quando ele vem: divergência
  // indica proxy no meio reescrevendo cabeçalho, e é melhor recusar.
  const doCabecalho = String(request.headers.get(CABECALHO_EMAIL) ?? "").trim().toLowerCase();
  if (doCabecalho && doCabecalho !== email) throw new ErroDeAcesso("e-mail do cabeçalho diverge do crachá");

  return { email, simulado: false };
}

export { identifica, ErroDeAcesso, CABECALHO_JWT, CABECALHO_EMAIL };
