// DECISIVAS — o repositório como banco de conteúdo (etapa 9).
//
// O painel não tem armazenamento próprio: **o estado é o repositório**. Salvar
// é gravar o arquivo no GitHub, o que vira um commit na main; o deploy
// automático publica em cerca de um minuto. Não existe segundo banco de
// conteúdo, e por isso não existe divergência possível entre o que o painel
// mostra e o que o build lê.
//
// O token é um segredo de runtime (`GITHUB_TOKEN`, no painel do Cloudflare),
// refinado para este repositório e com permissão de conteúdo. Ele **nunca**
// aparece em resposta, em log ou em mensagem de erro: o que sai daqui é o
// resultado da operação, não a credencial que a fez (regra 1).
//
// O autor do commit é o e-mail de quem editou, vindo do crachá do Access
// (src/acesso.js). É a auditoria de quem mudou o quê — e é só isso que se
// guarda de quem edita.
//
// SIMULAR_GITHUB é instrumento de desenvolvimento, como SIMULAR_MODELO: vive em
// `.dev.vars`, nunca em `wrangler.toml`. Com ele, a LEITURA continua real, mas
// pelo conteúdo cru do ramo (o repositório é público, e a API limita duramente
// quem chama sem token), e a GRAVAÇÃO fica na memória do isolate — o bastante
// para exercitar validação, mensagem de commit, histórico e reversão sem
// escrever de verdade e sem precisar de token.

const API = "https://api.github.com";
// Só a simulação de desenvolvimento usa: o conteúdo cru do ramo, sem passar
// pela API (que limita duramente quem chama sem token). Não serve para gravar,
// e por isso não existe fora da simulação.
const CRU = "https://raw.githubusercontent.com";
// A API exige um User-Agent identificável.
const AGENTE = "decisivas-cms";
// O prefixo que marca commit feito pelo painel. É por ele que o histórico
// separa o que o CMS gravou do que veio por push.
const PREFIXO = "CMS:";

class ErroDoGitHub extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status ?? 502;
  }
}

// Gravações simuladas, por caminho de arquivo. Só existe com SIMULAR_GITHUB.
const SIMULADAS = [];

function repo(env) {
  const valor = String(env.CMS_REPO ?? "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(valor)) {
    throw new ErroDoGitHub("CMS_REPO não configurado (esperado owner/repositorio)", 500);
  }
  return valor;
}

function ramo(env) {
  return String(env.CMS_RAMO ?? "main").trim();
}

function ehSimulado(env) {
  return String(env.SIMULAR_GITHUB ?? "") === "true";
}

function cabecalhos(env, { comCorpo = false } = {}) {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": AGENTE,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Sem token, a API só serve leitura de repositório público — é o que a
  // simulação de desenvolvimento usa.
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  if (comCorpo) h["Content-Type"] = "application/json";
  return h;
}

async function chama(env, caminho, opcoes = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: cabecalhos(env, { comCorpo: Boolean(opcoes.body) }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    // A mensagem da API entra sem o corpo inteiro: ela nomeia o problema
    // (arquivo inexistente, sha desatualizado, token sem permissão) e não
    // carrega credencial.
    throw new ErroDoGitHub(corpo?.message ?? `HTTP ${r.status}`, r.status === 404 ? 404 : 502);
  }
  return corpo;
}

// ---------------------------------------------------------------------------
// Base64 com UTF-8 correto
// ---------------------------------------------------------------------------
//
// `btoa` só aceita bytes; texto com acento tem de ser codificado antes. Fazer
// isso errado corromperia "ç" e "ã" no conteúdo — e o conteúdo é o produto.

function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bruto = "";
  for (const b of bytes) bruto += String.fromCharCode(b);
  return btoa(bruto);
}

