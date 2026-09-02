// DECISIVAS — monta as 20 páginas de caminho, o Sobre e a privacidade.
//
// Tudo aqui é HTML estático, gerado no build a partir de `conteudo/*.json`:
// nenhuma chamada de API para exibir página, nenhum texto escrito por código.
// Referência visual: `referencia/decisivas_prototipo_v5.html`.
//
// Endereços: `/caminhos/<slug do público>/<slug do tema>`, com os slugs de
// `dados/vocabulario.json`. O servidor de assets serve a URL sem `.html`.

const fs = require("node:fs");
const path = require("node:path");
const { escreveSeMudou } = require("./escreve-se-mudou");
const { escapa, troca, confereMarcadores, leParciais, ehPendente, textoOuPendente } = require("./html");
const conteudo = require("./conteudo");
const acervo = require("./acervo");

const SAIDA = "public";
const SEM_DATA = "texto em revisão";

// O cabeçalho é o mesmo parcial de todas as telas, e marca na navegação a
// página em que se está. Caminho não é Início nem Sobre: nenhuma das duas
// fica marcada.
function cabecalhoPara(parciais, atual) {
  return troca(parciais.cabecalho, {
    ATUAL_INICIO: atual === "inicio" ? ' aria-current="page"' : "",
    ATUAL_SOBRE: atual === "sobre" ? ' aria-current="page"' : "",
  });
}

// ---------------------------------------------------------------------------
// Blocos da página de caminho
// ---------------------------------------------------------------------------

function cardDeDados(dado, corDoPublico, primeiro) {
  // O primeiro card de dados usa a cor do público quando tem número: é o que
  // dá o ponto de cor do bloco, como no protótipo v5.
  const comCor = primeiro && dado.n;
  const classe = comCor ? "card numero" : "card";
  const estilo = comCor ? ` style="--cor: ${corDoPublico.cor}; --cor-texto-pilula: ${corDoPublico.texto}"` : "";
  const numero = dado.n ? `<div class="n">${escapa(dado.n)}</div>` : "";
  return `        <div class="${classe}"${estilo}>${numero}<h3>${escapa(dado.titulo)}</h3><p>${escapa(dado.texto)}</p></div>`;
}

function blocoPorQue(pagina, corDoPublico) {
  const prosa = pagina.por_que.texto.map((p) => `<p>${escapa(p)}</p>`).join("");
  const cards = pagina.por_que.dados
    .map((dado, i) => cardDeDados(dado, corDoPublico, i === 0))
    .join("\n");
  return `    <div class="prosa">${prosa}</div>\n    <div class="grade">\n${cards}\n    </div>`;
}

// Ícone dos cards de leitura: o ✓ e o ✕ ficam FORA do título, numa coluna
// própria à esquerda, e são decoração — o leitor de tela não os anuncia, o
// título do bloco já diz se é o que funciona ou o que não funciona.
const ICONE = { funciona: "✓", evita: "✕" };

function cardsDeLista(cards, classe) {
  const icone = ICONE[classe] ? `<span class="icone" aria-hidden="true">${ICONE[classe]}</span>` : "";
  return cards
    .map((card) => {
      const fonte = card.fonte ? `<p class="fonte">${escapa(card.fonte)}</p>` : "";
      return `      <div class="card ${classe}">${icone}<h3>${escapa(card.titulo)}</h3><p>${escapa(card.texto)}</p>${fonte}</div>`;
    })
    .join("\n");
}

function grade(cards, classe) {
  return `    <div class="grade">\n${cardsDeLista(cards, classe)}\n    </div>`;
}

// A lacuna vai logo abaixo do bloco a que se refere, e o próprio texto diz
// qual é: "sobre o que funciona" ou "sobre o que afasta". Sem essa marca, ela
// é da página inteira e entra depois do último dos dois blocos.
function ondeVaiALacuna(texto) {
  const alvo = texto.toLowerCase();
  if (alvo.includes("o que funciona")) return "funciona";
  if (alvo.includes("o que afasta") || alvo.includes("não funciona")) return "nao_funciona";
  return "nao_funciona";
}

function caixaDeLacuna(texto) {
  return `\n    <div class="lacuna">${escapa(texto)}</div>`;
}

