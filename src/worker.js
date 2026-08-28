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
const PROMPT_SISTEMA = `Você preenche uma página de apoio à comunicação de temas de interesse público,
usando exclusivamente os trechos de pesquisa fornecidos abaixo. Regras absolutas:

1. Use somente os trechos fornecidos. Não acrescente fatos, números, exemplos
   ou afirmações de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Cada campo preenchido deve listar os ids dos trechos usados.
5. Campo sem trechos suficientes recebe o valor "LACUNA". Nunca preencha por
   aproximação.
6. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
7. Trechos com base "restrita" que afirmem prevalência mantêm o escopo
   "entre os participantes do estudo".
8. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

Formato: {"importa": {"texto": "...", "ids": []},
          "pesquisa": {"texto": "...", "ids": []},
          "funciona": {"itens": ["...","...","..."], "ids": []},
          "afasta": {"itens": ["...","...","..."], "ids": []},
          "sintese": {"texto": "...", "ids": []}}`;

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

  // Consultas fixas (docs/07): o modelo não decide onde buscar.
  const [trechosMatch, trechosMidia, recursos] = await Promise.all([
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND pauta = 'consumo de mídia'", [publico]),
    consulta(env, "SELECT titulo, url, descricao FROM recursos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
  ]);

  // Blocos e mínimos (docs/07). Abaixo do mínimo → lacuna declarada, por código.
  const blocos = {
    importa: trechosMatch.filter((t) => t.tipo === "contexto" || t.tipo === "achado"),
    pesquisa: trechosMatch.filter((t) => t.tipo === "achado"),
    funciona: trechosMatch.filter((t) => t.tipo === "funciona"),
    afasta: trechosMatch.filter((t) => t.tipo === "afasta"),
    exemplos: trechosMatch.filter((t) => t.tipo === "exemplo" && t.link),
    midia: trechosMidia,
  };
  const minimos = {
    importa: blocos.importa.length >= 1,
    pesquisa: blocos.pesquisa.length >= 2 && blocos.pesquisa.some((t) => t.forca === "forte"),
    funciona: blocos.funciona.length >= 3,
    afasta: blocos.afasta.length >= 3,
    exemplos: blocos.exemplos.length >= 2,
    midia: blocos.midia.length >= 1,
  };

  const camposDoModelo = ["importa", "pesquisa", "funciona", "afasta"];
  const algumCampoViavel = camposDoModelo.some((c) => minimos[c]);

  // 5. Subconjunto vazio ou abaixo dos mínimos → lacuna por código, SEM modelo.
  let gerado;
  let modeloUsado = null;
  let subconjunto = [];
  if (!algumCampoViavel) {
    gerado = {
      importa: "LACUNA", pesquisa: "LACUNA", funciona: "LACUNA",
      afasta: "LACUNA", sintese: "LACUNA",
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
  // Síntese: derivada dos demais; omitida se pesquisa em lacuna (docs/07).
  pagina.sintese = pagina.pesquisa.lacuna
    ? null
    : montaCampo(gerado.sintese, true, "sintese", idsValidos, subconjunto, documentos);

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

  // 7. Gravação em registros antes de devolver. Sem IP, sem identidade.
  await env.DB.prepare(
    "INSERT INTO registros (rota, publico, macronarrativa, ids_trechos, modelo, resposta) VALUES ('match', ?1, ?2, ?3, ?4, ?5)"
  )
    .bind(publico, macronarrativa, [...idsUsados].join(","), modeloUsado, JSON.stringify(pagina))
    .run();

  return respostaJson(pagina);
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
    const json = extraiJson(texto);
    if (json && formatoValido(json)) return json;
    console.error(`resposta fora do formato (tentativa ${tentativa + 1})`);
  }
  return null;
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
    importa: campoTexto(dos(["contexto", "achado"], 1)),
    pesquisa: campoTexto(dos(["achado"], 2)),
    funciona: campoItens(dos(["funciona"], 3), 3),
    afasta: campoItens(dos(["afasta"], 3), 3),
    sintese: achadoForte
      ? { texto: achadoForte.texto, ids: [achadoForte.id] }
      : "LACUNA",
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
function formatoValido(json) {
  if (typeof json !== "object" || json === null) return false;
  const textoOk = (c) =>
    c === "LACUNA" ||
    (c && typeof c.texto === "string" && Array.isArray(c.ids)) ;
  const itensOk = (c) =>
    c === "LACUNA" ||
    (c && Array.isArray(c.itens) && c.itens.every((i) => typeof i === "string") && Array.isArray(c.ids));
  return (
    textoOk(json.importa) && textoOk(json.pesquisa) && textoOk(json.sintese) &&
    itensOk(json.funciona) && itensOk(json.afasta)
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
  for (const campo of ["importa", "pesquisa", "funciona", "afasta", "sintese"]) {
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

// Regras 2, 3 e 8 de docs/03, presentes em todo prompt de formato.
const REGRAS_FORMATO = `Regras absolutas:
1. Use somente o conteúdo da página fornecida. Não acrescente fatos, números
   ou exemplos de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Responda apenas com o JSON no formato indicado, sem nenhum texto fora dele.`;

// Prompts fixos por formato. Nada do usuário entra aqui.
const PROMPTS_FORMATO = {
  whatsapp: {
    sistema: `Você adapta uma página de apoio à comunicação para uma mensagem curta de WhatsApp, em português do Brasil, com tom pessoal e direto, no máximo 900 caracteres, sem emojis em excesso.
${REGRAS_FORMATO}

Formato: {"mensagem": "..."}`,
    valida: (j) => typeof j?.mensagem === "string" && j.mensagem.length > 0,
  },
  carrossel: {
    sistema: `Você adapta uma página de apoio à comunicação para um carrossel de 5 a 7 cartões, em português do Brasil. Cada cartão tem um título curto (até 40 caracteres) e um texto de apoio (até 200 caracteres). O primeiro cartão apresenta o tema; o último resume.
${REGRAS_FORMATO}

Formato: {"cartoes": [{"titulo": "...", "texto": "..."}]}`,
    valida: (j) =>
      Array.isArray(j?.cartoes) && j.cartoes.length >= 3 && j.cartoes.length <= 8 &&
      j.cartoes.every((c) => typeof c?.titulo === "string" && typeof c?.texto === "string"),
  },
  roteiro: {
    sistema: `Você adapta uma página de apoio à comunicação para um roteiro de vídeo curto (até 60 segundos), em português do Brasil. Divida em cenas; cada cena tem uma descrição visual breve e a fala correspondente, em linguagem falada.
${REGRAS_FORMATO}

Formato: {"cenas": [{"descricao": "...", "fala": "..."}]}`,
    valida: (j) =>
      Array.isArray(j?.cenas) && j.cenas.length >= 2 &&
      j.cenas.every((c) => typeof c?.descricao === "string" && typeof c?.fala === "string"),
  },
};

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
  if (!PROMPTS_FORMATO[formato]) {
    return respostaJson({ erro: "Formato fora da lista disponível." }, 400);
  }

  const canonica = paginaCanonica(pagina);
  if (!canonica) {
    return respostaJson({ erro: "Página ausente ou fora do formato entregue pela plataforma." }, 400);
  }

  const { sistema, valida } = PROMPTS_FORMATO[formato];
  const usuario = `Página a adaptar:\n\n${canonica.texto}`;

  let gerado = null;
  for (let tentativa = 0; tentativa < 2 && gerado === null; tentativa++) {
    const texto = await chamaModelo(env, sistema, usuario, () => simulaFormato(formato, canonica));
    const json = extraiJson(texto);
    if (json && valida(json)) gerado = json;
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
    conteudo: gerado,
    rotulo_ia: ROTULO_IA,
  };

  // Gravação em registros antes de devolver. Sem IP, sem identidade.
  await env.DB.prepare(
    "INSERT INTO registros (rota, publico, macronarrativa, formato, ids_trechos, modelo, resposta) VALUES ('formato', ?1, ?2, ?3, ?4, ?5, ?6)"
  )
    .bind(
      canonica.match.publico,
      canonica.match.macronarrativa,
      formato,
      canonica.ids.join(","),
      modeloUsado,
      JSON.stringify(resposta)
    )
    .run();

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
  const importa = campoTexto("importa");
  const pesquisa = campoTexto("pesquisa");
  const sintese = campoTexto("sintese");
  const funciona = campoItens("funciona");
  const afasta = campoItens("afasta");
  if (importa) partes.push(`Por que isso importa: ${importa}`);
  if (pesquisa) partes.push(`O que a pesquisa mostra: ${pesquisa}`);
  if (funciona.length) partes.push(`O que costuma funcionar:\n- ${funciona.join("\n- ")}`);
  if (afasta.length) partes.push(`O que costuma afastar:\n- ${afasta.join("\n- ")}`);
  if (sintese) partes.push(`Síntese: ${sintese}`);

  // Sem nenhum campo substantivo não há o que adaptar.
  if (partes.length < 2) return null;

  const ids = [...new Set(["importa", "pesquisa", "funciona", "afasta", "sintese"].flatMap(idsDe))];
  return { match: { publico, macronarrativa }, texto: partes.join("\n\n"), ids };
}

// Corta no tamanho máximo e remove qualquer URL: o modelo nunca vê links.
function limpaTexto(valor) {
  const semUrl = valor
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "");
  const aparado = semUrl.replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO_CAMPO);
  return aparado.length ? aparado : null;
}

// Simulador da rota formato: adaptação determinística da página canônica.
function simulaFormato(formato, canonica) {
  const linhas = canonica.texto.split("\n").filter((l) => l.trim());
  const corte = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  if (formato === "whatsapp") {
    return JSON.stringify({ mensagem: corte(linhas.join(" "), 900) });
  }
  if (formato === "carrossel") {
    const cartoes = linhas.slice(0, 7).map((l, i) => ({
      titulo: corte(i === 0 ? "Para começar" : `Cartão ${i + 1}`, 40),
      texto: corte(l, 200),
    }));
    while (cartoes.length < 3) cartoes.push({ titulo: `Cartão ${cartoes.length + 1}`, texto: "…" });
    return JSON.stringify({ cartoes });
  }
  return JSON.stringify({
    cenas: linhas.slice(0, 4).map((l) => ({ descricao: "Pessoa falando à câmera.", fala: corte(l, 240) })),
  });
}
