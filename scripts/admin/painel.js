// DECISIVAS — o painel de edição, no navegador (etapa 9).
//
// Script de TELA, não do build: o build só o copia para public/admin/. Roda
// atrás do Cloudflare Access, e toda operação passa pelas rotas /api/cms/*, que
// conferem o crachá de novo no servidor.
//
// O que ele NÃO faz, de propósito:
//
//   - não valida em vez do servidor. As regras da especificação (destaque de 8
//     caracteres, 5 linhas de resumo, 1 a 3 cards, termos bloqueados) vivem em
//     src/valida-conteudo.cjs e em src/varre-termos.cjs, e é o Worker que as
//     aplica, com as MESMAS funções que o build usa. O painel manda, recebe o
//     campo que falhou e acende o campo. Uma segunda cópia das regras aqui é
//     exatamente a divergência que a etapa 9 não pode ter;
//   - não escreve texto. Todo rótulo vem de window.CONFIGURACAO.admin, os nomes
//     de público e tema vêm de window.VOCABULARIO, e os nomes dos campos vêm de
//     configuracao.admin.campos. Nenhuma palavra é escrita neste arquivo;
//   - não guarda nada. Recarregar a página relê tudo do repositório.
//
// O formulário é MONTADO DA FORMA DO JSON, e não de um esquema escrito à mão:
// texto vira campo de texto, lista vira lista de campos, objeto vira grupo.
// Assim um campo novo no arquivo aparece no painel sem tocar em código — o que
// é a promessa da etapa 9 ao contrário: o conteúdo manda na tela.

