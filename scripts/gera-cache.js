// DECISIVAS — gera o cache em lote (etapa 7).
//
// Percorre TODOS os recortes que a plataforma serve, na ordem em que uma
// pessoa os encontraria:
//
//   1. os 20 cruzamentos (público × tema), pela rota /api/match;
//   2. os recortes por pauta de cada cruzamento — o gatilho de cada tag, que
//      a rota gera em segundo plano depois de responder; o script espera e
//      confere até todas ficarem disponíveis;
//   3. os três formatos de cada cruzamento (whatsapp, carrossel, roteiro),
//      pela rota /api/formato.
//
// COMO RODAR
//
//   local:      npx wrangler dev  (em outro terminal)  e então
//               node scripts/gera-cache.js
//   produção:   BASE_URL=https://SEU-DOMINIO node scripts/gera-cache.js
//
// Atrás do Cloudflare Access, use um token de serviço (Access → Service Auth):
//
//   BASE_URL=https://SEU-DOMINIO \
//   ACESSO_CLIENT_ID=... ACESSO_CLIENT_SECRET=... node scripts/gera-cache.js
//
// Custo: com OPENROUTER_API_KEY no ambiente, o script consulta o uso da conta
// antes e depois e reporta a diferença — o custo real cobrado, direto da API.
//
// PRÉ-REQUISITOS (docs/06)
//
// - `CACHE_ENABLED = "true"` publicado. Com o cache desligado a geração é paga
//   e não grava nada, e a rota nem gera as tags: o script recusa rodar.
// - `DELETE FROM paginas; DELETE FROM formatos;` aplicado antes, quando prompt
//   ou regra mudaram — isso não invalida o cache sozinho.
// - Sem `[env.*]` no wrangler.toml, a pré-visualização de branch usa o MESMO
//   D1 e o mesmo cache da produção: rode o lote só a partir da main.

const VOCABULARIO = require("../dados/vocabulario.json");
const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const MACRONARRATIVAS = VOCABULARIO.macronarrativas.map((m) => m.id);
const FORMATOS = VOCABULARIO.formatos;

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

// Espera pelas tags: a rota gera o gatilho de cada pauta depois de responder,
// então a primeira resposta pode vir com tags indisponíveis. O script volta a
// pedir a página até todas ficarem prontas.
const TENTATIVAS_TAGS = Number(process.env.TENTATIVAS_TAGS ?? 12);
const ESPERA_TAGS_MS = Number(process.env.ESPERA_TAGS_MS ?? 3000);

function cabecalhos() {
  const h = { "Content-Type": "application/json" };
  if (process.env.ACESSO_CLIENT_ID && process.env.ACESSO_CLIENT_SECRET) {
    h["CF-Access-Client-Id"] = process.env.ACESSO_CLIENT_ID;
    h["CF-Access-Client-Secret"] = process.env.ACESSO_CLIENT_SECRET;
  }
  return h;
}

function espera(ms) {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

async function chama(rota, corpo) {
  const inicio = Date.now();
  const r = await fetch(`${BASE_URL}${rota}`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify(corpo),
  });
  const ms = Date.now() - inicio;
  const texto = await r.text();
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    // Resposta que não é JSON quase sempre é a tela de login do Access.
    const dica = /cloudflareaccess|access\.|<html/i.test(texto)
      ? " (parece a tela do Cloudflare Access: use ACESSO_CLIENT_ID e ACESSO_CLIENT_SECRET)"
      : "";
    return { ok: false, ms, erro: `resposta não-JSON, HTTP ${r.status}${dica}` };
  }
  if (!r.ok) return { ok: false, ms, erro: dados.erro ?? `HTTP ${r.status}` };
  return { ok: true, ms, dados };
}

async function usoAtual(chave) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (!r.ok) return null;
    const { data } = await r.json();
    return data?.total_usage ?? null;
  } catch {
    return null;
  }
}

function paginaSoLacunas(pagina) {
  return ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"].every(
    (campo) => pagina[campo]?.lacuna !== false
  );
}

