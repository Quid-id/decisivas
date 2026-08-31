// DECISIVAS — Worker do Cloudflare, rota /api/*
//
// /api/match implementa docs/01 (Fluxo do match), docs/03 (regras do agente)
// e docs/07 (mapa de recuperação), nesta ordem: checagens de código antes do
// modelo, consulta ao D1 com teto de 60 trechos, chamada ao OpenRouter
// (MODEL_ID), validação com uma retentativa, termos bloqueados, anexação por
// código (chips, nota de base, mídia, exemplos, recursos), gravação em
// registros, resposta.
//
// Nenhuma chave de API entra neste arquivo: local em .dev.vars, produção
// como segredo no painel do Cloudflare.

// Governança de formatos (docs/08): o agente nunca inventa regra de formato,
// aplica o que está escrito no documento. O arquivo entra no prompt no build
// ([[rules]] no wrangler.toml), então editar o .md muda o comportamento no
// próximo deploy.
import REGRAS_DE_FORMATO from "../docs/08-regras-de-formato.md";

// Versão do acervo (data/versao-acervo.txt, atualizada a cada carga oficial).
// Carimba as respostas e valida o cache do navegador (nível 2).
import VERSAO_ACERVO_BRUTA from "../data/versao-acervo.txt";
const VERSAO_ACERVO = VERSAO_ACERVO_BRUTA.trim();

// Vocabulários fechados (CLAUDE.md). Qualquer valor fora deles → 400.
const PUBLICOS = [
  "idosos",
  "jovens",
  "mulheres beneficiárias",
  "mulheres de 2 a 5 salários mínimos",
  "trabalhadoras informais",
  "pequenas empreendedoras",
  "plataformizadas",
];

const MACRONARRATIVAS = [
  "dinheiro no bolso",
  "proteção do trabalhador",
  "proteção da família",
  "brasil soberano",
  "engajamento cívico",
];

const FORMATOS = ["whatsapp", "carrossel", "roteiro"];

// Rótulo de IA obrigatório em toda saída gerada (docs/01, item 9 do cartão).
const ROTULO_IA =
  "Conteúdo organizado com apoio de inteligência artificial a partir do acervo de pesquisa. Não indica voto nem menciona candidaturas.";

const NOTA_BASE_RESTRITA =
  "Achado referente aos participantes do estudo citado, não generalizável ao conjunto do público.";

const AVISO_LACUNA = "Evidência insuficiente no acervo para este item.";

const MENSAGEM_INDISPONIVEL =
  "O serviço está temporariamente indisponível. O acervo e as páginas fixas continuam no ar.";

const TETO_TRECHOS = 60;

