// DECISIVAS — carrega e valida o conteúdo das páginas (etapa 8B).
//
// As 20 páginas são texto fixo, escrito pela equipe e validado pelo jurídico.
// Este módulo é a única porta de entrada desse texto no build: se a estrutura
// não estiver como a especificação define, o build **falha com o caminho do
// campo** em vez de publicar página pela metade.
//
// O mapa de arquivo por público é explícito, e não derivado de slug: o
// identificador do banco, o nome na tela, o slug da URL e o nome do arquivo
// são quatro coisas diferentes, e o 70+ é a prova (id `60+`, slug `70-mais`,
// arquivo `70mais.json`).

const fs = require("node:fs");

const PASTA = "conteudo";

const ARQUIVO_POR_PUBLICO = {
  "jovens": "jovens.json",
  "60+": "70mais.json",
  "mulheres beneficiárias": "mulheres-beneficiarias.json",
  "mulheres de 2 a 5 salários mínimos": "mulheres-2-a-5-sm.json",
};

// Campos obrigatórios de cada página, e os limites que a especificação fixa.
// Zero é válido: bloco sem card não é renderizado (a caixa de lacuna saiu da
// página na etapa 8C). Três é o teto do layout.
const MINIMO_CARDS = 0;
const MAXIMO_CARDS = 3;
const LINHAS_DE_RESUMO = 5;
const PARAGRAFOS_POR_QUE = 2;
const CARDS_DE_DADOS = 3;
const CARDS_COMO_CHEGAR = 3;
// O número em destaque do card cabe em 8 caracteres ("nº 1", "10,4 mi",
// "1 em 4"). Acima disso ele estoura o card, então o build recusa.
const MAXIMO_DO_NUMERO = 8;

class ErroDeConteudo extends Error {}

function exige(condicao, caminho, oQue) {
  if (!condicao) throw new ErroDeConteudo(`${caminho}: ${oQue}`);
}

function exigeCurto(valor, caminho) {
  exige(
    String(valor).length <= MAXIMO_DO_NUMERO,
    caminho,
    `número em destaque com no máximo ${MAXIMO_DO_NUMERO} caracteres, tem ${String(valor).length}`
  );
}

function exigeTexto(valor, caminho) {
  exige(typeof valor === "string" && valor.trim().length > 0, caminho, "texto obrigatório, ausente ou vazio");
}

function exigeLista(valor, caminho, minimo, maximo) {
  exige(Array.isArray(valor), caminho, "deveria ser uma lista");
  exige(
    valor.length >= minimo && valor.length <= maximo,
    caminho,
    `deveria ter de ${minimo} a ${maximo} itens, tem ${valor.length}`
  );
}

function validaCards(cards, caminho) {
  exigeLista(cards, caminho, MINIMO_CARDS, MAXIMO_CARDS);
  cards.forEach((card, i) => {
    exigeTexto(card.titulo, `${caminho}[${i}].titulo`);
    exigeTexto(card.texto, `${caminho}[${i}].texto`);
  });
}

function validaPagina(pagina, caminho) {
  exigeTexto(pagina.titulo, `${caminho}.titulo`);
  exigeTexto(pagina.linha, `${caminho}.linha`);

  exige(pagina.por_que && typeof pagina.por_que === "object", `${caminho}.por_que`, "objeto obrigatório");
  exigeLista(pagina.por_que.texto, `${caminho}.por_que.texto`, PARAGRAFOS_POR_QUE, PARAGRAFOS_POR_QUE);
  pagina.por_que.texto.forEach((p, i) => exigeTexto(p, `${caminho}.por_que.texto[${i}]`));
  exigeLista(pagina.por_que.dados, `${caminho}.por_que.dados`, CARDS_DE_DADOS, CARDS_DE_DADOS);
  pagina.por_que.dados.forEach((dado, i) => {
    exigeTexto(dado.titulo, `${caminho}.por_que.dados[${i}].titulo`);
    exigeTexto(dado.texto, `${caminho}.por_que.dados[${i}].texto`);
    // `n` é opcional: é o número em destaque, e só o primeiro card o usa.
    if (dado.n !== undefined) {
      exigeTexto(dado.n, `${caminho}.por_que.dados[${i}].n`);
      exigeCurto(dado.n, `${caminho}.por_que.dados[${i}].n`);
    }
  });

  validaCards(pagina.funciona, `${caminho}.funciona`);
  validaCards(pagina.nao_funciona, `${caminho}.nao_funciona`);

  exigeLista(pagina.resumo, `${caminho}.resumo`, LINHAS_DE_RESUMO, LINHAS_DE_RESUMO);
  pagina.resumo.forEach((linha, i) => exigeTexto(linha, `${caminho}.resumo[${i}]`));

  // `lacuna` não é mais lido pelo build: a caixa de aviso saiu da página. O
  // campo segue nos arquivos, e é ignorado — não se valida o que não se usa.
}

