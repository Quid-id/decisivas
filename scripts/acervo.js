// DECISIVAS — leitura do acervo para o build.
//
// A seção "Explorar o acervo" de cada caminho precisa dizer quantos trechos o
// acervo tem naquele cruzamento e quais pautas existem ali. Isso vem do próprio
// acervo (`dados/DECISIVAS_acervo_v5.xlsx`), não de número escrito à mão: o
// banco não é alcançável no build, e a planilha é a mesma fonte que a carga usa.

const ExcelJS = require("exceljs");

const ARQUIVO = "dados/DECISIVAS_acervo_v5.xlsx";
const ABA = "acervo";
// Uma pauta só vira botão com 3 ou mais trechos no cruzamento (etapa 4, e
// mantido na 10): com um ou dois, o botão entrega quase nada.
const MINIMO_DE_TRECHOS = 3;
// A pauta transversal não vira botão: ela vale para os cinco temas e casaria
// em todo cruzamento, sem dizer nada sobre este.
const PAUTA_TRANSVERSAL = "comunicação e linguagem";
// Os tipos que o "Explorar o acervo" devolve. `perfil` descreve o público e
// não pertence a um tema; `exemplo` não tem linha no acervo.
const TIPOS_NA_TELA = new Set(["achado", "funciona", "afasta", "verbatim", "contexto"]);

async function resumo() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ARQUIVO);
  const ws = wb.getWorksheet(ABA);
  if (!ws) throw new Error(`${ARQUIVO}: aba "${ABA}" não encontrada`);

  const cabecalho = ws.getRow(1).values.map((v) => (v ?? "").toString().trim());
  const coluna = (nome) => cabecalho.indexOf(nome);
  const por = new Map();

  ws.eachRow((linha, n) => {
    if (n === 1) return;
    const valor = (nome) => {
      const v = linha.getCell(coluna(nome)).value;
      return v === null || v === undefined ? "" : String(v).trim();
    };
    const publico = valor("publico");
    const macronarrativa = valor("macronarrativa");
    if (!publico || !macronarrativa) return;   // perfil não pertence a um tema
    if (!TIPOS_NA_TELA.has(valor("tipo"))) return;
    const chave = `${publico}|${macronarrativa}`;
    if (!por.has(chave)) por.set(chave, { trechos: 0, achados: 0, pautas: new Map() });
    const item = por.get(chave);
    item.trechos += 1;
    if (valor("tipo") === "achado") item.achados += 1;
    const pauta = valor("pauta");
    if (pauta) item.pautas.set(pauta, (item.pautas.get(pauta) ?? 0) + 1);
  });

  // As pautas mais presentes primeiro: são os atalhos que fazem sentido
  // oferecer quando o recurso ligar.
  const resultado = new Map();
  for (const [chave, item] of por) {
    resultado.set(chave, {
      trechos: item.trechos,
      achados: item.achados,
      // Da mais presente para a menos, só as que passam do corte, fora a
      // transversal: são exatamente as pautas que o botão consulta no banco.
      pautas: [...item.pautas.entries()]
        .filter(([pauta, n]) => n >= MINIMO_DE_TRECHOS && pauta !== PAUTA_TRANSVERSAL)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .map(([pauta]) => pauta),
    });
  }
  return resultado;
}

module.exports = { resumo };
