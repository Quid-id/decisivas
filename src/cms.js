// DECISIVAS — as rotas do painel de edição (etapa 9).
//
// Cinco coisas, e nada além delas: ler um arquivo do repositório, gravar um
// arquivo no repositório, subir um asset, listar o histórico do painel e dizer
// em que pé está o deploy. Mais a pré-visualização, que não grava nada.
//
//   GET  /api/cms/estado      quem está autenticado, o que é editável, o commit
//                             que gerou o site publicado e o commit do topo da
//                             main — a diferença entre os dois é o "publicando"
//   GET  /api/cms/arquivo     conteúdo e sha de um arquivo editável
//   PUT  /api/cms/arquivo     valida e grava (um commit na main)
//   POST /api/cms/asset       sobe uma imagem com nome fixo por uso
//   GET  /api/cms/historico   os últimos commits do painel
//   POST /api/cms/reverter    grava de volta a versão anterior, em commit novo
//   POST /api/cms/previa      a tela publicada com o texto novo trocado dentro
//
// TODAS exigem o crachá do Access, conferido por src/acesso.js. Sem ele, 401 —
// inclusive a de leitura: o painel é da equipe, e o que ele lê é o repositório
// com o sha, que é a chave da gravação.
//
// O que a gravação confere ANTES de mandar para o GitHub, e por que:
//
//   1. o caminho está na lista de arquivos editáveis. O token tem permissão de
//      conteúdo no repositório inteiro; a lista é o que impede o painel de
//      escrever em `src/`, em `.github/` ou no próprio `wrangler.toml`;
//   2. a estrutura fecha as regras da especificação (src/valida-conteudo.cjs), as
//      MESMAS que o build aplica. É o que faz o erro aparecer no campo em vez de
//      virar deploy vermelho;
//   3. nenhuma chave desapareceu, em `configuracao.json` e em `vocabulario.json`:
//      campo apagado sem querer é build derrubado, e o painel edita a interface
//      inteira num arquivo só;
//   4. os vocabulários fechados continuam fechados: id e slug não mudam, cor só
//      da paleta de brand/tokens.css;
//   5. varredura de BLOCKED_TERMS sobre o texto submetido, nomeando campo e
//      termo (regra 4). Sem a lista no ambiente, a gravação é RECUSADA: salvar
//      sem a varredura é empurrar para o build a chance de barrar, e o build só
//      barra depois de o commit existir.
//
// Nada de quem edita é gravado em banco (regra 5). O e-mail vive no autor do
// commit, que é a auditoria, e em nenhum outro lugar.

import * as gh from "./github.js";
import { identifica, ErroDeAcesso } from "./acesso.js";
import regras from "./valida-conteudo.cjs";
import varredura from "./varre-termos.cjs";
import escapaHtml from "./escapa-html.cjs";

const { escapa } = escapaHtml;

// Teto de um asset, em bytes já decodificados. Imagem de banner em .webp fica
// bem abaixo disso; o teto existe para uma escolha errada de arquivo não virar
// commit de 20 MB no repositório.
const MAXIMO_DO_ASSET = 2 * 1024 * 1024;

// Extensões que o site serve. Nada de .svgz, .html ou script: asset é imagem.
const EXTENSOES = ["webp", "png", "jpg", "jpeg", "svg", "avif"];

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Erro do painel: sempre com o CAMPO quando existe um, porque é o campo que o
// formulário acende. `regra` nomeia qual regra recusou, para a mensagem na tela
// dizer o motivo e não só "inválido".
function erro(env, { mensagem, campo = null, regra = null, status = 400 }) {
  return respostaJson({ erro: true, mensagem, campo, regra }, status);
}

// ---------------------------------------------------------------------------
// O que é editável
// ---------------------------------------------------------------------------

const SOBRE = "conteudo/sobre.json";
const CONFIGURACAO = "dados/configuracao.json";
const VOCABULARIO = "dados/vocabulario.json";
const PASTA_ASSETS = "assets/";

function arquivosDeConteudo(vocabulario) {
  return vocabulario.publicos.map((p) => `conteudo/${regras.ARQUIVO_POR_PUBLICO[p.id]}`);
}

function arquivosEditaveis(vocabulario) {
  return [...arquivosDeConteudo(vocabulario), SOBRE, CONFIGURACAO, VOCABULARIO];
}