// Um cruzamento: a página, as tags e os três formatos.
async function fazCruzamento(publico, macronarrativa, relatorio) {
  const rotulo = `${publico} × ${macronarrativa}`;
  const primeira = await chama("/api/match", { publico, macronarrativa });
  if (!primeira.ok) {
    relatorio.erros.push(`${rotulo}: ${primeira.erro}`);
    console.log(`ERRO   ${rotulo}: ${primeira.erro}`);
    return;
  }

  let pagina = primeira.dados;
  if (pagina.cache_habilitado === false) {
    throw new Error(
      "CACHE_ENABLED está \"false\" no destino: a geração seria paga e não gravaria nada. " +
        "Publique CACHE_ENABLED=\"true\" antes de rodar o lote (docs/06)."
    );
  }

  const daPagina = pagina.origem === "cache" ? "cache" : paginaSoLacunas(pagina) ? "lacuna" : "gerada";
  relatorio.paginas[daPagina]++;
  if (daPagina === "gerada") relatorio.temposDePagina.push(primeira.ms);

  // Tags: espera a geração em segundo plano terminar.
  const total = (pagina.tags ?? []).length;
  let tentativas = 0;
  while (tentativas < TENTATIVAS_TAGS && (pagina.tags ?? []).some((t) => !t.disponivel)) {
    await espera(ESPERA_TAGS_MS);
    const nova = await chama("/api/match", { publico, macronarrativa });
    if (!nova.ok) break;
    pagina = nova.dados;
    tentativas++;
  }
  const disponiveis = (pagina.tags ?? []).filter((t) => t.disponivel).length;
  const comGatilho = Object.values(pagina.gatilhos_por_pauta ?? {}).filter((g) => g?.lacuna === false).length;
  relatorio.tags.total += total;
  relatorio.tags.disponiveis += disponiveis;
  relatorio.tags.comGatilho += comGatilho;
  if (disponiveis < total) {
    relatorio.erros.push(`${rotulo}: ${total - disponiveis} tag(s) sem gatilho depois de ${tentativas} tentativa(s)`);
  }

  // Formatos: a página do recorte geral, nos três formatos.
  const porFormato = [];
  for (const formato of FORMATOS) {
    const r = await chama("/api/formato", { formato, pagina });
    if (!r.ok) {
      relatorio.erros.push(`${rotulo} / ${formato}: ${r.erro}`);
      porFormato.push(`${formato}: ERRO`);
      continue;
    }
    const origem = r.dados.origem === "cache" ? "cache" : "gerado";
    relatorio.formatos[origem]++;
    if (origem === "gerado") relatorio.temposDeFormato.push(r.ms);
    porFormato.push(`${formato}: ${origem}`);
  }

  console.log(
    `${daPagina.toUpperCase().padEnd(6)} ${rotulo.padEnd(52)} ` +
      `tags ${disponiveis}/${total} (com gatilho ${comGatilho}) | ${porFormato.join(", ")}`
  );
  relatorio.paginasParaConferencia[rotulo] = pagina;
}

// Item 2 da etapa 7: os três cruzamentos com menos de três trechos elegíveis
// em "O que ancorar" têm de mostrar os itens que existem E a lacuna.
const CONFERIR_ANCORAR = [
  ["60+", "dinheiro no bolso"],
  ["60+", "trabalho digno"],
  ["60+", "brasil e pertencimento"],
];

function media(lista) {
  if (!lista.length) return null;
  return Math.round(lista.reduce((a, b) => a + b, 0) / lista.length);
}

async function main() {
  const chave = process.env.OPENROUTER_API_KEY;
  const usoAntes = chave ? await usoAtual(chave) : null;
  const inicio = Date.now();

  const relatorio = {
    paginas: { gerada: 0, cache: 0, lacuna: 0 },
    tags: { total: 0, disponiveis: 0, comGatilho: 0 },
    formatos: { gerado: 0, cache: 0 },
    temposDePagina: [],
    temposDeFormato: [],
    erros: [],
    paginasParaConferencia: {},
  };

  console.log(`Destino: ${BASE_URL}`);
  console.log(
    `${PUBLICOS.length} públicos × ${MACRONARRATIVAS.length} temas = ${PUBLICOS.length * MACRONARRATIVAS.length} ` +
      `cruzamentos, mais as tags de cada um e ${FORMATOS.length} formatos.\n`
  );

  for (const publico of PUBLICOS) {
    for (const macronarrativa of MACRONARRATIVAS) {
      await fazCruzamento(publico, macronarrativa, relatorio);
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log("\n----- Relatório -----");
  console.log(`Páginas geradas agora:   ${relatorio.paginas.gerada}`);
  console.log(`Páginas já em cache:     ${relatorio.paginas.cache}`);
  console.log(`Páginas só de lacuna:    ${relatorio.paginas.lacuna}`);
  console.log(
    `Tags:                    ${relatorio.tags.disponiveis} de ${relatorio.tags.total} disponíveis ` +
      `(com gatilho: ${relatorio.tags.comGatilho}; o resto em lacuna)`
  );
  console.log(`Formatos gerados agora:  ${relatorio.formatos.gerado}`);
  console.log(`Formatos já em cache:    ${relatorio.formatos.cache}`);
  console.log(`Tempo do lote:           ${minutos} min`);
  const mp = media(relatorio.temposDePagina);
  const mf = media(relatorio.temposDeFormato);
  console.log(`Tempo médio por página gerada:  ${mp === null ? "—" : mp + " ms"}`);
  console.log(`Tempo médio por formato gerado: ${mf === null ? "—" : mf + " ms"}`);

  console.log("\n----- Conferência de 'O que ancorar' com lacuna (etapa 7, item 2) -----");
  for (const [publico, macronarrativa] of CONFERIR_ANCORAR) {
    const pagina = relatorio.paginasParaConferencia[`${publico} × ${macronarrativa}`];
    if (!pagina) { console.log(`${publico} × ${macronarrativa}: não consultado`); continue; }
    const a = pagina.ancorar ?? {};
    console.log(
      `${(publico + " × " + macronarrativa).padEnd(36)} itens: ${(a.itens ?? []).length} | ` +
        `lacuna: ${a.lacuna === true ? "sim" : "não"} | aviso: ${a.aviso ?? "—"}`
    );
  }

  if (chave && usoAntes !== null) {
    const usoDepois = await usoAtual(chave);
    if (usoDepois !== null) {
      console.log(`\nCusto total do lote: US$ ${(usoDepois - usoAntes).toFixed(6)} (uso da conta OpenRouter)`);
    }
  } else {
    console.log("\nCusto total do lote: não disponível (defina OPENROUTER_API_KEY para medir)");
  }

  if (relatorio.erros.length) {
    console.log(`\n${relatorio.erros.length} problema(s):`);
    for (const e of relatorio.erros) console.log(`- ${e}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
