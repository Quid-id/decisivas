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
const { troca, confereMarcadores, leParciais, pendentes } = require("./html");
const monta = require("./interface");
const geraCaminhos = require("./gera-caminhos");
const verificaLiterais = require("./verifica-literais");
const verificaConteudo = require("./verifica-conteudo");

const SAIDA = "public";
const ASSETS = "assets";

// Telas montadas aqui: as que não vêm de `conteudo/`. Título e descrição de
// cada uma vivem em `meta`, na configuração; `atual` é o endereço que a
// navegação marca.
const PAGINAS = [
  { arquivo: "index.html", meta: "inicio", atual: "/" },
  { arquivo: "resultado.html", meta: "redirecionamento", atual: "/" },
];

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
    cabeca: (meta) => monta.cabeca(parciais, configuracao, meta),
    cabecalho: (atual) => monta.cabecalho(parciais, configuracao, atual),
    rodape: monta.rodape(parciais, configuracao),
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
    `telas publicadas: ${PAGINAS.length} fixas + ${doConteudo.caminhos} caminhos + Sobre e privacidade ` +
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
    // Em CI a verificação já teria derrubado o build; aqui é máquina de quem
    // desenvolve, e o aviso basta.
    console.log(
      "termos bloqueados: VARREDURA NÃO EXECUTADA — BLOCKED_TERMS ausente ou vazia. " +
        "Fora de CI isso é só aviso; no build do Cloudflare derruba a publicação. " +
        "Em produção ela é variável de build no painel (docs/06-operacao.md)."
    );
  }

  // O que falta redigir ou falta de asset, listado no fim para a equipe ver
  // sem precisar abrir tela.
  const pendencias = pendentes();
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
