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
