// DECISIVAS — varredura de termos bloqueados, em módulo compartilhado.
//
// Lugar único da regra 4 aplicada a texto: a mesma varredura que o build roda
// sobre `conteudo/*.json` e `dados/configuracao.json` (etapa 8C) roda no Worker
// antes de o CMS gravar qualquer arquivo (etapa 9). Duas implementações
// divergiriam, e divergência aqui significa termo passando por um caminho e
// sendo barrado no outro.
//
// `.cjs` de propósito: `scripts/*.js` são CommonJS e o Worker é ESM. A extensão
// explícita deixa os dois lados carregarem o mesmo arquivo sem ambiguidade.
//
// COMO A COMPARAÇÃO FUNCIONA (igual ao que docs/06 documenta)
//
// Sempre por palavra inteira: sigla curta não dispara dentro de outra palavra
// ("PT" não casa em "parte", "PL" não casa em "plano").
//
//   - SIGLA (só maiúsculas, admitindo conector curto em minúscula, como em
//     `PCdoB`): comparação SENSÍVEL a maiúsculas.
//   - NOME (tudo o mais: pessoas, partidos por extenso, adjetivos como
//     "petista"): comparação INSENSÍVEL a maiúsculas e a acentos.

// A lista chega como texto de variável de ambiente. Separador `|`; a vírgula é
// aceita para não depender do formato com que a lista foi salva no painel.
function listaDeTermos(bruto) {
  return String(bruto ?? "")
    .split(/[|,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function ehSigla(termo) {
  return /^\p{Lu}{2,}(?:\p{Ll}{1,3}\p{Lu}+)*$/u.test(termo);
}

function semAcento(texto) {
  return String(texto).normalize("NFD").replace(/\p{M}/gu, "");
}

function escapaRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cada termo virou um padrão de palavra inteira, com o modo de comparação que
// ele pede. O padrão é montado uma vez, e não a cada campo.
function padroes(lista) {
  return lista.map((termo) => {
    const sigla = ehSigla(termo);
    const alvo = sigla ? termo : semAcento(termo);
    return {
      termo,
      sigla,
      padrao: new RegExp(
        `(?<![\\p{L}\\p{N}])${escapaRegex(alvo)}(?![\\p{L}\\p{N}])`,
        sigla ? "gu" : "giu"
      ),
    };
  });
}

// Caminho legível do campo, do tipo `paginas["trabalho digno"].resumo[2]`. É o
// que o build imprime e o que o CMS usa para acender o campo certo no
// formulário.
function juntaCaminho(base, chave) {
  if (typeof chave === "number") return `${base}[${chave}]`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) return base ? `${base}.${chave}` : chave;
  return `${base}["${chave}"]`;
}

// Todo texto de uma estrutura, com o caminho de cada um.
function textos(valor, caminho, destino) {
  if (typeof valor === "string") {
    destino.push({ campo: caminho, texto: valor });
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => textos(item, juntaCaminho(caminho, i), destino));
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [chave, dentro] of Object.entries(valor)) {
      textos(dentro, juntaCaminho(caminho, chave), destino);
    }
  }
}

// Um trecho curto em volta da ocorrência, para achar a frase.
function trecho(texto, posicao) {
  const inicio = Math.max(0, posicao - 50);
  return (inicio ? "…" : "") + texto.slice(inicio, posicao + 50).replace(/\s+/g, " ") + "…";
}

// Varre uma estrutura já em memória. Devolve uma ocorrência por achado, com
// campo, termo e trecho. `arquivo` entra só para a mensagem.
function varreValor(valor, compilados, arquivo) {
  const encontrados = [];
  textos(valor, "", encontrados);
  const ocorrencias = [];
  for (const { campo, texto } of encontrados) {
    for (const { termo, sigla, padrao } of compilados) {
      const alvo = sigla ? texto : semAcento(texto);
      padrao.lastIndex = 0;
      for (const achado of alvo.matchAll(padrao)) {
        ocorrencias.push({ arquivo, campo, termo, trecho: trecho(texto, achado.index) });
      }
    }
  }
  return { ocorrencias, campos: encontrados.length };
}

module.exports = {
  listaDeTermos,
  ehSigla,
  semAcento,
  padroes,
  juntaCaminho,
  textos,
  trecho,
  varreValor,
};
