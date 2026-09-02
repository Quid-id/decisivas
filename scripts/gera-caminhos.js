// DECISIVAS — monta as 20 páginas de caminho, o Sobre e a privacidade.
//
// Tudo aqui é HTML estático, gerado no build a partir de `conteudo/*.json`:
// nenhuma chamada de API para exibir página, nenhum texto escrito por código.
// Rótulo de bloco, ícone, separador de título e os textos do "Explorar o
// acervo" vêm de `dados/configuracao.json`; o texto das páginas, de
// `conteudo/*.json`; nome, cor e slug de público e tema, de
// `dados/vocabulario.json`. Referência visual:
// `referencia/decisivas_prototipo_v5.html`.
//
// Endereços: `/caminhos/<slug do público>/<slug do tema>`, com os slugs de
// `dados/vocabulario.json`. O servidor de assets serve a URL sem `.html`.

const fs = require("node:fs");
const path = require("node:path");
const { escreveSeMudou } = require("./escreve-se-mudou");
const { escapa, troca, confereMarcadores, ehPendente } = require("./html");
const monta = require("./interface");
const conteudo = require("./conteudo");
const acervo = require("./acervo");

const SAIDA = "public";

// ---------------------------------------------------------------------------
// Blocos da página de caminho
// ---------------------------------------------------------------------------

// Os três cards de dados de "por que falar", na ordem em que estão escritos no
// JSON: o primeiro na cor do público, o segundo em amarelo, o terceiro
// off-white com a sombra na cor do público. A cor entra por variável, dos
// tokens e de dados/vocabulario.json — nenhuma cor escrita aqui.
const CLASSE_DO_CARD = ["card numero", "card destaque", "card publico"];

function cardDeDados(dado, cor, posicao) {
  const classe = CLASSE_DO_CARD[posicao] ?? "card";
  const estilo =
    classe === "card numero"
      ? ` style="--cor: ${cor.cor}; --cor-texto-pilula: ${cor.texto}"`
      : "";
  const numero = dado.n ? `<div class="n">${escapa(dado.n)}</div>` : "";
  return `        <div class="${classe}"${estilo}>${numero}<h3>${escapa(dado.titulo)}</h3><p>${escapa(dado.texto)}</p></div>`;
}

function blocoPorQue(pagina, cor) {
  const prosa = pagina.por_que.texto.map((p) => `<p>${escapa(p)}</p>`).join("");
  const cards = pagina.por_que.dados.map((dado, i) => cardDeDados(dado, cor, i)).join("\n");
  return `    <div class="prosa">${prosa}</div>\n    <div class="grade">\n${cards}\n    </div>`;
}

// Ícone dos cards de leitura: o ✓ e o ✕ vêm da configuração, ficam FORA do
// título, numa coluna própria à esquerda, e são decoração — o leitor de tela
// não os anuncia, o título do bloco já diz se é o que funciona ou o que não.
function cardsDeLista(cards, classe, icone) {
  const marca = icone ? `<span class="icone" aria-hidden="true">${escapa(icone)}</span>` : "";
  return cards
    .map((card) => {
      const fonte = card.fonte ? `<p class="fonte">${escapa(card.fonte)}</p>` : "";
      return `      <div class="card ${classe}">${marca}<h3>${escapa(card.titulo)}</h3><p>${escapa(card.texto)}</p>${fonte}</div>`;
    })
    .join("\n");
}

function grade(cards, classe, icone) {
  if (!cards || !cards.length) return "";
  return `    <div class="grade">\n${cardsDeLista(cards, classe, icone)}\n    </div>`;
}

// Um bloco da página: o rótulo, com a régua, e o que vier dentro. **Bloco sem
// nenhum item não é renderizado** — a página mostra os cards que existem,
// sejam 3, 2 ou 1, e some com o bloco quando não há nenhum. Não há caixa de
// aviso: o campo `lacuna` dos JSON deixou de ser lido no build (a caixa está
// em arquivo/caixa-de-lacuna.html).
function bloco(rotulo, dentro) {
  if (!dentro || !String(dentro).trim()) return "";
  return `  <section class="bloco">\n    <h2>${escapa(rotulo)}</h2>\n${dentro}\n  </section>\n`;
}

// "Quem é este público": o retrato do público em círculo, o card de número na
// cor dele e o card de texto off-white com a sombra na mesma cor, os três na
// mesma linha (em coluna única abaixo de 760 px).
function blocoQuemE(quemE, cor, oRetrato) {
  const destaque =
    `      <div class="card numero" style="--cor: ${cor.cor}; --cor-texto-pilula: ${cor.texto}">` +
    `<div class="n">${escapa(quemE.destaque.n)}</div><h3>${escapa(quemE.destaque.titulo)}</h3>` +
    `<p>${escapa(quemE.destaque.texto)}</p></div>`;
  const texto = `      <div class="card publico largo"><p>${escapa(quemE.texto)}</p></div>`;
  const linhas = [oRetrato, destaque, texto].filter(Boolean).join("\n");
  return `    <div class="grade${oRetrato ? " com-retrato" : ""}">\n${linhas}\n    </div>`;
}

