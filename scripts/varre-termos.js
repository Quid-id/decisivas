// DECISIVAS — varredura de termos bloqueados sobre o cache (etapa 7, item 3).
//
// Lê o que a plataforma tem guardado e procura, em todo o texto entregue,
// qualquer item de BLOCKED_TERMS. O resultado esperado é ZERO ocorrências.
//
// A lista tem SOMENTE nomes próprios — sobrenomes de figuras políticas, nomes
// e siglas de partidos, nomes de coligações. Nunca palavras temáticas ("voto",
// "eleição"): são vocabulário legítimo do acervo. Ela vive em variável de
// ambiente, fora do repositório.
//
// COMO RODAR
//
// Pelas rotas (o que o cache entrega de fato, sem precisar de credencial do
// Cloudflare; é a varredura que o Claude Code consegue rodar):
//
//   BLOCKED_TERMS="..." BASE_URL=https://SEU-DOMINIO node scripts/varre-termos.js
//
// Atrás do Access, os mesmos ACESSO_CLIENT_ID e ACESSO_CLIENT_SECRET do
// gera-cache.js valem aqui.
//
// Direto nas tabelas do D1, com wrangler autenticado (varre também o que
// ninguém pediu ainda, incluindo linhas antigas):
//
//   BLOCKED_TERMS="..." node scripts/varre-termos.js --d1=remote
//   BLOCKED_TERMS="..." node scripts/varre-termos.js --d1=local
//
// A comparação é a MESMA do Worker: ignora maiúsculas e acentos e casa palavra
// inteira, para uma sigla curta não disparar dentro de outra palavra.

const { execFileSync } = require("node:child_process");
const VOCABULARIO = require("../dados/vocabulario.json");

const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const MACRONARRATIVAS = VOCABULARIO.macronarrativas.map((m) => m.id);
const FORMATOS = VOCABULARIO.formatos;
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

