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
// Marcadores nas telas: {{CABECA}} (o <head> comum), {{CABECALHO}} (banner +
// barra), {{RODAPE}} (rodapé e aviso de privacidade) e {{COMPARTILHAR}} (a
// barra lateral, só nas páginas de caminho). No cabeçalho, {{BANNER}} vira as
// imagens de assets/ ou, enquanto não houver nenhuma, a faixa provisória de
// linhas coloridas.

const fs = require("node:fs");
const path = require("node:path");
const { escreveSeMudou } = require("./escreve-se-mudou");
const { escapa, troca, confereMarcadores, leParciais, ehPendente, pendentes } = require("./html");
const geraCaminhos = require("./gera-caminhos");

const SAIDA = "public";
const ASSETS = "assets";

// Telas montadas aqui: as que não vêm de `conteudo/`. O Sobre, a privacidade e
// as 20 páginas de caminho são montados por scripts/gera-caminhos.js, a partir
// do conteúdo escrito pela equipe.
const PAGINAS = [
  {
    arquivo: "index.html",
    titulo: "DECISIVAS · Com quem você quer falar hoje?",
    descricao:
      "Escolha um público e um tema e receba o que a pesquisa mostra sobre essa conversa: o que funciona, o que não funciona e como chegar nessas pessoas.",
    atual: "inicio",
  },
  {
    arquivo: "resultado.html",
    titulo: "Este endereço mudou · DECISIVAS",
    descricao: "Os caminhos agora ficam em /caminhos/<público>/<tema>.",
    atual: "inicio",
  },
];

// Faixa provisória do protótipo v3, enquanto os assets de banner não chegam.
// As cores são as da paleta da identidade; é a única exceção à regra de não
// escrever cor fora dos tokens, porque SVG inline não lê variável de CSS de
// outro arquivo — e some assim que o primeiro banner-*.svg existir.
const BANNER_PROVISORIO = `  <figure class="ativa"><svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1200" height="220" fill="#f7f7ed"/>
    <g fill="none" stroke-width="9" stroke-linecap="square">
      <path d="M60 220 V120 H240 V40" stroke="#0f02fd"/><path d="M330 0 V90 H470 V220" stroke="#ff5aac"/>
      <path d="M600 220 V150 H760 V70 H900" stroke="#16c172"/><path d="M960 0 V100 H1120 V220" stroke="#ff3131"/>
    </g>
    <g fill="none" stroke-width="9"><circle cx="240" cy="40" r="14" stroke="#0f02fd"/><circle cx="900" cy="70" r="14" stroke="#16c172"/></g>
  </svg></figure>
  <figure><svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1200" height="220" fill="#f7f7ed"/>
    <g stroke="#f7f7ed" stroke-width="10">
      <rect x="0" y="0" width="300" height="90" fill="#26cbff"/><rect x="320" y="0" width="420" height="90" fill="#ffcc32"/>
      <rect x="760" y="0" width="440" height="90" fill="#7e2dff"/><rect x="0" y="110" width="480" height="110" fill="#16c172"/>
      <rect x="500" y="110" width="300" height="110" fill="#ff5aac"/><rect x="820" y="110" width="380" height="110" fill="#b4db00"/>
    </g>
  </svg></figure>
  <figure><svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1200" height="220" fill="#000000"/>
    <g fill="none" stroke-width="9" stroke-linecap="round">
      <path d="M0 60 H200 V180 H420" stroke="#ffb23d"/><path d="M420 20 H640 V140 H860" stroke="#26cbff"/>
      <path d="M860 200 H1000 V60 H1200" stroke="#ff5aac"/>
    </g>
  </svg></figure>
  <span class="nota">faixa provisória. Substituir pelos arquivos banner-* da pasta assets</span>`;

// A rotação do banner é comportamento de tela, mas vive aqui porque o número
// de imagens só se conhece no build.
const RODA_BANNER = `<script>
  (function () {
    var figuras = document.querySelectorAll("#banner figure");
    if (figuras.length < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var i = 0;
    setInterval(function () {
      figuras[i].classList.remove("ativa");
      i = (i + 1) % figuras.length;
      figuras[i].classList.add("ativa");
    }, 5000);
  })();
</script>`;

function arquivosDeBanner() {
  if (!fs.existsSync(ASSETS)) return [];
  return fs
    .readdirSync(ASSETS)
    .filter((f) => /^banner-.+\.(svg|png|jpg|jpeg|webp)$/i.test(f))
    .sort();
}

function montaBanner() {
  const imagens = arquivosDeBanner();
  if (!imagens.length) return BANNER_PROVISORIO;
  return imagens
    .map(
      (arquivo, i) =>
        `  <figure${i === 0 ? ' class="ativa"' : ""}><img src="/assets/${arquivo}" alt=""></figure>`
    )
    .join("\n");
}

