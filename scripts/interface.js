// DECISIVAS — monta o que é comum a toda tela: <head>, cabeçalho, rodapé e a
// barra lateral de voltar e compartilhar.
//
// Existe por causa da regra desta entrega: NENHUM texto fixo, rótulo, nome de
// imagem ou link é escrito dentro de template ou de script. Tudo o que aparece
// na tela vem de `dados/configuracao.json`, de `conteudo/*.json` ou de
// `dados/vocabulario.json`. Os parciais de `parciais/` só têm marcadores; é
// aqui que cada marcador recebe o valor da configuração — e é isso que o CMS
// da etapa 9 vai editar, sem tocar em código.
//
// `scripts/verifica-literais.js` roda no fim do build e recusa publicar se
// achar na tela palavra que não venha dessas fontes.

const fs = require("node:fs");
const path = require("node:path");
const { escapa, troca, ehPendente, registraPendencia } = require("./html");

// Caminho de asset na configuração é o endereço público ("/assets/x.svg"); o
// arquivo correspondente é procurado na pasta do repositório.
function caminhoLocal(endereco) {
  return String(endereco).replace(/^\/+/, "");
}

function existeAsset(endereco) {
  return Boolean(endereco) && fs.existsSync(caminhoLocal(endereco));
}

// Texto de pendência: aponta o arquivo e o campo a preencher, para a equipe
// saber onde mexer. O formato vem da configuração.
function pendencia(configuracao, arquivo, campo) {
  const p = configuracao.pendencias;
  registraPendencia(`${arquivo} → ${campo}`);
  return escapa(
    p.formato.replace("{prefixo}", p.prefixo).replace("{arquivo}", arquivo).replace("{campo}", campo)
  );
}

// Quando quem escreve já deixou a nota do que falta dentro do próprio campo
// ("[preencher: id do vídeo…"), é essa nota que vai à tela: ela diz mais do
// que o nome do campo. Sem nota, entra o apontamento do arquivo e do campo.
function textoDaPendencia(configuracao, valor, arquivo, campo) {
  const nota = String(valor ?? "").trim();
  // A nota da equipe vem como "[preencher: …]"; o prefixo da configuração é
  // "[preencher]". A comparação é pelo começo, sem o fecha-colchete.
  const marca = configuracao.pendencias.prefixo.replace(/\]$/, "");
  if (nota.startsWith(marca) && nota.length > configuracao.pendencias.prefixo.length) {
    registraPendencia(`${arquivo} → ${campo}`);
    return escapa(nota);
  }
  return pendencia(configuracao, arquivo, campo);
}

