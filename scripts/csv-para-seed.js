// DECISIVAS — converte o CSV da planilha de etiquetagem em seed.sql
//
// COMO RODAR:
//
//   node scripts/csv-para-seed.js <trechos.csv> [documentos.csv] [saida.sql]
//
//   node scripts/csv-para-seed.js data/amostra.csv            # desenvolvimento
//   node scripts/csv-para-seed.js export.csv cabecalhos.csv   # carga oficial
//
// O que faz:
// - Lê o CSV de trechos exportado da Fila de revisão (mesmas colunas de
//   data/amostra.csv). Se existir a coluna de decisão ("decisao"/"decisão"),
//   só entram linhas com "aceitar" ou "corrigir e aceitar".
// - Valida os vocabulários fechados do CLAUDE.md; linha fora deles é recusada.
// - Recusa macronarrativa CONFERIR e qualquer linha com alerta VETO.
// - Lê, se fornecido, o CSV da aba Cabeçalhos (colunas: id_documento, fonte,
//   autoria, metodo, periodo, base, risco). Sem ele, gera documentos com
//   campos "A PREENCHER" — serve só para desenvolvimento local.
// - O campo interno de motivo de restrição NUNCA entra no seed: qualquer
//   coluna cujo nome contenha "motivo" é descartada na leitura.
// - Escreve seed.sql (INSERTs para documentos e trechos) e imprime o
//   relatório de aceitas e recusadas com o motivo de cada recusa.
//
// Aplicar no D1 (documentado em docs/06-operacao.md):
//   local:  npx wrangler d1 execute decisivas --local  --file=seed.sql
//   remoto: npx wrangler d1 execute decisivas --remote --file=seed.sql

const fs = require("node:fs");

// ATENÇÃO: este script escreve para o schema ANTERIOR à migração 003 (colunas
// base, despersonalizado, id_documento) e lê CSV. Ele é substituído na etapa 3
// por um carregador do xlsx contra o schema novo. Está aqui só pelo histórico:
// rodá-lo hoje gera INSERTs que o banco recusa.
//
// Vocabulários fechados: fonte única em dados/vocabulario.json.
const VOCABULARIO = require("../dados/vocabulario.json");
const PUBLICOS = VOCABULARIO.publicos.map((p) => p.id);
const MACRONARRATIVAS = VOCABULARIO.macronarrativas.map((m) => m.id);
const TIPOS = VOCABULARIO.tipos;
const FORCAS = VOCABULARIO.forcas;
const BASES = ["geral", "restrita"];
const DECISOES_ACEITAS = ["aceitar", "corrigir e aceitar"];

// ---------- CSV (RFC 4180: aspas, vírgulas e quebras de linha em campos) ----------

