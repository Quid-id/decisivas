// DECISIVAS — Worker do Cloudflare, rota /api/*
//
// /api/match implementa docs/01 (Fluxo do match), docs/03 (regras do agente)
// e docs/07 (mapa de recuperação), nesta ordem: checagens de código antes do
// modelo, consulta ao D1 (o recorte inteiro do cruzamento, sem teto),
// chamada ao OpenRouter (MODEL_ID), validação com uma retentativa, termos
// bloqueados, anexação por código, gravação em registros, resposta.
//
// O filtro é camada de código, sem IA (etapa 4): entrega ao modelo todos os
// trechos do cruzamento agrupados por tipo, mais os trechos de perfil do
// público, e produz as tags de pauta. Além da versão geral, cada tag tem um
// recorte próprio (a pauta + a pauta transversal) do qual sai só o gatilho.
// Cada recorte tem entrada e validade de cache próprias, então nada é gerado
// no clique.
//
// Nenhuma chave de API entra neste arquivo: local em .dev.vars, produção
// como segredo no painel do Cloudflare.

// Governança de formatos (docs/08): o agente nunca inventa regra de formato,
// aplica o que está escrito no documento. O arquivo entra no prompt no build
// ([[rules]] no wrangler.toml), então editar o .md muda o comportamento no
// próximo deploy.
import REGRAS_DE_FORMATO from "../docs/08-regras-de-formato.md";

// Versão do acervo (dados/versao-acervo.txt, atualizada a cada carga oficial).
// Carimba as respostas e valida o cache do navegador (nível 2).
import VERSAO_ACERVO_BRUTA from "../dados/versao-acervo.txt";
const VERSAO_ACERVO = VERSAO_ACERVO_BRUTA.trim();

// Fonte única dos vocabulários fechados (migração 003).
import VOCABULARIO from "../dados/vocabulario.json";

// Vocabulários fechados: fonte única em dados/vocabulario.json, lida também
// pelos scripts e pelo build (que publica public/vocabulario.js para o front).
// Nenhuma outra cópia destas listas existe no repositório.
const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const MACRONARRATIVAS = VOCABULARIO.macronarrativas.map((m) => m.id);
const FORMATOS = VOCABULARIO.formatos;

// Rótulo de IA obrigatório em toda saída gerada (docs/01, item 9 do cartão).
const ROTULO_IA =
  "Conteúdo organizado com apoio de inteligência artificial a partir do acervo de pesquisa. Não indica voto nem menciona candidaturas.";

const AVISO_LACUNA = "Evidência insuficiente no acervo para este item.";

const MENSAGEM_INDISPONIVEL =
  "O serviço está temporariamente indisponível. O acervo e as páginas fixas continuam no ar.";

// Pauta transversal (etapa 4): entra em TODO recorte por pauta, porque
// linguagem atravessa qualquer ângulo, e nunca vira tag na tela.
const PAUTA_TRANSVERSAL = "comunicação e linguagem";

// Pauta do cruzamento só vira tag com pelo menos este número de trechos.
const MINIMO_TRECHOS_PARA_TAG = 3;

// Tipos que entram no prompt, na ordem em que aparecem. `exemplo` fica fora
// de propósito: não tem linha no acervo desta versão e carrega link, e o
// modelo nunca vê link (regra 2 do CLAUDE.md).
const ORDEM_DOS_TIPOS = ["achado", "funciona", "afasta", "contexto", "perfil", "verbatim"];

const CABECALHO_DO_TIPO = {
  achado: 'Trechos do tipo "achado" — o que a pesquisa encontrou.',
  funciona: 'Trechos do tipo "funciona" — o que aproxima este público deste tema.',
  afasta: 'Trechos do tipo "afasta" — o que afasta este público deste tema.',
  contexto: 'Trechos do tipo "contexto" — o cenário em que o tema chega a este público.',
  perfil: 'Trechos do tipo "perfil" — quem é este público. Não dependem do tema.',
  verbatim:
    'Trechos do tipo "verbatim" — REFERÊNCIA DE LINGUAGEM. São falas de ' +
    'participantes, para calibrar vocabulário e tom. NÃO sustentam afirmação: ' +
    'nunca use um verbatim como evidência de um achado.',
};

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
8. Os trechos de tipo "verbatim" são referência de linguagem: servem para
   calibrar vocabulário e tom, e não sustentam afirmação. Nunca use um
   verbatim como evidência de um achado. Os de tipo "perfil" descrevem o
   público e não dependem do tema.
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

