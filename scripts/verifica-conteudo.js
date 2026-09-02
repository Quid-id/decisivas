// DECISIVAS — verificação de conteúdo (etapa 8C).
//
// Duas conferências, as duas rodando no build e as duas capazes de derrubá-lo:
//
//   1. ESTRUTURA. Os 4 públicos, os 5 temas de cada um, os campos
//      obrigatórios e os limites de cada bloco. Quem faz é
//      `scripts/conteudo.js`, a única porta de entrada do texto das páginas;
//      aqui ele é chamado para que uma execução solta deste script confira o
//      mesmo que o build.
//
//   2. TERMOS BLOQUEADOS. Varredura de todo o texto de `conteudo/*.json` e de
//      `dados/configuracao.json` contra a lista de `BLOCKED_TERMS`. O
//      resultado esperado é ZERO ocorrências: a regra 4 do CLAUDE.md não
//      admite nome de figura política, partido ou direção de voto em nenhum
//      texto. Achando qualquer um, o build falha nomeando ARQUIVO, CAMPO e
//      TERMO.
//
// A lista vive em variável de ambiente, fora do repositório — ela nomeia
// figuras e partidos, e o repositório é público. Em produção, é uma variável
// de build no painel do Cloudflare (docs/06-operacao.md).
//
// Sem a variável, o que acontece depende de ONDE o build está rodando:
//
//   - build de esteira da branch que publica (a main): **falha**. Publicar sem
//     a varredura é publicar sem a rede que sustenta a regra 4, e a falta da
//     variável no painel passa a ser um erro visível, não um aviso no log.
//   - build de pré-visualização (qualquer outra branch): só avisa. As
//     variáveis de build ficam no ambiente de produção do painel, e o build de
//     branch não as recebe — reprovar aí seria reprovar por um detalhe da
//     esteira, não por conteúdo.
//   - máquina de quem desenvolve: só avisa, para `wrangler dev` rodar sem a
//     lista à mão.
//
// COMO RODAR SOZINHO
//
//   BLOCKED_TERMS="Sobrenome|Outro Nome|SIGLA" node scripts/verifica-conteudo.js
//
// COMO A COMPARAÇÃO FUNCIONA
//
// Sempre por palavra inteira: sigla curta não dispara dentro de outra palavra
// ("PT" não casa em "parte", "PL" não casa em "plano").
//
//   - SIGLA (só maiúsculas, admitindo conector curto em minúscula, como em
//     `PCdoB`): comparação SENSÍVEL a maiúsculas. "PT" casa com "PT" e não com
//     "pt"; do contrário, qualquer sigla de duas letras viraria falso positivo.
//   - NOME (tudo o mais: pessoas, partidos escritos por extenso, adjetivos
//     como "petista"): comparação INSENSÍVEL a maiúsculas e a acentos, porque
//     nome próprio aparece escrito de todo jeito.
//
// ATENÇÃO à lista: alguns nomes de partido são também palavra comum do
// português — "Podemos", "Cidadania", "Solidariedade", "Avante". Como nome, a
// comparação é insensível a maiúsculas, então uma frase que use a palavra no
// sentido comum derruba o build. Hoje nenhuma das quatro aparece no conteúdo.
// Se aparecer, a saída mostra o campo e a frase: o caminho é reescrever a
// frase, não afrouxar a varredura.

const fs = require("node:fs");
const path = require("node:path");
const conteudo = require("./conteudo");

const PASTA_CONTEUDO = "conteudo";
const CONFIGURACAO = "dados/configuracao.json";

// ---------------------------------------------------------------------------
// A lista
// ---------------------------------------------------------------------------

// Rodando em CI? As esteiras de build marcam a própria presença no ambiente.
// O build do Cloudflare define CI; as outras variáveis cobrem Workers Builds,
// Pages e GitHub Actions, para a conferência não depender de uma só.
const MARCAS_DE_CI = ["CI", "WORKERS_CI", "CF_PAGES", "GITHUB_ACTIONS"];

// E de qual branch? Cada esteira publica o nome numa variável própria.
const MARCAS_DE_RAMO = ["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH", "GITHUB_REF_NAME", "BRANCH"];

// A branch que publica: é a dela que o site vai ao ar, e só nela a falta da
// lista derruba o build.
const RAMO_DE_PUBLICACAO = "main";

