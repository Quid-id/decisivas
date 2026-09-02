// DECISIVAS — Worker do Cloudflare, rota /api/*
//
// Uma rota só: `POST /api/explorar`, o "Explorar o acervo" (etapa 10). Fora de
// /api/*, o Worker entrega o site estático — as 20 páginas de caminho e as
// telas de apoio, todas HTML gerado no build.
//
// O que esta rota faz, e o que ela NÃO faz:
//
//   modo pauta     consulta o D1 e devolve trechos do cruzamento com aquela
//                  pauta, cinco por vez. Sem modelo, sem cache, sem custo.
//   modo pergunta  o modelo lê a pergunta e a lista de trechos do cruzamento e
//                  devolve SÓ uma lista de números — os trechos que responder.
//                  Não redige, não resume, não completa. O texto que vai à
//                  tela é o do acervo, palavra por palavra.
//
// Por construção o modelo não tem canal para escrever nada: a única saída
// aceita é `{"ids": [...]}`. Qualquer outra coisa é descartada e tratada como
// resposta vazia (regra 3 do CLAUDE.md).
//
// Fontes únicas, importadas e não copiadas: os vocabulários fechados
// (dados/vocabulario.json), os textos de tela (dados/configuracao.json), o
// prompt de sistema (prompts/explorar.txt) e a marca de versão do acervo
// (dados/versao-acervo.txt).
//
// Nenhuma chave de API entra neste arquivo: local em .dev.vars, produção como
// segredo no painel do Cloudflare.

import { interpretaIds } from "./interpreta-ids.js";
import PROMPT_EXPLORAR from "../prompts/explorar.txt";
import VERSAO_ACERVO_BRUTA from "../dados/versao-acervo.txt";
import VOCABULARIO from "../dados/vocabulario.json";
import CONFIGURACAO from "../dados/configuracao.json";

const VERSAO_ACERVO = String(VERSAO_ACERVO_BRUTA).trim();
const EXPLORAR = CONFIGURACAO.explorar;
const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const TEMAS = VOCABULARIO.macronarrativas.map((m) => m.id);

// Quantos trechos por resposta, nos dois modos (especificação da etapa 10).
const POR_RESPOSTA = 5;
// Perguntas livres por hora, por origem. Botões de pauta não têm limite.
const PERGUNTAS_POR_HORA = 30;
// Mínimo de palavras úteis numa pergunta.
const PALAVRAS_MINIMAS = 3;