function validaPublico(dados, publico, temas, arquivo) {
  exigeTexto(dados.nome, `${arquivo}.nome`);
  exige(dados.publico !== undefined, `${arquivo}.publico`, "campo obrigatório");

  exige(dados.quem_e && typeof dados.quem_e === "object", `${arquivo}.quem_e`, "objeto obrigatório");
  exigeTexto(dados.quem_e.texto, `${arquivo}.quem_e.texto`);
  const destaque = dados.quem_e.destaque ?? {};
  exigeTexto(destaque.n, `${arquivo}.quem_e.destaque.n`);
  exigeCurto(destaque.n, `${arquivo}.quem_e.destaque.n`);
  exigeTexto(destaque.titulo, `${arquivo}.quem_e.destaque.titulo`);
  exigeTexto(destaque.texto, `${arquivo}.quem_e.destaque.texto`);

  exigeLista(dados.como_chegar, `${arquivo}.como_chegar`, CARDS_COMO_CHEGAR, CARDS_COMO_CHEGAR);
  dados.como_chegar.forEach((card, i) => {
    exigeTexto(card.titulo, `${arquivo}.como_chegar[${i}].titulo`);
    exigeTexto(card.texto, `${arquivo}.como_chegar[${i}].texto`);
    // `fonte` é obrigatória quando o card cita dado de pesquisa externa; a
    // regra 9 do CONTEXTO cobra fonte nomeada, e é a equipe que decide onde
    // cabe — aqui só se exige que, existindo, não venha vazia.
    if (card.fonte !== undefined) exigeTexto(card.fonte, `${arquivo}.como_chegar[${i}].fonte`);
  });

  // `revisado_em` é opcional: sem ele, o cabeçalho diz "texto em revisão".
  if (dados.revisado_em !== undefined) exigeTexto(dados.revisado_em, `${arquivo}.revisado_em`);

  exige(dados.paginas && typeof dados.paginas === "object", `${arquivo}.paginas`, "objeto obrigatório");
  const presentes = Object.keys(dados.paginas);
  for (const tema of temas) {
    exige(presentes.includes(tema), `${arquivo}.paginas`, `falta o tema "${tema}"`);
    validaPagina(dados.paginas[tema], `${arquivo}.paginas["${tema}"]`);
  }
  const sobrando = presentes.filter((t) => !temas.includes(t));
  exige(sobrando.length === 0, `${arquivo}.paginas`, `tema fora do vocabulário: ${sobrando.join(", ")}`);
}

function validaSobre(sobre) {
  for (const campo of ["projeto", "como_foi_feito", "publicos_intro", "aviso_ia", "quem_faz", "privacidade"]) {
    exigeTexto(sobre[campo], `sobre.json.${campo}`);
  }
  exige(sobre.temas && typeof sobre.temas === "object", "sobre.json.temas", "objeto obrigatório");
  if (sobre.revisado_em !== undefined) exigeTexto(sobre.revisado_em, "sobre.json.revisado_em");
}

// Carrega tudo e valida. `vocabulario` entra como parâmetro porque é a fonte
// única dos públicos e temas: o conteúdo é conferido CONTRA ele, e não o
// contrário.
function carrega(vocabulario) {
  const temas = vocabulario.macronarrativas.map((m) => m.id);
  const publicos = {};

  for (const publico of vocabulario.publicos) {
    const arquivo = ARQUIVO_POR_PUBLICO[publico.id];
    exige(Boolean(arquivo), `conteudo/`, `nenhum arquivo mapeado para o público "${publico.id}"`);
    const caminho = `${PASTA}/${arquivo}`;
    exige(fs.existsSync(caminho), caminho, "arquivo de conteúdo não encontrado");
    let dados;
    try {
      dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    } catch (e) {
      throw new ErroDeConteudo(`${caminho}: JSON inválido — ${e.message}`);
    }
    validaPublico(dados, publico, temas, caminho);
    publicos[publico.id] = dados;
  }

  const caminhoSobre = `${PASTA}/sobre.json`;
  exige(fs.existsSync(caminhoSobre), caminhoSobre, "arquivo de conteúdo não encontrado");
  const sobre = JSON.parse(fs.readFileSync(caminhoSobre, "utf8"));
  validaSobre(sobre);
  for (const tema of temas) {
    exige(sobre.temas[tema] !== undefined, "sobre.json.temas", `falta o tema "${tema}"`);
    exigeTexto(sobre.temas[tema], `sobre.json.temas["${tema}"]`);
  }

  return { publicos, sobre, ARQUIVO_POR_PUBLICO };
}

module.exports = { carrega, ARQUIVO_POR_PUBLICO, ErroDeConteudo };