// Prompt do recorte por pauta (etapa 4): mesmas regras absolutas, um campo só.
// No beta, cada tag entrega apenas o gatilho daquele ângulo; a adaptação de
// formato por pauta fica para depois.
const PROMPT_SISTEMA_PAUTA = `Você prepara o material para que uma pessoa escreva a própria comunicação
de um tema de interesse público a um público específico, usando exclusivamente
os trechos de pesquisa fornecidos abaixo. Aqui o recorte é uma pauta: um ângulo
dentro do tema. Você NÃO escreve a mensagem, e neste recorte entrega um único
campo: o gatilho. Regras absolutas:

1. Use somente os trechos fornecidos. Não acrescente fatos, números, exemplos
   ou afirmações de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Liste os ids dos trechos usados.
5. Sem trechos suficientes, o valor do campo é "LACUNA", a string inteira no
   lugar do objeto. Nunca preencha por aproximação.
6. Os trechos de tipo "verbatim" são referência de linguagem: servem para
   calibrar vocabulário e tom, e não sustentam afirmação.
7. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
8. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

O campo:
- "gatilho": o ângulo que mobiliza este público neste tema, por esta pauta, em
  uma ou duas frases, derivado dos trechos de tipo "achado". É o núcleo do que
  a mensagem precisa tocar quando o recorte é esta pauta.

Formato: {"gatilho": {"texto": "...", "ids": []}}`;

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

  const cacheLigado = env.CACHE_ENABLED !== "false";

  // O recorte do banco é carregado no máximo uma vez por requisição, e só
  // quando há algo a gerar: com tudo em cache, a rota não consulta trechos.
  // Guarda a promessa, não o resultado, para que as gerações por pauta, que
  // rodam em paralelo, compartilhem a mesma consulta.
  let recortePendente = null;
  const carregaRecorte = () =>
    (recortePendente ??= consultaRecorte(env, publico, macronarrativa));

  // 5. Cache nível 1 do recorte geral (pauta vazia), antes de qualquer chamada
  // ao modelo. Com o interruptor desligado, abreCachePagina não toca o banco —
  // nem a consulta de validade, nem a tabela paginas. Qualquer falha ali
  // (tabela ausente, coluna ausente) devolve cache indisponível e a rota segue
  // para geração.
  const cacheGeral = await abreCachePagina(env, cacheLigado, publico, macronarrativa, "");

  let pagina;
  if (cacheGeral.guardada) {
    pagina = JSON.parse(cacheGeral.guardada.resposta);
    pagina.origem = "cache";
    await gravaRegistro(env, {
      rota: "match", publico, macronarrativa,
      ids: cacheGeral.guardada.ids_trechos, modelo: cacheGeral.guardada.modelo,
      origem: "cache", resposta: pagina,
    });
  } else {
    const { trechos, perfil, recursos } = await carregaRecorte();
    const gerada = await geraPaginaGeral(env, publico, macronarrativa, trechos, perfil, recursos);
    if (gerada === null) return respostaIndisponivel();
    pagina = gerada.pagina;

    // 7. Guarda no cache (páginas de lacuna também: não custam nada e a
    // validade por ids_acervo invalida sozinha quando o acervo mudar).
    await guardaCache(
      env, cacheGeral,
      "INSERT OR REPLACE INTO paginas (publico, macronarrativa, pauta, resposta, ids_trechos, ids_acervo, modelo, gerado_em) VALUES (?1, ?2, '', ?3, ?4, ?5, ?6, datetime('now'))",
      [publico, macronarrativa, JSON.stringify(pagina), gerada.ids, cacheGeral.idsAcervo, gerada.modelo]
    );

    // 8. Gravação em registros antes de devolver. Sem IP, sem identidade.
    await gravaRegistro(env, {
      rota: "match", publico, macronarrativa,
      ids: gerada.ids, modelo: gerada.modelo, origem: "geracao", resposta: pagina,
    });
  }

  // 9. Recortes por pauta: um gatilho por tag, cada um com entrada e validade
  // próprias no cache. Vai fora do JSON guardado do recorte geral, porque cada
  // pauta invalida sozinha quando os trechos dela mudam.
  pagina.gatilhos_por_pauta = await gatilhosPorPauta(
    env, cacheLigado, publico, macronarrativa, pagina.tags ?? [], carregaRecorte
  );

  pagina.versao_acervo = VERSAO_ACERVO;
  // O front usa esta flag: com o cache desligado, descarta o que guardou.
  pagina.cache_habilitado = cacheLigado;

  return respostaJson(pagina);
}