function marcaLigada(marca) {
  const valor = String(process.env[marca] ?? "").trim().toLowerCase();
  return valor !== "" && valor !== "false" && valor !== "0";
}

function ehCI() {
  return MARCAS_DE_CI.some(marcaLigada);
}

function ramoDoBuild() {
  for (const marca of MARCAS_DE_RAMO) {
    const valor = String(process.env[marca] ?? "").trim();
    if (valor) return valor;
  }
  return "";
}

// Build que publica: esteira, na branch principal. É o único lugar onde a
// falta da lista é erro — no de pré-visualização as variáveis de produção do
// painel não chegam.
function ehBuildQuePublica() {
  return ehCI() && ramoDoBuild() === RAMO_DE_PUBLICACAO;
}

// Uma linha no começo do log dizendo em que ambiente o build está e se a lista
// chegou. Existe porque o log do build do Cloudflare é o único lugar onde essa
// resposta aparece: o check do GitHub só traz o número do build e um link para
// o painel, sem texto nenhum. **Nunca imprime os termos** — só quantos são: o
// log do build é visível a quem tem acesso ao painel, e a lista nomeia figuras
// e partidos.
function ambienteDoBuild() {
  const marcas = MARCAS_DE_CI.filter(marcaLigada);
  const onde = marcas.length ? `esteira (${marcas.join(", ")})` : "máquina local (nenhuma marca de esteira)";
  const ramo = `ramo ${ramoDoBuild() || "desconhecido"}`;
  const quantos = listaDeTermos().length;
  const lista = quantos
    ? `BLOCKED_TERMS: ${quantos} termo(s)`
    : "BLOCKED_TERMS: AUSENTE ou vazia — no painel ela vive no ambiente de PRODUÇÃO " +
      "(Settings → Builds → Variables and secrets), e o build de pré-visualização de branch " +
      "não recebe as variáveis de produção; no build da main, ausente derruba a publicação";
  return `${onde} | ${ramo} | ${lista}`;
}

function listaDeTermos() {
  return (process.env.BLOCKED_TERMS ?? "")
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
}

// Sigla: só maiúsculas, admitindo conectores curtos em minúscula no meio
// (`PCdoB`). Sem espaço — "União Brasil" é nome, não sigla.
function ehSigla(termo) {
  return /^\p{Lu}{2,}(?:\p{Ll}{1,3}\p{Lu}+)*$/u.test(termo);
}

function semAcento(texto) {
  return String(texto).normalize("NFD").replace(/\p{M}/gu, "");
}

function escapaRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cada termo virou um padrão de palavra inteira, com o modo de comparação que
// ele pede. O padrão é montado uma vez, e não a cada campo.
function padroes(lista) {
  return lista.map((termo) => {
    const sigla = ehSigla(termo);
    const alvo = sigla ? termo : semAcento(termo);
    return {
      termo,
      sigla,
      padrao: new RegExp(
        `(?<![\\p{L}\\p{N}])${escapaRegex(alvo)}(?![\\p{L}\\p{N}])`,
        sigla ? "gu" : "giu"
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// A varredura
// ---------------------------------------------------------------------------

// Caminho legível do campo, do tipo `paginas["trabalho digno"].resumo[2]`.
function juntaCaminho(base, chave) {
  if (typeof chave === "number") return `${base}[${chave}]`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) return base ? `${base}.${chave}` : chave;
  return `${base}["${chave}"]`;
}

function textos(valor, caminho, destino) {
  if (typeof valor === "string") {
    destino.push({ campo: caminho, texto: valor });
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => textos(item, juntaCaminho(caminho, i), destino));
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [chave, dentro] of Object.entries(valor)) {
      textos(dentro, juntaCaminho(caminho, chave), destino);
    }
  }
}

function arquivosVarridos() {
  const doConteudo = fs
    .readdirSync(PASTA_CONTEUDO)
    .filter((a) => a.endsWith(".json"))
    .sort()
    .map((a) => path.join(PASTA_CONTEUDO, a));
  return [...doConteudo, CONFIGURACAO];
}

// Um trecho curto em volta da ocorrência, para a equipe achar a frase.
function trecho(texto, posicao) {
  const inicio = Math.max(0, posicao - 50);
  return (inicio ? "…" : "") + texto.slice(inicio, posicao + 50).replace(/\s+/g, " ") + "…";
}

function varre() {
  const lista = listaDeTermos();
  if (!lista.length) {
    return { rodou: false, publica: ehBuildQuePublica(), termos: 0, arquivos: 0, campos: 0, ocorrencias: [] };
  }

  const compilados = padroes(lista);
  const ocorrencias = [];
  const arquivos = arquivosVarridos();
  let campos = 0;

  for (const arquivo of arquivos) {
    const encontrados = [];
    textos(JSON.parse(fs.readFileSync(arquivo, "utf8")), "", encontrados);
    campos += encontrados.length;
    for (const { campo, texto } of encontrados) {
      for (const { termo, sigla, padrao } of compilados) {
        const alvo = sigla ? texto : semAcento(texto);
        padrao.lastIndex = 0;
        for (const achado of alvo.matchAll(padrao)) {
          ocorrencias.push({ arquivo, campo, termo, trecho: trecho(texto, achado.index) });
        }
      }
    }
  }

  return {
    rodou: true,
    publica: ehBuildQuePublica(),
    termos: lista.length,
    siglas: compilados.filter((c) => c.sigla).length,
    arquivos: arquivos.length,
    campos,
    ocorrencias,
  };
}

// ---------------------------------------------------------------------------

function verifica({ vocabulario }) {
  console.log(`ambiente do build: ${ambienteDoBuild()}`);

  // 1. Estrutura: a mesma checagem que o build já fazia.
  const { publicos } = conteudo.carrega(vocabulario);
  const paginas = Object.values(publicos).reduce((n, p) => n + Object.keys(p.paginas).length, 0);

  // 2. Termos bloqueados.
  const resultado = varre();
  if (!resultado.rodou && resultado.publica) {
    throw new Error(
      `BLOCKED_TERMS ausente ou vazia no build que publica (esteira, ramo ${RAMO_DE_PUBLICACAO}).\n` +
        "Sem a lista, a varredura de termos bloqueados não roda, e publicar sem ela é\n" +
        "publicar sem a rede que sustenta a regra 4. Defina a variável nas variáveis de\n" +
        "build do painel do Cloudflare (docs/06-operacao.md, seção da varredura)."
    );
  }
  if (resultado.ocorrencias.length) {
    const lista = resultado.ocorrencias
      .map((o) => `  ${o.arquivo} · ${o.campo} · "${o.termo}"\n    ${o.trecho}`)
      .join("\n");
    throw new Error(
      `termo bloqueado no conteúdo (${resultado.ocorrencias.length} ocorrência(s)).\n` +
        "A regra 4 não admite nome de figura política, partido ou direção de voto em\n" +
        `nenhum texto — reescreva a frase, não afrouxe a varredura:\n${lista}`
    );
  }

  return { paginas, ...resultado };
}

module.exports = { verifica, varre, ehSigla, listaDeTermos, ambienteDoBuild, ehBuildQuePublica };

if (require.main === module) {
  const vocabulario = JSON.parse(fs.readFileSync("dados/vocabulario.json", "utf8"));
  try {
    const r = verifica({ vocabulario });
    console.log(
      `estrutura: ${r.paginas} páginas conferidas, ${vocabulario.publicos.length} públicos × ` +
        `${vocabulario.macronarrativas.length} temas`
    );
    if (!r.rodou) {
      // Execução na mão sem a lista é engano de quem rodou: o script existe
      // para varrer. No build é diferente — lá só o da main reprova.
      console.log(
        "varredura NÃO executada: BLOCKED_TERMS ausente ou vazia. " +
          'Rode com a lista: BLOCKED_TERMS="Nome|SIGLA" node scripts/verifica-conteudo.js'
      );
      process.exit(1);
    }
    console.log(
      `varredura: ${r.termos} termos (${r.siglas} siglas, sensíveis a maiúsculas) em ` +
        `${r.arquivos} arquivos e ${r.campos} campos de texto — ${r.ocorrencias.length} ocorrência(s)`
    );
  } catch (e) {
    console.error(`FALHA na verificação de conteúdo: ${e.message}`);
    process.exit(1);
  }
}
