// DECISIVAS — converte as planilhas de regra em blocos de texto e monta os
// prompts do agente. Roda no build (chamado por scripts/sincroniza-tokens.js),
// antes de `wrangler dev` e `wrangler deploy`, inclusive nos deploys por push.
//
// Por que existir: o prompt de sistema tem de viver num só lugar (etapa 5 da
// especificação). As fontes são:
//
//   prompts/match.txt    → prompt da rota /api/match (recorte geral)
//   prompts/pauta.txt    → prompt do recorte por pauta (só o gatilho)
//   prompts/formato.txt  → prompt da rota /api/formato
//
// e as regras, que entram nesses arquivos por marcador:
//
//   {{REGRAS_GERAIS}}      ← dados/Regra_geral_formatos.xlsx  (RG)
//   {{REGRAS_GATILHO}}     ← dados/Regra_gatilho.xlsx         (RGT)
//   {{REGRAS_SELECAO}}     ← dados/Regra_selecao.xlsx         (RS)
//   {{REGRAS_DE_FORMATO}}  ← docs/08-regras-de-formato.md
//
// A saída vai para prompts/gerado/, fora do versionamento: quem lê é o Worker
// (por import de texto) e scripts/testa-modelos.js. Ninguém edita à mão, e
// nenhuma cópia do prompt existe em outro lugar do repositório — docs/03
// aponta para cá.
//
// {{NOME_DO_FORMATO}} é o único marcador que sobrevive à geração: o Worker o
// substitui em tempo de execução, porque o formato só se conhece na requisição.

const fs = require("node:fs");
const ExcelJS = require("exceljs");
const { escreveSeMudou } = require("./escreve-se-mudou");

const SAIDA = "prompts/gerado";

// O que entra no bloco de regras, e o que fica de fora:
//
// - linha com id no padrão da planilha (RG01, RGT03, RS07): entra, com a
//   categoria e a verificação, que é o que torna a regra conferível;
// - linha de nota que começa com "Ordem de aplicação": entra como última
//   linha, porque é regra de precedência entre as regras (Regra_selecao);
// - cabeçalho, instruções de manutenção da planilha, notas de origem e linhas
//   "Em aberto": ficam fora. Não são regra, e "Em aberto" é justamente o que
//   ainda não foi decidido.
//
// A coluna `origem` não vai ao modelo: é rastreabilidade interna, e cita nomes
// de pessoas que não têm por que entrar num prompt.
const PLANILHAS = {
  REGRAS_GERAIS: {
    arquivo: "dados/Regra_geral_formatos.xlsx",
    aba: "regra_geral_formatos",
    prefixo: "RG",
    cabecalho:
      "REGRAS GERAIS (RG) — valem para o material do match e para a adaptação de\n" +
      "formato. Cada regra vem com a verificação que diz se foi cumprida. Em\n" +
      "conflito com o documento de regras de formato, estas regras prevalecem.",
  },
  REGRAS_GATILHO: {
    arquivo: "dados/Regra_gatilho.xlsx",
    aba: "regra_gatilho",
    prefixo: "RGT",
    cabecalho:
      "REGRAS DE GATILHO (RGT) — valem para o campo \"gatilho\", no recorte geral e\n" +
      "no recorte de cada pauta.",
  },
  REGRAS_SELECAO: {
    arquivo: "dados/Regra_selecao.xlsx",
    aba: "regra_selecao",
    prefixo: "RS",
    cabecalho:
      "REGRAS DE SELEÇÃO (RS) — valem para escolher os itens de \"ancorar\" (trechos\n" +
      "de tipo funciona) e de \"evitar\" (trechos de tipo afasta).",
  },
};

function texto(celula) {
  const v = celula?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.result === "string") return v.result;
    return String(v);
  }
  return String(v).trim();
}