function blocoQuemE(quemE, corDoPublico) {
  const destaque =
    `      <div class="card numero" style="--cor: ${corDoPublico.cor}; --cor-texto-pilula: ${corDoPublico.texto}">` +
    `<div class="n">${escapa(quemE.destaque.n)}</div><h3>${escapa(quemE.destaque.titulo)}</h3>` +
    `<p>${escapa(quemE.destaque.texto)}</p></div>`;
  const texto = `      <div class="card largo"><p>${escapa(quemE.texto)}</p></div>`;
  return `    <div class="grade">\n${destaque}\n${texto}\n    </div>`;
}

function blocoResumo(linhas) {
  const itens = linhas.map((l) => `<li>${escapa(l)}</li>`).join("");
  return `    <div class="resumo"><ul>${itens}</ul></div>`;
}

function botoesDePauta(pautas) {
  if (!pautas.length) return `      <span class="meta">Sem pautas etiquetadas neste cruzamento.</span>`;
  return pautas
    .map((pauta) => `      <button type="button" disabled>${escapa(pauta)}</button>`)
    .join("\n");
}

function trechosDoCruzamento(resumoDoCruzamento) {
  if (!resumoDoCruzamento) return "trechos";
  const { trechos, achados } = resumoDoCruzamento;
  return `${trechos} trechos, ${achados} deles achados,`;
}

// ---------------------------------------------------------------------------

function montaCaminho(modelo, parciais, { publico, tema, dados, pagina, resumoDoCruzamento }) {
  const cor = { cor: publico.cor, texto: publico.texto };
  const lacunaEm = pagina.lacuna ? ondeVaiALacuna(pagina.lacuna) : null;
  const titulo = `${dados.nome} × ${tema.nome}`;

  const html = troca(modelo, {
    CABECA: troca(parciais.cabeca, {
      TITULO: `${escapa(titulo)} · DECISIVAS`,
      DESCRICAO: escapa(pagina.linha),
    }),
    CABECALHO: cabecalhoPara(parciais, null),
    RODAPE: parciais.rodape,
    COMPARTILHAR: parciais.compartilhar,
    PILULA_PUBLICO:
      `<span class="pilula" style="--cor: ${cor.cor}; --cor-texto-pilula: ${cor.texto}">${escapa(dados.nome)}</span>`,
    NOME_TEMA: escapa(tema.nome),
    REVISADO_EM: dados.revisado_em ? `texto revisado em ${escapa(dados.revisado_em)}` : SEM_DATA,
    TITULO_CAMINHO: escapa(pagina.titulo || titulo),
    LINHA: escapa(pagina.linha),
    POR_QUE: blocoPorQue(pagina, cor),
    FUNCIONA: grade(pagina.funciona, "funciona") + (lacunaEm === "funciona" ? caixaDeLacuna(pagina.lacuna) : ""),
    NAO_FUNCIONA:
      grade(pagina.nao_funciona, "evita") + (lacunaEm === "nao_funciona" ? caixaDeLacuna(pagina.lacuna) : ""),
    QUEM_E: blocoQuemE(dados.quem_e, cor),
    COMO_CHEGAR: grade(dados.como_chegar, ""),
    RESUMO: blocoResumo(pagina.resumo),
    TRECHOS_DO_CRUZAMENTO: trechosDoCruzamento(resumoDoCruzamento),
    PAUTAS: botoesDePauta(resumoDoCruzamento ? resumoDoCruzamento.pautas : []),
    EXEMPLO_PERGUNTA: escapa(`Ex.: o que a pesquisa mostra sobre ${tema.nome.toLowerCase()}`),
  });
  return html;
}

