// DECISIVAS — teste comparativo de modelos via OpenRouter
//
// COMO RODAR (Node 20.6+):
//
//   node --env-file=.dev.vars scripts/testa-modelos.js
//
// ou, com a chave já exportada no ambiente:
//
//   OPENROUTER_API_KEY=... node scripts/testa-modelos.js
//
// A chave vem SEMPRE do ambiente (.dev.vars, fora do versionamento).
// Nunca cole a chave neste arquivo.
//
// O que o script faz:
// 1. Confere o saldo de créditos da conta (GET /api/v1/credits).
// 2. Envia o MESMO prompt de teste para cada modelo da lista MODELOS. O prompt
//    de sistema é lido de prompts/gerado/match.txt — o mesmo arquivo que o
//    Worker importa, gerado no build a partir de prompts/match.txt e das
//    planilhas de regra (etapa 5). Não existe cópia do prompt aqui: rode o
//    build antes (`node scripts/sincroniza-tokens.js`).
// 3. Imprime por modelo: nome, tempo de resposta, tokens de entrada e
//    saída, custo informado pela API e se a resposta é o JSON esperado.
//
// Os trechos do teste saem de dados/DECISIVAS_acervo_v5.xlsx, no cruzamento de
// CRUZAMENTO_DE_TESTE, já na taxonomia da migração 003. A mensagem é montada
// como o Worker monta (agrupada por tipo, com o número de itens pedido); o
// montador canônico é montaMensagemUsuario em src/worker.js, e este aqui é um
// espelho para o teste — mexeu num, confira o outro.
//
// A lista ativa contém apenas modelos GRATUITOS (sufixo :free), que rodam
// sem crédito na conta. Os pagos, de faixas de preço diferentes, estão
// comentados: descomente depois de adicionar créditos. Confira os
// identificadores vigentes em https://openrouter.ai/models — eles mudam
// com o tempo; um id inválido aparece como erro na tabela, sem derrubar
// os demais.

const MODELOS = [
  // ---- Gratuitos (rodam sem créditos) ----
  "deepseek/deepseek-chat-v3.1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-235b-a22b:free",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-20b:free",

  // ---- Pagos (descomente quando a conta tiver créditos) ----
  // Faixa barata:
  // "google/gemini-2.5-flash-lite",
  // "deepseek/deepseek-chat-v3.1",
  // Faixa intermediária:
  // "openai/gpt-5-mini",
  // "google/gemini-2.5-flash",
  // "anthropic/claude-haiku-4.5",
  // Faixa cara (referência de qualidade):
  // "anthropic/claude-sonnet-4.5",
  // "google/gemini-2.5-pro",
];

// Prompt de sistema: fonte única, gerada no build.
const fs = require("node:fs");
const ExcelJS = require("exceljs");

const ARQUIVO_PROMPT = "prompts/gerado/match.txt";
if (!fs.existsSync(ARQUIVO_PROMPT)) {
  console.error(
    `${ARQUIVO_PROMPT} não existe. Rode o build primeiro: node scripts/sincroniza-tokens.js`
  );
  process.exit(1);
}
const PROMPT_SISTEMA = fs.readFileSync(ARQUIVO_PROMPT, "utf8").trim();

// Cruzamento do teste. `60+` × `trabalho digno` é pequeno (6 achados, 2
// funciona, 3 afasta, 1 contexto) e exercita o caso mais difícil do contrato:
// "ancorar" com menos de três itens elegíveis.
const CRUZAMENTO_DE_TESTE = { publico: "60+", macronarrativa: "trabalho digno" };

const ORDEM_DOS_TIPOS = ["achado", "funciona", "afasta", "contexto", "verbatim"];
const CABECALHO_DO_TIPO = {
  achado: 'Trechos do tipo "achado" — o que a pesquisa encontrou.',
  funciona: 'Trechos do tipo "funciona" — o que aproxima este público deste tema.',
  afasta: 'Trechos do tipo "afasta" — o que afasta este público deste tema.',
  contexto: 'Trechos do tipo "contexto" — o cenário em que o tema chega a este público.',
  verbatim:
    'Trechos do tipo "verbatim" — REFERÊNCIA DE LINGUAGEM. São falas de ' +
    "participantes, para calibrar vocabulário e tom. NÃO sustentam afirmação: " +
    "nunca use um verbatim como evidência de um achado.",
};

async function trechosDoCruzamento() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("dados/DECISIVAS_acervo_v5.xlsx");
  const ws = wb.getWorksheet("acervo");
  const cabecalho = ws.getRow(1).values.map((v) => (v ?? "").toString().trim());
  const coluna = (nome) => cabecalho.indexOf(nome);
  const trechos = [];
  ws.eachRow((linha, n) => {
    if (n === 1) return;
    const valor = (nome) => {
      const v = linha.getCell(coluna(nome)).value;
      return v === null || v === undefined ? "" : String(v).trim();
    };
    if (
      valor("publico") === CRUZAMENTO_DE_TESTE.publico &&
      valor("macronarrativa") === CRUZAMENTO_DE_TESTE.macronarrativa
    ) {
      trechos.push({
        id: valor("id"), tipo: valor("tipo"), forca: valor("forca"),
        pauta: valor("pauta"), texto: valor("texto"),
      });
    }
  });
  return trechos;
}

