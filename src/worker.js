// DECISIVAS — Worker do Cloudflare, rota /api/*
//
// Estado atual: esqueleto com respostas de exemplo. As rotas reais serão
// implementadas conforme docs/01-especificacao.md e docs/03-regras-do-agente.md.
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

const MENSAGEM_INDISPONIVEL =
  "O serviço está temporariamente indisponível. O acervo e as páginas fixas continuam no ar.";

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Fora de /api/*, entrega o site estático.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Interruptor de desligamento: toda rota do agente passa por aqui.
    if (env.AGENT_ENABLED === "false") {
      return respostaJson({ erro: MENSAGEM_INDISPONIVEL }, 503);
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

    if (url.pathname === "/api/match") {
      return rotaMatch(corpo, env);
    }
    if (url.pathname === "/api/formato") {
      return rotaFormato(corpo, env);
    }

    return respostaJson({ erro: "Rota inexistente." }, 404);
  },
};

// POST /api/match — por enquanto devolve um exemplo fixo no formato da
// página de resultado (docs/01, seção 2). A implementação real consultará
// o D1 e chamará o modelo via OpenRouter (MODEL_ID).
function rotaMatch(corpo, env) {
  const { publico, macronarrativa } = corpo ?? {};

  if (!PUBLICOS.includes(publico) || !MACRONARRATIVAS.includes(macronarrativa)) {
    return respostaJson(
      { erro: "Público ou tema fora dos vocabulários da plataforma." },
      400
    );
  }

  return respostaJson({
    exemplo: true,
    match: { publico, macronarrativa },
    fontes: 0,
    atualizado_em: null,
    importa: { texto: "LACUNA", ids: [] },
    pesquisa: { texto: "LACUNA", ids: [] },
    funciona: { itens: [], ids: [] },
    afasta: { itens: [], ids: [] },
    sintese: { texto: "LACUNA", ids: [] },
    habitos_de_midia: { texto: "LACUNA", ids: [] },
    materiais_complementares: [],
    rotulo_ia: ROTULO_IA,
    modelo: env.MODEL_ID ?? null,
  });
}

// POST /api/formato — por enquanto devolve um exemplo fixo. A implementação
// real receberá a página já gerada e adaptará ao formato pedido, sem
// reconsultar o banco (docs/01, seção Formatos).
function rotaFormato(corpo, env) {
  const { formato } = corpo ?? {};

  if (!FORMATOS.includes(formato)) {
    return respostaJson({ erro: "Formato fora da lista disponível." }, 400);
  }

  return respostaJson({
    exemplo: true,
    formato,
    conteudo: "LACUNA",
    rotulo_ia: ROTULO_IA,
    modelo: env.MODEL_ID ?? null,
  });
}
