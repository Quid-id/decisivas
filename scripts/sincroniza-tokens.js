// DECISIVAS — gera public/tokens.css a partir de brand/tokens.css.
//
// Roda automaticamente no build ([build] em wrangler.toml), antes de
// `wrangler dev` e `wrangler deploy` — inclusive nos deploys do Cloudflare
// acionados por push. Ninguém precisa (nem deve) copiar à mão:
// public/tokens.css é gerado e está fora do versionamento.

const fs = require("node:fs");

const ORIGEM = "brand/tokens.css";
const DESTINO = "public/tokens.css";

const cabecalho =
  "/* ARQUIVO GERADO no build a partir de brand/tokens.css — NÃO EDITAR AQUI.\n" +
  "   Edite brand/tokens.css; a cópia é refeita por scripts/sincroniza-tokens.js. */\n";

const conteudo = fs.readFileSync(ORIGEM, "utf8");
fs.writeFileSync(DESTINO, cabecalho + conteudo, "utf8");
console.log(`tokens sincronizados: ${ORIGEM} → ${DESTINO}`);

// Também gera public/versao-acervo.js a partir de data/versao-acervo.txt.
// É a marca de versão do cache do navegador (nível 2): a carga oficial do
// banco atualiza o .txt no mesmo commit, e o deploy leva a nova marca ao site.
const versao = fs.readFileSync("data/versao-acervo.txt", "utf8").trim();
fs.writeFileSync(
  "public/versao-acervo.js",
  `// ARQUIVO GERADO no build a partir de data/versao-acervo.txt — NÃO EDITAR AQUI.\nwindow.VERSAO_ACERVO = ${JSON.stringify(versao)};\n`,
  "utf8"
);
console.log(`versão do acervo publicada: ${versao}`);