// Página do recorte geral: todos os trechos do cruzamento mais os de perfil do
// público. Devolve a página montada, os ids usados e o modelo, ou null quando
// a geração não pode ser entregue (fuga de formato ou termo bloqueado).
async function geraPaginaGeral(env, publico, macronarrativa, trechos, perfil, recursos) {
  // Blocos e mínimos (docs/07). Abaixo do mínimo → lacuna declarada, por
  // código. O gatilho deriva dos achados, então compartilha os trechos e o
  // mínimo do bloco pesquisa.
  const achados = trechos.filter((t) => t.tipo === "achado");
  const minimoAchados = achados.length >= 2 && achados.some((t) => t.forca === "forte");
  const blocos = {
    gatilho: achados,
    ancorar: trechos.filter((t) => t.tipo === "funciona"),
    evitar: trechos.filter((t) => t.tipo === "afasta"),
    contexto: trechos.filter((t) => t.tipo === "contexto" || t.tipo === "achado"),
    pesquisa: achados,
    exemplos: trechos.filter((t) => t.tipo === "exemplo" && t.link),
  };
  const minimos = {
    gatilho: minimoAchados,
    ancorar: blocos.ancorar.length >= 3,
    evitar: blocos.evitar.length >= 3,
    contexto: blocos.contexto.length >= 1,
    pesquisa: minimoAchados,
    exemplos: blocos.exemplos.length >= 2,
  };

  const camposDoModelo = ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"];
  const algumCampoViavel = camposDoModelo.some((c) => minimos[c]);

  // 5. Recorte vazio ou abaixo dos mínimos → lacuna por código, SEM modelo.
  let gerado;
  let modeloUsado = null;
  let subconjunto = [];
  if (!algumCampoViavel) {
    gerado = {
      gatilho: "LACUNA", ancorar: "LACUNA", evitar: "LACUNA",
      contexto: "LACUNA", pesquisa: "LACUNA",
    };
  } else {
    // Sem teto: o recorte inteiro vai ao modelo, agrupado por tipo. A geração
    // acontece uma vez por recorte e vai para o cache, então o custo é fixo.
    subconjunto = [...trechos, ...perfil];

    gerado = await geraComValidacao(env, publico, macronarrativa, subconjunto);
    if (gerado === null) return null;
    modeloUsado = modeloAtual(env);

    // Verificação de segurança na saída: termos bloqueados (variável de
    // ambiente, fora do repositório) → descarta e responde indisponibilidade.
    if (contemTermoBloqueado(JSON.stringify(gerado), env)) {
      console.error("resposta descartada por termo bloqueado");
      return null;
    }
  }

  // 6. Anexação por código: lacunas, tags de pauta, hábitos de mídia,
  // exemplos (links do banco), recursos.
  const idsValidos = new Set(subconjunto.map((t) => t.id));

  const pagina = { match: { publico, macronarrativa } };
  for (const campo of camposDoModelo) {
    pagina[campo] = montaCampo(gerado[campo], minimos[campo], idsValidos);
  }

  // Tags de pauta (etapa 4): as pautas do cruzamento com 3 trechos ou mais,
  // fora a transversal. Ficam no JSON guardado porque derivam exatamente dos
  // trechos que definem a validade desta entrada.
  pagina.tags = tagsDoCruzamento(trechos);

  // Hábitos de mídia: a planilha própria ainda não existe e a pauta
  // `consumo de mídia` não está entre as 59 da migração 003, então o bloco é
  // lacuna declarada — não erro. Volta a ter conteúdo quando a planilha chegar
  // (etapa 6 da especificação).
  pagina.habitos_de_midia = { lacuna: true, aviso: AVISO_LACUNA };

  pagina.exemplos = minimos.exemplos
    ? {
        itens: blocos.exemplos.map((t) => ({ id: t.id, texto: t.texto, link: t.link })),
        lacuna: false,
      }
    : { lacuna: true, aviso: AVISO_LACUNA };

  // Materiais complementares: só da tabela recursos; vazio → bloco omitido.
  pagina.materiais_complementares = recursos;

  // Data da última atualização do acervo: definida na carga, via variável
  // de ambiente (ex.: ACERVO_ATUALIZADO_EM="02/09/2026").
  pagina.atualizado_em = env.ACERVO_ATUALIZADO_EM ?? null;
  pagina.rotulo_ia = ROTULO_IA;
  pagina.origem = "geracao";

  return { pagina, ids: [...idsDaPagina(pagina)].join(","), modelo: modeloUsado };
}