function blocoResumo(linhas) {
  const itens = linhas.map((l) => `<li>${escapa(l)}</li>`).join("");
  return `    <div class="resumo"><ul>${itens}</ul></div>`;
}

// Botões de pauta do "Explorar o acervo": os nomes são o vocabulário fechado
// das 59 pautas, lido do acervo — não são texto escrito aqui.
function botoesDePauta(pautas, configuracao) {
  if (!pautas.length) {
    return `      <span class="meta">${escapa(configuracao.explorar.aviso_sem_pautas)}</span>`;
  }
  return pautas
    .map((pauta) => `      <button type="button" disabled>${escapa(pauta)}</button>`)
    .join("\n");
}

// O texto do "Explorar o acervo" traz o tamanho do acervo neste cruzamento.
// Os dois números entram nos lugares marcados na configuração.
function textoDoExplorar(configuracao, resumoDoCruzamento) {
  const trechos = resumoDoCruzamento ? resumoDoCruzamento.trechos : 0;
  const achados = resumoDoCruzamento ? resumoDoCruzamento.achados : 0;
  return escapa(
    configuracao.explorar.texto
      .replace("{trechos}", String(trechos))
      .replace("{achados}", String(achados))
  );
}

// ---------------------------------------------------------------------------

function montaCaminho(modelo, comum, configuracao, { publico, tema, dados, pagina, resumoDoCruzamento }) {
  const cor = { cor: publico.cor, texto: publico.texto };
  const blocos = configuracao.caminho.blocos;
  const titulo = `${dados.nome} ${configuracao.caminho.separador_titulo} ${tema.nome}`;

  return troca(modelo, {
    CABECA: comum.cabeca({
      titulo: configuracao.meta.caminho.padrao_titulo
        .replace("{publico}", dados.nome)
        .replace("{tema}", tema.nome),
      descricao: pagina.linha,
    }),
    CABECALHO: comum.cabecalho(null) + "\n" + comum.rodaBanner,
    RODAPE: comum.rodape,
    COMPARTILHAR: comum.compartilhar,
    VOLTAR: comum.voltar,
    // A cor do público vale para a página inteira: é dela que sai a sombra dos
    // cards off-white (--sombra-publico, em brand/tokens.css).
    ESTILO_PUBLICO: `--cor-publico: ${cor.cor}`,
    PILULA_PUBLICO:
      `<span class="pilula" style="--cor: ${cor.cor}; --cor-texto-pilula: ${cor.texto}">${escapa(dados.nome)}</span>`,
    NOME_TEMA: escapa(tema.nome),
    REVISADO_EM: dados.revisado_em
      ? `${escapa(configuracao.caminho.prefixo_revisado)} ${escapa(dados.revisado_em)}`
      : escapa(configuracao.caminho.texto_em_revisao),
    TITULO_CAMINHO: escapa(pagina.titulo || titulo),
    LINHA: escapa(pagina.linha),
    BLOCO_POR_QUE: bloco(blocos.por_que, blocoPorQue(pagina, cor)),
    BLOCO_FUNCIONA: bloco(
      blocos.funciona,
      grade(pagina.funciona, "funciona", configuracao.caminho.icone_funciona)
    ),
    BLOCO_NAO_FUNCIONA: bloco(
      blocos.nao_funciona,
      grade(pagina.nao_funciona, "evita", configuracao.caminho.icone_nao_funciona)
    ),
    BLOCO_QUEM_E: bloco(
      blocos.quem_e,
      blocoQuemE(dados.quem_e, cor, monta.retrato(configuracao, publico, dados.nome))
    ),
    BLOCO_COMO_CHEGAR: bloco(blocos.como_chegar, grade(dados.como_chegar, "publico", null)),
    BLOCO_RESUMO: bloco(blocos.resumo, blocoResumo(pagina.resumo)),
    TITULO_EXPLORAR: escapa(configuracao.explorar.titulo),
    TEXTO_EXPLORAR: textoDoExplorar(configuracao, resumoDoCruzamento),
    PAUTAS: botoesDePauta(resumoDoCruzamento ? resumoDoCruzamento.pautas : [], configuracao),
    ROTULO_CAMPO_EXPLORAR: escapa(configuracao.explorar.rotulo_campo),
    EXEMPLO_CAMPO_EXPLORAR: escapa(configuracao.explorar.exemplo_campo),
    BOTAO_EXPLORAR: escapa(configuracao.explorar.botao),
    AVISO_EXPLORAR: escapa(configuracao.explorar.aviso_desligado),
  });
}

// Texto do Sobre e da privacidade: o que a equipe escreveu, ou a pendência
// dizendo qual campo de qual arquivo falta.
function paragrafo(configuracao, valor, arquivo, campo) {
  if (ehPendente(valor)) {
    return `<div class="preencher">${monta.textoDaPendencia(configuracao, valor, arquivo, campo)}</div>`;
  }
  return `<p>${escapa(valor)}</p>`;
}