async function blocoDaPlanilha(chave, { arquivo, aba, prefixo, cabecalho }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);
  const ws = wb.getWorksheet(aba);
  if (!ws) throw new Error(`${arquivo}: aba "${aba}" não encontrada`);

  const padraoId = new RegExp(`^${prefixo}\\d+$`);
  const regras = [];
  const ordemDeAplicacao = [];

  ws.eachRow((linha) => {
    const primeira = texto(linha.getCell(1));
    if (padraoId.test(primeira)) {
      const regra = texto(linha.getCell(2));
      const categoria = texto(linha.getCell(3));
      const verificacao = texto(linha.getCell(4));
      if (!regra) throw new Error(`${arquivo}: ${primeira} sem texto de regra`);
      if (!verificacao) {
        // A própria planilha diz que regra sem verificação não orienta o agente.
        throw new Error(`${arquivo}: ${primeira} sem verificação — não pode ir ao prompt`);
      }
      regras.push({ id: primeira, regra, categoria, verificacao });
    } else if (/^Ordem de aplicação/i.test(primeira)) {
      ordemDeAplicacao.push(primeira);
    }
  });

  if (!regras.length) throw new Error(`${arquivo}: nenhuma regra ${prefixo} encontrada`);
  const ids = new Set(regras.map((r) => r.id));
  if (ids.size !== regras.length) throw new Error(`${arquivo}: id de regra repetido`);

  const linhas = regras.map(
    (r) =>
      `- ${r.id}${r.categoria ? ` [${r.categoria}]` : ""} ${r.regra}\n` +
      `  Verificação: ${r.verificacao}`
  );
  const corpo = [cabecalho, "", ...linhas, ...ordemDeAplicacao.map((o) => `\n${o}`)].join("\n");
  return { chave, texto: corpo, quantas: regras.length };
}

async function main() {
  const blocos = {};
  const relatorio = [];
  for (const [chave, config] of Object.entries(PLANILHAS)) {
    const bloco = await blocoDaPlanilha(chave, config);
    blocos[chave] = bloco.texto;
    relatorio.push(`${config.prefixo}: ${bloco.quantas} regras (${config.arquivo})`);
  }

  // O documento de formatos entra inteiro, como está: é a fonte dos limites de
  // cada formato (docs/08). A precedência da planilha em conflito está escrita
  // no prompt e no cabeçalho do próprio documento.
  blocos.REGRAS_DE_FORMATO =
    "DOCUMENTO DE REGRAS DE FORMATO (docs/08-regras-de-formato.md), na íntegra:\n\n" +
    fs.readFileSync("docs/08-regras-de-formato.md", "utf8").trim();

  fs.mkdirSync(SAIDA, { recursive: true });
  let mudaram = 0;
  for (const nome of ["match", "pauta", "formato"]) {
    const origem = `prompts/${nome}.txt`;
    let conteudo = fs.readFileSync(origem, "utf8");

    for (const [chave, valor] of Object.entries(blocos)) {
      const marcador = `{{${chave}}}`;
      if (conteudo.includes(marcador)) conteudo = conteudo.split(marcador).join(valor);
    }

    // Marcador esquecido é erro de build, não detalhe: o prompt iria ao modelo
    // com um buraco. {{NOME_DO_FORMATO}} é a exceção, resolvida no Worker.
    const restantes = [...conteudo.matchAll(/\{\{([A-Z_]+)\}\}/g)]
      .map((m) => m[1])
      .filter((m) => m !== "NOME_DO_FORMATO");
    if (restantes.length) {
      throw new Error(`${origem}: marcador não substituído: ${[...new Set(restantes)].join(", ")}`);
    }

    // Sem cabeçalho de "arquivo gerado": o conteúdo deste arquivo É o prompt de
    // sistema, entregue ao modelo palavra por palavra. Que é gerado está dito na
    // pasta (prompts/gerado/, fora do versionamento) e aqui neste script.
    const destino = `${SAIDA}/${nome}.txt`;
    if (escreveSeMudou(destino, conteudo.trim() + "\n")) mudaram++;
    relatorio.push(`${destino}: ${(fs.statSync(destino).size / 1024).toFixed(1)} KB`);
  }

  console.log(
    `prompts gerados (${mudaram} arquivo(s) reescrito(s)) —`,
    relatorio.join(" | ")
  );
}

module.exports = { main };

if (require.main === module) {
  main().catch((e) => {
    console.error("FALHA ao gerar os prompts:", e.message);
    process.exit(1);
  });
}