// Um gatilho por tag, em paralelo: são recortes independentes, e sequenciar
// faria a primeira pessoa de um cruzamento esperar uma geração atrás da outra.
// Falha de uma pauta não derruba a página: aquele ângulo fica em lacuna e não
// é guardado, para a próxima requisição tentar de novo.
async function gatilhosPorPauta(env, cacheLigado, publico, macronarrativa, tags, carregaRecorte) {
  if (!tags.length) return {};
  const pares = await Promise.all(
    tags.map(async ({ pauta }) => [
      pauta,
      await gatilhoDaPauta(env, cacheLigado, publico, macronarrativa, pauta, carregaRecorte),
    ])
  );
  return Object.fromEntries(pares);
}

async function gatilhoDaPauta(env, cacheLigado, publico, macronarrativa, pauta, carregaRecorte) {
  const cache = await abreCachePagina(env, cacheLigado, publico, macronarrativa, pauta);
  if (cache.guardada) {
    const campo = JSON.parse(cache.guardada.resposta);
    await gravaRegistro(env, {
      rota: "match", publico, macronarrativa,
      ids: cache.guardada.ids_trechos, modelo: cache.guardada.modelo,
      origem: "cache", resposta: { recorte: { pauta }, gatilho: campo },
    });
    return campo;
  }

  const { trechos } = await carregaRecorte();
  // O recorte da pauta: os trechos dela mais os da pauta transversal.
  const recorte = recorteDaPauta(trechos, pauta);
  const achados = recorte.filter((t) => t.tipo === "achado");
  const minimoOk = achados.length >= 2 && achados.some((t) => t.forca === "forte");

  let campo;
  let modeloUsado = null;
  if (!minimoOk) {
    campo = { lacuna: true, aviso: AVISO_LACUNA };
  } else {
    const gerado = await geraGatilhoDaPauta(env, publico, macronarrativa, pauta, recorte);
    if (gerado === null) {
      // Sem entrega válida: lacuna nesta pauta, sem guardar no cache.
      return { lacuna: true, aviso: AVISO_LACUNA };
    }
    modeloUsado = modeloAtual(env);
    campo = montaCampo(gerado.gatilho, true, new Set(recorte.map((t) => t.id)));
  }

  await guardaCache(
    env, cache,
    "INSERT OR REPLACE INTO paginas (publico, macronarrativa, pauta, resposta, ids_trechos, ids_acervo, modelo, gerado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
    [publico, macronarrativa, pauta, JSON.stringify(campo), (campo.ids ?? []).join(","), cache.idsAcervo, modeloUsado]
  );
  await gravaRegistro(env, {
    rota: "match", publico, macronarrativa,
    ids: (campo.ids ?? []).join(","), modelo: modeloUsado, origem: "geracao",
    resposta: { recorte: { pauta }, gatilho: campo },
  });
  return campo;
}

