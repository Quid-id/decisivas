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

// A marca de versão do acervo NÃO é mais publicada para o front: ela existia
// para o cache do navegador da tela de resultado, que saiu na etapa 8A junto
// com a geração de página por modelo. `dados/versao-acervo.txt` continua sendo
// a marca da carga no repositório, lida na hora de carregar o banco.

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

// Monta as telas: as fixas, as 20 páginas de caminho de conteudo/*.json, o
// Sobre e a privacidade. As fontes ficam em paginas/, parciais/ e conteudo/;
// public/ é só saída.
require("./gera-paginas")
  .main()
  .catch((e) => {
    console.error("FALHA ao gerar as telas:", e.message);
    process.exit(1);
  });