function montaSobre(comum, configuracao, sobre, vocabulario, publicos) {
  const modelo = fs.readFileSync("paginas/sobre.html", "utf8");
  const blocos = configuracao.sobre.blocos;
  const ONDE = "conteudo/sobre.json";

  const listaDePublicos = vocabulario.publicos
    .map((p) => {
      const dados = publicos[p.id];
      return `    <h3>${escapa(dados.nome)}</h3>\n    <p>${escapa(dados.quem_e.texto)}</p>`;
    })
    .join("\n");
  const listaDeTemas = vocabulario.macronarrativas
    .map((t) => `    <h3>${escapa(t.nome)}</h3>\n    <p>${escapa(sobre.temas[t.id])}</p>`)
    .join("\n");

  return troca(modelo, {
    CABECA: comum.cabeca(configuracao.meta.sobre),
    CABECALHO: comum.cabecalho("/sobre") + "\n" + comum.rodaBanner,
    RODAPE: comum.rodape,
    TITULO_SOBRE: escapa(configuracao.sobre.titulo),
    // O vídeo de apresentação vive só aqui, pelo video_embed da configuração.
    VIDEO: monta.video(configuracao),
    ROTULO_PROJETO: escapa(blocos.projeto),
    PROJETO: paragrafo(configuracao, sobre.projeto, ONDE, "projeto"),
    ROTULO_COMO_FOI_FEITO: escapa(blocos.como_foi_feito),
    COMO_FOI_FEITO: paragrafo(configuracao, sobre.como_foi_feito, ONDE, "como_foi_feito"),
    ROTULO_PUBLICOS: escapa(blocos.publicos),
    PUBLICOS_INTRO: paragrafo(configuracao, sobre.publicos_intro, ONDE, "publicos_intro"),
    PUBLICOS: listaDePublicos,
    ROTULO_TEMAS: escapa(blocos.temas),
    TEMAS: listaDeTemas,
    ROTULO_AVISO_IA: escapa(blocos.aviso_ia),
    AVISO_IA: paragrafo(configuracao, sobre.aviso_ia, ONDE, "aviso_ia"),
    ROTULO_QUEM_FAZ: escapa(blocos.quem_faz),
    QUEM_FAZ: paragrafo(configuracao, sobre.quem_faz, ONDE, "quem_faz"),
  });
}

function montaPrivacidade(comum, configuracao, sobre) {
  const modelo = fs.readFileSync("paginas/privacidade.html", "utf8");
  // O texto vem em um parágrafo por linha em branco, como foi escrito.
  const paragrafos = String(sobre.privacidade)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapa(p)}</p>`)
    .join("\n    ");
  return troca(modelo, {
    CABECA: comum.cabeca(configuracao.meta.privacidade),
    CABECALHO: comum.cabecalho(configuracao.privacidade.destino) + "\n" + comum.rodaBanner,
    RODAPE: comum.rodape,
    TITULO_PRIVACIDADE: escapa(configuracao.pagina_privacidade.titulo),
    REVISADO_EM: sobre.revisado_em
      ? `${escapa(configuracao.pagina_privacidade.prefixo_revisado)} ${escapa(sobre.revisado_em)}`
      : escapa(configuracao.caminho.texto_em_revisao),
    PRIVACIDADE: paragrafos,
  });
}

async function main({ comum, vocabulario, configuracao }) {
  const { publicos, sobre } = conteudo.carrega(vocabulario);
  const resumoDoAcervo = await acervo.resumo();
  const modelo = fs.readFileSync("paginas/caminho.html", "utf8");

  let escritos = 0;
  const gerados = [];
  // Os nomes de pauta que foram para a tela: são o vocabulário fechado do
  // acervo, e scripts/verifica-literais.js precisa deles para não acusar
  // palavra de fora das fontes.
  const pautas = new Set();

  for (const publico of vocabulario.publicos) {
    const dados = publicos[publico.id];
    for (const tema of vocabulario.macronarrativas) {
      const doCruzamento = resumoDoAcervo.get(`${publico.id}|${tema.id}`);
      for (const pauta of doCruzamento ? doCruzamento.pautas : []) pautas.add(pauta);
      const html = montaCaminho(modelo, comum, configuracao, {
        publico,
        tema,
        dados,
        pagina: dados.paginas[tema.id],
        resumoDoCruzamento: doCruzamento,
      });
      confereMarcadores(html, `caminho ${publico.slug}/${tema.slug}`);
      const destino = path.join(SAIDA, "caminhos", publico.slug, `${tema.slug}.html`);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      if (escreveSeMudou(destino, html)) escritos++;
      gerados.push(`/caminhos/${publico.slug}/${tema.slug}`);
    }
  }

  const paginaSobre = montaSobre(comum, configuracao, sobre, vocabulario, publicos);
  confereMarcadores(paginaSobre, "paginas/sobre.html");
  if (escreveSeMudou(path.join(SAIDA, "sobre.html"), paginaSobre)) escritos++;

  const paginaPrivacidade = montaPrivacidade(comum, configuracao, sobre);
  confereMarcadores(paginaPrivacidade, "paginas/privacidade.html");
  if (escreveSeMudou(path.join(SAIDA, "privacidade.html"), paginaPrivacidade)) escritos++;

  return { caminhos: gerados.length, escritos, pautas: [...pautas] };
}

module.exports = { main };