// Os nomes de asset que o site usa, tirados das próprias fontes: todo valor que
// aponta para /assets/ na configuração e nos retratos do vocabulário. É o "nome
// fixo por uso" da especificação — o painel troca o arquivo de um uso que já
// existe, e não inventa nome novo, que ninguém leria.
function assetsEsperados(configuracao, vocabulario) {
  const achados = new Set();
  const anda = (valor) => {
    if (typeof valor === "string") {
      if (/^\/assets\/[^/]+$/.test(valor)) achados.add(valor.slice("/assets/".length));
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach(anda);
      return;
    }
    if (valor && typeof valor === "object") Object.values(valor).forEach(anda);
  };
  anda(configuracao);
  anda(vocabulario);
  return [...achados].sort();
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

// Toda chave que existia continua existindo, e com o mesmo tipo. Vale para a
// configuração e para o vocabulário, que são arquivos grandes editados campo a
// campo: apagar um campo sem querer derruba o build da main, e o painel não
// pode ser um caminho para isso. Lista pode mudar de tamanho (o banner tem
// lista de imagens); o TIPO dos itens é conferido pelo que sobrou.
function conferePreservado(antes, depois, campo) {
  if (Array.isArray(antes)) {
    regras.exige(Array.isArray(depois), campo, "deveria continuar sendo uma lista");
    // Cada item que existe é conferido contra o primeiro item de antes, que é o
    // molde: é assim que as imagens do banner podem entrar e sair.
    if (antes.length && depois.length) {
      depois.forEach((item, i) => conferePreservado(antes[0], item, varredura.juntaCaminho(campo, i)));
    }
    return;
  }
  if (antes && typeof antes === "object") {
    regras.exige(depois && typeof depois === "object" && !Array.isArray(depois), campo, "deveria continuar sendo um objeto");
    for (const [chave, dentro] of Object.entries(antes)) {
      const caminho = varredura.juntaCaminho(campo, chave);
      regras.exige(depois[chave] !== undefined, caminho, "campo apagado; o build precisa dele");
      conferePreservado(dentro, depois[chave], caminho);
    }
    return;
  }
  if (typeof antes === "string") {
    regras.exige(typeof depois === "string", campo, "deveria continuar sendo texto");
  }
}

// A paleta de brand/tokens.css, publicada pelo build em public/paleta.json e
// lida daqui pelos assets do próprio Worker. Sem ela a cor não é validada, e aí
// a gravação de cor é recusada: cor fora da paleta derruba o build (regra 8).
async function paleta(env) {
  try {
    const r = await env.ASSETS.fetch(new Request("https://decisivas.local/paleta.json"));
    if (!r.ok) return null;
    const corpo = await r.json();
    return Array.isArray(corpo?.cores) ? corpo.cores.map((c) => String(c).toLowerCase()) : null;
  } catch (e) {
    return null;
  }
}

async function validaVocabulario(env, antes, depois) {
  conferePreservado(antes, depois, VOCABULARIO);

  regras.exige(
    Array.isArray(depois.publicos) && depois.publicos.length === antes.publicos.length,
    `${VOCABULARIO}.publicos`,
    `são ${antes.publicos.length} públicos, vocabulário fechado`
  );
  regras.exige(
    Array.isArray(depois.macronarrativas) && depois.macronarrativas.length === antes.macronarrativas.length,
    `${VOCABULARIO}.macronarrativas`,
    `são ${antes.macronarrativas.length} temas, vocabulário fechado`
  );

  const cores = await paleta(env);
  for (const [i, publico] of depois.publicos.entries()) {
    const campo = `${VOCABULARIO}.publicos[${i}]`;
    // Identificador e slug NÃO se editam: o id é chave no banco (as restrições
    // do D1 recusam valor novo) e o slug é endereço publicado.
    regras.exige(publico.id === antes.publicos[i].id, `${campo}.id`, "identificador do vocabulário fechado não se edita");
    regras.exige(publico.slug === antes.publicos[i].slug, `${campo}.slug`, "slug é endereço publicado e não se edita");
    regras.exigeTexto(publico.nome, `${campo}.nome`);
    for (const chave of ["cor", "texto"]) {
      const valor = String(publico[chave] ?? "").toLowerCase();
      regras.exige(/^#[0-9a-f]{6}$/.test(valor), `${campo}.${chave}`, "cor em #rrggbb");
      if (valor !== String(antes.publicos[i][chave]).toLowerCase()) {
        regras.exige(
          Array.isArray(cores),
          `${campo}.${chave}`,
          "a paleta de brand/tokens.css não está publicada; sem ela a cor não pode ser conferida"
        );
        regras.exige(cores.includes(valor), `${campo}.${chave}`, "cor fora da paleta de brand/tokens.css (regra 8)");
      }
    }
    regras.exige(
      /^\/assets\/[\w.-]+$/.test(String(publico.retrato ?? "")),
      `${campo}.retrato`,
      "retrato deve apontar para um arquivo de /assets/"
    );
  }

  for (const [i, tema] of depois.macronarrativas.entries()) {
    const campo = `${VOCABULARIO}.macronarrativas[${i}]`;
    regras.exige(tema.id === antes.macronarrativas[i].id, `${campo}.id`, "identificador do vocabulário fechado não se edita");
    regras.exige(tema.slug === antes.macronarrativas[i].slug, `${campo}.slug`, "slug é endereço publicado e não se edita");
    regras.exigeTexto(tema.nome, `${campo}.nome`);
  }
}

// A estrutura, arquivo por arquivo. Lança ErroDeConteudo com o campo.
async function validaEstrutura(env, caminho, depois, antes, vocabulario) {
  const temas = vocabulario.macronarrativas.map((m) => m.id);

  if (caminho === SOBRE) {
    regras.validaSobre(depois, temas);
    conferePreservado(antes, depois, SOBRE);
    return;
  }
  if (caminho === CONFIGURACAO) {
    conferePreservado(antes, depois, CONFIGURACAO);
    return;
  }
  if (caminho === VOCABULARIO) {
    await validaVocabulario(env, antes, depois);
    return;
  }
  // Sobra o conteúdo de um público.
  const publico = vocabulario.publicos.find(
    (p) => `conteudo/${regras.ARQUIVO_POR_PUBLICO[p.id]}` === caminho
  );
  regras.exige(Boolean(publico), caminho, "arquivo fora da lista de editáveis");
  regras.exige(
    depois.publico === antes.publico,
    `${caminho}.publico`,
    "identificador do público não se edita"
  );
  regras.validaPublico(depois, temas, caminho);
}

// A varredura de termos bloqueados sobre o que foi submetido. Devolve a
// primeira ocorrência: é a que o painel acende.
function varreSubmetido(env, caminho, dados) {
  const lista = varredura.listaDeTermos(env.BLOCKED_TERMS);
  if (!lista.length) {
    return {
      recusa: {
        mensagem:
          "a lista de termos bloqueados não está configurada no Worker; " +
          "sem ela a gravação não é conferida e por isso não é feita",
        regra: "regra 4",
        status: 503,
      },
    };
  }
  const { ocorrencias } = varredura.varreValor(dados, varredura.padroes(lista), caminho);
  if (ocorrencias.length) {
    const o = ocorrencias[0];
    return {
      recusa: {
        mensagem: `termo bloqueado no texto: "${o.termo}" — ${o.trecho}`,
        // O campo sai com o arquivo na frente, igual ao erro de estrutura: é o
        // mesmo formato que o build imprime, e é o que o painel procura.
        campo: `${caminho}.${o.campo}`,
        regra: "regra 4",
        status: 400,
      },
      quantas: ocorrencias.length,
    };
  }
  return { recusa: null };
}

// ---------------------------------------------------------------------------
// Leitura das fontes que o próprio Worker precisa
// ---------------------------------------------------------------------------
//
// O vocabulário e a configuração que o Worker traz embutidos são os do BUILD —
// e o painel edita justamente esses arquivos. Para validar contra o estado
// corrente, eles são lidos do repositório, não do pacote.

async function fonte(env, caminho) {
  const { texto, sha } = await gh.leArquivo(env, caminho);
  try {
    return { dados: JSON.parse(texto), texto, sha };
  } catch (e) {
    throw new gh.ErroDoGitHub(`${caminho} no repositório não é JSON válido — ${e.message}`, 500);
  }
}

// ---------------------------------------------------------------------------
// As rotas
// ---------------------------------------------------------------------------

async function rotaEstado(env, email) {
  const { dados: vocabulario } = await fonte(env, VOCABULARIO);
  const { dados: configuracao } = await fonte(env, CONFIGURACAO);

  // Que commit gerou o site que está no ar: o build grava em public/. Comparado
  // com o topo da main, é o que diz se o deploy da última edição já passou.
  let doSite = null;
  try {
    const r = await env.ASSETS.fetch(new Request("https://decisivas.local/versao-build.json"));
    if (r.ok) doSite = await r.json();
  } catch (e) {
    doSite = null;
  }
  let doTopo = null;
  try {
    doTopo = await gh.commitDoTopo(env);
  } catch (e) {
    doTopo = null;
  }

  return respostaJson({
    email,
    repositorio: String(env.CMS_REPO ?? ""),
    ramo: String(env.CMS_RAMO ?? "main"),
    simulado: gh.ehSimulado(env),
    editaveis: arquivosEditaveis(vocabulario),
    assets: assetsEsperados(configuracao, vocabulario),
    vocabulario,
    // A publicação é assíncrona: o commit existe antes de o site mudar.
    commit_do_site: doSite?.commit ?? null,
    build_do_site: doSite?.quando ?? null,
    commit_do_topo: doTopo,
    publicando: Boolean(doTopo && doSite?.commit && doTopo !== doSite.commit),
  });
}

async function rotaLeArquivo(env, url) {
  const caminho = url.searchParams.get("caminho") ?? "";
  const { dados: vocabulario } = await fonte(env, VOCABULARIO);
  if (!arquivosEditaveis(vocabulario).includes(caminho)) {
    return erro(env, { mensagem: `${caminho} não está na lista de arquivos editáveis`, status: 403 });
  }
  const { texto, sha } = await gh.leArquivo(env, caminho);
  return respostaJson({ caminho, sha, dados: JSON.parse(texto) });
}

async function rotaGravaArquivo(request, env, email) {
  const corpo = await request.json().catch(() => null);
  const caminho = String(corpo?.caminho ?? "");
  const colecao = String(corpo?.colecao ?? "").slice(0, 60);
  const item = String(corpo?.item ?? "").slice(0, 120);

  const { dados: vocabulario } = await fonte(env, VOCABULARIO);
  if (!arquivosEditaveis(vocabulario).includes(caminho)) {
    return erro(env, { mensagem: `${caminho} não está na lista de arquivos editáveis`, status: 403 });
  }
  if (!corpo?.dados || typeof corpo.dados !== "object") {
    return erro(env, { mensagem: "sem dados para gravar" });
  }

  // O estado corrente vem do repositório, não do que o painel diz: é dele que
  // sai o sha da gravação e é contra ele que se confere o que foi apagado.
  const atual = await fonte(env, caminho);

  // 1. estrutura e vocabulários
  try {
    await validaEstrutura(env, caminho, corpo.dados, atual.dados, vocabulario);
  } catch (e) {
    if (e instanceof regras.ErroDeConteudo) {
      return erro(env, { mensagem: e.oQue, campo: e.campo, regra: "estrutura" });
    }
    throw e;
  }

  // 2. termos bloqueados
  const { recusa } = varreSubmetido(env, caminho, corpo.dados);
  if (recusa) return erro(env, recusa);

  // 3. nada a fazer se nada mudou: commit vazio é ruído no histórico.
  const texto = `${JSON.stringify(corpo.dados, null, indentacaoDe(atual.texto))}\n`;
  if (texto.trim() === atual.texto.trim()) {
    return respostaJson({ gravado: false, mensagem_de_commit: null, igual: true });
  }

  const { commit, mensagem, simulado } = await gh.gravaTexto(env, {
    caminho,
    texto,
    sha: atual.sha,
    colecao,
    item,
    email,
  });
  return respostaJson({ gravado: true, commit, mensagem_de_commit: mensagem, simulado });
}

// A indentação do arquivo é preservada: `conteudo/*.json` usa um espaço e a
// configuração usa dois. Reescrever com outra indentação faria um diff de
// arquivo inteiro a cada edição de uma linha.
function indentacaoDe(texto) {
  const linha = String(texto).split("\n").find((l) => /^\s+\S/.test(l));
  if (!linha) return 2;
  const espacos = linha.match(/^\s+/)[0];
  return espacos.includes("\t") ? "\t" : espacos.length;
}

async function rotaAsset(request, env, email) {
  const corpo = await request.json().catch(() => null);
  const nome = String(corpo?.nome ?? "");
  const base64 = String(corpo?.base64 ?? "");

  const { dados: vocabulario } = await fonte(env, VOCABULARIO);
  const { dados: configuracao } = await fonte(env, CONFIGURACAO);
  const esperados = assetsEsperados(configuracao, vocabulario);
  if (!esperados.includes(nome)) {
    return erro(env, {
      mensagem: `${nome} não é um asset usado pelo site; o painel troca o arquivo de um uso que já existe`,
      status: 403,
    });
  }
  const extensao = nome.split(".").pop().toLowerCase();
  if (!EXTENSOES.includes(extensao)) {
    return erro(env, { mensagem: `extensão .${extensao} não é de imagem` });
  }
  // O tamanho é conferido no servidor: o painel avisa antes, mas o teto que
  // vale é este.
  const bytes = Math.floor((base64.replace(/=+$/, "").length * 3) / 4);
  if (!bytes) return erro(env, { mensagem: "arquivo vazio" });
  if (bytes > MAXIMO_DO_ASSET) {
    return erro(env, {
      mensagem: `arquivo de ${Math.round(bytes / 1024)} kB; o teto é ${Math.round(MAXIMO_DO_ASSET / 1024)} kB`,
    });
  }

  const caminho = `${PASTA_ASSETS}${nome}`;
  // Asset pode não existir ainda (o site mostra placeholder até existir), então
  // a falta de sha não é erro.
  let sha = null;
  try {
    sha = (await gh.leArquivo(env, caminho)).sha;
  } catch (e) {
    sha = null;
  }
  const { commit, mensagem, simulado } = await gh.gravaBase64(env, {
    caminho,
    base64,
    sha,
    colecao: "assets",
    item: nome,
    email,
  });
  return respostaJson({ gravado: true, commit, mensagem_de_commit: mensagem, bytes, simulado });
}

async function rotaHistorico(env, url) {
  const limite = Math.min(50, Math.max(1, Number(url.searchParams.get("limite")) || 20));
  return respostaJson({ commits: await gh.historico(env, { limite }) });
}

async function rotaReverter(request, env, email) {
  const corpo = await request.json().catch(() => null);
  const caminho = String(corpo?.caminho ?? "");
  const { dados: vocabulario } = await fonte(env, VOCABULARIO);
  if (!arquivosEditaveis(vocabulario).includes(caminho)) {
    return erro(env, { mensagem: `${caminho} não está na lista de arquivos editáveis`, status: 403 });
  }

  const anterior = await gh.versaoAnterior(env, caminho);
  const atual = await gh.leArquivo(env, caminho);
  if (anterior.texto.trim() === atual.texto.trim()) {
    return respostaJson({ revertido: false, igual: true });
  }

  // A versão anterior volta pelas MESMAS conferências: reverter para um estado
  // que hoje não passa na validação seria trocar um problema por outro.
  let dados;
  try {
    dados = JSON.parse(anterior.texto);
  } catch (e) {
    return erro(env, { mensagem: `a versão anterior de ${caminho} não é JSON válido`, status: 500 });
  }
  try {
    await validaEstrutura(env, caminho, dados, JSON.parse(atual.texto), vocabulario);
  } catch (e) {
    if (e instanceof regras.ErroDeConteudo) {
      return erro(env, { mensagem: e.oQue, campo: e.campo, regra: "estrutura" });
    }
    throw e;
  }
  const { recusa } = varreSubmetido(env, caminho, dados);
  if (recusa) return erro(env, recusa);

  const { commit, mensagem, simulado } = await gh.gravaTexto(env, {
    caminho,
    texto: anterior.texto,
    sha: atual.sha,
    colecao: "reverter",
    item: caminho,
    email,
  });
  return respostaJson({
    revertido: true,
    commit,
    de: anterior.commit,
    mensagem_de_commit: mensagem,
    simulado,
  });
}

// Pré-visualização: a tela COMO ESTÁ PUBLICADA, com o texto novo trocado
// dentro. Não passa pelo build e não grava nada — o painel mostra ao lado.
//
// A troca é do texto antigo pelo novo, os dois escapados como o build escapa
// (src/escapa-html.cjs, o mesmo módulo). Assim a prévia é a página real, e não
// uma segunda montagem que poderia divergir da de verdade.
//
// O que a prévia NÃO alcança, e o painel diz na tela: mudança de ESTRUTURA
// (card que entra ou sai, linha de resumo acrescentada) — isso só aparece
// depois da publicação, porque quem monta a página é o build. E texto repetido
// palavra por palavra em dois lugares da mesma tela é trocado nos dois.
async function rotaPrevia(request, env) {
  const corpo = await request.json().catch(() => null);
  const endereco = String(corpo?.endereco ?? "");
  const trocas = Array.isArray(corpo?.trocas) ? corpo.trocas : [];
  // Endereço de tela publicada: letras, números, hífen, barra e ponto, sem
  // subida de diretório. A prévia lê dos assets do próprio site, então um
  // endereço solto não alcança nada além do que já é público — mas o formato
  // fechado evita gastar chamada com bobagem.
  if (!/^\/[\w\-/.]*$/.test(endereco) || endereco.includes("..")) {
    return erro(env, { mensagem: "endereço de prévia inválido" });
  }

  const r = await env.ASSETS.fetch(new Request(`https://decisivas.local${endereco}`));
  if (!r.ok) return erro(env, { mensagem: `a tela ${endereco} ainda não está publicada`, status: 404 });
  let html = await r.text();

  let trocados = 0;
  let ausentes = [];
  for (const troca of trocas) {
    const de = escapa(String(troca?.de ?? ""));
    const para = escapa(String(troca?.para ?? ""));
    if (!de || de === para) continue;
    if (!html.includes(de)) {
      ausentes.push(String(troca?.campo ?? ""));
      continue;
    }
    html = html.split(de).join(para);
    trocados += 1;
  }

  return respostaJson({ endereco, html, trocados, ausentes });
}

// ---------------------------------------------------------------------------
// A porta
// ---------------------------------------------------------------------------

// Governa o painel e só ele, como AGENT_ENABLED governa o /api/explorar:
// desligado, as rotas do CMS respondem 503 e o site segue de pé.
function ligado(env) {
  return String(env.CMS_ENABLED ?? "") === "true";
}

async function rota(request, env, url) {
  if (!ligado(env)) {
    return respostaJson({ erro: true, mensagem: "o painel de edição está desligado" }, 503);
  }

  // Identidade primeiro, sempre: nenhuma rota do CMS responde sem crachá.
  let quem;
  try {
    quem = await identifica(request, env);
  } catch (e) {
    if (e instanceof ErroDeAcesso) {
      return respostaJson({ erro: true, mensagem: e.motivo, acesso: false }, 401);
    }
    throw e;
  }

  const caminho = url.pathname;
  const metodo = request.method;

  try {
    if (caminho === "/api/cms/estado" && metodo === "GET") return await rotaEstado(env, quem.email);
    if (caminho === "/api/cms/arquivo" && metodo === "GET") return await rotaLeArquivo(env, url);
    if (caminho === "/api/cms/arquivo" && metodo === "PUT") return await rotaGravaArquivo(request, env, quem.email);
    if (caminho === "/api/cms/asset" && metodo === "POST") return await rotaAsset(request, env, quem.email);
    if (caminho === "/api/cms/historico" && metodo === "GET") return await rotaHistorico(env, url);
    if (caminho === "/api/cms/reverter" && metodo === "POST") return await rotaReverter(request, env, quem.email);
    if (caminho === "/api/cms/previa" && metodo === "POST") return await rotaPrevia(request, env);
  } catch (e) {
    if (e instanceof gh.ErroDoGitHub) {
      console.error("cms/github:", e.message);
      return respostaJson({ erro: true, mensagem: e.message }, e.status);
    }
    console.error("cms falhou:", e.message);
    return respostaJson({ erro: true, mensagem: "não foi possível concluir a operação" }, 500);
  }

  return respostaJson({ erro: true, mensagem: "rota do painel inexistente" }, 404);
}

// A própria tela do painel também passa por aqui (run_worker_first em
// /admin*): sem crachá, nem o formulário aparece. Não substitui o Access — é a
// segunda tranca, para o caso de a aplicação do Access não estar cobrindo o
// caminho.
async function tela(request, env) {
  if (!ligado(env)) {
    return new Response("painel desligado", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  try {
    await identifica(request, env);
  } catch (e) {
    return new Response("sem crachá do Cloudflare Access", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return env.ASSETS.fetch(request);
}

export { rota, tela, ligado, arquivosEditaveis, assetsEsperados, conferePreservado, indentacaoDe };