// ---------------------------------------------------------------------------
// Cache nível 1: o interruptor decide ANTES de qualquer acesso ao banco, e
// falha de cache nunca derruba a rota (docs/06, seção Migrações de banco).
// ---------------------------------------------------------------------------

// Estado do cache para esta requisição. Com `ligado` falso não há uma única
// consulta: devolve indisponível de imediato. Com o cache ligado, qualquer
// erro (tabela ou coluna ausente, falha do D1) é registrado e devolve
// indisponível, para a rota gerar normalmente em vez de responder 503.
async function abreCachePagina(env, ligado, publico, macronarrativa, pauta) {
  if (!ligado) return { disponivel: false, idsAcervo: null, guardada: null };
  try {
    const idsAcervo = await idsAcervoAtual(env, publico, macronarrativa, pauta);
    const guardada = await env.DB.prepare(
      "SELECT resposta, ids_trechos, modelo FROM paginas WHERE publico = ?1 AND macronarrativa = ?2 AND pauta = ?3 AND ids_acervo = ?4 AND (modelo IS NULL OR modelo = ?5)"
    ).bind(publico, macronarrativa, pauta, idsAcervo, modeloAtual(env)).first();
    return { disponivel: true, idsAcervo, guardada };
  } catch (e) {
    console.error("cache de páginas indisponível, gerando normalmente:", e.message);
    return { disponivel: false, idsAcervo: null, guardada: null };
  }
}

// Mesma lógica para as saídas de formato, com o formato na chave.
async function abreCacheFormato(env, ligado, publico, macronarrativa, formato) {
  if (!ligado) return { disponivel: false, idsAcervo: null, guardada: null };
  try {
    const idsAcervo = await idsAcervoAtual(env, publico, macronarrativa, "");
    const guardada = await env.DB.prepare(
      "SELECT resposta, ids_trechos, modelo FROM formatos WHERE publico = ?1 AND macronarrativa = ?2 AND formato = ?3 AND pauta = '' AND ids_acervo = ?4 AND (modelo IS NULL OR modelo = ?5)"
    ).bind(publico, macronarrativa, formato, idsAcervo, modeloAtual(env)).first();
    return { disponivel: true, idsAcervo, guardada };
  } catch (e) {
    console.error("cache de formatos indisponível, gerando normalmente:", e.message);
    return { disponivel: false, idsAcervo: null, guardada: null };
  }
}

// Guarda no cache. Não guarda nada se o cache estiver desligado ou se a
// leitura já tinha falhado; falha na gravação é registrada e ignorada, porque
// a resposta já está pronta para a pessoa.
async function guardaCache(env, cache, sqlTexto, parametros) {
  if (!cache.disponivel) return;
  try {
    await env.DB.prepare(sqlTexto).bind(...parametros).run();
  } catch (e) {
    console.error("falha ao guardar no cache, resposta entregue sem guardar:", e.message);
  }
}

// Modelo desta requisição, como entra no cache e em registros. Também valida
// a entrada guardada: página gerada por outro modelo não é reutilizada.
function modeloAtual(env) {
  return env.SIMULAR_MODELO === "true" ? "simulacao" : env.MODEL_ID;
}