function normaliza(texto) {
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function termos() {
  const lista = (process.env.BLOCKED_TERMS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!lista.length) {
    console.error(
      "BLOCKED_TERMS ausente ou vazia. Exporte a mesma lista que está no painel do Cloudflare:\n" +
        '  BLOCKED_TERMS="sobrenome1,sobrenome2,sigla1" node scripts/varre-termos.js'
    );
    process.exit(1);
  }
  return lista;
}

function ocorrencias(texto, lista) {
  const alvo = normaliza(texto);
  const achados = [];
  for (const termo of lista) {
    const escapado = normaliza(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const padrao = new RegExp(`(?<![\\p{L}\\p{N}])${escapado}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of alvo.matchAll(padrao)) {
      achados.push({ termo, posicao: m.index, trecho: alvo.slice(Math.max(0, m.index - 60), m.index + 60) });
    }
  }
  return achados;
}

function cabecalhos() {
  const h = { "Content-Type": "application/json" };
  if (process.env.ACESSO_CLIENT_ID && process.env.ACESSO_CLIENT_SECRET) {
    h["CF-Access-Client-Id"] = process.env.ACESSO_CLIENT_ID;
    h["CF-Access-Client-Secret"] = process.env.ACESSO_CLIENT_SECRET;
  }
  return h;
}

async function chama(rota, corpo) {
  const r = await fetch(`${BASE_URL}${rota}`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  try {
    return { ok: r.ok, dados: JSON.parse(texto) };
  } catch {
    return { ok: false, erro: `resposta não-JSON, HTTP ${r.status}` };
  }
}

// Só o texto que chega à pessoa. Ids, nomes de público e tema ficam de fora:
// são vocabulário fechado do próprio projeto.
function textoDaPagina(pagina) {
  const partes = [];
  for (const campo of ["gatilho", "contexto", "pesquisa"]) {
    if (pagina[campo]?.texto) partes.push(pagina[campo].texto);
  }
  for (const campo of ["ancorar", "evitar"]) {
    for (const item of pagina[campo]?.itens ?? []) partes.push(item);
  }
  for (const item of pagina.perfil?.itens ?? []) partes.push(item.texto);
  for (const item of pagina.habitos_de_midia?.itens ?? []) partes.push(item.texto);
  for (const [pauta, campo] of Object.entries(pagina.gatilhos_por_pauta ?? {})) {
    if (campo?.texto) partes.push(`[pauta ${pauta}] ${campo.texto}`);
  }
  return partes.join("\n");
}

function textoDoFormato(resposta) {
  const o = resposta.orientacao ?? {};
  return [o.gatilho ?? "", ...(o.ancorar ?? []), ...(o.evitar ?? [])].join("\n");
}

async function varrePelasRotas(lista) {
  const achados = [];
  let pecas = 0;
  for (const publico of PUBLICOS) {
    for (const macronarrativa of MACRONARRATIVAS) {
      const rotulo = `${publico} × ${macronarrativa}`;
      const r = await chama("/api/match", { publico, macronarrativa });
      if (!r.ok) {
        console.log(`ERRO   ${rotulo}: ${r.erro ?? r.dados?.erro}`);
        continue;
      }
      pecas++;
      for (const a of ocorrencias(textoDaPagina(r.dados), lista)) {
        achados.push({ onde: `página ${rotulo}`, ...a });
      }
      for (const formato of FORMATOS) {
        const f = await chama("/api/formato", { formato, pagina: r.dados });
        if (!f.ok) {
          console.log(`ERRO   ${rotulo} / ${formato}: ${f.erro ?? f.dados?.erro}`);
          continue;
        }
        pecas++;
        for (const a of ocorrencias(textoDoFormato(f.dados), lista)) {
          achados.push({ onde: `formato ${formato} de ${rotulo}`, ...a });
        }
      }
      console.log(`ok     ${rotulo}`);
    }
  }
  return { achados, pecas, fonte: `rotas de ${BASE_URL}` };
}

function consultaD1(onde, sql) {
  const saida = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "decisivas", `--${onde}`, "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
  const inicio = saida.indexOf("[");
  return JSON.parse(saida.slice(inicio))[0].results ?? [];
}

function varrePeloD1(onde, lista) {
  const achados = [];
  let pecas = 0;
  for (const tabela of ["paginas", "formatos"]) {
    const colunas = tabela === "paginas" ? "publico, macronarrativa, pauta" : "publico, macronarrativa, formato, pauta";
    const linhas = consultaD1(onde, `SELECT ${colunas}, resposta FROM ${tabela}`);
    for (const linha of linhas) {
      pecas++;
      const onde2 =
        `${tabela}: ${linha.publico} × ${linha.macronarrativa}` +
        (linha.formato ? ` / ${linha.formato}` : "") +
        (linha.pauta ? ` [pauta ${linha.pauta}]` : "");
      // A linha guardada é a resposta inteira em JSON: varre o texto todo.
      for (const a of ocorrencias(linha.resposta, lista)) achados.push({ onde: onde2, ...a });
    }
    console.log(`ok     ${tabela}: ${linhas.length} linha(s)`);
  }
  return { achados, pecas, fonte: `tabelas do D1 (${onde})` };
}

async function main() {
  const lista = termos();
  const argumentoD1 = process.argv.find((a) => a.startsWith("--d1"));
  const onde = argumentoD1 ? (argumentoD1.split("=")[1] ?? "local") : null;

  console.log(`Termos na lista: ${lista.length}`);
  const { achados, pecas, fonte } = onde ? varrePeloD1(onde, lista) : await varrePelasRotas(lista);

  console.log(`\n----- Varredura de termos bloqueados -----`);
  console.log(`Fonte:       ${fonte}`);
  console.log(`Peças lidas: ${pecas}`);
  console.log(`Ocorrências: ${achados.length}`);
  if (!achados.length) {
    console.log("\nZero ocorrências. Nenhum termo bloqueado no que a plataforma entrega.");
    return;
  }
  for (const a of achados) {
    console.log(`\n- termo "${a.termo}" em ${a.onde}\n  …${a.trecho}…`);
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