// Ordem dos grupos na tela: é a ordem das etiquetas na configuração. `perfil`
// e `exemplo` não têm etiqueta e por isso não entram em resposta nenhuma.
const TIPOS_NA_ORDEM = Object.keys(EXPLORAR.etiquetas);

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Minúsculas, sem acento, espaços simples. Serve para comparar pergunta com
// cache, para contar palavras e para a varredura de termos.
function normaliza(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Termos bloqueados
// ---------------------------------------------------------------------------
//
// BLOCKED_TERMS traz SOMENTE nomes próprios: sobrenomes de figuras políticas,
// nomes e siglas de partidos. Nunca palavras temáticas ("voto", "eleição"),
// que são vocabulário legítimo do acervo. A lista é segredo de runtime, no
// painel; a mesma que o build usa (docs/06). Separador `|`, e a vírgula é
// aceita para não depender do formato com que a lista foi salva.
//
// A comparação casa palavra inteira e ignora maiúsculas e acentos, para uma
// sigla curta não disparar dentro de outra palavra ("PT" em "parte").
function termosBloqueados(env) {
  return String(env.BLOCKED_TERMS ?? "")
    .split(/[|,]/)
    .map((t) => normaliza(t))
    .filter(Boolean);
}

function contemTermo(texto, termos) {
  const alvo = normaliza(texto);
  return termos.some((termo) => {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapado}(?![\\p{L}\\p{N}])`, "u").test(alvo);
  });
}

// ---------------------------------------------------------------------------
// Limite por origem
// ---------------------------------------------------------------------------
//
// 30 perguntas livres por hora por origem. A contagem vive na memória do
// Worker, numa chave que é o hash da origem com um sal do dia: o endereço não
// é gravado em lugar nenhum, e a chave de hoje não serve para reconhecer
// ninguém amanhã. Memória de isolate é volátil — o limite é barreira contra
// abuso casual, não contravenção determinada, e é o que a etapa 10 pede.
const contagem = new Map();

async function chaveDeOrigem(request) {
  const origem = request.headers.get("CF-Connecting-IP") ?? "sem-origem";
  const sal = new Date().toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${origem}|${sal}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function dentroDoLimite(request) {
  const chave = await chaveDeOrigem(request);
  const agora = Date.now();
  const janela = 60 * 60 * 1000;
  const atual = contagem.get(chave);
  if (!atual || agora - atual.desde > janela) {
    contagem.set(chave, { desde: agora, n: 1 });
    // Limpeza oportunista: sem isso o Map cresce enquanto o isolate viver.
    if (contagem.size > 5000) {
      for (const [k, v] of contagem) if (agora - v.desde > janela) contagem.delete(k);
    }
    return true;
  }
  if (atual.n >= PERGUNTAS_POR_HORA) return false;
  atual.n += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Acervo
// ---------------------------------------------------------------------------

// `forte` primeiro, e a ordem das etiquetas depois: é a ordem em que a tela
// mostra, e também a ordem em que a paginação por deslocamento caminha.
const ORDEM_SQL = `
  ORDER BY CASE WHEN forca = 'forte' THEN 0 ELSE 1 END,
           CASE tipo ${TIPOS_NA_ORDEM.map((t, i) => `WHEN '${t}' THEN ${i}`).join(" ")} ELSE 99 END,
           id`;

const TIPOS_ACEITOS = `tipo IN (${TIPOS_NA_ORDEM.map(() => "?").join(", ")})`;

async function trechosDaPauta(env, publico, tema, pauta, deslocamento) {
  const sql =
    `SELECT id, texto, tipo, forca FROM trechos
      WHERE publico = ? AND macronarrativa = ? AND pauta = ? AND ${TIPOS_ACEITOS}
      ${ORDEM_SQL} LIMIT ? OFFSET ?`;
  const r = await env.DB.prepare(sql)
    .bind(publico, tema, pauta, ...TIPOS_NA_ORDEM, POR_RESPOSTA, deslocamento)
    .all();
  return r.results ?? [];
}

async function trechosDoCruzamento(env, publico, tema) {
  const sql =
    `SELECT id, texto, tipo, forca FROM trechos
      WHERE publico = ? AND macronarrativa = ? AND ${TIPOS_ACEITOS} ${ORDEM_SQL}`;
  const r = await env.DB.prepare(sql).bind(publico, tema, ...TIPOS_NA_ORDEM).all();
  return r.results ?? [];
}

// A origem que vai à tela é o nome curto do estudo, pelo prefixo do id
// (`D01-TR-042-jov` → D01), traduzido pela tabela da configuração. **Nunca o
// id cru.** Sem entrada na tabela, aparece a pendência com o campo a
// preencher — nunca um nome inventado (regra 2 do CLAUDE.md).
function origemDoTrecho(id) {
  const prefixo = String(id).split("-")[0];
  return EXPLORAR.origens?.[prefixo] ?? `[preencher] explorar.origens.${prefixo}`;
}

// Agrupa por etiqueta, na ordem da configuração, e varre a saída: trecho com
// termo bloqueado sai da resposta e o id vai para o registro.
function agrupa(trechos, termos) {
  const removidos = [];
  const porTipo = new Map();
  for (const t of trechos) {
    if (termos.length && contemTermo(t.texto, termos)) {
      removidos.push(t.id);
      continue;
    }
    if (!porTipo.has(t.tipo)) porTipo.set(t.tipo, []);
    porTipo.get(t.tipo).push({ texto: t.texto, origem: origemDoTrecho(t.id) });
  }
  const grupos = TIPOS_NA_ORDEM.filter((tipo) => porTipo.has(tipo)).map((tipo) => ({
    etiqueta: EXPLORAR.etiquetas[tipo],
    itens: porTipo.get(tipo),
  }));
  return { grupos, removidos };
}

// ---------------------------------------------------------------------------
// Registro: uma linha por consulta, sem identificação de quem perguntou
// ---------------------------------------------------------------------------

async function registra(env, { publico, tema, modo, alvo, ids, origem, removidos }) {
  try {
    await env.DB.prepare(
      `INSERT INTO registros (rota, publico, macronarrativa, formato, ids_trechos, modelo, origem, resposta)
       VALUES ('explorar', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        publico,
        tema,
        modo,
        ids.join(","),
        modo === "pergunta" ? modeloEmUso(env) : null,
        origem,
        JSON.stringify({ modo, alvo, ids, removidos })
      )
      .run();
  } catch (e) {
    // Falha de registro não derruba a resposta: o acervo é a entrega, o
    // registro é auditoria. Fica no log do Worker.
    console.error("registro falhou:", e.message);
  }
}

function modeloEmUso(env) {
  return env.SIMULAR_MODELO === "true" ? "simulacao" : env.MODEL_ID;
}

// ---------------------------------------------------------------------------
// Cache das perguntas (tabela `consultas`, migração 005)
// ---------------------------------------------------------------------------

async function doCache(env, publico, tema, pergunta) {
  try {
    const r = await env.DB.prepare(
      `SELECT ids, versao_acervo FROM consultas WHERE publico = ? AND macronarrativa = ? AND pergunta = ?`
    )
      .bind(publico, tema, pergunta)
      .first();
    if (!r || r.versao_acervo !== VERSAO_ACERVO) return null;
    return String(r.ids).split(",").filter(Boolean);
  } catch (e) {
    // Tabela ausente (migração 005 não aplicada) não pode derrubar a rota:
    // sem cache, a pergunta vai ao modelo.
    console.error("cache indisponível:", e.message);
    return null;
  }
}

async function gravaNoCache(env, publico, tema, pergunta, ids, modelo) {
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO consultas (publico, macronarrativa, pergunta, ids, versao_acervo, modelo, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(publico, tema, pergunta, ids.join(","), VERSAO_ACERVO, modelo)
      .run();
  } catch (e) {
    console.error("cache não gravou:", e.message);
  }
}

// ---------------------------------------------------------------------------
// O modelo
// ---------------------------------------------------------------------------

// Chamada ao OpenRouter, temperatura 0. SIMULAR_MODELO=true é instrumento de
// desenvolvimento: substitui a chamada por uma escolha determinística por
// palavras, para exercitar a rota inteira sem rede e sem chave. Nunca entra em
// produção — a variável não existe no wrangler.toml, só em .dev.vars.
async function escolheIds(env, pergunta, trechos) {
  if (env.SIMULAR_MODELO === "true") {
    return simulaEscolha(pergunta, trechos);
  }
  const lista = trechos.map((t, i) => `${i + 1}. ${t.texto}`).join("\n");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.MODEL_ID,
      messages: [
        { role: "system", content: PROMPT_EXPLORAR },
        { role: "user", content: `Pergunta: ${pergunta}\n\nTrechos:\n${lista}` },
      ],
      temperature: 0,
    }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || corpo?.error) {
    throw new Error(`OpenRouter: ${corpo?.error?.message ?? `HTTP ${r.status}`}`);
  }
  // A leitura da resposta vive em src/interpreta-ids.js, testável fora do
  // Worker: é ela que garante que só uma lista de números atravessa.
  return interpretaIds(corpo.choices?.[0]?.message?.content ?? "", trechos.length, POR_RESPOSTA);
}