function parseCsv(texto) {
  const linhas = [];
  let linha = [];
  let campo = "";
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreAspas = false;
      } else campo += c;
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ",") {
      linha.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

// Transforma em objetos usando o cabeçalho, descartando desde a leitura
// qualquer coluna de motivo de restrição (nunca sai da planilha).
function lerCsv(caminho) {
  const linhas = parseCsv(fs.readFileSync(caminho, "utf8"));
  const cabecalho = linhas[0].map((c) => c.trim().toLowerCase());
  return linhas.slice(1).map((valores, n) => {
    const obj = { _linha: n + 2 };
    cabecalho.forEach((coluna, i) => {
      if (coluna.includes("motivo")) return; // campo interno: fica de fora
      const valor = (valores[i] ?? "").trim();
      // Convenção da planilha: "-" significa "não se aplica" → campo vazio.
      obj[coluna] = valor === "-" ? "" : valor;
    });
    return obj;
  });
}

// ---------- SQL ----------

function sql(valor) {
  if (valor === null || valor === undefined || valor === "") return "NULL";
  return `'${String(valor).replace(/'/g, "''")}'`;
}

// ---------- Validação dos trechos ----------

function validaTrecho(t) {
  const erros = [];
  const decisao = (t["decisao"] ?? t["decisão"] ?? "").toLowerCase();
  if ((t["decisao"] !== undefined || t["decisão"] !== undefined) &&
      !DECISOES_ACEITAS.includes(decisao)) {
    erros.push(`decisão "${decisao || "(vazia)"}" não é aceitar/corrigir e aceitar`);
  }
  if ((t.alerta ?? "").toUpperCase().includes("VETO")) erros.push("alerta VETO");
  if ((t.macronarrativa ?? "").toUpperCase() === "CONFERIR")
    erros.push("macronarrativa CONFERIR (pendente de revisão)");

  if (!t.id) erros.push("id vazio");
  if (!t.texto) erros.push("texto vazio");
  if (!t.id_documento) erros.push("id_documento vazio");
  if (!t.pauta) erros.push("pauta vazia");
  if (!PUBLICOS.includes(t.publico)) erros.push(`publico "${t.publico}" fora do vocabulário`);
  if (!MACRONARRATIVAS.includes(t.macronarrativa) &&
      (t.macronarrativa ?? "").toUpperCase() !== "CONFERIR")
    erros.push(`macronarrativa "${t.macronarrativa}" fora do vocabulário`);
  if (!TIPOS.includes(t.tipo)) erros.push(`tipo "${t.tipo}" fora do vocabulário`);
  if (t.forca && !FORCAS.includes(t.forca)) erros.push(`força "${t.forca}" fora do vocabulário`);
  if (!BASES.includes(t.base)) erros.push(`base "${t.base}" fora do vocabulário`);
  return erros;
}

// ---------- Principal ----------

function main() {
  const [, , arquivoTrechos, arquivoDocumentos, arquivoSaida] = process.argv;
  if (!arquivoTrechos) {
    console.error("Uso: node scripts/csv-para-seed.js <trechos.csv> [documentos.csv] [saida.sql]");
    process.exit(1);
  }
  const saida = arquivoSaida ?? "seed.sql";

  const trechosBrutos = lerCsv(arquivoTrechos);
  const aceitos = [];
  const recusados = [];
  for (const t of trechosBrutos) {
    const erros = validaTrecho(t);
    if (erros.length) recusados.push({ id: t.id || `linha ${t._linha}`, erros });
    else aceitos.push(t);
  }

  // Documentos: da aba Cabeçalhos quando fornecida; senão, esqueleto de
  // desenvolvimento com os ids encontrados nos trechos aceitos.
  const idsDocumentos = [...new Set(aceitos.map((t) => t.id_documento))].sort();
  let documentos;
  let documentosPlaceholder = false;
  if (arquivoDocumentos) {
    documentos = lerCsv(arquivoDocumentos).filter((d) => idsDocumentos.includes(d.id_documento));
    for (const d of documentos) {
      if (!d.fonte || !d.metodo || !d.periodo || !BASES.includes(d.base)) {
        console.error(`ERRO em documentos: ${d.id_documento} sem fonte/metodo/periodo ou base inválida.`);
        process.exit(1);
      }
      if (d.risco && !["baixo", "alto"].includes(d.risco)) {
        console.error(`ERRO em documentos: risco "${d.risco}" inválido em ${d.id_documento}.`);
        process.exit(1);
      }
    }
    const faltando = idsDocumentos.filter((id) => !documentos.some((d) => d.id_documento === id));
    if (faltando.length) {
      console.error(`ERRO: documentos citados pelos trechos e ausentes do CSV de cabeçalhos: ${faltando.join(", ")}`);
      process.exit(1);
    }
  } else {
    documentosPlaceholder = true;
    documentos = idsDocumentos.map((id) => ({
      id_documento: id,
      fonte: "A PREENCHER",
      autoria: "",
      metodo: "A PREENCHER",
      periodo: "A PREENCHER",
      base: "restrita", // valor conservador até vir a aba Cabeçalhos
      risco: "",
    }));
  }

  // ---------- seed.sql ----------
  const linhas = [];
  linhas.push("-- seed.sql — gerado por scripts/csv-para-seed.js. Não editar à mão.");
  linhas.push(`-- Origem: ${arquivoTrechos}${arquivoDocumentos ? " + " + arquivoDocumentos : ""}`);
  linhas.push(`-- Trechos aceitos: ${aceitos.length} | recusados: ${recusados.length}`);
  if (documentosPlaceholder) {
    linhas.push("-- ATENÇÃO: documentos com campos A PREENCHER (sem CSV de cabeçalhos).");
    linhas.push("-- Este seed serve para DESENVOLVIMENTO, não para a carga oficial.");
  }
  linhas.push("");
  linhas.push("DELETE FROM trechos;");
  linhas.push("DELETE FROM documentos;");
  linhas.push("");
  for (const d of documentos) {
    linhas.push(
      `INSERT INTO documentos (id_documento, fonte, autoria, metodo, periodo, base, risco) VALUES (` +
      [d.id_documento, d.fonte, d.autoria, d.metodo, d.periodo, d.base, d.risco].map(sql).join(", ") + `);`
    );
  }
  linhas.push("");
  for (const t of aceitos) {
    linhas.push(
      `INSERT INTO trechos (id, texto, publico, macronarrativa, pauta, tipo, forca, base, despersonalizado, link, pagina, id_documento) VALUES (` +
      [t.id, t.texto, t.publico, t.macronarrativa, t.pauta, t.tipo, t.forca,
       t.base, t.despersonalizado || "nao", t.link, t.pagina, t.id_documento].map(sql).join(", ") + `);`
    );
  }
  linhas.push("");
  fs.writeFileSync(saida, linhas.join("\n"), "utf8");

  // ---------- Relatório ----------
  console.log(`Lidas:     ${trechosBrutos.length} linha(s) de ${arquivoTrechos}`);
  console.log(`Aceitas:   ${aceitos.length}`);
  console.log(`Recusadas: ${recusados.length}`);
  for (const r of recusados) console.log(`  - ${r.id}: ${r.erros.join("; ")}`);
  console.log(`Documentos: ${documentos.length}${documentosPlaceholder ? " (placeholder — só desenvolvimento)" : ""}`);
  console.log(`Seed gravado em ${saida}`);
  console.log("\nAplicar no D1:");
  console.log(`  local:  npx wrangler d1 execute decisivas --local  --file=${saida}`);
  console.log(`  remoto: npx wrangler d1 execute decisivas --remote --file=${saida}`);
}

main();