(function () {
  var CFG = window.CONFIGURACAO;
  var A = CFG.admin;
  var VOC = window.VOCABULARIO;

  var API = "/api/cms";
  // Chaves que o painel não deixa editar: identificador e slug são vocabulário
  // fechado e endereço publicado, e o servidor recusa a mudança de qualquer
  // forma (src/cms.js). Aqui elas aparecem apagadas, com a regra ao lado.
  var FECHADAS = ["id", "slug", "publico"];
  // Listas em que dá para acrescentar e remover item. As outras têm tamanho
  // fixo na especificação (2 parágrafos, 3 cards de dados, 5 linhas de resumo).
  var LISTAS_ABERTAS = ["funciona", "nao_funciona", "imagens"];
  // Blocos da configuração que a coleção "Site" abre. O resto do arquivo
  // (pendências, favicon, o próprio bloco admin) não é texto de tela que a
  // equipe edite no dia a dia.
  var BLOCOS_DO_SITE = [
    "marca", "navegacao", "navegacao_rotulo", "meta", "home", "caminho", "sobre",
    "pagina_privacidade", "explorar", "compartilhar", "privacidade", "rodape",
    "banner", "video_embed", "substack_embed", "site",
  ];
  // Campos de conteúdo de público que a coleção "Públicos" abre (o resto do
  // arquivo é a coleção "Caminhos").
  var CAMPOS_DO_PUBLICO = ["nome", "quem_e", "como_chegar", "revisado_em"];
  var CAMPOS_DO_SOBRE = ["projeto", "como_foi_feito", "publicos_intro", "aviso_ia", "receba", "revisado_em"];
  var CAMPOS_DA_PRIVACIDADE = ["privacidade", "privacidade_revisada_em"];

  var el = {
    email: document.getElementById("email"),
    estado: document.getElementById("estado"),
    colecoes: document.getElementById("lista-colecoes"),
    itens: document.getElementById("lista-itens"),
    formulario: document.getElementById("formulario"),
    semSelecao: document.getElementById("sem-selecao"),
    acoes: document.getElementById("acoes"),
    previsualizar: document.getElementById("previsualizar"),
    publicar: document.getElementById("publicar"),
    reverter: document.getElementById("reverter"),
    recado: document.getElementById("recado"),
    historico: document.getElementById("lista-historico"),
    previa: document.getElementById("previa"),
    avisoPrevia: document.getElementById("aviso-previa"),
    quadroPrevia: document.getElementById("quadro-previa"),
    fecharPrevia: document.getElementById("fechar-previa"),
  };

  var estado = { conta: null, item: null, campos: {} };

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  function cria(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    // textContent, nunca innerHTML: o que passa por aqui é conteúdo editável.
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function limpa(no) {
    while (no.firstChild) no.removeChild(no.firstChild);
  }

  // O mesmo caminho legível que o servidor devolve no erro (a regra vive em
  // src/varre-termos.cjs, `juntaCaminho`). É por esta string que o campo errado
  // é encontrado no formulário.
  function juntaCaminho(base, chave) {
    if (typeof chave === "number") return base + "[" + chave + "]";
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) return base ? base + "." + chave : chave;
    return base + '["' + chave + '"]';
  }

  function caminhoDe(arquivo, chaves) {
    return chaves.reduce(juntaCaminho, arquivo);
  }

  function dentro(objeto, chaves) {
    return chaves.reduce(function (atual, chave) {
      return atual === undefined || atual === null ? atual : atual[chave];
    }, objeto);
  }

  function poe(objeto, chaves, valor) {
    var alvo = objeto;
    for (var i = 0; i < chaves.length - 1; i += 1) alvo = alvo[chaves[i]];
    alvo[chaves[chaves.length - 1]] = valor;
  }

  function rotulo(chave) {
    if (typeof chave === "number") return String(chave + 1);
    // Chave que é identificador de tema aparece com o nome de tela do
    // vocabulário: "dinheiro no bolso" é chave de arquivo, "Dinheiro no bolso"
    // é o que a equipe lê.
    var tema = VOC.macronarrativas.filter(function (m) {
      return m.id === chave;
    })[0];
    if (tema) return tema.nome;
    // Sem rótulo na configuração, vale a chave do arquivo: a equipe pode nomear
    // qualquer campo em admin.campos sem tocar em código (regra 2.1).
    return A.campos[chave] || chave;
  }

  function recado(texto, tipo) {
    el.recado.className = "recado" + (tipo ? " " + tipo : "");
    el.recado.textContent = texto;
  }

  async function chama(caminho, opcoes) {
    var r = await fetch(API + caminho, opcoes || {});
    if (r.status === 401) {
      recado(A.avisos.sem_acesso, "erro");
      throw new Error("401");
    }
    var dados = await r.json().catch(function () {
      return { erro: true, mensagem: A.avisos.erro };
    });
    if (dados.erro) {
      var e = new Error(dados.mensagem || A.avisos.erro);
      e.campo = dados.campo || null;
      e.regra = dados.regra || null;
      throw e;
    }
    return dados;
  }

  // -------------------------------------------------------------------------
  // Coleções e itens
  // -------------------------------------------------------------------------

  function arquivoDoPublico(publico) {
    // O painel não deduz o nome do arquivo: pega da lista que o servidor
    // devolve, na ordem dos públicos do vocabulário (src/cms.js).
    var i = VOC.publicos.findIndex(function (p) {
      return p.id === publico.id;
    });
    return estado.conta.editaveis[i];
  }

  function enderecoDoCaminho(publico, tema) {
    return "/caminhos/" + publico.slug + "/" + tema.slug + ".html";
  }

  function itensDaColecao(nome) {
    var itens = [];
    if (nome === "caminhos") {
      VOC.publicos.forEach(function (publico) {
        VOC.macronarrativas.forEach(function (tema) {
          itens.push({
            rotulo: publico.nome + " · " + tema.nome,
            arquivo: arquivoDoPublico(publico),
            raiz: ["paginas", tema.id],
            colecao: A.colecoes.caminhos.nome,
            endereco: enderecoDoCaminho(publico, tema),
          });
        });
      });
      return itens;
    }
    if (nome === "publicos") {
      VOC.publicos.forEach(function (publico, i) {
        itens.push({
          rotulo: publico.nome,
          arquivo: arquivoDoPublico(publico),
          raiz: [],
          campos: CAMPOS_DO_PUBLICO,
          colecao: A.colecoes.publicos.nome,
          endereco: enderecoDoCaminho(publico, VOC.macronarrativas[0]),
          // O nome na tela, a cor e o retrato vivem no vocabulário, não no
          // conteúdo: por isso o público tem um segundo arquivo.
          extra: { arquivo: "dados/vocabulario.json", raiz: ["publicos", i], campos: ["nome", "cor", "retrato", "id", "slug"] },
        });
      });
      return itens;
    }
    if (nome === "temas") {
      itens.push({
        rotulo: A.colecoes.temas.nome,
        arquivo: "conteudo/sobre.json",
        raiz: ["temas"],
        colecao: A.colecoes.temas.nome,
        endereco: "/sobre.html",
      });
      return itens;
    }
    if (nome === "sobre") {
      itens.push({
        rotulo: A.colecoes.sobre.nome,
        arquivo: "conteudo/sobre.json",
        raiz: [],
        campos: CAMPOS_DO_SOBRE,
        colecao: A.colecoes.sobre.nome,
        endereco: "/sobre.html",
      });
      return itens;
    }
    if (nome === "privacidade") {
      itens.push({
        rotulo: A.colecoes.privacidade.nome,
        arquivo: "conteudo/sobre.json",
        raiz: [],
        campos: CAMPOS_DA_PRIVACIDADE,
        colecao: A.colecoes.privacidade.nome,
        endereco: "/privacidade.html",
      });
      return itens;
    }
    if (nome === "site") {
      BLOCOS_DO_SITE.forEach(function (bloco) {
        itens.push({
          rotulo: rotulo(bloco),
          arquivo: "dados/configuracao.json",
          raiz: [bloco],
          colecao: A.colecoes.site.nome,
          endereco: "/index.html",
        });
      });
      return itens;
    }
    if (nome === "assets") {
      itens.push({ rotulo: A.colecoes.assets.nome, assets: true, colecao: A.colecoes.assets.nome });
      return itens;
    }
    return itens;
  }

  function mostraColecoes() {
    limpa(el.colecoes);
    Object.keys(A.colecoes).forEach(function (nome) {
      var li = cria("li");
      var b = cria("button", null, A.colecoes[nome].nome);
      b.type = "button";
      b.appendChild(cria("span", "ajuda", A.colecoes[nome].ajuda));
      b.addEventListener("click", function () {
        [].forEach.call(el.colecoes.querySelectorAll("button"), function (o) {
          o.removeAttribute("aria-current");
        });
        b.setAttribute("aria-current", "true");
        mostraItens(nome);
      });
      li.appendChild(b);
      el.colecoes.appendChild(li);
    });
  }

  function mostraItens(nome) {
    limpa(el.itens);
    itensDaColecao(nome).forEach(function (item) {
      var li = cria("li");
      var b = cria("button", null, item.rotulo);
      b.type = "button";
      b.addEventListener("click", function () {
        [].forEach.call(el.itens.querySelectorAll("button"), function (o) {
          o.removeAttribute("aria-current");
        });
        b.setAttribute("aria-current", "true");
        abre(item);
      });
      li.appendChild(b);
      el.itens.appendChild(li);
    });
  }

  // -------------------------------------------------------------------------
  // O formulário, montado da forma do JSON
  // -------------------------------------------------------------------------

  function regraDo(chaves) {
    var ultima = chaves[chaves.length - 1];
    var penultima = chaves.length > 1 ? chaves[chaves.length - 2] : null;
    if (ultima === "n") return A.regras.destaque;
    if (ultima === "resumo") return A.regras.resumo;
    if (ultima === "funciona" || ultima === "nao_funciona") return A.regras.cards;
    if (ultima === "dados") return A.regras.dados;
    if (ultima === "como_chegar") return A.regras.como_chegar;
    if (ultima === "texto" && penultima === "por_que") return A.regras.por_que_texto;
    if (ultima === "cor") return A.regras.cor;
    if (ultima === "privacidade") return A.regras.secoes;
    if (ultima === "revisado_em" || ultima === "privacidade_revisada_em") return A.regras.data;
    if (String(ultima).indexOf("aviso") === 0) return A.regras.aviso;
    if (FECHADAS.indexOf(ultima) >= 0) return A.regras.fechado;
    return null;
  }

  function campoDeTexto(valor, chaves, arquivo, dados) {
    var caminho = caminhoDe(arquivo, chaves);
    var chave = chaves[chaves.length - 1];
    var fechado = FECHADAS.indexOf(chave) >= 0;
    var div = cria("div", "campo-painel" + (fechado ? " fechado" : ""));
    var id = "c" + Math.random().toString(36).slice(2);

    var lab = cria("label", null, rotulo(chave));
    lab.htmlFor = id;
    var regra = regraDo(chaves);
    if (regra) lab.appendChild(cria("span", "regra", " — " + regra));
    div.appendChild(lab);

    var longo = String(valor).length > 90 || String(valor).indexOf("\n") >= 0;
    var entrada = cria(longo ? "textarea" : "input");
    if (!longo) entrada.type = "text";
    entrada.id = id;
    entrada.value = String(valor);
    if (fechado) entrada.readOnly = true;
    entrada.addEventListener("input", function () {
      poe(dados, chaves, entrada.value);
      div.className = "campo-painel" + (fechado ? " fechado" : "");
      var erro = div.querySelector(".erro");
      if (erro) erro.remove();
    });
    div.appendChild(entrada);

    estado.campos[caminho] = div;
    return div;
  }

  function itemDeLista(valor, chaves, arquivo, dados, aberta, redesenha) {
    var caixa = cria("div", "grupo item-lista");
    caixa.appendChild(monta(valor, chaves, arquivo, dados, redesenha));
    if (aberta) {
      var b = cria("button", "remover", A.botoes.remover);
      b.type = "button";
      b.addEventListener("click", function () {
        var lista = dentro(dados, chaves.slice(0, -1));
        lista.splice(chaves[chaves.length - 1], 1);
        redesenha();
      });
      caixa.appendChild(b);
    }
    return caixa;
  }

  // Recursiva: texto vira campo, lista vira lista de campos, objeto vira grupo.
  function monta(valor, chaves, arquivo, dados, redesenha) {
    if (valor === null || valor === undefined) valor = "";
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      return campoDeTexto(valor, chaves, arquivo, dados);
    }

    if (Array.isArray(valor)) {
      var chave = chaves[chaves.length - 1];
      var aberta = LISTAS_ABERTAS.indexOf(chave) >= 0;
      var grupo = cria("div", "grupo");
      var titulo = cria("span", "rotulo-grupo", rotulo(chave));
      var regra = regraDo(chaves);
      if (regra) titulo.appendChild(cria("span", "regra", " — " + regra));
      grupo.appendChild(titulo);
      valor.forEach(function (item, i) {
        grupo.appendChild(itemDeLista(item, chaves.concat(i), arquivo, dados, aberta, redesenha));
      });
      if (aberta) {
        var b = cria("button", "acrescentar", A.botoes.acrescentar);
        b.type = "button";
        b.addEventListener("click", function () {
          var lista = dentro(dados, chaves);
          // O molde do item novo é o primeiro item, com os textos em branco:
          // nada de texto inventado (regra 2).
          lista.push(emBranco(lista[0] !== undefined ? lista[0] : ""));
          redesenha();
        });
        grupo.appendChild(b);
      }
      return grupo;
    }

    var caixa = cria("div", "grupo");
    if (chaves.length) {
      var t = cria("span", "rotulo-grupo", rotulo(chaves[chaves.length - 1]));
      caixa.appendChild(t);
    }
    Object.keys(valor).forEach(function (chave) {
      if (String(chave).indexOf("_leia_me") === 0) return;
      caixa.appendChild(monta(valor[chave], chaves.concat(chave), arquivo, dados, redesenha));
    });
    return caixa;
  }

  function emBranco(molde) {
    if (Array.isArray(molde)) return molde.map(emBranco);
    if (molde && typeof molde === "object") {
      var novo = {};
      Object.keys(molde).forEach(function (chave) {
        novo[chave] = emBranco(molde[chave]);
      });
      return novo;
    }
    return "";
  }

  // -------------------------------------------------------------------------
  // Abrir, pré-visualizar, publicar, reverter
  // -------------------------------------------------------------------------

  async function abre(item) {
    estado.item = item;
    el.semSelecao.hidden = true;
    limpa(el.formulario);
    recado(A.carregando);
    el.acoes.hidden = true;

    if (item.assets) {
      recado("");
      mostraAssets();
      return;
    }

    try {
      var principal = await chama("/arquivo?caminho=" + encodeURIComponent(item.arquivo));
      item.sha = principal.sha;
      item.dados = principal.dados;
      item.original = JSON.parse(JSON.stringify(principal.dados));
      if (item.extra) {
        var segundo = await chama("/arquivo?caminho=" + encodeURIComponent(item.extra.arquivo));
        item.extra.dados = segundo.dados;
        item.extra.original = JSON.parse(JSON.stringify(segundo.dados));
      }
      desenha();
      recado("");
      el.acoes.hidden = false;
    } catch (e) {
      recado(e.message, "erro");
    }
  }

  function desenhaBloco(pai, arquivo, dados, raiz, campos, redesenha) {
    var valor = raiz.length ? dentro(dados, raiz) : dados;
    if (campos) {
      campos.forEach(function (chave) {
        if (valor[chave] === undefined) return;
        pai.appendChild(monta(valor[chave], raiz.concat(chave), arquivo, dados, redesenha));
      });
      return;
    }
    pai.appendChild(monta(valor, raiz, arquivo, dados, redesenha));
  }

  function desenha() {
    var item = estado.item;
    estado.campos = {};
    limpa(el.formulario);
    desenhaBloco(el.formulario, item.arquivo, item.dados, item.raiz, item.campos, desenha);
    if (item.extra) {
      desenhaBloco(el.formulario, item.extra.arquivo, item.extra.dados, item.extra.raiz, item.extra.campos, desenha);
    }
  }

  // O que mudou, texto por texto: é o que a prévia troca na página publicada.
  function trocas(original, dados, chaves, achadas, arquivo) {
    var antes = dentro(original, chaves);
    var depois = dentro(dados, chaves);
    if (typeof antes === "string" && typeof depois === "string") {
      if (antes !== depois) achadas.push({ campo: caminhoDe(arquivo, chaves), de: antes, para: depois });
      return achadas;
    }
    if (Array.isArray(antes) && Array.isArray(depois)) {
      antes.forEach(function (_, i) {
        if (depois[i] !== undefined) trocas(original, dados, chaves.concat(i), achadas, arquivo);
      });
      return achadas;
    }
    if (antes && typeof antes === "object" && depois && typeof depois === "object") {
      Object.keys(antes).forEach(function (chave) {
        if (depois[chave] !== undefined) trocas(original, dados, chaves.concat(chave), achadas, arquivo);
      });
    }
    return achadas;
  }

  function todasAsTrocas() {
    var item = estado.item;
    var achadas = trocas(item.original, item.dados, [], [], item.arquivo);
    if (item.extra) achadas = achadas.concat(trocas(item.extra.original, item.extra.dados, [], [], item.extra.arquivo));
    return achadas;
  }

  async function previsualiza() {
    var item = estado.item;
    var lista = todasAsTrocas();
    if (!lista.length) {
      recado(A.avisos.previa_sem_troca);
      return;
    }
    ocupado(el.previsualizar, true);
    try {
      var r = await chama("/previa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endereco: item.endereco, trocas: lista }),
      });
      el.quadroPrevia.srcdoc = r.html;
      el.previa.hidden = false;
      var aviso = A.avisos.previa_estrutura;
      if (r.ausentes.length) aviso = A.avisos.previa_ausente + " " + r.ausentes.join(", ");
      el.avisoPrevia.textContent = aviso;
      recado("");
    } catch (e) {
      recado(e.message, "erro");
    } finally {
      ocupado(el.previsualizar, false);
    }
  }

  function acende(campo, mensagem) {
    var div = campo ? estado.campos[campo] : null;
    if (!div) return false;
    div.className = "campo-painel errado";
    var antigo = div.querySelector(".erro");
    if (antigo) antigo.remove();
    div.appendChild(cria("p", "erro", mensagem));
    div.scrollIntoView({ block: "center" });
    var entrada = div.querySelector("input, textarea");
    if (entrada) entrada.focus();
    return true;
  }

  async function gravaArquivo(arquivo, dados, item) {
    return chama("/arquivo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caminho: arquivo, colecao: item.colecao, item: item.rotulo, dados: dados }),
    });
  }

  async function publica() {
    var item = estado.item;
    ocupado(el.publicar, true);
    try {
      var r = await gravaArquivo(item.arquivo, item.dados, item);
      var mudou = r.gravado;
      if (item.extra) {
        var r2 = await gravaArquivo(item.extra.arquivo, item.extra.dados, item);
        mudou = mudou || r2.gravado;
      }
      if (!mudou) {
        recado(A.avisos.sem_mudanca);
        return;
      }
      recado(A.avisos.publicado, "bom");
      item.original = JSON.parse(JSON.stringify(item.dados));
      if (item.extra) item.extra.original = JSON.parse(JSON.stringify(item.extra.dados));
      await atualizaEstado();
      await mostraHistorico();
    } catch (e) {
      if (!acende(e.campo, e.message)) recado(e.message, "erro");
      else recado(e.message, "erro");
    } finally {
      ocupado(el.publicar, false);
    }
  }

  async function reverte() {
    var item = estado.item;
    if (!window.confirm(A.avisos.confirmar_reverter)) return;
    ocupado(el.reverter, true);
    try {
      var r = await chama("/reverter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: item.arquivo }),
      });
      recado(r.revertido ? A.avisos.revertido : A.avisos.sem_mudanca, r.revertido ? "bom" : null);
      if (r.revertido) {
        await abre(item);
        await atualizaEstado();
        await mostraHistorico();
      }
    } catch (e) {
      recado(e.message, "erro");
    } finally {
      ocupado(el.reverter, false);
    }
  }

  function ocupado(botao, sim) {
    botao.disabled = sim;
    if (sim) botao.setAttribute("aria-busy", "true");
    else botao.removeAttribute("aria-busy");
  }

  // -------------------------------------------------------------------------
  // Imagens
  // -------------------------------------------------------------------------

  function mostraAssets() {
    limpa(el.formulario);
    el.acoes.hidden = true;
    estado.conta.assets.forEach(function (nome) {
      var linha = cria("div", "asset");
      var img = cria("img");
      img.src = "/assets/" + nome;
      img.alt = nome;
      linha.appendChild(img);
      var lado = cria("div");
      lado.appendChild(cria("p", "nome", nome));
      var entrada = cria("input");
      entrada.type = "file";
      entrada.accept = "image/*";
      entrada.addEventListener("change", function () {
        if (entrada.files && entrada.files[0]) envia(nome, entrada.files[0]);
      });
      lado.appendChild(entrada);
      linha.appendChild(lado);
      el.formulario.appendChild(linha);
    });
  }

  function envia(nome, arquivo) {
    var leitor = new FileReader();
    leitor.onload = async function () {
      var base64 = String(leitor.result).split(",")[1];
      recado(A.carregando);
      try {
        await chama("/asset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome, base64: base64 }),
        });
        recado(A.avisos.asset_enviado, "bom");
        await atualizaEstado();
        await mostraHistorico();
      } catch (e) {
        recado(e.message, "erro");
      }
    };
    leitor.readAsDataURL(arquivo);
  }

  // -------------------------------------------------------------------------
  // Estado do deploy e histórico
  // -------------------------------------------------------------------------

  async function atualizaEstado() {
    try {
      estado.conta = await chama("/estado");
    } catch (e) {
      recado(e.message, "erro");
      return;
    }
    el.email.textContent = estado.conta.email;
    el.estado.className = "estado" + (estado.conta.publicando ? " publicando" : "");
    el.estado.textContent = estado.conta.publicando ? A.avisos.publicando : A.avisos.em_dia;
    if (estado.conta.publicando) {
      // A publicação é assíncrona: o commit existe antes do site mudar. O
      // painel volta a perguntar até o site no ar ser o da última edição.
      window.clearTimeout(estado.relogio);
      estado.relogio = window.setTimeout(atualizaEstado, 15000);
    }
  }

  async function mostraHistorico() {
    limpa(el.historico);
    try {
      var r = await chama("/historico?limite=10");
      if (!r.commits.length) {
        el.historico.appendChild(cria("li", "vazio", A.historico.vazio));
        return;
      }
      r.commits.forEach(function (c) {
        var li = cria("li");
        li.appendChild(cria("span", null, c.mensagem));
        if (c.quando) li.appendChild(cria("span", "quando", " · " + new Date(c.quando).toLocaleString("pt-BR")));
        el.historico.appendChild(li);
      });
    } catch (e) {
      el.historico.appendChild(cria("li", "vazio", e.message));
    }
  }

  // -------------------------------------------------------------------------

  el.previsualizar.textContent = A.botoes.previsualizar;
  el.publicar.textContent = A.botoes.publicar;
  el.reverter.textContent = A.botoes.reverter;
  el.fecharPrevia.textContent = A.botoes.fechar_previa;

  el.previsualizar.addEventListener("click", previsualiza);
  el.publicar.addEventListener("click", publica);
  el.reverter.addEventListener("click", reverte);
  el.fecharPrevia.addEventListener("click", function () {
    el.previa.hidden = true;
    el.quadroPrevia.srcdoc = "";
  });

  (async function () {
    await atualizaEstado();
    if (!estado.conta) return;
    mostraColecoes();
    await mostraHistorico();
  })();
})();
