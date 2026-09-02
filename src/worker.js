// DECISIVAS — Worker do Cloudflare, rota /api/*
//
// Reduzido na etapa 8A. As páginas deixaram de ser geradas por modelo no
// acesso: as 20 páginas são texto fixo, escrito pela equipe e montado no build
// (docs/CONTEXTO_DECISIVAS.md v3). Com isso saíram do Worker as rotas
// /api/match e /api/formato, os prompts, o filtro do acervo e o cache de
// páginas e de tags — tudo em arquivo/, nada apagado do histórico.
//
// O que sobra aqui é o mínimo: fora de /api/*, o site estático; dentro,
// nenhuma rota. A próxima a existir é /api/explorar, o "Explorar o acervo"
// (etapa 10), que a 8B cria desligada e que AGENT_ENABLED passa a governar
// sozinha. O binding do D1 e a tabela `registros` continuam no lugar para ela.
//
// Nenhuma chave de API entra neste arquivo: local em .dev.vars, produção
// como segredo no painel do Cloudflare.

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Fora de /api/*, entrega o site estático. É por aqui que passa tudo o
    // que a plataforma serve hoje: as 20 páginas fixas e as telas de apoio,
    // todas HTML gerado no build.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Nenhuma rota de API existe nesta etapa. run_worker_first garante que
    // /api/* chega aqui em vez de cair nos assets, então a resposta é
    // explícita em vez de virar uma página de erro do site.
    return respostaJson({ erro: "Rota inexistente." }, 404);
  },
};
