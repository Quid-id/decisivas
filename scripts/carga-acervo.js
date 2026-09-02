// DECISIVAS — carga do acervo no D1 (etapa 3).
//
// Lê dados/DECISIVAS_acervo_v5.xlsx, valida cada linha contra as restrições da
// migração 003, e grava os comandos em blocos .sql numerados em carga-003/,
// prontos para colar no console do painel do Cloudflare.
//
// Substitui o antigo scripts/csv-para-seed.js, que lia CSV e escrevia para o
// schema anterior à 003.
//
// Uso:
//   npm install                       # uma vez, traz o exceljs
//   node scripts/carga-acervo.js      # valida, relata e grava carga-003/
//
// Opções por variável de ambiente:
//   ACERVO=caminho.xlsx     outra planilha (padrão: dados/DECISIVAS_acervo_v5.xlsx)
//   SAIDA=pasta             outra pasta de saída (padrão: carga-003)
//   KB_POR_BLOCO=90         alvo de tamanho por comando INSERT
//
// Por que blocos de 90 KB: o D1 recusa comando acima de 96 KiB com
// "statement too long: SQLITE_TOOBIG" — medido contra o D1 local, que passa em
// 94,8 KB e falha em 97,8 KB. 90 KB deixa margem e dá a mesma contagem de
// blocos. Um comando por bloco é o maior pedaço que o D1 aceita com certeza;
// juntar mais depende de um limite do console que não conseguimos medir.
//
// A carga é idempotente: o bloco 1 limpa a tabela antes dos INSERTs, então
// rodar tudo de novo substitui, não duplica. Ele também limpa o cache, porque
// o acervo novo invalida as páginas já geradas.

const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const VOCABULARIO = require("../dados/vocabulario.json");

const ACERVO = process.env.ACERVO ?? "dados/DECISIVAS_acervo_v5.xlsx";
const PAUTAS = "dados/DECISIVAS_pautas_de_para_v1.xlsx";
const SAIDA = process.env.SAIDA ?? "carga-003";
const KB_POR_BLOCO = Number(process.env.KB_POR_BLOCO ?? 90);

// As nove colunas da migração 003, na ordem do schema.
const COLUNAS = ["id", "texto", "publico", "macronarrativa", "pauta", "tipo", "forca", "link", "pagina"];

const PUBLICOS = new Set(VOCABULARIO.publicos.map((p) => p.id));
const MACRONARRATIVAS = new Set(VOCABULARIO.macronarrativas.map((m) => m.id));
const TIPOS = new Set(VOCABULARIO.tipos);
const FORCAS = new Set(VOCABULARIO.forcas);

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

// Célula vazia, em qualquer das formas que o xlsx usa, vira null — que é o que
// o banco guarda. Texto rico vira texto simples.
function valorDaCelula(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && Array.isArray(v.richText)) {
    v = v.richText.map((r) => r.text).join("");
  }
  const s = String(v);
  return s === "" ? null : s;
}

async function leAba(caminho, aba) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.getWorksheet(aba);
  if (!ws) throw new Error(`aba "${aba}" não existe em ${caminho}`);
  const cabecalho = ws.getRow(1).values.slice(1).map((c) => String(c ?? "").trim());
  const linhas = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const celulas = row.values.slice(1);
    const registro = {};
    cabecalho.forEach((c, i) => { registro[c] = valorDaCelula(celulas[i]); });
    if (Object.values(registro).some((v) => v !== null)) registro.__linha = n;
    if (Object.values(registro).some((v) => v !== null && v !== n)) linhas.push(registro);
  });
  return { cabecalho, linhas };
}

// ---------------------------------------------------------------------------
// Validação: as restrições da migração 003, uma a uma
// ---------------------------------------------------------------------------