function montaSobre(parciais, sobre, vocabulario, publicos, configuracao) {
  const modelo = fs.readFileSync("paginas/sobre.html", "utf8");
  const idVideo = configuracao.video_youtube_id;
  const video = ehPendente(idVideo)
    ? "[preencher] vídeo de apresentação: identificador do YouTube em dados/configuracao.json"
    : `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(idVideo)}?rel=0" title="Vídeo de apresentação do DECISIVAS" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

  const listaDePublicos = vocabulario.publicos
    .map((p) => {
      const dados = publicos[p.id];
      return `    <h3>${escapa(dados.nome)}</h3>\n    <p>${escapa(dados.quem_e.texto)}</p>`;
    })
    .join("\n");
  const listaDeTemas = vocabulario.macronarrativas
    .map((t) => `    <h3>${escapa(t.nome)}</h3>\n    <p>${escapa(sobre.temas[t.id])}</p>`)
    .join("\n");

  const html = troca(modelo, {
    CABECA: troca(parciais.cabeca, {
      TITULO: "Sobre o projeto · DECISIVAS",
      DESCRICAO: "O que é o DECISIVAS, como foi feito, os públicos, os temas e o uso de inteligência artificial.",
    }),
    CABECALHO: cabecalhoPara(parciais, "sobre"),
    RODAPE: parciais.rodape,
    VIDEO: video,
    PROJETO: textoOuPendente(sobre.projeto, "texto sobre o projeto", "conteudo/sobre.json").html,
    COMO_FOI_FEITO: textoOuPendente(sobre.como_foi_feito, "como foi feito", "conteudo/sobre.json").html,
    PUBLICOS_INTRO: textoOuPendente(sobre.publicos_intro, "introdução dos públicos", "conteudo/sobre.json").html,
    PUBLICOS: listaDePublicos,
    TEMAS: listaDeTemas,
    AVISO_IA: textoOuPendente(sobre.aviso_ia, "aviso sobre inteligência artificial", "conteudo/sobre.json").html,
    QUEM_FAZ: textoOuPendente(sobre.quem_faz, "quem faz", "conteudo/sobre.json").html,
  });
  return html;
}

function montaPrivacidade(parciais, sobre) {
  const modelo = fs.readFileSync("paginas/privacidade.html", "utf8");
  // O texto vem em um parágrafo por linha em branco, como foi escrito.
  const paragrafos = String(sobre.privacidade)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapa(p)}</p>`)
    .join("\n    ");
  return troca(modelo, {
    CABECA: troca(parciais.cabeca, {
      TITULO: "Política de privacidade · DECISIVAS",
      DESCRICAO: "O DECISIVAS não usa cookies de rastreamento nem coleta dados pessoais.",
    }),
    CABECALHO: cabecalhoPara(parciais, null),
    RODAPE: parciais.rodape,
    REVISADO_EM: sobre.revisado_em ? `Revisado em ${escapa(sobre.revisado_em)}` : SEM_DATA,
    PRIVACIDADE: paragrafos,
  });
}

async function main({ parciais, vocabulario, configuracao }) {
  const { publicos, sobre } = conteudo.carrega(vocabulario);
  const resumoDoAcervo = await acervo.resumo();
  const modelo = fs.readFileSync("paginas/caminho.html", "utf8");

  let escritos = 0;
  const gerados = [];

  for (const publico of vocabulario.publicos) {
    const dados = publicos[publico.id];
    for (const tema of vocabulario.macronarrativas) {
      const html = montaCaminho(modelo, parciais, {
        publico,
        tema,
        dados,
        pagina: dados.paginas[tema.id],
        resumoDoCruzamento: resumoDoAcervo.get(`${publico.id}|${tema.id}`),
      });
      confereMarcadores(html, `caminho ${publico.slug}/${tema.slug}`);
      const destino = path.join(SAIDA, "caminhos", publico.slug, `${tema.slug}.html`);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      if (escreveSeMudou(destino, html)) escritos++;
      gerados.push(`/caminhos/${publico.slug}/${tema.slug}`);
    }
  }

  const paginaSobre = montaSobre(parciais, sobre, vocabulario, publicos, configuracao);
  confereMarcadores(paginaSobre, "paginas/sobre.html");
  if (escreveSeMudou(path.join(SAIDA, "sobre.html"), paginaSobre)) escritos++;

  const paginaPrivacidade = montaPrivacidade(parciais, sobre);
  confereMarcadores(paginaPrivacidade, "paginas/privacidade.html");
  if (escreveSeMudou(path.join(SAIDA, "privacidade.html"), paginaPrivacidade)) escritos++;

  return { caminhos: gerados.length, escritos };
}

module.exports = { main };