// Asset ausente aparece como placeholder com o nome esperado, nunca como
// imagem quebrada (regra 2 do CLAUDE.md, valendo também para imagem).
function assetPendente(configuracao, endereco) {
  const p = configuracao.pendencias;
  registraPendencia(endereco);
  return escapa(p.asset.replace("{prefixo}", p.prefixo).replace("{arquivo}", endereco));
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

// A marca: o logotipo quando o arquivo existir, o nome em tipografia de
// destaque enquanto não existir.
function marca(configuracao) {
  const m = configuracao.marca;
  const conteudo = existeAsset(m.logo)
    ? `<img src="${escapa(m.logo)}" alt="${escapa(m.texto_alternativo)}">`
    : escapa(m.nome);
  return `<a class="marca" href="${escapa(m.destino)}" aria-label="${escapa(m.texto_alternativo)}">${conteudo}</a>`;
}

// Navegação da barra preta. A página em que se está fica marcada por
// aria-current, comparando com o endereço da tela — nada escrito no template.
function navegacaoBarra(configuracao, atual) {
  return configuracao.navegacao
    .map((item) => {
      const marcaAtual = item.destino === atual ? ' aria-current="page"' : "";
      return `    <a href="${escapa(item.destino)}"${marcaAtual}>${escapa(item.rotulo)}</a>`;
    })
    .join("\n");
}

// A navegação do rodapé é lista própria (rodape.navegacao): ela leva também à
// política de privacidade, que não fica na barra preta.
function navegacaoRodape(configuracao) {
  return configuracao.rodape.navegacao
    .map((item) => `        <li><a href="${escapa(item.destino)}">${escapa(item.rotulo)}</a></li>`)
    .join("\n");
}

// Faixa provisória, enquanto os arquivos de banner não chegam. As cores são as
// da paleta da identidade; é a única exceção à regra de não escrever cor fora
// dos tokens, porque SVG inline não lê variável de CSS de outro arquivo — e
// some assim que as imagens de banner existirem.
const FAIXA_PROVISORIA = `  <figure class="ativa"><svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
  </svg></figure>`;

// Quantas imagens de banner existem de verdade. A configuração lista os
// arquivos esperados; enquanto nenhum existir, entra a faixa provisória.
function imagensDeBanner(configuracao) {
  return (configuracao.banner.imagens ?? []).filter((imagem) => existeAsset(imagem.arquivo));
}

function banner(configuracao) {
  const imagens = imagensDeBanner(configuracao);
  if (!imagens.length) {
    return `${FAIXA_PROVISORIA}\n  <span class="nota">${escapa(configuracao.banner.nota_provisoria)}</span>`;
  }
  return imagens
    .map(
      (imagem, i) =>
        `  <figure${i === 0 ? ' class="ativa"' : ""}><img src="${escapa(imagem.arquivo)}" ` +
        `alt="${escapa(imagem.texto_alternativo ?? "")}"></figure>`
    )
    .join("\n");
}

// A rotação do banner é comportamento de tela, e o intervalo vem da
// configuração: o número de imagens só se conhece no build.
function rodaBanner(configuracao) {
  return `<script>
  (function () {
    var figuras = document.querySelectorAll("#banner figure");
    if (figuras.length < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var i = 0;
    setInterval(function () {
      figuras[i].classList.remove("ativa");
      i = (i + 1) % figuras.length;
      figuras[i].classList.add("ativa");
    }, ${Number(configuracao.banner.intervalo_ms)});
  })();
</script>`;
}

// Logotipo de parceiro no rodapé.
function logoParceiro(configuracao, bloco) {
  return existeAsset(bloco.logo)
    ? `<span class="logo"><img src="${escapa(bloco.logo)}" alt="${escapa(bloco.texto_alternativo)}"></span>`
    : `<span class="logo">${assetPendente(configuracao, bloco.logo)}</span>`;
}

// Contato do rodapé: link quando existe, pendência quando falta.
function contato(configuracao, valor, campo, endereco) {
  if (ehPendente(valor)) {
    const texto = textoDaPendencia(configuracao, valor, "dados/configuracao.json", campo);
    return `<span class="tagline">${texto}</span>`;
  }
  return `<a href="${escapa(endereco(valor))}" rel="noopener noreferrer">${escapa(valor)}</a>`;
}

// Botões de rede da barra lateral. Rótulo, nome e cor de hover de cada rede
// vêm da configuração; o endereço a compartilhar é o da própria página, lido
// no navegador — não existe domínio escrito no build.
function redes(configuracao) {
  return configuracao.compartilhar.redes
    .filter((rede) => rede.ativo)
    .map(
      (rede) =>
        `  <a class="botao-redondo" data-rede="${escapa(rede.id)}" href="#" target="_blank" rel="noopener noreferrer" ` +
        `style="--hover: ${rede.cor_hover}; --hover-icone: ${rede.cor_icone_hover}" ` +
        `title="${escapa(rede.nome)}" aria-label="${escapa(rede.nome)}">${escapa(rede.rotulo)}</a>`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parciais completos
// ---------------------------------------------------------------------------

function cabeca(parciais, configuracao, { titulo, descricao }) {
  return troca(parciais.cabeca, {
    TITULO: escapa(titulo),
    DESCRICAO: escapa(descricao),
    FAVICON: escapa(configuracao.favicon),
    FAVICON_PNG: escapa(configuracao.favicon_png),
    IMAGEM_COMPARTILHAMENTO: escapa(configuracao.imagem_compartilhamento),
  });
}

function cabecalho(parciais, configuracao, atual) {
  return troca(parciais.cabecalho, {
    BANNER: banner(configuracao),
    MARCA: marca(configuracao),
    ROTULO_NAVEGACAO: escapa(configuracao.navegacao_rotulo),
    NAVEGACAO: navegacaoBarra(configuracao, atual),
  });
}

function rodape(parciais, configuracao) {
  const r = configuracao.rodape;
  return troca(parciais.rodape, {
    AVISO_PRIVACIDADE: escapa(configuracao.privacidade.aviso),
    DESTINO_PRIVACIDADE: escapa(configuracao.privacidade.destino),
    ROTULO_PRIVACIDADE: escapa(configuracao.privacidade.rotulo_link),
    BOTAO_PRIVACIDADE: escapa(configuracao.privacidade.botao),
    MARCA_NAVEGADOR: escapa(configuracao.privacidade.marca_navegador),
    MARCA_RODAPE: marca(configuracao).replace('class="marca"', 'class="marca assinatura"'),
    ASSINATURA: ehPendente(r.assinatura)
      ? pendencia(configuracao, "dados/configuracao.json", "assinatura")
      : escapa(r.assinatura),
    NOTA_IA: escapa(r.nota_ia),
    TITULO_NAVEGACAO: escapa(r.titulo_navegacao),
    NAVEGACAO_RODAPE: navegacaoRodape(configuracao),
    TITULO_CONTATO: escapa(r.titulo_contato),
    CONTATO_EMAIL: contato(configuracao, r.contato.email, "email", (v) => `mailto:${v}`),
    CONTATO_INSTAGRAM: contato(
      configuracao,
      r.contato.instagram,
      "instagram",
      (v) => `https://instagram.com/${String(v).replace(/^@/, "")}`
    ),
    CONTATO_CIDADE: escapa(r.contato.cidade),
    ROTULO_ORGANIZACAO: escapa(r.organizacao.rotulo),
    LOGO_ORGANIZACAO: logoParceiro(configuracao, r.organizacao),
    ROTULO_REALIZACAO: escapa(r.realizacao.rotulo),
    LOGO_REALIZACAO: logoParceiro(configuracao, r.realizacao),
    DIREITOS: escapa(r.direitos),
  });
}

function compartilhar(parciais, configuracao) {
  const c = configuracao.compartilhar;
  return troca(parciais.compartilhar, {
    ROTULO_COMPARTILHAR: escapa(c.rotulo),
    DESTINO_VOLTAR: escapa(configuracao.caminho.voltar_destino),
    ROTULO_VOLTAR: escapa(configuracao.caminho.voltar),
    ICONE_VOLTAR: escapa(configuracao.caminho.icone_voltar),
    REDES: redes(configuracao),
    ROTULO_COPIAR: escapa(c.copiar.rotulo),
    NOME_COPIAR: escapa(c.copiar.nome),
    CONFIRMACAO_COPIAR: escapa(c.copiar.confirmacao),
    COR_HOVER_COPIAR: c.copiar.cor_hover,
    COR_ICONE_HOVER_COPIAR: c.copiar.cor_icone_hover,
  });
}

// Voltar ao início na página de caminho: botão fixo à esquerda do título,
// visível desde o topo e independente da barra de compartilhamento. Em telas
// até 900 px ele sai daqui e quem aparece é o voltar da faixa do pé.
function voltar(configuracao) {
  const c = configuracao.caminho;
  return (
    `  <a class="botao-redondo voltar voltar-fixo" href="${escapa(c.voltar_destino)}" ` +
    `title="${escapa(c.voltar)}" aria-label="${escapa(c.voltar)}">${escapa(c.icone_voltar)}</a>`
  );
}

// Retrato do público, no bloco "Quem é este público". O arquivo vem de
// dados/vocabulario.json (campo `retrato`), e o texto alternativo da
// configuração, com o nome do público no lugar marcado. Enquanto o arquivo não
// existir, entra o placeholder com o nome esperado.
function retrato(configuracao, publico, nome) {
  if (!publico.retrato) return "";
  const alternativo = String(configuracao.caminho.retrato_alternativo).replace("{publico}", nome);
  if (!existeAsset(publico.retrato)) {
    return `      <div class="retrato retrato-ausente">${assetPendente(configuracao, publico.retrato)}</div>`;
  }
  return `      <img class="retrato" src="${escapa(publico.retrato)}" alt="${escapa(alternativo)}" width="800" height="800">`;
}

// O vídeo vive só na página Sobre, pelo código de incorporação da
// configuração. Não há janela de abertura em nenhuma tela.
function video(configuracao) {
  if (ehPendente(configuracao.video_embed)) {
    return textoDaPendencia(configuracao, configuracao.video_embed, "dados/configuracao.json", "video_embed");
  }
  return configuracao.video_embed;
}

module.exports = {
  existeAsset,
  imagensDeBanner,
  pendencia,
  textoDaPendencia,
  cabeca,
  cabecalho,
  rodape,
  compartilhar,
  rodaBanner,
  video,
  voltar,
  retrato,
};
