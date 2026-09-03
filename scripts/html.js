// DECISIVAS — utilidades de montagem de HTML no build.
//
// Um lugar só para escapar texto e para aplicar os parciais, usado por
// scripts/gera-paginas.js e scripts/gera-caminhos.js. Todo texto de conteúdo
// passa por `escapa` antes de entrar no HTML: o conteúdo é editado por pessoas,
// em JSON, e um `<` perdido não pode virar marcação.

const fs = require("node:fs");
// O escape vive em src/escapa-html.cjs, compartilhado com o Worker: a
// pré-visualização do painel precisa escapar igual para achar o texto na tela.
const { escapa } = require("../src/escapa-html.cjs");

function troca(html, marcadores) {
  let resultado = html;
  for (const [chave, valor] of Object.entries(marcadores)) {
    resultado = resultado.split(`{{${chave}}}`).join(valor);
  }
  return resultado;
}

// Marcador esquecido é erro de build, não detalhe: a tela iria ao ar com um
// buraco. Nenhum marcador sobrevive à geração.
function confereMarcadores(html, origem) {
  const restantes = [...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
  if (restantes.length) {
    throw new Error(`${origem}: marcador não substituído: ${[...new Set(restantes)].join(", ")}`);
  }
}

function leParciais() {
  return {
    cabeca: fs.readFileSync("parciais/cabeca.html", "utf8").trim(),
    cabecalho: fs.readFileSync("parciais/cabecalho.html", "utf8").trim(),
    rodape: fs.readFileSync("parciais/rodape.html", "utf8").trim(),
    compartilhar: fs.readFileSync("parciais/compartilhar.html", "utf8").trim(),
    explorar: fs.readFileSync("parciais/explorar.html", "utf8").trim(),
    interacao: fs.readFileSync("parciais/interacao.html", "utf8").trim(),
  };
}

// O que falta redigir aparece na tela como caixa [preencher], nunca como texto
// inventado (regra 2 do CLAUDE.md). O texto da pendência é montado por
// scripts/interface.js, com o formato que vem da configuração; aqui só fica a
// lista, para o build imprimir no fim.
const PENDENTES = [];

function ehPendente(valor) {
  return !valor || String(valor).trim() === "" || String(valor).startsWith("[preencher");
}

function registraPendencia(oQue) {
  PENDENTES.push(oQue);
}

function pendentes() {
  return [...new Set(PENDENTES)];
}

module.exports = { escapa, troca, confereMarcadores, leParciais, ehPendente, registraPendencia, pendentes };
