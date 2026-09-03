// DECISIVAS — monta as telas a partir das fontes e publica em public/.
//
// Este script cuida das telas que NÃO vêm de conteudo/: o Início e o
// redirecionador da rota antiga. As 20 páginas de caminho, o Sobre e a
// privacidade são montados por scripts/gera-caminhos.js, chamado no fim.
//
// Roda no build (chamado por scripts/sincroniza-tokens.js), antes de
// `wrangler dev` e `wrangler deploy`, inclusive nos deploys por push.
//
// Por que existir: cabeçalho e rodapé são um parcial só (etapa 6), incluído no
// build, e não copiados em cada HTML — copiar é como duas telas divergem. As
// fontes ficam em paginas/ e parciais/; tudo que sai em public/ é gerado e
// está fora do versionamento.
//
//   paginas/*.html   + parciais/*.html         → public/*.html
//   conteudo/*.json  + paginas/caminho.html    → public/caminhos/<pub>/<tema>.html
//   paginas/estilos.css, paginas/_redirects    → public/
//   dados/configuracao.json                    → public/configuracao.js
//   assets/* (inclusive assets/fonts/)         → public/assets/
//
// Texto, rótulo, endereço e nome de imagem vêm de dados/configuracao.json,
// conteudo/*.json e dados/vocabulario.json — nunca de dentro deste arquivo nem
// dos templates. Quem monta os parciais com esses valores é
// scripts/interface.js; scripts/verifica-literais.js confere no fim do build.

const fs = require("node:fs");
const path = require("node:path");
const { escreveSeMudou } = require("./escreve-se-mudou");
const { escapa, troca, confereMarcadores, leParciais, pendentes } = require("./html");
const monta = require("./interface");
const geraCaminhos = require("./gera-caminhos");
const verificaLiterais = require("./verifica-literais");
const verificaConteudo = require("./verifica-conteudo");
const conteudo = require("./conteudo");

const SAIDA = "public";
const ASSETS = "assets";

// Telas montadas aqui: as que não vêm de `conteudo/`. Título e descrição de
// cada uma vivem em `meta`, na configuração; `atual` é o endereço que a
// navegação marca.
const PAGINAS = [
  { arquivo: "index.html", meta: "inicio", atual: "/" },
  { arquivo: "resultado.html", meta: "redirecionamento", atual: "/" },
];

