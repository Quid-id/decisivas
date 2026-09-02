// DECISIVAS — o build recusa publicar tela com texto escrito em código.
//
// A regra desta entrega: nenhum texto fixo, rótulo, nome de imagem ou link é
// escrito dentro de template ou de script. Tudo o que aparece na tela vem de
//
//   dados/configuracao.json   textos e rótulos da interface
//   conteudo/*.json           as 20 páginas, o Sobre e a privacidade
//   dados/vocabulario.json    públicos, temas, cores e slugs
//
// mais os nomes das pautas, que são o vocabulário fechado do acervo e chegam
// aqui pela lista que a geração das páginas devolve.
//
// Este script lê o que foi publicado em public/, junta toda palavra visível —
// texto e também alt, title, placeholder, aria-label e as descrições do <head>
// — e confere se cada uma existe nas fontes acima. Palavra de fora é falha de
// build, não aviso: se passasse, o CMS da etapa 9 não teria como editá-la.
//
// O que NÃO é conferido: o que está dentro de <script> e <style>, os comentários
// de HTML e os números. Script é comportamento, comentário não aparece na tela,
// e número vem do conteúdo ou da contagem do acervo.

const fs = require("node:fs");
const path = require("node:path");

const SAIDA = "public";
const FONTES = ["dados/configuracao.json", "dados/vocabulario.json"];
const PASTA_CONTEUDO = "conteudo";

// Palavra: sequência de letras (com acento), apóstrofo e hífen no meio. Duas
// letras no mínimo — "a", "e", "o" não distinguem nada.
const PALAVRA = /\p{L}[\p{L}\p{M}'’-]+/gu;

function palavrasDe(texto) {
  return (String(texto).toLowerCase().match(PALAVRA) ?? []).map((p) =>
    p.replace(/^[-'’]+|[-'’]+$/g, "")
  );
}

// Corpus das fontes: chaves e valores, em qualquer profundidade. As chaves
// entram porque as pendências mostram na tela o campo que falta preencher.
function juntaPalavras(valor, destino) {
  if (valor === null || valor === undefined) return;
  if (Array.isArray(valor)) {
    for (const item of valor) juntaPalavras(item, destino);
    return;
  }
  if (typeof valor === "object") {
    for (const [chave, dentro] of Object.entries(valor)) {
      for (const p of palavrasDe(chave)) destino.add(p);
      juntaPalavras(dentro, destino);
    }
    return;
  }
  for (const p of palavrasDe(valor)) destino.add(p);
}

function corpus(extras) {
  const permitidas = new Set();
  const arquivos = [
    ...FONTES,
    ...fs
      .readdirSync(PASTA_CONTEUDO)
      .filter((a) => a.endsWith(".json"))
      .map((a) => path.join(PASTA_CONTEUDO, a)),
  ];
  for (const arquivo of arquivos) {
    juntaPalavras(JSON.parse(fs.readFileSync(arquivo, "utf8")), permitidas);
    // O caminho do próprio arquivo aparece na tela nas pendências.
    for (const p of palavrasDe(arquivo)) permitidas.add(p);
  }
  juntaPalavras(extras, permitidas);
  return permitidas;
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

function decodifica(texto) {
  return texto.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTIDADES[e]);
}

// Atributos que o olho ou o leitor de tela alcançam.
const ATRIBUTOS = /(?:alt|title|placeholder|aria-label)\s*=\s*"([^"]*)"/gi;
// E as descrições do <head>, que aparecem no buscador e no compartilhamento.
// O content de viewport e robots é instrução para o navegador, não texto.
const META_DE_TEXTO = /<meta\s+(?:name="description"|property="og:(?:title|description)")\s+content="([^"]*)"/gi;

function textoVisivel(html) {
  const semScript = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const atributos = [...semScript.matchAll(ATRIBUTOS)].map((m) => m[1]).join(" ");
  const metas = [...semScript.matchAll(META_DE_TEXTO)].map((m) => m[1]).join(" ");
  const corpo = semScript.replace(/<[^>]*>/g, " ");
  return decodifica(`${corpo} ${atributos} ${metas}`);
}

function telas(pasta) {
  const achadas = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, item.name);
    if (item.isDirectory()) achadas.push(...telas(completo));
    else if (item.name.endsWith(".html")) achadas.push(completo);
  }
  return achadas;
}

function verifica({ extras = [] } = {}) {
  const permitidas = corpus(extras);
  const foraDaFonte = new Map();
  const paginas = telas(SAIDA);
  let total = 0;

  for (const pagina of paginas) {
    const palavras = palavrasDe(textoVisivel(fs.readFileSync(pagina, "utf8")));
    total += palavras.length;
    for (const palavra of palavras) {
      if (permitidas.has(palavra)) continue;
      if (!foraDaFonte.has(palavra)) foraDaFonte.set(palavra, pagina);
    }
  }

  if (foraDaFonte.size) {
    const lista = [...foraDaFonte.entries()]
      .slice(0, 20)
      .map(([palavra, onde]) => `  "${palavra}" em ${onde}`)
      .join("\n");
    throw new Error(
      `texto de interface fora das fontes de conteúdo (${foraDaFonte.size} palavra(s)).\n` +
        `Toda palavra na tela tem de vir de dados/configuracao.json, conteudo/*.json ou ` +
        `dados/vocabulario.json — nunca de template ou script:\n${lista}`
    );
  }

  return { telas: paginas.length, palavras: total };
}

module.exports = { verifica };
