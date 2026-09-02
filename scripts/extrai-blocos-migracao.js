// DECISIVAS — extrai os blocos de uma migração do docs/06-operacao.md para
// arquivos .sql numerados, prontos para colar no console do painel.
//
// Existe para que ninguém precise transcrever SQL à mão: o docs/06 é a fonte,
// e este script só recorta. Transcrever à mão já introduziu erro uma vez.
//
// Uso:  node scripts/extrai-blocos-migracao.js 003 [pasta-de-saida]

const fs = require("node:fs");
const path = require("node:path");

const numero = process.argv[2];
const saida = process.argv[3] ?? `migracao-${numero}`;
if (!numero) {
  console.error("uso: node scripts/extrai-blocos-migracao.js <numero> [pasta]");
  process.exit(1);
}

const doc = fs.readFileSync("docs/06-operacao.md", "utf8");
const inicio = doc.indexOf(`### Migração ${numero}`);
if (inicio === -1) {
  console.error(`Migração ${numero} não encontrada em docs/06-operacao.md`);
  process.exit(1);
}
// A seção termina no próximo título OU no marcador "Depois da verificação",
// porque o comando que vem depois dele é o teste que DEVE falhar, não migração.
const proximoTitulo = doc.indexOf("\n### ", inicio + 1);
const posTeste = doc.indexOf("**Depois da verificação**", inicio);
const limites = [proximoTitulo, posTeste].filter((i) => i !== -1);
const secao = doc.slice(inicio, limites.length ? Math.min(...limites) : undefined);

const blocos = [...secao.matchAll(/```sql\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());
if (!blocos.length) {
  console.error("nenhum bloco sql encontrado na seção");
  process.exit(1);
}

fs.mkdirSync(saida, { recursive: true });
blocos.forEach((sql, i) => {
  const n = String(i + 1).padStart(2, "0");
  fs.writeFileSync(path.join(saida, `bloco${n}.sql`), sql + "\n", "utf8");
  const uma = !sql.includes("\n") && (sql.match(/;/g) || []).length === 1;
  console.log(`bloco ${n}: ${sql.length} caracteres${uma ? "" : "  <-- ATENÇÃO: não é um comando numa linha só"}`);
});
console.log(`\n${blocos.length} blocos em ${saida}/ — cole um por vez, na ordem.`);