function deBase64(base64) {
  const bruto = atob(String(base64).replace(/\s+/g, ""));
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

// Lê um arquivo do ramo de publicação. Devolve o texto e o `sha` do blob — o
// sha é o que a gravação exige, e é o que impede sobrescrever cegamente uma
// edição de outra pessoa: se o arquivo mudou no meio, a API recusa.
async function leArquivo(env, caminho) {
  if (ehSimulado(env)) {
    // A gravação mais recente daquele arquivo vale como estado.
    const ultima = [...SIMULADAS].reverse().find((g) => g.caminho === caminho);
    if (ultima) return { texto: ultima.texto, sha: ultima.sha };
    // E o estado inicial vem do conteúdo cru do ramo: em simulação não há sha
    // real para gravar, então não faz sentido gastar a cota da API.
    const r = await fetch(`${CRU}/${repo(env)}/${ramo(env)}/${encodeURI(caminho)}`);
    if (r.ok) return { texto: await r.text(), sha: "simulado-inicial" };
    throw new ErroDoGitHub(`${caminho} não encontrado no ramo ${ramo(env)} (HTTP ${r.status})`, 404);
  }
  const dados = await chama(
    env,
    `/repos/${repo(env)}/contents/${encodeURI(caminho)}?ref=${encodeURIComponent(ramo(env))}`
  );
  if (dados.type !== "file" || typeof dados.content !== "string") {
    throw new ErroDoGitHub(`${caminho} não é um arquivo`, 400);
  }
  return { texto: deBase64(dados.content), sha: dados.sha };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function mensagemDeCommit({ colecao, item, email }) {
  return `${PREFIXO} ${colecao} · ${item} · ${email}`;
}

// Grava conteúdo já em base64 (é assim que a API recebe, e é assim que imagem
// chega do painel). `sha` ausente significa arquivo novo.
async function gravaBase64(env, { caminho, base64, sha, colecao, item, email }) {
  const mensagem = mensagemDeCommit({ colecao, item, email });

  if (ehSimulado(env)) {
    const falso = {
      caminho,
      texto: /\.(json|txt|md|css|html|js)$/.test(caminho) ? deBase64(base64) : null,
      sha: `simulado-${SIMULADAS.length + 1}`,
      mensagem,
      email,
      quando: new Date().toISOString(),
      simulado: true,
    };
    SIMULADAS.push(falso);
    return { commit: falso.sha, mensagem, simulado: true };
  }

  if (!env.GITHUB_TOKEN) {
    throw new ErroDoGitHub("GITHUB_TOKEN não configurado no Worker", 500);
  }

  const corpo = {
    message: mensagem,
    content: base64,
    branch: ramo(env),
    // O autor é quem editou. O committer fica com a identidade do token, que é
    // o que de fato empurrou — separar os dois é o que torna a auditoria útil.
    author: { name: email, email },
  };
  if (sha) corpo.sha = sha;

  const dados = await chama(env, `/repos/${repo(env)}/contents/${encodeURI(caminho)}`, {
    method: "PUT",
    body: JSON.stringify(corpo),
  });
  return { commit: dados.commit?.sha ?? null, mensagem, simulado: false };
}

async function gravaTexto(env, { caminho, texto, sha, colecao, item, email }) {
  return gravaBase64(env, { caminho, base64: paraBase64(texto), sha, colecao, item, email });
}

// ---------------------------------------------------------------------------
// Histórico e reversão
// ---------------------------------------------------------------------------

// Os últimos commits do painel, do mais novo para o mais antigo. Só os que
// começam com o prefixo: push de quem programa não é edição de conteúdo.
async function historico(env, { limite = 20 } = {}) {
  if (ehSimulado(env)) {
    return [...SIMULADAS]
      .reverse()
      .slice(0, limite)
      .map((g) => ({
        commit: g.sha,
        mensagem: g.mensagem,
        autor: g.email,
        quando: g.quando,
        arquivo: g.caminho,
        simulado: true,
      }));
  }
  const dados = await chama(
    env,
    `/repos/${repo(env)}/commits?sha=${encodeURIComponent(ramo(env))}&per_page=${Math.min(100, limite * 3)}`
  );
  return (Array.isArray(dados) ? dados : [])
    .filter((c) => String(c.commit?.message ?? "").startsWith(PREFIXO))
    .slice(0, limite)
    .map((c) => ({
      commit: c.sha,
      mensagem: String(c.commit.message).split("\n")[0],
      autor: c.commit?.author?.email ?? null,
      quando: c.commit?.author?.date ?? null,
      simulado: false,
    }));
}

// A versão anterior de um arquivo: o penúltimo commit que o tocou. É o que a
// reversão grava de volta, num commit NOVO — nada de reescrever histórico.
async function versaoAnterior(env, caminho) {
  if (ehSimulado(env)) {
    // A versão anterior à primeira gravação simulada é o estado do ramo — que é
    // o que ela é de verdade: o commit anterior ao do painel.
    const daquele = SIMULADAS.filter((g) => g.caminho === caminho);
    if (!daquele.length) throw new ErroDoGitHub(`${caminho} não tem versão anterior`, 400);
    if (daquele.length === 1) {
      const r = await fetch(`${CRU}/${repo(env)}/${ramo(env)}/${encodeURI(caminho)}`);
      if (!r.ok) throw new ErroDoGitHub(`${caminho} não tem versão anterior`, 400);
      return { texto: await r.text(), commit: "simulado-inicial" };
    }
    return { texto: daquele[daquele.length - 2].texto, commit: daquele[daquele.length - 2].sha };
  }
  const commits = await chama(
    env,
    `/repos/${repo(env)}/commits?sha=${encodeURIComponent(ramo(env))}` +
      `&path=${encodeURI(caminho)}&per_page=2`
  );
  if (!Array.isArray(commits) || commits.length < 2) {
    throw new ErroDoGitHub(`${caminho} não tem versão anterior neste ramo`, 400);
  }
  const anterior = commits[1].sha;
  const dados = await chama(
    env,
    `/repos/${repo(env)}/contents/${encodeURI(caminho)}?ref=${encodeURIComponent(anterior)}`
  );
  return { texto: deBase64(dados.content), commit: anterior };
}

// O commit que está no topo do ramo. Comparado com o commit que gerou o site
// publicado, é o que diz se o deploy já passou (src/cms.js).
async function commitDoTopo(env) {
  if (ehSimulado(env)) {
    // Sem gravação simulada ainda, o topo é o do site: em simulação não há
    // deploy, e dizer "publicando" à toa seria mentir sobre o estado.
    const ultimo = SIMULADAS[SIMULADAS.length - 1];
    return ultimo ? ultimo.sha : null;
  }
  const dados = await chama(env, `/repos/${repo(env)}/commits/${encodeURIComponent(ramo(env))}`);
  return dados.sha ?? null;
}

export {
  ErroDoGitHub,
  PREFIXO,
  leArquivo,
  gravaTexto,
  gravaBase64,
  historico,
  versaoAnterior,
  commitDoTopo,
  paraBase64,
  deBase64,
  mensagemDeCommit,
  ehSimulado,
};