// Conjunto atual de ids de trechos que alimentam UM recorte, ordenado e
// serializado. É o mecanismo de validade do cache: comparação literal do
// conjunto inteiro, sem hash — não há colisão possível e a string guardada é
// auditável direto no banco.
//
// O recorte geral (pauta vazia) é o cruzamento inteiro mais os trechos de
// perfil do público; o recorte de uma pauta é a pauta mais a transversal. Cada
// um invalida sozinho: mexer numa pauta não derruba as outras.
async function idsAcervoAtual(env, publico, macronarrativa, pauta) {
  const linhas = pauta
    ? await consulta(
        env,
        "SELECT id FROM trechos WHERE publico = ?1 AND macronarrativa = ?2 AND pauta IN (?3, ?4) ORDER BY id",
        [publico, macronarrativa, pauta, PAUTA_TRANSVERSAL]
      )
    : await consulta(
        env,
        "SELECT id FROM trechos WHERE publico = ?1 AND (macronarrativa = ?2 OR tipo = 'perfil') ORDER BY id",
        [publico, macronarrativa]
      );
  return linhas.map((l) => l.id).join(",");
}

async function gravaRegistro(env, dados) {
  const { rota, publico, macronarrativa, formato = null, ids, modelo, origem, resposta } = dados;
  try {
    await env.DB.prepare(
      "INSERT INTO registros (rota, publico, macronarrativa, formato, ids_trechos, modelo, origem, resposta) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )
      .bind(rota, publico, macronarrativa, formato, ids, modelo, origem, JSON.stringify(resposta))
      .run();
  } catch (e) {
    // O registro é salvaguarda do projeto (docs/04): se o banco recusar a
    // gravação, o conteúdo entregue vai para o log do Worker em vez de se
    // perder, e a pessoa continua atendida. Esta linha no log significa
    // schema desatualizado — ver docs/06, seção Migrações de banco.
    console.error(
      "FALHA AO GRAVAR REGISTRO —", e.message,
      "| registro:", JSON.stringify({ rota, publico, macronarrativa, formato, ids_trechos: ids, modelo, origem, resposta })
    );
  }
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

// Mesma mecânica para o recorte de uma pauta, com o prompt de um campo só.
async function geraGatilhoDaPauta(env, publico, macronarrativa, pauta, recorte) {
  const usuario = montaMensagemUsuario(publico, macronarrativa, recorte, pauta);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const texto = await chamaModelo(env, PROMPT_SISTEMA_PAUTA, usuario, () =>
      simulaGatilhoDaPauta(recorte)
    );
    const json = normalizaLacunas(extraiJson(texto));
    if (json && gatilhoValido(json)) {
      if (contemTermoBloqueado(JSON.stringify(json), env)) {
        console.error(`gatilho da pauta "${pauta}" descartado por termo bloqueado`);
        return null;
      }
      return json;
    }
    console.error(`gatilho da pauta "${pauta}": resposta fora do formato (tentativa ${tentativa + 1})`);
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

// Os trechos vão ao modelo agrupados por tipo, com o cabeçalho que diz o que
// cada tipo é — em especial o verbatim, que é referência de linguagem e não
// sustenta afirmação. A pauta de cada trecho vai na etiqueta: é o que permite
// ao modelo separar ângulos dentro do mesmo cruzamento.
// Simulador do recorte por pauta (SIMULAR_MODELO=true).
function simulaGatilhoDaPauta(recorte) {
  const achado =
    recorte.find((t) => t.tipo === "achado" && t.forca === "forte") ??
    recorte.find((t) => t.tipo === "achado");
  return JSON.stringify({
    gatilho: achado ? { texto: achado.texto, ids: [achado.id] } : "LACUNA",
  });
}

function montaMensagemUsuario(publico, macronarrativa, trechos, pauta = "") {
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
  const cabecalho = pauta
    ? `Match: publico = "${publico}", macronarrativa = "${macronarrativa}", recorte da pauta = "${pauta}".`
    : `Match: publico = "${publico}", macronarrativa = "${macronarrativa}".`;
  return `${cabecalho}\n\nTrechos fornecidos, agrupados por tipo:\n\n${grupos.join("\n\n")}`;
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

// Recorte de pauta: um campo só, "LACUNA" ou o objeto de texto. A string
// "LACUNA" já foi tratada por normalizaLacunas e vira lacuna declarada aqui,
// como no recorte geral.
function gatilhoValido(json) {
  const g = json?.gatilho;
  return g === "LACUNA" || (!!g && typeof g.texto === "string" && Array.isArray(g.ids));
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
function montaCampo(valor, minimoOk, idsValidos) {
  const ehLacuna =
    !minimoOk || valor === "LACUNA" || valor?.texto === "LACUNA" || valor == null;
  if (ehLacuna) return { lacuna: true, aviso: AVISO_LACUNA };

  const ids = (valor.ids ?? []).filter((id) => idsValidos.has(id));
  const resultado = { lacuna: false, ids };
  if ("itens" in valor) resultado.itens = valor.itens;
  else resultado.texto = valor.texto;
  return resultado;
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

// ---------------------------------------------------------------------------
// Filtro (etapa 4): camada de código, sem IA. Decide o que vai ao modelo e
// quais pautas viram tag. Não há teto de trechos: cada recorte é gerado uma
// vez e vai para o cache.
// ---------------------------------------------------------------------------

// O que alimenta a página de um cruzamento: os trechos do cruzamento, os de
// perfil do público (que não dependem do tema) e os recursos curados.
async function consultaRecorte(env, publico, macronarrativa) {
  const [trechos, perfil, recursos] = await Promise.all([
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
    consulta(env, "SELECT * FROM trechos WHERE publico = ?1 AND tipo = 'perfil'", [publico]),
    consulta(env, "SELECT titulo, url, descricao FROM recursos WHERE publico = ?1 AND macronarrativa = ?2", [publico, macronarrativa]),
  ]);
  return { trechos, perfil, recursos };
}

// As tags da página: pautas do cruzamento com MINIMO_TRECHOS_PARA_TAG trechos
// ou mais, da mais frequente para a menos. A pauta transversal fica de fora —
// ela entra em todo recorte, mas não é um ângulo que a pessoa escolhe.
function tagsDoCruzamento(trechos) {
  const contagem = new Map();
  for (const t of trechos) {
    const pauta = t.pauta ?? "";
    if (!pauta || pauta === PAUTA_TRANSVERSAL) continue;
    contagem.set(pauta, (contagem.get(pauta) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .filter(([, n]) => n >= MINIMO_TRECHOS_PARA_TAG)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([pauta, n]) => ({ pauta, trechos: n }));
}

// O recorte de uma pauta: os trechos dela mais os da pauta transversal.
function recorteDaPauta(trechos, pauta) {
  return trechos.filter((t) => t.pauta === pauta || t.pauta === PAUTA_TRANSVERSAL);
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

  // Cache nível 1, mesma validade e mesma proteção da rota match: com o
  // interruptor desligado nada aqui toca o banco, e falha de cache cai para
  // geração normal em vez de derrubar a rota.
  const cacheLigado = env.CACHE_ENABLED !== "false";
  const cache = await abreCacheFormato(
    env, cacheLigado, canonica.match.publico, canonica.match.macronarrativa, formato
  );
  if (cache.guardada) {
    const respostaCache = JSON.parse(cache.guardada.resposta);
    respostaCache.origem = "cache";
    respostaCache.versao_acervo = VERSAO_ACERVO;
    respostaCache.cache_habilitado = true;
    await gravaRegistro(env, {
      rota: "formato",
      publico: canonica.match.publico, macronarrativa: canonica.match.macronarrativa, formato,
      ids: cache.guardada.ids_trechos, modelo: cache.guardada.modelo, origem: "cache", resposta: respostaCache,
    });
    return respostaJson(respostaCache);
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

  const modeloUsado = modeloAtual(env);
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
    // O front usa esta flag: com o cache desligado, descarta o que guardou.
    cache_habilitado: cacheLigado,
  };

  await guardaCache(
    env, cache,
    "INSERT OR REPLACE INTO formatos (publico, macronarrativa, formato, pauta, resposta, ids_trechos, ids_acervo, modelo, gerado_em) VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?7, datetime('now'))",
    [
      canonica.match.publico, canonica.match.macronarrativa, formato,
      JSON.stringify(resposta), canonica.ids.join(","), cache.idsAcervo, modeloUsado,
    ]
  );

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