function valida(linhas, pautasValidas) {
  const problemas = [];
  const vistos = new Map();
  const anota = (l, regra, detalhe) =>
    problemas.push({ linha: l.__linha, id: l.id ?? "(sem id)", regra, detalhe });

  for (const l of linhas) {
    if (!l.id) anota(l, "id obrigatório", "célula vazia");
    else if (vistos.has(l.id)) anota(l, "id único", `repetido; já aparece na linha ${vistos.get(l.id)}`);
    else vistos.set(l.id, l.__linha);

    if (!l.texto) anota(l, "texto obrigatório", "célula vazia");

    if (!l.publico) anota(l, "publico obrigatório", "célula vazia");
    else if (!PUBLICOS.has(l.publico)) anota(l, "publico na lista fechada", `valor "${l.publico}"`);

    if (!l.tipo) anota(l, "tipo obrigatório", "célula vazia");
    else if (!TIPOS.has(l.tipo)) anota(l, "tipo na lista fechada", `valor "${l.tipo}"`);

    const ehPerfil = l.tipo === "perfil";

    if (l.macronarrativa === null) {
      if (!ehPerfil) anota(l, "macronarrativa vazia só em perfil", `tipo "${l.tipo}"`);
    } else if (!MACRONARRATIVAS.has(l.macronarrativa)) {
      anota(l, "macronarrativa na lista fechada", `valor "${l.macronarrativa}"`);
    }

    if (l.pauta === null) {
      if (!ehPerfil) anota(l, "pauta vazia só em perfil", `tipo "${l.tipo}"`);
    } else if (!pautasValidas.has(l.pauta)) {
      anota(l, "pauta existe na tabela pautas", `valor "${l.pauta}" não está entre as ${pautasValidas.size}`);
    }

    if (l.tipo === "achado") {
      if (l.forca === null) anota(l, "achado tem força", "célula vazia");
      else if (!FORCAS.has(l.forca)) anota(l, "forca na lista fechada", `valor "${l.forca}"`);
    } else if (l.forca !== null) {
      anota(l, "força só em achado", `tipo "${l.tipo}" com força "${l.forca}"`);
    }

    // Etapa 2: "link sempre vazio nesta versão. A coluna existe, não se usa."
    if (l.link !== null) anota(l, "link vazio nesta versão", `valor "${l.link}"`);
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

function contagens(linhas) {
  const conta = (fn) => linhas.reduce((m, l) => (m.set(fn(l), (m.get(fn(l)) ?? 0) + 1), m), new Map());
  const ordenado = (m) => [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  return {
    porPublico: ordenado(conta((l) => l.publico)),
    porTema: ordenado(conta((l) => l.macronarrativa ?? "(perfil, sem tema)")),
    porTipo: ordenado(conta((l) => l.tipo)),
    porForca: ordenado(conta((l) => l.forca ?? "(sem força)")),
    perfilPorPublico: ordenado(conta((l) => (l.tipo === "perfil" ? l.publico : "__"))).filter(([k]) => k !== "__"),
    cruzamentos: new Set(linhas.filter((l) => l.tipo !== "perfil").map((l) => `${l.publico}|${l.macronarrativa}`)),
    pautasUsadas: new Set(linhas.filter((l) => l.pauta).map((l) => l.pauta)),
  };
}

function imprimeRelatorio(linhas, c) {
  const linha = (r) => console.log("  " + r);
  console.log(`\n=== Acervo: ${ACERVO} ===`);
  console.log(`linhas lidas: ${linhas.length}\n`);

  console.log("por público:");
  for (const [k, n] of c.porPublico) linha(`${String(k).padEnd(36)} ${String(n).padStart(5)}`);
  console.log("\npor tema:");
  for (const [k, n] of c.porTema) linha(`${String(k).padEnd(36)} ${String(n).padStart(5)}`);
  console.log("\npor tipo:");
  for (const [k, n] of c.porTipo) linha(`${String(k).padEnd(36)} ${String(n).padStart(5)}`);
  console.log("\nforça (só em achado):");
  for (const [k, n] of c.porForca) linha(`${String(k).padEnd(36)} ${String(n).padStart(5)}`);
  console.log("\ntrechos de tipo perfil, por público:");
  for (const [k, n] of c.perfilPorPublico) linha(`${String(k).padEnd(36)} ${String(n).padStart(5)}`);

  console.log(`\ncruzamentos com trechos: ${c.cruzamentos.size} de 20`);
  console.log(`pautas usadas: ${c.pautasUsadas.size} de 59`);

  // Cruzamento × tipo: é a contagem que a especificação pede para conferir.
  console.log("\npor público × tema × tipo:");
  const tipos = VOCABULARIO.tipos.filter((t) => linhas.some((l) => l.tipo === t));
  linha(`${"cruzamento".padEnd(52)} ${tipos.map((t) => t.slice(0, 8).padStart(9)).join("")}   total`);
  const chaves = [...c.cruzamentos].sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const k of chaves) {
    const [pu, ma] = k.split("|");
    const sub = linhas.filter((l) => l.publico === pu && l.macronarrativa === ma && l.tipo !== "perfil");
    const cols = tipos.map((t) => String(sub.filter((l) => l.tipo === t).length).padStart(9)).join("");
    linha(`${`${pu} × ${ma}`.padEnd(52)} ${cols}   ${String(sub.length).padStart(5)}`);
  }
}

// ---------------------------------------------------------------------------
// Emissão dos blocos
// ---------------------------------------------------------------------------

const cita = (v) => (v === null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");

function blocos(linhas) {
  const prefixo = `INSERT INTO trechos (${COLUNAS.join(", ")}) VALUES `;
  const alvo = KB_POR_BLOCO * 1024;
  const inserts = [];
  let atual = null;

  for (const l of linhas) {
    const tupla = "(" + COLUNAS.map((c) => cita(l[c])).join(", ") + ")";
    if (atual === null) {
      atual = { sql: prefixo + tupla, n: 1 };
    } else {
      const candidato = atual.sql + ", " + tupla;
      if (Buffer.byteLength(candidato + ";") > alvo) {
        inserts.push({ sql: atual.sql + ";", n: atual.n });
        atual = { sql: prefixo + tupla, n: 1 };
      } else {
        atual.sql = candidato; atual.n += 1;
      }
    }
  }
  if (atual) inserts.push({ sql: atual.sql + ";", n: atual.n });

  const limpeza =
    "DELETE FROM trechos;\nDELETE FROM paginas;\nDELETE FROM formatos;";
  const verificacao =
    "SELECT (SELECT COUNT(*) FROM trechos) AS trechos, " +
    "(SELECT COUNT(DISTINCT publico || '|' || macronarrativa) FROM trechos WHERE tipo <> 'perfil') AS cruzamentos, " +
    "(SELECT COUNT(*) FROM trechos WHERE tipo = 'perfil') AS perfil, " +
    "(SELECT COUNT(*) FROM trechos WHERE tipo = 'achado' AND forca = 'forte') AS achados_forte, " +
    "(SELECT COUNT(DISTINCT pauta) FROM trechos WHERE pauta IS NOT NULL) AS pautas_usadas, " +
    "(SELECT COUNT(*) FROM paginas) AS paginas, (SELECT COUNT(*) FROM formatos) AS formatos;";

  return [
    { nome: "limpeza", descricao: "apaga o acervo anterior e invalida o cache", sql: limpeza },
    ...inserts.map((i, k) => ({
      nome: `insert-${String(k + 1).padStart(2, "0")}`,
      descricao: `${i.n} trechos`,
      sql: i.sql,
    })),
    { nome: "verificacao", descricao: "confere a carga", sql: verificacao },
  ];
}

// ---------------------------------------------------------------------------

async function main() {
  const { cabecalho, linhas } = await leAba(ACERVO, "acervo");
  const faltando = COLUNAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length) {
    console.error(`ERRO: a planilha não tem as colunas ${faltando.join(", ")}.`);
    console.error(`colunas encontradas: ${cabecalho.join(", ")}`);
    process.exit(1);
  }

  const dePara = await leAba(PAUTAS, "pautas_de_para");
  const pautasValidas = new Set(dePara.linhas.map((l) => l.pauta_consolidada).filter(Boolean));

  const c = contagens(linhas);
  imprimeRelatorio(linhas, c);

  // Validar ANTES de gravar: uma linha fora das restrições aborta a carga.
  const problemas = valida(linhas, pautasValidas);
  console.log(`\n=== Validação contra as restrições da migração 003 ===`);
  if (problemas.length) {
    console.log(`${problemas.length} problema(s). Nada foi gravado.\n`);
    const porRegra = new Map();
    for (const p of problemas) porRegra.set(p.regra, (porRegra.get(p.regra) ?? 0) + 1);
    for (const [regra, n] of [...porRegra.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)} × ${regra}`);
    }
    console.log("\nprimeiras 40 ocorrências:");
    for (const p of problemas.slice(0, 40)) {
      console.log(`  linha ${String(p.linha).padStart(5)}  ${p.id.padEnd(20)} ${p.regra}: ${p.detalhe}`);
    }
    if (problemas.length > 40) console.log(`  ... e ${problemas.length - 40} outras`);
    process.exit(1);
  }
  console.log(`nenhuma linha rejeitada: as ${linhas.length} passam nas nove restrições.`);

  const partes = blocos(linhas);
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
  console.log(`\n=== Blocos em ${SAIDA}/ (alvo de ${KB_POR_BLOCO} KB por comando) ===`);
  partes.forEach((p, i) => {
    const arquivo = path.join(SAIDA, `${String(i + 1).padStart(2, "0")}-${p.nome}.sql`);
    fs.writeFileSync(arquivo, p.sql + "\n", "utf8");
    const kb = (Buffer.byteLength(p.sql) / 1024).toFixed(1);
    console.log(`  ${path.basename(arquivo).padEnd(24)} ${kb.padStart(7)} KB   ${p.descricao}`);
  });

  const somaTuplas = partes.filter((p) => p.nome.startsWith("insert")).reduce((s, p) => s + Number(p.descricao.split(" ")[0]), 0);
  console.log(`\ntotal: ${partes.length} blocos, ${somaTuplas} trechos.`);
  if (somaTuplas !== linhas.length) {
    console.error(`ERRO: os blocos somam ${somaTuplas} trechos, e a planilha tem ${linhas.length}.`);
    process.exit(1);
  }

  console.log(`
Para aplicar no console do painel (dash.cloudflare.com → Storage & Databases →
D1 SQL Database → decisivas → Console), cole um arquivo por vez, na ordem
numerada. O primeiro apaga o acervo anterior, então recomeçar é executar de
novo a partir dele — nunca colar um bloco do meio isolado.

Com wrangler autenticado, o equivalente é:
  for f in ${SAIDA}/*.sql; do npx wrangler d1 execute decisivas --remote --file="$f"; done

Depois da carga: atualize dados/versao-acervo.txt e ACERVO_ATUALIZADO_EM no
wrangler.toml, faça o deploy, e regenere o cache (docs/06-operacao.md).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
