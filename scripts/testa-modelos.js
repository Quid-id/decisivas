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
// 2. Envia o MESMO prompt de teste — o prompt de sistema real de
//    docs/03-regras-do-agente.md com três trechos de data/amostra.csv
//    (match idosos × dinheiro no bolso) — para cada modelo da lista MODELOS.
// 3. Imprime por modelo: nome, tempo de resposta, tokens de entrada e
//    saída, custo informado pela API e se a resposta é o JSON esperado.
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

// Prompt de sistema de docs/03-regras-do-agente.md, na íntegra.
const PROMPT_SISTEMA = `Você prepara o material para que uma pessoa escreva a própria comunicação
de um tema de interesse público a um público específico, usando exclusivamente
os trechos de pesquisa fornecidos abaixo. Você NÃO escreve a mensagem:
entrega o material de apoio. Regras absolutas:

1. Use somente os trechos fornecidos. Não acrescente fatos, números, exemplos
   ou afirmações de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Cada campo preenchido deve listar os ids dos trechos usados.
5. Campo sem trechos suficientes recebe o valor "LACUNA". Nunca preencha por
   aproximação.
6. Campo em lacuna recebe a string "LACUNA" no lugar do objeto inteiro — nunca
   um objeto com "LACUNA" dentro de "texto" ou "itens".
7. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
8. Trechos com base "restrita" que afirmem prevalência mantêm o escopo
   "entre os participantes do estudo".
9. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

Os campos:
- "gatilho": o ângulo que mobiliza este público neste tema, em uma ou duas
  frases, derivado dos trechos de tipo "achado". É o núcleo do que a mensagem
  precisa tocar.
- "ancorar": exatamente três elementos concretos que a mensagem deve conter,
  vindos dos trechos de tipo "funciona".
- "evitar": exatamente três elementos que a mensagem não deve conter, vindos
  dos trechos de tipo "afasta".
- "contexto": por que isso importa para este público, em uma ou duas frases.
- "pesquisa": o que o acervo mostra sobre este cruzamento.

Formato: {"gatilho": {"texto": "...", "ids": []},
          "ancorar": {"itens": ["...","...","..."], "ids": []},
          "evitar": {"itens": ["...","...","..."], "ids": []},
          "contexto": {"texto": "...", "ids": []},
          "pesquisa": {"texto": "...", "ids": []}}`;

// Três trechos reais de data/amostra.csv (match: idosos × dinheiro no bolso).
// Poucos trechos de propósito: mede o caso real, incluindo o dever de
// devolver LACUNA nos campos sem evidência suficiente.
const PROMPT_USUARIO = `Match: publico = "idosos", macronarrativa = "dinheiro no bolso".

Trechos fornecidos:

[id: D01-TR-023 | tipo: achado | força: forte | base: restrita]
São poucos os relatos de satisfação com a aposentadoria. A razão essencial está no valor pago à maioria dos aposentados, exatamente na fase da vida em que gastos com remédios comprometem bastante o orçamento.

[id: D01-TR-024 | tipo: achado | força: indício | base: restrita]
Quando a aposentadoria não sustenta o custo de vida, restam seguir trabalhando ou depender do auxílio de filhos e netos. Essa condição impacta negativamente o emocional e chega a gerar quadros de depressão.

[id: D01-TR-025 | tipo: verbatim | base: restrita]
"A gente passa a vida sonhando com ela e quando ela chega é uma droga."`;

const API = "https://openrouter.ai/api/v1";

async function consultaCreditos(chave) {
  const r = await fetch(`${API}/credits`, {
    headers: { Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ao consultar créditos`);
  const { data } = await r.json();
  return (data?.total_credits ?? 0) - (data?.total_usage ?? 0);
}

async function testaModelo(chave, modelo) {
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
        { role: "user", content: PROMPT_USUARIO },
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
    jsonValido = ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"]
      .every((campo) => campo in j);
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

  console.log(`Testando ${MODELOS.length} modelo(s), um por vez...\n`);
  const resultados = [];
  for (const modelo of MODELOS) {
    process.stdout.write(`- ${modelo} ... `);
    try {
      const res = await testaModelo(chave, modelo);
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