// Prompt de sistema de docs/03-regras-do-agente.md, na íntegra.
// A pessoa escreve, a plataforma orienta (docs/08, Parte 1): o agente entrega
// o material de escrita, nunca a mensagem pronta.
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

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function respostaIndisponivel() {
  return respostaJson({ erro: MENSAGEM_INDISPONIVEL }, 503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Fora de /api/*, entrega o site estático.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // 1. Interruptor de desligamento: toda rota do agente passa por aqui.
    if (env.AGENT_ENABLED === "false") {
      return respostaIndisponivel();
    }

    // O agente não conversa: só aceita as duas rotas fechadas, via POST.
    if (request.method !== "POST") {
      return respostaJson({ erro: "Método não permitido." }, 405);
    }

    let corpo;
    try {
      corpo = await request.json();
    } catch {
      return respostaJson({ erro: "Corpo da requisição malformado." }, 400);
    }

    try {
      if (url.pathname === "/api/match") return await rotaMatch(corpo, env, request);
      if (url.pathname === "/api/formato") return await rotaFormato(corpo, env, request);
    } catch (e) {
      console.error("erro na rota", url.pathname, e.message);
      return respostaIndisponivel();
    }

    return respostaJson({ erro: "Rota inexistente." }, 404);
  },
};

// ---------------------------------------------------------------------------
// Checagens antes do modelo (docs/03, seção "Antes de chamar o modelo")
// ---------------------------------------------------------------------------

// 2. Turnstile. Verificação efetiva entra na tarefa 7 (docs/05); enquanto o
// segredo não estiver configurado, a checagem é neutra.
async function verificaTurnstile(corpo, env, request) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  const resposta = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: corpo?.turnstile_token ?? "",
        remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
      }),
    }
  );
  const dados = await resposta.json().catch(() => null);
  return dados?.success === true;
}

// 3. Limite por IP (padrão: 20 req/hora por rota). Implementação com
// armazenamento entra na tarefa 7; por ora a checagem é neutra.
async function limitePorIpOk(env, request, rota) {
  return true;
}

// ---------------------------------------------------------------------------
// Rota /api/match
// ---------------------------------------------------------------------------

async function rotaMatch(corpo, env, request) {
  const { publico, macronarrativa } = corpo ?? {};

  if (!(await verificaTurnstile(corpo, env, request))) {
    return respostaJson({ erro: "Verificação anti-abuso falhou." }, 403);
  }
  if (!(await limitePorIpOk(env, request, "match"))) {
    return respostaJson({ erro: "Limite de requisições atingido. Tente mais tarde." }, 429);
  }

  // 4. Vocabulários fechados → 400 sem chamar o modelo.
  if (!PUBLICOS.includes(publico) || !MACRONARRATIVAS.includes(macronarrativa)) {
    return respostaJson(
      { erro: "Público ou tema fora dos vocabulários da plataforma." },
      400
    );
  }

  // 5. Cache nível 1 (docs/06): antes de qualquer chamada ao modelo. A
  // entrada vale enquanto o conjunto de ids de trechos do cruzamento no
  // banco for exatamente o conjunto guardado na geração.
  const cacheLigado = env.CACHE_ENABLED !== "false";
  const idsAcervo = cacheLigado ? await idsAcervoAtual(env, publico, macronarrativa) : null;
  if (cacheLigado) {
    const guardada = await env.DB.prepare(
      "SELECT resposta, ids_trechos, modelo FROM paginas WHERE publico = ?1 AND macronarrativa = ?2 AND ids_acervo = ?3"
    ).bind(publico, macronarrativa, idsAcervo).first();
    if (guardada) {
      const pagina = JSON.parse(guardada.resposta);
      pagina.origem = "cache";
      pagina.versao_acervo = VERSAO_ACERVO;
      await gravaRegistro(env, {
        rota: "match", publico, macronarrativa,
        ids: guardada.ids_trechos, modelo: guardada.modelo, origem: "cache", resposta: pagina,
      });
      return respostaJson(pagina);
    }
  }

  // Consultas fixas (docs/07): o modelo não decide onde buscar.
  const [trechosMatch, trechosMidia, recursos] = await Promise.all([
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND pauta = 'consumo de mídia'", [publico]),
    consulta(env, "SELECT titulo, url, descricao FROM recursos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
  ]);

  // Blocos e mínimos (docs/07). Abaixo do mínimo → lacuna declarada, por código.
  // O gatilho deriva dos achados, então compartilha os trechos e o mínimo
  // do bloco pesquisa.
  const achados = trechosMatch.filter((t) => t.tipo === "achado");
  const minimoAchados = achados.length >= 2 && achados.some((t) => t.forca === "forte");
  const blocos = {
    gatilho: achados,
    ancorar: trechosMatch.filter((t) => t.tipo === "funciona"),
    evitar: trechosMatch.filter((t) => t.tipo === "afasta"),
    contexto: trechosMatch.filter((t) => t.tipo === "contexto" || t.tipo === "achado"),
    pesquisa: achados,
    exemplos: trechosMatch.filter((t) => t.tipo === "exemplo" && t.link),
    midia: trechosMidia,
  };
  const minimos = {
    gatilho: minimoAchados,
    ancorar: blocos.ancorar.length >= 3,
    evitar: blocos.evitar.length >= 3,
    contexto: blocos.contexto.length >= 1,
    pesquisa: minimoAchados,
    exemplos: blocos.exemplos.length >= 2,
    midia: blocos.midia.length >= 1,
  };

  const camposDoModelo = ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"];
  const algumCampoViavel = camposDoModelo.some((c) => minimos[c]);

  // 5. Subconjunto vazio ou abaixo dos mínimos → lacuna por código, SEM modelo.
  let gerado;
  let modeloUsado = null;
  let subconjunto = [];
  if (!algumCampoViavel) {
    gerado = {
      gatilho: "LACUNA", ancorar: "LACUNA", evitar: "LACUNA",
      contexto: "LACUNA", pesquisa: "LACUNA",
    };
  } else {
    // Teto de 60 trechos, priorizando força forte e diversidade de pauta.
    const candidatos = unicosPorId(
      camposDoModelo.filter((c) => minimos[c]).flatMap((c) => blocos[c])
    );
    subconjunto = limitaSubconjunto(candidatos, TETO_TRECHOS);

    gerado = await geraComValidacao(env, publico, macronarrativa, subconjunto);
    if (gerado === null) return respostaIndisponivel();
    modeloUsado = env.SIMULAR_MODELO === "true" ? "simulacao" : env.MODEL_ID;

    // Verificação de segurança na saída: termos bloqueados (variável de
    // ambiente, fora do repositório) → descarta e responde indisponibilidade.
    if (contemTermoBloqueado(JSON.stringify(gerado), env)) {
      console.error("resposta descartada por termo bloqueado");
      return respostaIndisponivel();
    }
  }

  // 6. Anexação por código: lacunas, chips de fonte, nota de base,
  // mídia, exemplos (links do banco), recursos.
  const idsValidos = new Set(subconjunto.map((t) => t.id));
  const documentos = await mapaDocumentos(env, [
    ...subconjunto, ...blocos.midia, ...blocos.exemplos,
  ]);

  const pagina = { match: { publico, macronarrativa } };
  for (const campo of camposDoModelo) {
    pagina[campo] = montaCampo(gerado[campo], minimos[campo], campo, idsValidos, subconjunto, documentos);
  }

  pagina.habitos_de_midia = minimos.midia
    ? {
        itens: blocos.midia.map((t) => ({ id: t.id, texto: t.texto, chip: chipDe(t, documentos) })),
        lacuna: false,
      }
    : { lacuna: true, aviso: AVISO_LACUNA };

  pagina.exemplos = minimos.exemplos
    ? {
        itens: blocos.exemplos.map((t) => ({ id: t.id, texto: t.texto, link: t.link, chip: chipDe(t, documentos) })),
        lacuna: false,
      }
    : { lacuna: true, aviso: AVISO_LACUNA };

  // Materiais complementares: só da tabela recursos; vazio → bloco omitido.
  pagina.materiais_complementares = recursos;

  const idsUsados = idsDaPagina(pagina);
  const trechosVisiveis = [...subconjunto, ...blocos.midia, ...blocos.exemplos]
    .filter((t) => idsUsados.has(t.id));
  pagina.nota_base_restrita = trechosVisiveis.some((t) => t.base === "restrita")
    ? NOTA_BASE_RESTRITA
    : null;
  pagina.fontes = new Set(trechosVisiveis.map((t) => t.id_documento)).size;
  // Data da última atualização do acervo: definida na carga, via variável
  // de ambiente (ex.: ACERVO_ATUALIZADO_EM="08/2026").
  pagina.atualizado_em = env.ACERVO_ATUALIZADO_EM ?? null;
  pagina.rotulo_ia = ROTULO_IA;
  pagina.versao_acervo = VERSAO_ACERVO;
  pagina.origem = "geracao";
  // O front usa esta flag: com o cache desligado, descarta o que guardou.
  pagina.cache_habilitado = cacheLigado;

  // 7. Guarda no cache (páginas de lacuna também: não custam nada e a
  // validade por ids_acervo invalida sozinha quando o acervo mudar).
  if (cacheLigado) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO paginas (publico, macronarrativa, resposta, ids_trechos, ids_acervo, modelo, gerado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))"
    )
      .bind(publico, macronarrativa, JSON.stringify(pagina), [...idsUsados].join(","), idsAcervo, modeloUsado)
      .run();
  }

  // 8. Gravação em registros antes de devolver. Sem IP, sem identidade.
  await gravaRegistro(env, {
    rota: "match", publico, macronarrativa,
    ids: [...idsUsados].join(","), modelo: modeloUsado, origem: "geracao", resposta: pagina,
  });

  return respostaJson(pagina);
}

// Conjunto atual de ids de trechos que alimentam a página do cruzamento
// (match exato + hábitos de mídia), ordenado e serializado. É o mecanismo de
// validade do cache: comparação literal do conjunto inteiro, sem hash — não
// há colisão possível e a string guardada é auditável direto no banco.
async function idsAcervoAtual(env, publico, macronarrativa) {
  const linhas = await consulta(
    env,
    "SELECT id FROM trechos WHERE publico = ?1 AND (macronarrativa = ?2 OR pauta = 'consumo de mídia') ORDER BY id",
    [publico, macronarrativa]
  );
  return linhas.map((l) => l.id).join(",");
}

async function gravaRegistro(env, { rota, publico, macronarrativa, formato = null, ids, modelo, origem, resposta }) {
  await env.DB.prepare(
    "INSERT INTO registros (rota, publico, macronarrativa, formato, ids_trechos, modelo, origem, resposta) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
  )
    .bind(rota, publico, macronarrativa, formato, ids, modelo, origem, JSON.stringify(resposta))
    .run();
}

// ---------------------------------------------------------------------------
// Geração e validação
// ---------------------------------------------------------------------------

// Chama o modelo e valida o JSON; fuga de formato → uma nova retentativa;
// persistindo → null (indisponibilidade).
async function geraComValidacao(env, publico, macronarrativa, subconjunto) {
  const usuario = montaMensagemUsuario(publico, macronarrativa, subconjunto);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const texto = await chamaModelo(env, PROMPT_SISTEMA, usuario, () => simulaModelo(subconjunto));
    const json = normalizaLacunas(extraiJson(texto));
    if (json && formatoValido(json)) return json;
    console.error(`resposta fora do formato (tentativa ${tentativa + 1})`);
  }
  return null;
}

// Lacunas mal codificadas viram lacuna declarada, nunca conteúdo. O teste de
// modelos (docs/06) registrou {"itens": "LACUNA"}, {"texto": "LACUNA"} e
// {"itens": ["LACUNA","LACUNA","LACUNA"]} — sem isto, a última passaria na
// validação e chegaria à página como três itens escritos "LACUNA".
function normalizaLacunas(json) {
  if (typeof json !== "object" || json === null) return json;
  const ehLacuna = (v) =>
    v === "LACUNA" ||
    (v && v.texto === "LACUNA") ||
    (v && v.itens === "LACUNA") ||
    (v && Array.isArray(v.itens) && v.itens.length > 0 && v.itens.every((i) => i === "LACUNA"));
  const normalizado = {};
  for (const [campo, valor] of Object.entries(json)) {
    normalizado[campo] = ehLacuna(valor) ? "LACUNA" : valor;
  }
  return normalizado;
}

// ÚNICO ponto de contato com o modelo, para todas as rotas. Com
// SIMULAR_MODELO=true (variável de ambiente, para desenvolvimento sem rede),
// devolve a resposta determinística do simulador da rota — o restante do
// fluxo (validação, termos bloqueados, registro) não muda.
async function chamaModelo(env, sistema, usuario, simulador) {
  if (env.SIMULAR_MODELO === "true") {
    return simulador();
  }
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.MODEL_ID,
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
      temperature: 0,
    }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || corpo?.error) {
    throw new Error(`OpenRouter: ${corpo?.error?.message ?? `HTTP ${r.status}`}`);
  }
  return corpo.choices?.[0]?.message?.content ?? "";
}

function simulaModelo(subconjunto) {
  const dos = (tipos, n) => subconjunto.filter((t) => tipos.includes(t.tipo)).slice(0, n);
  const campoTexto = (trechos) =>
    trechos.length
      ? { texto: trechos.map((t) => t.texto).join(" "), ids: trechos.map((t) => t.id) }
      : "LACUNA";
  const campoItens = (trechos, minimo) =>
    trechos.length >= minimo
      ? { itens: trechos.map((t) => t.texto), ids: trechos.map((t) => t.id) }
      : "LACUNA";
  const achadoForte = subconjunto.find((t) => t.tipo === "achado" && t.forca === "forte");
  return JSON.stringify({
    gatilho: achadoForte
      ? { texto: achadoForte.texto, ids: [achadoForte.id] }
      : "LACUNA",
    ancorar: campoItens(dos(["funciona"], 3), 3),
    evitar: campoItens(dos(["afasta"], 3), 3),
    contexto: campoTexto(dos(["contexto", "achado"], 1)),
    pesquisa: campoTexto(dos(["achado"], 2)),
  });
}

function montaMensagemUsuario(publico, macronarrativa, subconjunto) {
  const linhas = subconjunto.map((t) => {
    const meta = [`id: ${t.id}`, `tipo: ${t.tipo}`];
    if (t.forca) meta.push(`força: ${t.forca}`);
    meta.push(`base: ${t.base}`);
    return `[${meta.join(" | ")}]\n${t.texto}`;
  });
  return `Match: publico = "${publico}", macronarrativa = "${macronarrativa}".\n\nTrechos fornecidos:\n\n${linhas.join("\n\n")}`;
}

function extraiJson(texto) {
  try {
    return JSON.parse(String(texto).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
}

// Formato fixo dos cinco campos. Cada campo é "LACUNA" ou o objeto esperado.
// "ancorar" e "evitar" carregam exatamente três elementos (docs/03).
function formatoValido(json) {
  if (typeof json !== "object" || json === null) return false;
  const textoOk = (c) =>
    c === "LACUNA" ||
    (c && typeof c.texto === "string" && Array.isArray(c.ids)) ;
  const itensOk = (c) =>
    c === "LACUNA" ||
    (c && Array.isArray(c.itens) && c.itens.length === 3 &&
      c.itens.every((i) => typeof i === "string") && Array.isArray(c.ids));
  return (
    textoOk(json.gatilho) && textoOk(json.contexto) && textoOk(json.pesquisa) &&
    itensOk(json.ancorar) && itensOk(json.evitar)
  );
}

// BLOCKED_TERMS traz SOMENTE nomes próprios: sobrenomes de figuras políticas,
// nomes e siglas de partidos, nomes de coligações. Nunca palavras temáticas
// ("voto", "eleição", "candidato"): são vocabulário legítimo do acervo e
// bloqueá-las vetaria conteúdo revisado por humanos.
// A comparação ignora maiúsculas e acentos e casa palavras inteiras, para que
// uma sigla curta não dispare dentro de outra palavra.
function contemTermoBloqueado(texto, env) {
  const termos = (env.BLOCKED_TERMS ?? "")
    .split(",").map((t) => normaliza(t)).filter(Boolean);
  const alvo = normaliza(texto);
  return termos.some((termo) => {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapado}(?![\\p{L}\\p{N}])`, "u").test(alvo);
  });
}

// Minúsculas e sem acentos (decomposição Unicode + remoção dos diacríticos).
function normaliza(texto) {
  return String(texto).trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

// ---------------------------------------------------------------------------
// Montagem por código
// ---------------------------------------------------------------------------

// Um campo da página: lacuna quando abaixo do mínimo OU quando o modelo
// devolveu LACUNA ou "LACUNA" no texto. Ids fora do subconjunto são removidos.
function montaCampo(valor, minimoOk, campo, idsValidos, subconjunto, documentos) {
  const ehLacuna =
    !minimoOk || valor === "LACUNA" || valor?.texto === "LACUNA" || valor == null;
  if (ehLacuna) return { lacuna: true, aviso: AVISO_LACUNA };

  const ids = (valor.ids ?? []).filter((id) => idsValidos.has(id));
  const usados = subconjunto.filter((t) => ids.includes(t.id));
  const resultado = { lacuna: false, ids, chips: chipsDe(usados, documentos) };
  if ("itens" in valor) resultado.itens = valor.itens;
  else resultado.texto = valor.texto;
  return resultado;
}

// Chips de fonte: nome do estudo, método, período (docs/01).
function chipsDe(trechos, documentos) {
  const vistos = new Map();
  for (const t of trechos) {
    const d = documentos.get(t.id_documento);
    if (d && !vistos.has(t.id_documento)) {
      vistos.set(t.id_documento, { fonte: d.fonte, metodo: d.metodo, periodo: d.periodo });
    }
  }
  return [...vistos.values()];
}

function chipDe(trecho, documentos) {
  return chipsDe([trecho], documentos)[0] ?? null;
}

async function mapaDocumentos(env, trechos) {
  const ids = [...new Set(trechos.map((t) => t.id_documento))];
  if (ids.length === 0) return new Map();
  const marcadores = ids.map((_, i) => `?${i + 1}`).join(", ");
  const docs = await consulta(
    env,
    `SELECT id_documento, fonte, metodo, periodo FROM documentos WHERE id_documento IN (${marcadores})`,
    ids
  );
  return new Map(docs.map((d) => [d.id_documento, d]));
}

function idsDaPagina(pagina) {
  const ids = new Set();
  for (const campo of ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"]) {
    for (const id of pagina[campo]?.ids ?? []) ids.add(id);
  }
  for (const item of pagina.habitos_de_midia?.itens ?? []) ids.add(item.id);
  for (const item of pagina.exemplos?.itens ?? []) ids.add(item.id);
  return ids;
}

// Teto de trechos priorizando força forte e diversidade de pauta:
// rodadas entre as pautas, fortes primeiro dentro de cada uma.
function limitaSubconjunto(trechos, teto) {
  const porPauta = new Map();
  for (const t of trechos) {
    if (!porPauta.has(t.pauta)) porPauta.set(t.pauta, []);
    porPauta.get(t.pauta).push(t);
  }
  for (const lista of porPauta.values()) {
    lista.sort((a, b) => (b.forca === "forte") - (a.forca === "forte"));
  }
  const resultado = [];
  while (resultado.length < teto) {
    let pegou = false;
    for (const lista of porPauta.values()) {
      if (lista.length && resultado.length < teto) {
        resultado.push(lista.shift());
        pegou = true;
      }
    }
    if (!pegou) break;
  }
  return resultado;
}

function unicosPorId(trechos) {
  const vistos = new Map();
  for (const t of trechos) if (!vistos.has(t.id)) vistos.set(t.id, t);
  return [...vistos.values()];
}

async function consulta(env, sqlTexto, parametros = []) {
  const { results } = await env.DB.prepare(sqlTexto).bind(...parametros).all();
  return results ?? [];
}

// ---------------------------------------------------------------------------
// Rota /api/formato (docs/01, seção Formatos; docs/03, seção /api/formato)
//
// Entrada: a página já gerada por /api/match + formato da lista fechada.
// O acervo NÃO é reconsultado; o modelo recebe só a página. Nenhum texto
// livre do usuário chega ao modelo: da entrada só sobrevivem os campos
// conhecidos da página, com tipo e tamanho validados, URLs removidas e o
// restante descartado.
// ---------------------------------------------------------------------------

// Nome de cada formato como aparece na seção correspondente de docs/08.
const NOMES_FORMATO = {
  whatsapp: "WhatsApp",
  carrossel: "Carrossel",
  roteiro: "Roteiro de vídeo",
};

const AVISO_ORIENTACAO_GERAL =
  "Orientação geral do formato: o acervo ainda não tem, para este cruzamento, trechos do que funciona ou do que afasta.";

// Prompt fixo por formato: preâmbulo com as regras 2 e 3 de docs/03 e o
// contrato de entrega da Parte 3 de docs/08 + o documento de governança
// na íntegra. A pessoa escreve, a plataforma orienta: o modelo NUNCA
// entrega a mensagem final.
function promptFormato(formato) {
  return `Você orienta a escrita de uma comunicação no formato "${NOMES_FORMATO[formato]}", em português do Brasil, a partir de uma página de apoio fornecida. Você NÃO escreve a mensagem final: entrega o material para que a pessoa escreva a própria mensagem.

Regras absolutas:
1. Toda orientação específica de público ou tema vem da página fornecida. O documento de regras de formato abaixo é a única fonte externa permitida. Não acrescente fatos, números ou exemplos de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações, políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Aplique as Regras gerais e a seção "${NOMES_FORMATO[formato]}" do documento abaixo. Nunca invente regra de formato.
5. Se a página não trouxer itens de "O que ancorar" ou "O que evitar", use apenas as regras do documento.
6. Responda apenas com o JSON no formato indicado, sem nenhum texto fora dele.

Entregue três coisas, nesta ordem (Parte 3 do documento):
- "gatilho": o gatilho da página adaptado a este formato — qual ângulo funciona melhor neste meio, considerando a extensão e a estrutura definidas no documento (uma a duas frases).
- "ancorar": lista do que deve aparecer, a partir dos itens de "O que ancorar" da página, adaptados à estrutura do formato.
- "evitar": lista do que evitar, a partir dos itens de "O que evitar" da página somados aos cuidados específicos do formato.

Formato: {"gatilho": "...", "ancorar": ["..."], "evitar": ["..."]}

Documento de regras de formato:

${REGRAS_DE_FORMATO}`;
}

function validaOrientacao(j) {
  const lista = (v) =>
    Array.isArray(v) && v.length >= 1 && v.every((i) => typeof i === "string" && i.trim());
  return (
    typeof j?.gatilho === "string" && j.gatilho.trim().length > 0 &&
    lista(j?.ancorar) && lista(j?.evitar)
  );
}

const TAMANHO_MAXIMO_CAMPO = 4000;

async function rotaFormato(corpo, env, request) {
  const { formato, pagina } = corpo ?? {};

  if (!(await verificaTurnstile(corpo, env, request))) {
    return respostaJson({ erro: "Verificação anti-abuso falhou." }, 403);
  }
  if (!(await limitePorIpOk(env, request, "formato"))) {
    return respostaJson({ erro: "Limite de requisições atingido. Tente mais tarde." }, 429);
  }

  // Lista fechada de formatos → 400 sem chamar o modelo.
  if (!NOMES_FORMATO[formato]) {
    return respostaJson({ erro: "Formato fora da lista disponível." }, 400);
  }

  const canonica = paginaCanonica(pagina);
  if (!canonica) {
    return respostaJson({ erro: "Página ausente ou fora do formato entregue pela plataforma." }, 400);
  }

  // Cache nível 1, mesma validade da rota match: o conjunto de ids do
  // cruzamento no banco precisa ser exatamente o guardado na geração.
  const cacheLigado = env.CACHE_ENABLED !== "false";
  const idsAcervo = cacheLigado
    ? await idsAcervoAtual(env, canonica.match.publico, canonica.match.macronarrativa)
    : null;
  if (cacheLigado) {
    const guardada = await env.DB.prepare(
      "SELECT resposta, ids_trechos, modelo FROM formatos WHERE publico = ?1 AND macronarrativa = ?2 AND formato = ?3 AND ids_acervo = ?4"
    ).bind(canonica.match.publico, canonica.match.macronarrativa, formato, idsAcervo).first();
    if (guardada) {
      const respostaCache = JSON.parse(guardada.resposta);
      respostaCache.origem = "cache";
      respostaCache.versao_acervo = VERSAO_ACERVO;
      await gravaRegistro(env, {
        rota: "formato",
        publico: canonica.match.publico, macronarrativa: canonica.match.macronarrativa, formato,
        ids: guardada.ids_trechos, modelo: guardada.modelo, origem: "cache", resposta: respostaCache,
      });
      return respostaJson(respostaCache);
    }
  }

  const sistema = promptFormato(formato);
  const usuario = `Página de apoio:\n\n${canonica.texto}`;

  let gerado = null;
  for (let tentativa = 0; tentativa < 2 && gerado === null; tentativa++) {
    const texto = await chamaModelo(env, sistema, usuario, () => simulaFormato(formato, canonica));
    const json = extraiJson(texto);
    if (json && validaOrientacao(json)) gerado = json;
    else console.error(`formato ${formato}: resposta fora do formato (tentativa ${tentativa + 1})`);
  }
  if (gerado === null) return respostaIndisponivel();

  // Mesma verificação de saída da rota match.
  if (contemTermoBloqueado(JSON.stringify(gerado), env)) {
    console.error("resposta de formato descartada por termo bloqueado");
    return respostaIndisponivel();
  }

  const modeloUsado = env.SIMULAR_MODELO === "true" ? "simulacao" : env.MODEL_ID;
  const resposta = {
    formato,
    match: canonica.match,
    orientacao: gerado,
    // Sinalização por código (docs/08, Parte 3): sem ancorar e sem evitar
    // na página, a orientação é geral, não específica deste público.
    aviso_orientacao:
      canonica.ancorar.length === 0 && canonica.evitar.length === 0
        ? AVISO_ORIENTACAO_GERAL
        : null,
    rotulo_ia: ROTULO_IA,
    versao_acervo: VERSAO_ACERVO,
    origem: "geracao",
  };

  if (cacheLigado) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO formatos (publico, macronarrativa, formato, resposta, ids_trechos, ids_acervo, modelo, gerado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))"
    )
      .bind(
        canonica.match.publico, canonica.match.macronarrativa, formato,
        JSON.stringify(resposta), canonica.ids.join(","), idsAcervo, modeloUsado
      )
      .run();
  }

  // Gravação em registros antes de devolver. Sem IP, sem identidade.
  await gravaRegistro(env, {
    rota: "formato",
    publico: canonica.match.publico, macronarrativa: canonica.match.macronarrativa, formato,
    ids: canonica.ids.join(","), modelo: modeloUsado, origem: "geracao", resposta,
  });

  return respostaJson(resposta);
}

// Reduz a página recebida à forma canônica: só os campos conhecidos, só
// strings, tamanho limitado, URLs removidas. Qualquer outra coisa no corpo
// é descartada — é isso que garante que texto livre não chega ao modelo.
function paginaCanonica(pagina) {
  if (typeof pagina !== "object" || pagina === null) return null;
  const publico = pagina.match?.publico;
  const macronarrativa = pagina.match?.macronarrativa;
  if (!PUBLICOS.includes(publico) || !MACRONARRATIVAS.includes(macronarrativa)) return null;

  const texto = (valor) =>
    typeof valor === "string" ? limpaTexto(valor) : null;
  const campoTexto = (campo) =>
    pagina[campo]?.lacuna === false ? texto(pagina[campo].texto) : null;
  const campoItens = (campo) =>
    pagina[campo]?.lacuna === false && Array.isArray(pagina[campo].itens)
      ? pagina[campo].itens.map(texto).filter(Boolean)
      : [];
  const idsDe = (campo) =>
    Array.isArray(pagina[campo]?.ids)
      ? pagina[campo].ids.filter((id) => typeof id === "string" && /^[A-Za-z0-9-]{1,40}$/.test(id))
      : [];

  const partes = [];
  partes.push(`Público: ${publico}. Tema: ${macronarrativa}.`);
  const gatilho = campoTexto("gatilho");
  const contexto = campoTexto("contexto");
  const pesquisa = campoTexto("pesquisa");
  const ancorar = campoItens("ancorar");
  const evitar = campoItens("evitar");
  if (gatilho) partes.push(`Gatilho: ${gatilho}`);
  if (contexto) partes.push(`Por que isso importa: ${contexto}`);
  if (pesquisa) partes.push(`O que a pesquisa mostra: ${pesquisa}`);
  if (ancorar.length) partes.push(`O que ancorar:\n- ${ancorar.join("\n- ")}`);
  if (evitar.length) partes.push(`O que evitar:\n- ${evitar.join("\n- ")}`);

  // Sem nenhum campo substantivo não há o que adaptar.
  if (partes.length < 2) return null;

  const ids = [...new Set(["gatilho", "ancorar", "evitar", "contexto", "pesquisa"].flatMap(idsDe))];
  return { match: { publico, macronarrativa }, texto: partes.join("\n\n"), ids, gatilho, ancorar, evitar };
}

// Corta no tamanho máximo e remove qualquer URL: o modelo nunca vê links.
function limpaTexto(valor) {
  const semUrl = valor
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "");
  const aparado = semUrl.replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO_CAMPO);
  return aparado.length ? aparado : null;
}

// Simulador da rota formato: orientação determinística construída da página
// canônica, na estrutura da Parte 3 de docs/08 (gatilho, ancorar, evitar).
function simulaFormato(formato, canonica) {
  const base =
    canonica.gatilho ?? canonica.texto.split("\n").find((l) => l.trim()) ?? "";
  return JSON.stringify({
    gatilho: `Para ${NOMES_FORMATO[formato]}, partir do gatilho da página: ${base}`,
    ancorar: canonica.ancorar.length
      ? canonica.ancorar
      : ["Sem trechos específicos: seguir a estrutura recomendada do formato."],
    evitar: [
      ...canonica.evitar,
      `Cuidados específicos do formato ${NOMES_FORMATO[formato]} (docs/08).`,
    ],
  });
}
