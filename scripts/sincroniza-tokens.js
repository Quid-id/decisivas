// DECISIVAS — gera public/tokens.css a partir de brand/tokens.css.
//
// Roda automaticamente no build ([build] em wrangler.toml), antes de
// `wrangler dev` e `wrangler deploy` — inclusive nos deploys do Cloudflare
// acionados por push. Ninguém precisa (nem deve) copiar à mão:
// public/tokens.css é gerado e está fora do versionamento.

const fs = require("node:fs");
const { escreveSeMudou } = require("./escreve-se-mudou");

const ORIGEM = "brand/tokens.css";
const DESTINO = "public/tokens.css";

const cabecalho =
  "/* ARQUIVO GERADO no build a partir de brand/tokens.css — NÃO EDITAR AQUI.\n" +
  "   Edite brand/tokens.css; a cópia é refeita por scripts/sincroniza-tokens.js. */\n";

const conteudo = fs.readFileSync(ORIGEM, "utf8");
escreveSeMudou(DESTINO, cabecalho + conteudo);
console.log(`tokens sincronizados: ${ORIGEM} → ${DESTINO}`);

// Também gera public/versao-acervo.js, com os dois valores de que o cache do
// navegador (nível 2) precisa:
//
// 1. VERSAO_ACERVO, de dados/versao-acervo.txt: a carga oficial do banco
//    atualiza o .txt no mesmo commit, e o deploy leva a nova marca ao site.
// 2. CACHE_HABILITADO, de CACHE_ENABLED no wrangler.toml: é o que faz o
//    interruptor alcançar o navegador sem custo de requisição. A variável
//    vive em [vars], então mudá-la exige commit + deploy — o mesmo ciclo que
//    regenera este arquivo, o que mantém os dois lados sempre coerentes.
const versao = fs.readFileSync("dados/versao-acervo.txt", "utf8").trim();
// Em produção o valor vem de [vars] no wrangler.toml. Em desenvolvimento o
// .dev.vars sobrescreve o ambiente do Worker, então é lido primeiro para que
// o front local não discorde do servidor local.
function leCacheEnabled() {
  for (const [arquivo, padrao] of [
    [".dev.vars", /^\s*CACHE_ENABLED\s*=\s*"?([^"\s]*)"?/m],
    ["wrangler.toml", /^\s*CACHE_ENABLED\s*=\s*"([^"]*)"/m],
  ]) {
    if (!fs.existsSync(arquivo)) continue;
    const achado = fs.readFileSync(arquivo, "utf8").match(padrao);
    if (achado) return achado[1];
  }
  return "true";
}
const cacheHabilitado = leCacheEnabled() !== "false";
escreveSeMudou(
  "public/versao-acervo.js",
  "// ARQUIVO GERADO no build (scripts/sincroniza-tokens.js) — NÃO EDITAR AQUI.\n" +
    `window.VERSAO_ACERVO = ${JSON.stringify(versao)};\n` +
    `window.CACHE_HABILITADO = ${cacheHabilitado};\n`
);
console.log(`versão do acervo publicada: ${versao} | cache no navegador: ${cacheHabilitado ? "ligado" : "desligado"}`);

// E publica os vocabulários fechados para o front, a partir da mesma fonte que
// o Worker e os scripts leem (dados/vocabulario.json). É o que impede as listas
// de divergirem entre servidor e tela.
const vocabulario = JSON.parse(fs.readFileSync("dados/vocabulario.json", "utf8"));
escreveSeMudou(
  "public/vocabulario.js",
  "// ARQUIVO GERADO no build a partir de dados/vocabulario.json — NÃO EDITAR AQUI.\n" +
    `window.VOCABULARIO = ${JSON.stringify(vocabulario)};\n`
);
console.log(
  `vocabulário publicado: ${vocabulario.publicos.length} públicos, ${vocabulario.macronarrativas.length} temas`
);

// E monta os prompts do agente a partir das planilhas de regra e do documento
// de formatos (etapa 5). O prompt de sistema vive num só lugar — prompts/ —, e
// o build o compõe em prompts/gerado/, que é o que o Worker importa e o que
// scripts/testa-modelos.js lê. Ver scripts/gera-prompts.js.
require("./gera-prompts")
  .main()
  .catch((e) => {
    console.error("FALHA ao gerar os prompts:", e.message);
    process.exit(1);
  });