// Confere que toda cor de público existe na paleta de brand/tokens.css. É o
// que impede a identidade de escapar por dados/vocabulario.json.
function conferePaletaDosPublicos(vocabulario) {
  const tokens = fs.readFileSync("brand/tokens.css", "utf8");
  const paleta = new Set(
    [...tokens.matchAll(/^\s*--[a-z-]+:\s*(#[0-9a-f]{6});/gim)].map((m) => m[1].toLowerCase())
  );
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

// Logotipo de parceiro: o arquivo em assets/, quando existir; senão o
// placeholder com o nome esperado.
function logo(arquivo, nome) {
  const caminho = path.join(ASSETS, arquivo);
  return fs.existsSync(caminho)
    ? `<span class="logo"><img src="/assets/${arquivo}" alt="${escapa(nome)}"></span>`
    : `<span class="logo">[assets/${escapa(arquivo)}]</span>`;
}

// Contato do rodapé: link quando existe, caixa [preencher] quando não.
function contato(valor, oQue, endereco) {
  if (ehPendente(valor)) return `<span class="tagline">[preencher] ${escapa(oQue)}</span>`;
  return `<a href="${escapa(endereco(valor))}" rel="noopener noreferrer">${escapa(valor)}</a>`;
}

async function main() {
  const vocabulario = JSON.parse(fs.readFileSync("dados/vocabulario.json", "utf8"));
  conferePaletaDosPublicos(vocabulario);
  const configuracao = JSON.parse(fs.readFileSync("dados/configuracao.json", "utf8"));

  const parciais = leParciais();
  parciais.cabecalho = parciais.cabecalho.replace("{{BANNER}}", montaBanner()) + "\n" + RODA_BANNER;
  // O rodapé é igual em toda tela, e o que falta redigir aparece nele como
  // [preencher] — inclusive a assinatura e o contato.
  parciais.rodape = troca(parciais.rodape, {
    ASSINATURA: ehPendente(configuracao.assinatura)
      ? "[preencher] assinatura do projeto"
      : escapa(configuracao.assinatura),
    CONTATO_EMAIL: contato(configuracao.contato?.email, "e-mail", (v) => `mailto:${v}`),
    CONTATO_INSTAGRAM: contato(
      configuracao.contato?.instagram,
      "Instagram",
      (v) => `https://instagram.com/${String(v).replace(/^@/, "")}`
    ),
    LOGO_QUID: logo("logo-quid.svg", "Quid"),
    LOGO_BRIEF: logo("logo-brief.svg", "BRIEF"),
  });

  fs.mkdirSync(SAIDA, { recursive: true });
  let escritos = 0;

  for (const pagina of PAGINAS) {
    const origem = path.join("paginas", pagina.arquivo);
    let html = fs.readFileSync(origem, "utf8");
    html = troca(html, {
      CABECA: troca(parciais.cabeca, { TITULO: pagina.titulo, DESCRICAO: escapa(pagina.descricao) }),
      CABECALHO: parciais.cabecalho,
      RODAPE: parciais.rodape,
      ATUAL_INICIO: pagina.atual === "inicio" ? ' aria-current="page"' : "",
      ATUAL_SOBRE: pagina.atual === "sobre" ? ' aria-current="page"' : "",
    });
    confereMarcadores(html, origem);
    if (escreveSeMudou(path.join(SAIDA, pagina.arquivo), html)) escritos++;
  }

  // As 20 páginas de caminho, o Sobre e a privacidade, de conteudo/*.json.
  const doConteudo = await geraCaminhos.main({ parciais, vocabulario, configuracao });
  escritos += doConteudo.escritos;

  // Estilos e redirecionamentos das rotas antigas.
  if (copia("paginas/estilos.css", path.join(SAIDA, "estilos.css"))) escritos++;
  if (copia("paginas/_redirects", path.join(SAIDA, "_redirects"))) escritos++;

  // Configuração das telas, publicada como os demais vocabulários.
  if (
    escreveSeMudou(
      path.join(SAIDA, "configuracao.js"),
      "// ARQUIVO GERADO no build a partir de dados/configuracao.json — NÃO EDITAR AQUI.\n" +
        `window.CONFIGURACAO = ${JSON.stringify(configuracao)};\n`
    )
  ) {
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
      // A pasta de fontes vai inteira: as telas servem a Inclusive Sans do
      // próprio site, sem chamada ao Google Fonts.
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

  const banners = arquivosDeBanner().length;
  console.log(
    `telas publicadas: ${PAGINAS.length} fixas + ${doConteudo.caminhos} caminhos + Sobre e privacidade ` +
      `(${escritos} arquivo(s) reescrito(s)) | ` +
      `banner: ${banners ? `${banners} imagem(ns) de assets/` : "faixa provisória"} | ` +
      `assets copiados: ${copiados} | [preencher] pendentes: ${pendentes().length}`
  );
}

module.exports = { main };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("FALHA ao gerar as telas:", e.message);
    process.exit(1);
  }
}
