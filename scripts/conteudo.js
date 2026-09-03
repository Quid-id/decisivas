// DECISIVAS — carrega e valida o conteúdo das páginas (etapa 8B).
//
// As 20 páginas são texto fixo, escrito pela equipe e validado pelo jurídico.
// Este módulo é a única porta de entrada desse texto no build: se a estrutura
// não estiver como a especificação define, o build **falha com o caminho do
// campo** em vez de publicar página pela metade.
//
// As REGRAS de estrutura não vivem aqui: vivem em `src/valida-conteudo.cjs`,
// compartilhadas com o Worker, porque o painel da etapa 9 valida a mesma coisa
// antes de gravar. Aqui fica só a leitura dos arquivos — o que é do build.
//
// O mapa de arquivo por público é explícito, e não derivado de slug: o
// identificador do banco, o nome na tela, o slug da URL e o nome do arquivo
// são quatro coisas diferentes, e o 70+ é a prova (id `60+`, slug `70-mais`,
// arquivo `70mais.json`).

const fs = require("node:fs");
const regras = require("../src/valida-conteudo.cjs");

const PASTA = "conteudo";

const { ARQUIVO_POR_PUBLICO, ErroDeConteudo, exige } = regras;

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
      throw new ErroDeConteudo(caminho, `JSON inválido — ${e.message}`);
    }
    regras.validaPublico(dados, temas, caminho);
    publicos[publico.id] = dados;
  }

  const caminhoSobre = `${PASTA}/sobre.json`;
  exige(fs.existsSync(caminhoSobre), caminhoSobre, "arquivo de conteúdo não encontrado");
  const sobre = JSON.parse(fs.readFileSync(caminhoSobre, "utf8"));
  regras.validaSobre(sobre, temas);

  return { publicos, sobre, ARQUIVO_POR_PUBLICO };
}

module.exports = { carrega, ARQUIVO_POR_PUBLICO, ErroDeConteudo };
