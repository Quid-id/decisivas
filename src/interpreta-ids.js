// DECISIVAS — a única saída que o modelo tem no "Explorar o acervo".
//
// Módulo próprio, e não uma função dentro do Worker, para ser testável fora do
// Worker: é ele que garante que o modelo não escreve na tela. A regra 3 do
// CLAUDE.md depende deste arquivo.
//
// O modelo recebe a pergunta e a lista numerada de trechos do cruzamento
// (prompts/explorar.txt) e só pode responder `{"ids": [n, n, ...]}`. Aqui:
//
//   - cerca de código é tolerada: modelo que responde ```json {...} ``` teve a
//     cerca removida antes da leitura, porque o JSON dentro dela é a resposta
//     certa e recusá-la só apagaria resultado bom;
//   - qualquer outra coisa vira lista vazia — prosa, JSON de outro formato,
//     resposta em branco;
//   - número que não aponta para um trecho da lista é descartado;
//   - repetido é descartado;
//   - acima do teto, o excedente é cortado.
//
// Lista vazia significa "sem resultado" na tela, com o aviso da configuração.
// Não existe caminho pelo qual texto do modelo chegue a uma página.

// Tira a cerca de código, quando houver: ```json na abertura (ou só ```) e
// ``` no fim. Nada além disso é tolerado — texto antes ou depois da cerca
// continua invalidando a resposta.
function semCerca(bruto) {
  const texto = String(bruto).trim();
  const cercado = texto.match(/^```(?:[a-zA-Z]+)?\s*([\s\S]*?)\s*```$/);
  return cercado ? cercado[1].trim() : texto;
}

export function interpretaIds(bruto, quantos, teto) {
  let dados;
  try {
    dados = JSON.parse(semCerca(bruto));
  } catch (e) {
    return [];
  }
  if (!dados || !Array.isArray(dados.ids)) return [];
  const vistos = new Set();
  const validos = [];
  for (const n of dados.ids) {
    const i = Number(n);
    if (!Number.isInteger(i) || i < 1 || i > quantos || vistos.has(i)) continue;
    vistos.add(i);
    validos.push(i);
    if (validos.length === teto) break;
  }
  return validos;
}
