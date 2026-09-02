// DECISIVAS — escrita idempotente de arquivo gerado no build.
//
// Por que existe: o build roda dentro do `wrangler dev`, que fica de olho nos
// diretórios de origem e reinicia o Worker quando algum arquivo muda. Se o
// build reescrever sua própria saída a cada execução, ele se dispara de novo —
// e o Worker reinicia no meio das requisições, que respondem 503. Escrevendo só
// quando o conteúdo muda de verdade, o ciclo se fecha na segunda passada.

const fs = require("node:fs");
const path = require("node:path");

function escreveSeMudou(caminho, conteudo) {
  const atual = fs.existsSync(caminho) ? fs.readFileSync(caminho, "utf8") : null;
  if (atual === conteudo) return false;
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, conteudo, "utf8");
  return true;
}

module.exports = { escreveSeMudou };
