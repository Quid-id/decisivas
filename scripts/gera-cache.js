// DECISIVAS — gera o cache de páginas em lote (nível 1, tabela paginas).
//
// Percorre todos os cruzamentos dos vocabulários fechados (4 públicos × 5
// macronarrativas = 20) chamando POST /api/match no Worker indicado. O
// próprio Worker guarda cada página gerada no cache; cruzamento sem acervo
// suficiente vira página de lacunas, sem custo de modelo.
//
// Cada chamada cobre mais de um recorte (etapa 4): o recorte geral do
// cruzamento e o gatilho de cada tag de pauta, cada um com entrada e validade
// próprias no cache. O relatório conta os dois: cruzamentos e recortes de
// pauta. Nada é gerado no clique da pessoa — é aqui que o custo acontece.
//
// Uso:
//   local:     npx wrangler dev  (em outro terminal)  e então
//              node scripts/gera-cache.js
//   produção:  BASE_URL=https://SEU-DOMINIO node scripts/gera-cache.js
//
// Custo: com OPENROUTER_API_KEY no ambiente, o script consulta o saldo da
// conta antes e depois do lote e reporta a diferença — o custo real cobrado,
// direto da API. Sem a chave, reporta "não disponível".
//
// Rodar após CADA carga do banco (docs/06): a carga muda os conjuntos de ids
// e invalida o cache inteiro; sem regenerar, a primeira pessoa de cada
// cruzamento paga o tempo da geração.

// Vocabulários fechados: fonte única em dados/vocabulario.json.
const VOCABULARIO = require("../dados/vocabulario.json");
const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const MACRONARRATIVAS = VOCABULARIO.macronarrativas.map((m) => m.id);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8787";

async function usoAtual(chave) {
  const r = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) return null;
  const { data } = await r.json();
  return data?.total_usage ?? null;
}

function paginaSoLacunas(pagina) {
  return ["gatilho", "ancorar", "evitar", "contexto", "pesquisa"].every(
    (campo) => pagina[campo]?.lacuna === true
  );
}

async function main() {
  const chave = process.env.OPENROUTER_API_KEY;
  const usoAntes = chave ? await usoAtual(chave) : null;

  let geradas = 0, jaEmCache = 0, soLacunas = 0, erros = 0;
  let tags = 0, tagsComGatilho = 0;

  for (const publico of PUBLICOS) {
    for (const macronarrativa of MACRONARRATIVAS) {
      const rotulo = `${publico} × ${macronarrativa}`;
      try {
        const r = await fetch(`${BASE_URL}/api/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publico, macronarrativa }),
        });
        const corpo = await r.json();
        if (r.ok) {
          const porPauta = corpo.gatilhos_por_pauta ?? {};
          tags += Object.keys(porPauta).length;
          tagsComGatilho += Object.values(porPauta).filter((g) => g?.lacuna === false).length;
        }
        if (!r.ok) {
          erros++;
          console.log(`ERRO   ${rotulo}: ${corpo.erro ?? `HTTP ${r.status}`}`);
        } else if (corpo.origem === "cache") {
          jaEmCache++;
          // O recorte geral veio do cache; as tags têm validade própria e
          // podem ter sido geradas nesta mesma chamada.
          console.log(`cache  ${rotulo} (${Object.keys(corpo.gatilhos_por_pauta ?? {}).length} tag(s) de pauta)`);
        } else if (paginaSoLacunas(corpo)) {
          soLacunas++;
          console.log(`lacuna ${rotulo} (sem acervo suficiente; sem custo)`);
        } else {
          geradas++;
          const quantasTags = Object.keys(corpo.gatilhos_por_pauta ?? {}).length;
          console.log(`GERADA ${rotulo} (${quantasTags} tag(s) de pauta)`);
        }
      } catch (e) {
        erros++;
        console.log(`ERRO   ${rotulo}: ${e.message}`);
      }
    }
  }

  console.log("\n----- Relatório -----");
  console.log(`Geradas agora:          ${geradas}`);
  console.log(`Já estavam em cache:    ${jaEmCache}`);
  console.log(`Sem acervo suficiente:  ${soLacunas}`);
  console.log(`Erros:                  ${erros}`);
  console.log(`Tags de pauta cobertas: ${tags} (com gatilho: ${tagsComGatilho}; o resto em lacuna)`);

  if (chave && usoAntes !== null) {
    const usoDepois = await usoAtual(chave);
    if (usoDepois !== null) {
      console.log(`Custo total do lote:    $${(usoDepois - usoAntes).toFixed(6)} (diferença de uso na conta OpenRouter)`);
    }
  } else {
    console.log("Custo total do lote:    não disponível (defina OPENROUTER_API_KEY para medir)");
  }

  if (erros > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