// Simulador (SIMULAR_MODELO=true): escolhe por palavra em comum entre a
// pergunta e o trecho, `forte` desempatando. Não é o modelo, e não pretende
// ser: serve para conferir a rota, o cache, o agrupamento e as guardas.
const SEM_VALOR = new Set(
  ("de da do das dos e ou a o as os um uma que como para por com sem sobre no na nos nas em ao aos " +
    "se sua seu suas seus mais menos muito pouco quando onde qual quais quero falar fala")
    .split(" ")
);

function simulaEscolha(pergunta, trechos) {
  const palavras = normaliza(pergunta)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length > 2 && !SEM_VALOR.has(p));
  if (!palavras.length) return [];
  const notas = trechos.map((t, i) => {
    const alvo = normaliza(t.texto);
    let nota = 0;
    for (const p of palavras) if (alvo.includes(p)) nota += 1;
    return { n: i + 1, nota, forte: t.forca === "forte" ? 1 : 0 };
  });
  return notas
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota || b.forte - a.forte || a.n - b.n)
    .slice(0, POR_RESPOSTA)
    .map((x) => x.n);
}

// ---------------------------------------------------------------------------
// A rota
// ---------------------------------------------------------------------------

function erro(codigo, aviso, status) {
  return respostaJson({ erro: codigo, aviso }, status);
}

