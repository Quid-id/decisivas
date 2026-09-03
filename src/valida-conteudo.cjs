// DECISIVAS — as regras de estrutura do conteúdo, em módulo compartilhado.
//
// Lugar único das regras que a especificação fixa para `conteudo/*.json`: dois
// parágrafos em "por que importa", três cards de dados, de 1 a 3 cards em
// "funciona" e "não funciona", cinco linhas de resumo, número em destaque de
// até 8 caracteres. Quem as aplica:
//
//   - o build, por `scripts/conteudo.js`, que lê os arquivos e derruba a
//     publicação quando a estrutura não fecha (etapa 8B/8C);
//   - o Worker, por `src/cms.js`, ANTES de o painel gravar (etapa 9). O erro
//     aparece no campo do formulário, e não como falha de deploy.
//
// Por isso este arquivo não toca em disco e não conhece nome de arquivo: recebe
// a estrutura já em memória e o caminho legível de onde ela veio. `.cjs` porque
// os scripts do build são CommonJS e o Worker é ESM — a extensão explícita
// deixa os dois carregarem o mesmo arquivo.
//
// Todo erro carrega o CAMPO. É o que permite ao painel acender o campo errado
// em vez de mostrar uma mensagem genérica.

// Zero é válido: bloco sem card não é renderizado (a caixa de lacuna saiu da
// página na etapa 8C). Três é o teto do layout.
const MINIMO_CARDS = 0;
const MAXIMO_CARDS = 3;
const LINHAS_DE_RESUMO = 5;
const PARAGRAFOS_POR_QUE = 2;
const CARDS_DE_DADOS = 3;
const CARDS_COMO_CHEGAR = 3;
// O número em destaque do card cabe em 8 caracteres ("nº 1", "10,4 mi",
// "1 em 4"). Acima disso ele estoura o card, então a entrega recusa.
const MAXIMO_DO_NUMERO = 8;

// Qual arquivo guarda qual público. Explícito, e não derivado de slug: o
// identificador do banco, o nome na tela, o slug da URL e o nome do arquivo são
// quatro coisas diferentes, e o 70+ é a prova (id `60+`, slug `70-mais`,
// arquivo `70mais.json`). Mora aqui porque o build e o painel precisam do mesmo
// mapa — o painel para saber que arquivo abrir, o build para ler.
const ARQUIVO_POR_PUBLICO = {
  "jovens": "jovens.json",
  "60+": "70mais.json",
  "mulheres beneficiárias": "mulheres-beneficiarias.json",
  "mulheres de 2 a 5 salários mínimos": "mulheres-2-a-5-sm.json",
};

class ErroDeConteudo extends Error {
  constructor(campo, oQue) {
    super(`${campo}: ${oQue}`);
    this.campo = campo;
    this.oQue = oQue;
  }
}

function exige(condicao, campo, oQue) {
  if (!condicao) throw new ErroDeConteudo(campo, oQue);
}

function exigeCurto(valor, campo) {
  exige(
    String(valor).length <= MAXIMO_DO_NUMERO,
    campo,
    `número em destaque com no máximo ${MAXIMO_DO_NUMERO} caracteres, tem ${String(valor).length}`
  );
}

function exigeTexto(valor, campo) {
  exige(typeof valor === "string" && valor.trim().length > 0, campo, "texto obrigatório, ausente ou vazio");
}

function exigeLista(valor, campo, minimo, maximo) {
  exige(Array.isArray(valor), campo, "deveria ser uma lista");
  exige(
    valor.length >= minimo && valor.length <= maximo,
    campo,
    `deveria ter de ${minimo} a ${maximo} itens, tem ${valor.length}`
  );
}

function validaCards(cards, campo) {
  exigeLista(cards, campo, MINIMO_CARDS, MAXIMO_CARDS);
  cards.forEach((card, i) => {
    exigeTexto(card.titulo, `${campo}[${i}].titulo`);
    exigeTexto(card.texto, `${campo}[${i}].texto`);
  });
}

function validaPagina(pagina, campo) {
  exige(pagina && typeof pagina === "object", campo, "objeto obrigatório");
  exigeTexto(pagina.titulo, `${campo}.titulo`);
  exigeTexto(pagina.linha, `${campo}.linha`);

  exige(pagina.por_que && typeof pagina.por_que === "object", `${campo}.por_que`, "objeto obrigatório");
  exigeLista(pagina.por_que.texto, `${campo}.por_que.texto`, PARAGRAFOS_POR_QUE, PARAGRAFOS_POR_QUE);
  pagina.por_que.texto.forEach((p, i) => exigeTexto(p, `${campo}.por_que.texto[${i}]`));
  exigeLista(pagina.por_que.dados, `${campo}.por_que.dados`, CARDS_DE_DADOS, CARDS_DE_DADOS);
  pagina.por_que.dados.forEach((dado, i) => {
    exigeTexto(dado.titulo, `${campo}.por_que.dados[${i}].titulo`);
    exigeTexto(dado.texto, `${campo}.por_que.dados[${i}].texto`);
    // `n` é opcional: é o número em destaque, e só o primeiro card o usa.
    if (dado.n !== undefined) {
      exigeTexto(dado.n, `${campo}.por_que.dados[${i}].n`);
      exigeCurto(dado.n, `${campo}.por_que.dados[${i}].n`);
    }
  });

  validaCards(pagina.funciona, `${campo}.funciona`);
  validaCards(pagina.nao_funciona, `${campo}.nao_funciona`);

  exigeLista(pagina.resumo, `${campo}.resumo`, LINHAS_DE_RESUMO, LINHAS_DE_RESUMO);
  pagina.resumo.forEach((linha, i) => exigeTexto(linha, `${campo}.resumo[${i}]`));

  // `lacuna` não é mais lido pelo build: a caixa de aviso saiu da página. O
  // campo segue nos arquivos, e é ignorado — não se valida o que não se usa.
}

function validaPublico(dados, temas, arquivo) {
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

function validaSobre(sobre, temas) {
  for (const campo of ["projeto", "como_foi_feito", "publicos_intro", "aviso_ia", "privacidade"]) {
    exigeTexto(sobre[campo], `sobre.json.${campo}`);
  }
  exige(sobre.temas && typeof sobre.temas === "object", "sobre.json.temas", "objeto obrigatório");
  if (sobre.revisado_em !== undefined) exigeTexto(sobre.revisado_em, "sobre.json.revisado_em");
  for (const tema of temas ?? []) {
    exige(sobre.temas[tema] !== undefined, "sobre.json.temas", `falta o tema "${tema}"`);
    exigeTexto(sobre.temas[tema], `sobre.json.temas["${tema}"]`);
  }
}

module.exports = {
  ARQUIVO_POR_PUBLICO,
  ErroDeConteudo,
  exige,
  exigeTexto,
  exigeCurto,
  exigeLista,
  validaPagina,
  validaPublico,
  validaSobre,
  MAXIMO_DO_NUMERO,
  LINHAS_DE_RESUMO,
  MAXIMO_CARDS,
  CARDS_DE_DADOS,
  CARDS_COMO_CHEGAR,
  PARAGRAFOS_POR_QUE,
};
