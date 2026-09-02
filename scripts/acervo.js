// DECISIVAS — leitura do acervo para o build.
//
// A seção "Explorar o acervo" de cada caminho precisa dizer quantos trechos o
// acervo tem naquele cruzamento e quais pautas existem ali. Isso vem do próprio
// acervo (`dados/DECISIVAS_acervo_v5.xlsx`), não de número escrito à mão: o
// banco não é alcançável no build, e a planilha é a mesma fonte que a carga usa.

const ExcelJS = require("exceljs");

const ARQUIVO = "dados/DECISIVAS_acervo_v5.xlsx";
const ABA = "acervo";
const PAUTAS_POR_CRUZAMENTO = 5;   // quantos botões de pauta a seção mostra

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
      pautas: [...item.pautas.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .slice(0, PAUTAS_POR_CRUZAMENTO)
        .map(([pauta]) => pauta),
    });
  }
  return resultado;
}

module.exports = { resumo };