async function rotaExplorar(request, env) {
  const corpo = await request.json().catch(() => null);
  const publico = corpo?.publico;
  const tema = corpo?.tema;

  if (!PUBLICOS.includes(publico) || !TEMAS.includes(tema)) {
    return erro("parametros", EXPLORAR.aviso_erro, 400);
  }

  const termos = termosBloqueados(env);

  // ---- Modo pauta: consulta direta ao banco, sem modelo ----
  if (typeof corpo.pauta === "string" && corpo.pauta.trim()) {
    const pauta = corpo.pauta.trim();
    const deslocamento = Number.isInteger(corpo.deslocamento) && corpo.deslocamento > 0 ? corpo.deslocamento : 0;
    let trechos;
    try {
      trechos = await trechosDaPauta(env, publico, tema, pauta, deslocamento);
    } catch (e) {
      console.error("consulta por pauta falhou:", e.message);
      return erro("interno", EXPLORAR.aviso_erro, 500);
    }
    const { grupos, removidos } = agrupa(trechos, termos);
    const ids = trechos.map((t) => t.id);
    await registra(env, { publico, tema, modo: "pauta", alvo: pauta, ids, origem: "banco", removidos });
    return respostaJson({
      modo: "pauta",
      grupos,
      lacuna: grupos.length ? null : EXPLORAR.aviso_sem_resultado,
      rotulo: grupos.length ? EXPLORAR.rotulo_pauta : null,
      // Deslocamento seguinte, para o "Ver mais". Nulo quando a página veio
      // incompleta: não há mais o que buscar.
      proximo: trechos.length === POR_RESPOSTA ? deslocamento + POR_RESPOSTA : null,
    });
  }

  // ---- Modo pergunta ----
  if (typeof corpo.pergunta !== "string" || !corpo.pergunta.trim()) {
    return erro("parametros", EXPLORAR.aviso_erro, 400);
  }

  const pergunta = normaliza(corpo.pergunta);

  // 1. Fora do escopo: barra ANTES de qualquer coisa, sem chamar o modelo e
  // sem registrar o texto da pergunta.
  if (termos.length && contemTermo(pergunta, termos)) {
    // Nada é registrado: nem o texto, nem a linha (critério 3 da etapa 10).
    // Uma pergunta barrada não gera rastro nenhum no banco.
    return respostaJson({ modo: "pergunta", grupos: [], lacuna: EXPLORAR.aviso_fora_do_escopo, rotulo: null });
  }

  const uteis = pergunta.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 1);
  if (uteis.length < PALAVRAS_MINIMAS) {
    return respostaJson({ modo: "pergunta", grupos: [], lacuna: EXPLORAR.aviso_pergunta_curta, rotulo: null });
  }

  // 2. Limite por origem: só o modo pergunta, que é o que custa.
  if (!(await dentroDoLimite(request))) {
    return erro("limite", EXPLORAR.aviso_limite, 429);
  }

  let trechos;
  try {
    trechos = await trechosDoCruzamento(env, publico, tema);
  } catch (e) {
    console.error("consulta do cruzamento falhou:", e.message);
    return erro("interno", EXPLORAR.aviso_erro, 500);
  }

  // 3. Cache por pergunta normalizada, válido enquanto a versão do acervo for
  // a mesma. Guarda ids do acervo, não texto.
  const doCacheIds = await doCache(env, publico, tema, pergunta);
  let ids = doCacheIds;
  let origem = "cache";

  if (!ids) {
    origem = "modelo";
    try {
      const escolhidos = await escolheIds(env, pergunta, trechos);
      ids = escolhidos.map((n) => trechos[n - 1].id);
    } catch (e) {
      console.error("modelo falhou:", e.message);
      return erro("interno", EXPLORAR.aviso_erro, 500);
    }
    await gravaNoCache(env, publico, tema, pergunta, ids, modeloEmUso(env));
  }

  const escolhidos = ids.map((id) => trechos.find((t) => t.id === id)).filter(Boolean);
  const { grupos, removidos } = agrupa(escolhidos, termos);
  await registra(env, { publico, tema, modo: "pergunta", alvo: pergunta, ids, origem, removidos });

  return respostaJson({
    modo: "pergunta",
    grupos,
    lacuna: grupos.length ? null : EXPLORAR.aviso_sem_resultado,
    rotulo: grupos.length ? EXPLORAR.rotulo_pergunta : null,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Fora de /api/*, o site estático: as 20 páginas fixas e as telas de
    // apoio, todas HTML gerado no build.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/explorar") {
      // Interruptor de desligamento: governa esta rota e só ela (regra 6).
      if (env.AGENT_ENABLED !== "true") {
        return erro("desligado", EXPLORAR.aviso_desligado, 503);
      }
      if (request.method !== "POST") {
        return erro("parametros", EXPLORAR.aviso_erro, 405);
      }
      try {
        return await rotaExplorar(request, env);
      } catch (e) {
        console.error("explorar falhou:", e.message);
        return erro("interno", EXPLORAR.aviso_erro, 500);
      }
    }

    // run_worker_first manda /api/* para cá em vez dos assets, então a
    // resposta é explícita em vez de virar uma página de erro do site.
    return respostaJson({ erro: "Rota inexistente." }, 404);
  },
};