// As cores declaradas em brand/tokens.css. Servem a duas coisas: conferir a cor
// dos públicos aqui e ser publicada em public/paleta.json, que é de onde o
// painel da etapa 9 confere a cor antes de gravar (src/cms.js).
function paletaDeTokens() {
  const tokens = fs.readFileSync("brand/tokens.css", "utf8");
  return new Set(
    [...tokens.matchAll(/^\s*--[a-z-]+:\s*(#[0-9a-f]{6});/gim)].map((m) => m[1].toLowerCase())
  );
}

// Confere que toda cor de público existe na paleta de brand/tokens.css. É o
// que impede a identidade de escapar por dados/vocabulario.json.
function conferePaletaDosPublicos(vocabulario) {
  const paleta = paletaDeTokens();
  for (const publico of vocabulario.publicos) {
    for (const campo of ["cor", "texto"]) {
      const valor = String(publico[campo] ?? "").toLowerCase();
      if (!paleta.has(valor)) {
        throw new Error(
          `dados/vocabulario.json: ${publico.id} tem ${campo} ${valor}, que não está na paleta de brand/tokens.css`
        );
      }
    }
  }
}

function copia(origem, destino) {
  return escreveSeMudou(destino, fs.readFileSync(origem, "utf8"));
}

// O commit que gerou este build. As esteiras publicam o sha no ambiente; na
// máquina de quem desenvolve, o git responde. Sem nenhum dos dois, fica nulo —
// e o painel então só não mostra o estado do deploy, sem quebrar.
const MARCAS_DE_COMMIT = ["WORKERS_CI_COMMIT_SHA", "CF_PAGES_COMMIT_SHA", "GITHUB_SHA", "COMMIT_SHA"];

function versaoDoBuild() {
  for (const marca of MARCAS_DE_COMMIT) {
    const valor = String(process.env[marca] ?? "").trim();
    if (valor) return { commit: valor, quando: new Date().toISOString(), de: marca };
  }
  try {
    const { execFileSync } = require("node:child_process");
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return { commit: sha, quando: new Date().toISOString(), de: "git" };
  } catch (e) {
    return { commit: null, quando: new Date().toISOString(), de: null };
  }
}

async function main() {
  const vocabulario = JSON.parse(fs.readFileSync("dados/vocabulario.json", "utf8"));
  conferePaletaDosPublicos(vocabulario);
  const configuracao = JSON.parse(fs.readFileSync("dados/configuracao.json", "utf8"));

  // Etapa 8C: antes de escrever qualquer tela, a verificação de conteúdo —
  // estrutura dos JSON e varredura de BLOCKED_TERMS sobre todo o texto de
  // conteudo/ e de dados/configuracao.json. Termo achado derruba o build
  // nomeando arquivo, campo e termo; conteúdo com termo bloqueado não chega a
  // ser publicado. Sem a variável, a varredura não roda e o build avisa.
  const conferido = verificaConteudo.verifica({ vocabulario });

  const parciais = leParciais();
  // O rodapé e a barra lateral são iguais em toda tela: montados uma vez.
  // O cabeçalho depende da página que está aberta, por causa do aria-current.
  const comum = {
    // Os parciais seguem no pacote: o bloco Explorar é montado por caminho,
    // com o público, o tema e as pautas daquela página.
    parciais,
    cabeca: (meta) => monta.cabeca(parciais, configuracao, meta),
    cabecalho: (atual) => monta.cabecalho(parciais, configuracao, atual),
    // O texto do bloco "Receba os materiais" é conteúdo, e vem de
    // conteudo/sobre.json — não da configuração.
    rodape: monta.rodape(parciais, configuracao, { receba: conteudo.carrega(vocabulario).sobre.receba }),
    compartilhar: monta.compartilhar(parciais, configuracao),
    voltar: monta.voltar(configuracao),
    rodaBanner: monta.rodaBanner(configuracao),
  };

  fs.mkdirSync(SAIDA, { recursive: true });
  let escritos = 0;

  for (const pagina of PAGINAS) {
    const origem = path.join("paginas", pagina.arquivo);
    let html = fs.readFileSync(origem, "utf8");
    html = troca(html, {
      CABECA: comum.cabeca(configuracao.meta[pagina.meta]),
      CABECALHO: comum.cabecalho(pagina.atual) + "\n" + comum.rodaBanner,
      RODAPE: comum.rodape,
    });
    confereMarcadores(html, origem);
    if (escreveSeMudou(path.join(SAIDA, pagina.arquivo), html)) escritos++;
  }

  // As 20 páginas de caminho, o Sobre e a privacidade, de conteudo/*.json.
  const doConteudo = await geraCaminhos.main({ comum, vocabulario, configuracao });
  escritos += doConteudo.escritos;

  // Estilos e redirecionamentos das rotas antigas.
  if (copia("paginas/estilos.css", path.join(SAIDA, "estilos.css"))) escritos++;
  if (copia("paginas/_redirects", path.join(SAIDA, "_redirects"))) escritos++;

  // Configuração das telas, publicada como os demais vocabulários: é dela que
  // o Início e o redirecionador leem os textos no navegador.
  if (
    escreveSeMudou(
      path.join(SAIDA, "configuracao.js"),
      "// ARQUIVO GERADO no build a partir de dados/configuracao.json — NÃO EDITAR AQUI.\n" +
        `window.CONFIGURACAO = ${JSON.stringify(configuracao)};\n`
    )
  ) {
    escritos++;
  }

  // Painel de edição (etapa 9). Tela da equipe, montada como as outras — molde
  // em paginas/admin.html, rótulos da configuração — e servida em /admin, que o
  // Worker só entrega com o crachá do Access (wrangler.toml, run_worker_first).
  const painel = fs.readFileSync("paginas/admin.html", "utf8");
  const htmlDoPainel = troca(painel, {
    CABECA: comum.cabeca(configuracao.meta.admin),
    MARCA: escapa(configuracao.marca.nome),
    TITULO_PAINEL: escapa(configuracao.admin.titulo),
    ROTULO_EMAIL: escapa(configuracao.admin.rotulo_email),
    ROTULO_COLECOES: escapa(configuracao.admin.rotulo_colecoes),
    ROTULO_ITENS: escapa(configuracao.admin.rotulo_itens),
    ROTULO_FORMULARIO: escapa(configuracao.admin.rotulo_formulario),
    SEM_SELECAO: escapa(configuracao.admin.sem_selecao),
    TITULO_HISTORICO: escapa(configuracao.admin.historico.titulo),
  });
  confereMarcadores(htmlDoPainel, "paginas/admin.html");
  if (escreveSeMudou(path.join(SAIDA, "admin.html"), htmlDoPainel)) escritos++;
  if (copia("paginas/admin.css", path.join(SAIDA, "admin.css"))) escritos++;
  fs.mkdirSync(path.join(SAIDA, "admin"), { recursive: true });
  for (const arquivo of fs.readdirSync("scripts/admin")) {
    if (!arquivo.endsWith(".js")) continue;
    if (copia(path.join("scripts/admin", arquivo), path.join(SAIDA, "admin", arquivo))) escritos++;
  }

  // A paleta da identidade, para o painel conferir cor sem ler brand/tokens.css
  // (o Worker não tem disco): é a mesma lista que o build usa acima.
  if (
    escreveSeMudou(
      path.join(SAIDA, "paleta.json"),
      `${JSON.stringify({ cores: [...paletaDeTokens()].sort() }, null, 2)}\n`
    )
  ) {
    escritos++;
  }

  // Qual commit gerou este site. É o que o painel compara com o topo da main
  // para dizer se o deploy da última edição já passou.
  if (escreveSeMudou(path.join(SAIDA, "versao-build.json"), `${JSON.stringify(versaoDoBuild(), null, 2)}\n`)) {
    escritos++;
  }

  // Assets, quando existirem. O LEIA-ME fica de fora: é documentação.
  const destinoAssets = path.join(SAIDA, "assets");
  fs.mkdirSync(destinoAssets, { recursive: true });
  let copiados = 0;
  if (fs.existsSync(ASSETS)) {
    for (const arquivo of fs.readdirSync(ASSETS)) {
      if (arquivo === "LEIA-ME.md") continue;
      const origem = path.join(ASSETS, arquivo);
      // A pasta de fontes vai inteira: as telas servem a Inclusive Sans e a
      // Unbounded do próprio site, sem chamada ao Google Fonts.
      if (fs.statSync(origem).isDirectory()) {
        fs.cpSync(origem, path.join(destinoAssets, arquivo), { recursive: true });
        copiados += fs.readdirSync(origem).length;
        continue;
      }
      const destino = path.join(destinoAssets, arquivo);
      const igual =
        fs.existsSync(destino) && fs.readFileSync(destino).equals(fs.readFileSync(origem));
      if (!igual) fs.copyFileSync(origem, destino);
      copiados++;
    }
  }

  // Nenhuma palavra na tela pode vir de fora das fontes de conteúdo. Falha o
  // build se vier: é o que sustenta a promessa de que o CMS edita tudo.
  const literais = verificaLiterais.verifica({ extras: doConteudo.pautas });

  const banners = monta.imagensDeBanner(configuracao).length;
  console.log(
    `telas publicadas: ${PAGINAS.length} fixas + ${doConteudo.caminhos} caminhos + Sobre, privacidade e painel ` +
      `(${escritos} arquivo(s) reescrito(s)) | ` +
      `banner: ${banners ? `${banners} imagem(ns) de assets/` : "faixa provisória"} | ` +
      `assets copiados: ${copiados}`
  );
  console.log(
    `literais conferidos: ${literais.telas} telas, ${literais.palavras} palavras, todas das fontes de conteúdo`
  );

  // Verificação de conteúdo: estrutura e termos bloqueados.
  console.log(`estrutura conferida: ${conferido.paginas} páginas, ${vocabulario.publicos.length} públicos × ${vocabulario.macronarrativas.length} temas`);
  if (conferido.rodou) {
    console.log(
      `termos bloqueados: ${conferido.termos} termos (${conferido.siglas} siglas, sensíveis a maiúsculas) ` +
        `varridos em ${conferido.arquivos} arquivos e ${conferido.campos} campos de texto — ` +
        `${conferido.ocorrencias.length} ocorrência(s)`
    );
  } else {
    // No build que publica a verificação já teria derrubado tudo; aqui é
    // pré-visualização ou máquina de quem desenvolve, e o aviso basta.
    console.log(
      "termos bloqueados: VARREDURA NÃO EXECUTADA — BLOCKED_TERMS ausente ou vazia. " +
        "Em pré-visualização e na máquina local isso é só aviso; no build da main " +
        "derruba a publicação. A variável fica no ambiente de produção do painel " +
        "(docs/06-operacao.md)."
    );
  }

  // O que falta redigir ou falta de asset, listado no fim para a equipe ver
  // sem precisar abrir tela. Junta o que apareceu numa tela com o que está
  // marcado nas fontes e só aparece em tempo de execução.
  const pendencias = [...new Set([...pendentes(), ...verificaConteudo.pendenciasNaFonte()])];
  if (pendencias.length) {
    console.log(`pendências na tela (${pendencias.length}):`);
    for (const pendencia of pendencias) console.log(`  - ${pendencia}`);
  } else {
    console.log("pendências na tela: nenhuma");
  }
}

module.exports = { main };

if (require.main === module) {
  main().catch((e) => {
    console.error("FALHA ao gerar as telas:", e.message);
    process.exit(1);
  });
}