function montaMensagem(trechos) {
  const grupos = [];
  for (const tipo of ORDEM_DOS_TIPOS) {
    const doTipo = trechos.filter((t) => t.tipo === tipo);
    if (!doTipo.length) continue;
    const linhas = doTipo.map((t) => {
      const meta = [`id: ${t.id}`];
      if (t.forca) meta.push(`força: ${t.forca}`);
      if (t.pauta) meta.push(`pauta: ${t.pauta}`);
      return `[${meta.join(" | ")}]\n${t.texto}`;
    });
    grupos.push(`${CABECALHO_DO_TIPO[tipo]}\n\n${linhas.join("\n\n")}`);
  }
  const quantos = {
    ancorar: Math.min(3, trechos.filter((t) => t.tipo === "funciona").length),
    evitar: Math.min(3, trechos.filter((t) => t.tipo === "afasta").length),
  };
  const itens = ["ancorar", "evitar"]
    .map((campo) =>
      quantos[campo] === 0
        ? `- "${campo}": "LACUNA" — não há trecho elegível neste recorte.`
        : `- "${campo}": exatamente ${quantos[campo]} ${quantos[campo] === 1 ? "item" : "itens"}.`
    )
    .join("\n");
  return [
    `Match: publico = "${CRUZAMENTO_DE_TESTE.publico}", macronarrativa = "${CRUZAMENTO_DE_TESTE.macronarrativa}".`,
    `Itens pedidos neste recorte (RS06 — nunca complete para chegar a três):\n${itens}`,
    `Trechos fornecidos, agrupados por tipo:\n\n${grupos.join("\n\n")}`,
  ].join("\n\n");
}

const API = "https://openrouter.ai/api/v1";

async function consultaCreditos(chave) {
  const r = await fetch(`${API}/credits`, {
    headers: { Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ao consultar créditos`);
  const { data } = await r.json();
  return (data?.total_credits ?? 0) - (data?.total_usage ?? 0);
}

async function testaModelo(chave, modelo, promptUsuario) {
  const inicio = Date.now();
  const r = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: PROMPT_SISTEMA },
        { role: "user", content: promptUsuario },
      ],
      temperature: 0,
      // Pede à API o custo real da geração, junto com a contagem de tokens.
      usage: { include: true },
    }),
  });
  const ms = Date.now() - inicio;

  const corpo = await r.json().catch(() => null);
  if (!r.ok || corpo?.error) {
    const msg = corpo?.error?.message ?? `HTTP ${r.status}`;
    return { modelo, erro: msg, ms };
  }

  const texto = corpo.choices?.[0]?.message?.content ?? "";
  const uso = corpo.usage ?? {};

  // O formato exigido é JSON puro; medir a obediência faz parte do teste.
  let jsonValido = false;
  try {
    const semCerca = texto.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    const j = JSON.parse(semCerca);
    // Contrato da etapa 5: cinco campos; ancorar e evitar com 0 a 3 itens.
    const campos = ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"];
    const itensOk = (c) =>
      c === "LACUNA" || (c && Array.isArray(c.itens) && c.itens.length <= 3);
    jsonValido =
      campos.every((campo) => campo in j) && itensOk(j.ancorar) && itensOk(j.evitar);
  } catch {
    jsonValido = false;
  }

  return {
    modelo,
    ms,
    tokensEntrada: uso.prompt_tokens ?? null,
    tokensSaida: uso.completion_tokens ?? null,
    custoUSD: uso.cost ?? 0,
    jsonValido,
    amostra: texto.slice(0, 120).replace(/\s+/g, " "),
  };
}

async function main() {
  const chave = process.env.OPENROUTER_API_KEY;
  if (!chave) {
    console.error(
      "OPENROUTER_API_KEY ausente. Rode com: node --env-file=.dev.vars scripts/testa-modelos.js"
    );
    process.exit(1);
  }

  try {
    const saldo = await consultaCreditos(chave);
    console.log(`Saldo de créditos na conta: US$ ${saldo.toFixed(4)}`);
    if (saldo <= 0) {
      console.log(
        "Sem créditos: mantenha apenas os modelos :free na lista MODELOS.\n"
      );
    } else {
      console.log(
        "Há créditos: você pode descomentar os modelos pagos em MODELOS.\n"
      );
    }
  } catch (e) {
    console.warn(`Não foi possível consultar o saldo (${e.message}); seguindo.\n`);
  }

  const trechos = await trechosDoCruzamento();
  const promptUsuario = montaMensagem(trechos);
  console.log(
    `Cruzamento do teste: ${CRUZAMENTO_DE_TESTE.publico} × ${CRUZAMENTO_DE_TESTE.macronarrativa} ` +
      `— ${trechos.length} trechos, prompt de sistema com ${PROMPT_SISTEMA.length} caracteres.\n`
  );
  console.log(`Testando ${MODELOS.length} modelo(s), um por vez...\n`);
  const resultados = [];
  for (const modelo of MODELOS) {
    process.stdout.write(`- ${modelo} ... `);
    try {
      const res = await testaModelo(chave, modelo, promptUsuario);
      resultados.push(res);
      console.log(res.erro ? `ERRO: ${res.erro}` : `${res.ms} ms`);
    } catch (e) {
      resultados.push({ modelo, erro: e.message, ms: null });
      console.log(`ERRO: ${e.message}`);
    }
  }

  console.log("\n=== Resultado ===\n");
  for (const r of resultados) {
    console.log(`Modelo:          ${r.modelo}`);
    if (r.erro) {
      console.log(`  Erro:          ${r.erro}\n`);
      continue;
    }
    console.log(`  Tempo:         ${r.ms} ms`);
    console.log(`  Tokens:        ${r.tokensEntrada} entrada / ${r.tokensSaida} saída`);
    console.log(`  Custo:         US$ ${Number(r.custoUSD).toFixed(6)}`);
    console.log(`  JSON no formato: ${r.jsonValido ? "sim" : "NÃO"}`);
    console.log(`  Início da resposta: ${r.amostra}\n`);
  }
}

main();
