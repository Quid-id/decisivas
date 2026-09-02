# Operação

Passo a passo das tarefas de operação do DECISIVAS: o banco, as migrações e o
build. Atualizado na etapa 8C, com a verificação de conteúdo que roda no
build.

Todos os comandos rodam na raiz do repositório. O `wrangler` (a ferramenta
de linha de comando do Cloudflare) já está instalado como dependência do
projeto: rode `npm install` uma vez e use sempre `npx wrangler ...`.

## Banco de dados D1

O banco chama-se `decisivas`. Existem duas cópias independentes:

- **local** (`--local`): um arquivo SQLite na pasta `.wrangler/` da sua
  máquina, usado pelo `wrangler dev`. Pode ser recriado à vontade.
- **remoto** (`--remote`): o banco de produção no Cloudflare. Só recebe a
  carga oficial (linhas com decisão `aceitar` ou `corrigir e aceitar`).

### Criar o banco remoto (uma única vez)

```sh
npx wrangler login                 # abre o navegador para autorizar
npx wrangler d1 create decisivas
```

O comando imprime um `database_id`. Cole esse valor no campo
`database_id` do bloco `[[d1_databases]]` do `wrangler.toml`
(hoje está como `PREENCHER-APOS-CRIAR-O-BANCO`) e faça commit.
O banco local não precisa desse passo: ele é criado na primeira execução.

### Aplicar o schema (cria as seis tabelas)

```sh
# local
npx wrangler d1 execute decisivas --local --file=docs/02-schema.sql

# remoto
npx wrangler d1 execute decisivas --remote --file=docs/02-schema.sql
```

O schema só é aplicado em banco vazio. Para recriar o banco local do zero,
apague a pasta `.wrangler/` e rode o comando de novo.

### Gerar os blocos de carga a partir da planilha

```sh
node scripts/carga-acervo.js
```

O script lê `dados/DECISIVAS_acervo_v5.xlsx` (aba `acervo`) e
`dados/DECISIVAS_pautas_de_para_v1.xlsx` (aba `pautas_de_para`, só para
conferir a chave estrangeira), valida cada linha contra as **restrições da
migração 003** e grava os blocos em `carga-acervo/`. O que é verificado, com o
número da linha da planilha em cada recusa:

- `id` presente e único no arquivo;
- `texto` presente;
- `publico` e `tipo` nos vocabulários fechados de `dados/vocabulario.json`;
- `macronarrativa` e `pauta` vazias **somente** quando `tipo = 'perfil'`;
- `pauta` existente na tabela `pautas` (as 59 da planilha de/para);
- `forca` preenchida **somente** em `tipo = 'achado'`, e obrigatória nele;
- `link` vazio (nesta versão não há links na página — regra 2 do `CLAUDE.md`).

Qualquer problema **aborta** a geração e lista todas as linhas recusadas: não
existe carga parcial. Sem problema nenhum, o script imprime o relatório de
contagens (por público, tema, tipo e força; perfil por público; cruzamentos
cobertos; pautas usadas) e escreve os arquivos.

O primeiro bloco (`01-limpeza.sql`) apaga `trechos`: a carga **substitui** o
acervo por inteiro. O último (`09-verificacao.sql`) é o `SELECT` de
conferência; para o acervo v5 ele devolve:

```
trechos 2405 | cruzamentos 20 | perfil 91 | achados_forte 94 | pautas_usadas 59
```

(Até a etapa 8A o bloco 1 apagava também `paginas` e `formatos`, e a
verificação contava as duas. As tabelas saíram na migração 004.)

### Tamanho dos blocos, e por que são nove

O D1 recusa comando acima de **96 KiB** com `statement too long:
SQLITE_TOOBIG` (medido nesta base: 94,8 KB passa, 97,8 KB falha). Por isso os
INSERTs saem agrupados em blocos de até 90 KB — margem sobre o teto —, o que
dá sete blocos para as 2.405 linhas, mais a limpeza e a verificação: nove
arquivos, o menor número que o console aceita.

Para mudar o alvo: `KB_POR_BLOCO=80 node scripts/carga-acervo.js`. Subir muito
acima de 90 encosta no teto do D1 e a carga falha no meio.

### Aplicar a carga

Com terminal:

```sh
# local
for f in carga-acervo/*.sql; do npx wrangler d1 execute decisivas --local --file="$f"; done

# remoto (carga oficial — confira o relatório do script antes)
for f in carga-acervo/*.sql; do npx wrangler d1 execute decisivas --remote --file="$f"; done
```

Sem terminal, pelo console do painel:

1. dash.cloudflare.com → **Storage & Databases → D1 SQL Database → decisivas** → aba **Console**.
2. Cole **um arquivo por vez**, na ordem numerada, do `01` ao `09`, e confira
   que não houve erro antes de passar ao próximo.
3. Recomeçar é executar de novo **a partir do `01`** — nunca reexecutar um
   bloco do meio isolado, porque os INSERTs duplicados falham por chave
   primária.
4. A conferência é o bloco `09`, com os números da seção anterior.

Sobre o "um comando por vez" da seção de migrações, mais abaixo: lá a regra
existe porque a ordem entre os comandos é que importa e cada um tem de ser
conferido sozinho antes do seguinte. Aqui o conteúdo é homogêneo — INSERTs
independentes —, então cada arquivo vai colado inteiro. Se o console recusar a
colagem inteira, o limite é dele e não do D1: corte o arquivo em pedaços
menores, sempre em uma linha que **comece** com `INSERT`, mantendo a ordem.
Nunca corte no meio de um comando.

### Registro de cargas do acervo

| Acervo | Blocos | Linhas | Remoto |
|---|---|---|---|
| v5 (`dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`) | `arquivo/carga-003/01` a `09` | 2.405 trechos | **Aplicada em 02/09/2026, pelo console.** O bloco 09 devolveu `trechos 2405, cruzamentos 20, perfil 91, achados_forte 94, pautas_usadas 59, paginas 0, formatos 0` — igual ao esperado e ao que os nove blocos já tinham devolvido na réplica local do schema pós-003 |

A linha só vira "aplicada" com a saída do bloco `09` do remoto em mãos, como no
registro de migrações — a regra de quem aplica é a mesma, mais abaixo.

Com o acervo v5 no ar, a migração 004 ficou liberada: as 273 linhas da amostra
antiga não são mais a única cópia de nada, e nenhuma consulta do código as
alcança. Ela está escrita em `migracao-004.sql` e ainda não foi aplicada — ver
"Migração 004", abaixo.

### Conferir a carga

```sh
npx wrangler d1 execute decisivas --local --command="SELECT COUNT(*) AS trechos FROM trechos"
```

(Troque `--local` por `--remote` para conferir a produção.)

### Depois de CADA carga: versão do acervo

**Atualize `dados/versao-acervo.txt`** com uma marca nova (ex.:
`2026-09-15-carga-oficial-1`) **no mesmo commit dos blocos de carga**. É o que
diz, no repositório, qual acervo está no banco.

Nada mais depende da carga desde a etapa 8A: as páginas são texto fixo de
`conteudo/`, não saem do acervo em tempo de acesso, e não há cache a regenerar.
O acervo sustenta a escrita e a revisão das páginas, e volta a ser lido em tempo
real quando o "Explorar o acervo" for ligado (etapa 10).

## Migrações de banco

### A regra

**Toda alteração em `docs/02-schema.sql` exige aplicação no banco remoto ANTES
do deploy do código que depende dela.** O D1 não tem migração automática: o
schema versionado no repositório é só um arquivo de texto, e um `CREATE TABLE`
commitado não cria nada em produção. Código novo contra schema velho aparece
como `no such table: X` ou `table Y has no column named Z` nos logs.

A ordem é sempre esta, e não pode ser invertida:

1. Aplicar os comandos de migração no banco remoto.
2. Rodar o comando de verificação e confirmar o resultado.
3. Só então fazer o deploy (push na branch principal).

Alterar o schema sem entregar os comandos de migração remota é entrega
incompleta — a regra está no `CLAUDE.md`.

Uma migração é sempre **aditiva** (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`,
`CREATE INDEX`). O SQLite do D1 não remove nem renomeia coluna com um comando
só; se um dia isso for necessário, a migração cria a tabela nova, copia os
dados, e a antiga é removida em uma migração posterior, depois do deploy.

### Procedimento pelo console do painel (sem terminal)

Na migração, **cada comando vai sozinho** no console, em uma linha, sem
comentários. A ordem entre eles é que importa e cada um precisa ser conferido
antes do seguinte — é a diferença em relação aos blocos de carga, acima, que
são INSERTs independentes e vão colados inteiros:

1. dash.cloudflare.com → **Storage & Databases → D1 SQL Database → decisivas**
   → aba **Console**.
2. Cole o comando 1 da migração, execute e confira que não houve erro.
3. Repita para cada comando, **na ordem numerada**.
4. Cole o comando de verificação e confirme o resultado esperado.
5. Registre a migração como aplicada na tabela abaixo (data e quem aplicou),
   no mesmo commit em que o schema mudou, se possível.

Se um comando falhar dizendo que a tabela ou a coluna já existe, aquela parte
da migração já estava aplicada: siga para o próximo comando. Nenhum comando
desta seção apaga dados.

**Bloco de conferência que protege um `DROP` vem antes dele, e não se pula.**
O console não impõe ordem: quem cola decide. Quando um bloco existe só para
confirmar que é seguro remover algo, rodá-lo depois não protege nada. Se um
desses for pulado, registre o fato e o motivo na tabela abaixo, junto com o que
sustenta que não houve perda — o registro serve para auditoria, não para
parecer limpo.

Com terminal, o equivalente é `npx wrangler d1 execute decisivas --remote
--file=<arquivo com os comandos>`, mas o painel é o caminho oficial do projeto
(ver "Sem terminal", acima).

### Quem aplica, e de onde

**A aplicação no remoto é sempre feita por uma pessoa**, no console do painel ou
num terminal com `wrangler` autenticado. O ambiente onde o Claude Code roda não
tem credencial do Cloudflare (sem `CLOUDFLARE_API_TOKEN` e sem sessão de
`wrangler login`), então `--remote` falha ali por falta de autenticação, e não
por erro do comando.

O que o Claude Code faz é a parte de antes e a de depois: escreve os comandos,
**valida cada um contra uma réplica local do schema que o remoto tem hoje**, e
registra o resultado na tabela abaixo depois que a pessoa confirma a saída do
comando de verificação. É por isso que o registro tem uma coluna de estado: a
linha só vira "aplicada" com o resultado da verificação em mãos.

### Registro de migrações

| Nº | Commit | O que mudou | Remoto |
|---|---|---|---|
| 001 | schema inicial | Tabelas `documentos`, `trechos`, `recursos`, `registros`; índices `idx_trechos_match`, `idx_trechos_midia`, `idx_recursos_match` | Aplicada em 08/2026, pelo console |
| 002 | `8bbaf24` | Coluna `registros.origem` (`'geracao'` ou `'cache'`); tabelas `paginas` e `formatos` (cache nível 1) | **Aplicada em 02/09/2026, pelo console.** Verificação devolveu `1, 1, 1`. Foi a ausência desta migração que causou `no such table: paginas` e `table registros has no column named origem` nos logs de produção |
| 003 | etapa 2 | Tabela `pautas` com as 59 pautas; tabela `trechos` recriada com as nove colunas, a taxonomia final e as restrições (a antiga vira `trechos_ate_002`, preservada); `paginas` e `formatos` recriadas com `pauta` na chave; índices recriados | **Aplicada em 02/09/2026, pelo console.** Bloco 15 devolveu `59, 9, 0, 1, 1, 2` e `preservados: 273`, igual ao esperado; o INSERT de teste falhou com `CHECK constraint failed` em `publico`. O bloco 3 não foi executado — o bloco 4 rodou antes —, sem consequência: com `CACHE_ENABLED="false"` o Worker nunca gravou nas tabelas que a 002 acabara de criar, então estavam vazias, e o bloco 15 confirmou as duas recriadas com `pauta` na chave |
| 004 | etapa 8A | Remove `trechos_ate_002` (as 273 linhas da amostra anterior, já substituídas pela carga v5) e as tabelas de cache `paginas` e `formatos`, que saíram com a geração de página por modelo | **Aplicada em 02/09/2026, pelo console.** Bloco 1 devolveu `trechos 2405, antigos 273, pautas 59, paginas 12, formatos 1`; bloco 5 devolveu `0, 2405, 59`, igual ao esperado. As 12 páginas e o formato descartados eram o que o cache tinha guardado entre o deploy da etapa 7 e a decisão de páginas fixas — conteúdo gerado por modelo, que não vai ao ar |

A migração 002 foi a **etapa 0** da especificação em etapas versão 2 (hoje em `arquivo/DECISIVAS_especificacao_claude_code.md`):
o código publicado já a esperava, e ela não mudou nenhuma linha de código.

O que muda em produção com ela aplicada: a gravação em `registros` volta a
funcionar, e a linha `FALHA AO GRAVAR REGISTRO` deve parar de aparecer nos logs.
As tabelas `paginas` e `formatos` passam a existir, mas seguem intocadas
enquanto `CACHE_ENABLED` estiver em `"false"` — o interruptor evita o banco antes
de qualquer consulta, então as linhas `cache de páginas indisponível` e
`cache de formatos indisponível` já não apareciam por esse motivo.

Ela entrou **como está**, com a chave sem `pauta`. A coluna `pauta` nas duas
tabelas de cache é assunto da migração 003 (etapa 2), que é aditiva sobre estas.

Comandos da migração 002, um por bloco:

```sql
ALTER TABLE registros ADD COLUMN origem TEXT;
```

```sql
CREATE TABLE paginas (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa));
```

```sql
CREATE TABLE formatos (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, formato TEXT NOT NULL, resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa, formato));
```

Verificação (deve devolver `1`, `1`, `1`):

```sql
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='paginas') AS paginas, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='formatos') AS formatos, (SELECT COUNT(*) FROM pragma_table_info('registros') WHERE name='origem') AS coluna_origem;
```

Para conferir o schema remoto inteiro a qualquer momento, e comparar com
`docs/02-schema.sql`:

```sql
SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;
```

### Migração 003 (etapa 2): taxonomia, pautas e cache por pauta

São **15 blocos**, um comando cada, na ordem. Todos foram executados contra uma
réplica local do remoto (001 + 002, com as 273 linhas antigas dentro) antes de
serem escritos aqui.

Três avisos antes de começar:

1. **Entre os blocos 11 e 12 a tabela `trechos` não existe.** Execute-os em
   sequência, sem pausa: nesse intervalo a rota `/api/match` responde
   indisponibilidade. Com o Access na frente e o beta fechado, a janela é de
   segundos e afeta só quem estiver testando.
2. **Nada é apagado.** As 273 linhas antigas continuam em `trechos_ate_002`,
   que a migração 004 remove depois da carga da etapa 3 e do deploy. É o padrão
   aditivo desta seção: tabela nova, dados preservados, remoção depois.
3. **O bloco 3 é uma conferência.** Ele precisa devolver `0` e `0`. Se devolver
   outra coisa, pare: o cache não está vazio e os blocos 4 e 6 apagariam
   páginas geradas.

**Bloco 1** — Cria a tabela de pautas

```sql
CREATE TABLE pautas (pauta_consolidada TEXT PRIMARY KEY, macronarrativa_padrao TEXT NOT NULL CHECK (macronarrativa_padrao IN ('dinheiro no bolso', 'trabalho digno', 'família e cuidado', 'brasil e pertencimento', 'participação e voz', 'vale para os 5 temas')));
```

**Bloco 2** — Carrega as 59 pautas

```sql
INSERT INTO pautas (pauta_consolidada, macronarrativa_padrao) VALUES ('acesso a benefícios e atendimento', 'dinheiro no bolso'), ('aposentadoria e previdência', 'dinheiro no bolso'), ('atribuição de políticas públicas', 'participação e voz'), ('autonomia e amparo', 'trabalho digno'), ('bolsa família e transferência de renda', 'dinheiro no bolso'), ('brasil cotidiano', 'brasil e pertencimento'), ('cansaço cívico', 'participação e voz'), ('clima', 'brasil e pertencimento'), ('competência e autoestima política', 'participação e voz'), ('comunicação de serviço', 'família e cuidado'), ('comunicação e linguagem', 'vale para os 5 temas'), ('condição juvenil', 'trabalho digno'), ('confiança nas instituições', 'participação e voz'), ('cuidado e sobrecarga', 'família e cuidado'), ('cultura e lazer', 'família e cuidado'), ('custo de vida', 'dinheiro no bolso'), ('decisão de voto', 'participação e voz'), ('desigualdade', 'brasil e pertencimento'), ('direitos trabalhistas', 'trabalho digno'), ('educação', 'família e cuidado'), ('endividamento e crédito', 'dinheiro no bolso'), ('envelhecimento e autonomia', 'família e cuidado'), ('estigma do benefício', 'dinheiro no bolso'), ('etarismo', 'trabalho digno'), ('família e maternidade', 'família e cuidado'), ('funcionamento do legislativo', 'participação e voz'), ('futuro possível', 'brasil e pertencimento'), ('fé e religiosidade', 'família e cuidado'), ('gênero e trabalho', 'trabalho digno'), ('impostos', 'dinheiro no bolso'), ('informação e desinformação', 'participação e voz'), ('informação sobre direitos', 'trabalho digno'), ('jornada de trabalho', 'trabalho digno'), ('juventude e trabalho', 'trabalho digno'), ('mei e trabalho autônomo', 'trabalho digno'), ('memória e legado', 'participação e voz'), ('moradia e cidade', 'família e cuidado'), ('orgulho e identidade nacional', 'brasil e pertencimento'), ('orçamento e planejamento', 'dinheiro no bolso'), ('participação política', 'participação e voz'), ('país em disputa', 'brasil e pertencimento'), ('pertencimento regional', 'brasil e pertencimento'), ('polarização', 'participação e voz'), ('potências do país', 'brasil e pertencimento'), ('promessa e entrega', 'participação e voz'), ('proteção da infância', 'família e cuidado'), ('reconhecimento do trabalho', 'trabalho digno'), ('rede de apoio', 'família e cuidado'), ('rede de proteção social', 'família e cuidado'), ('renda e sustento', 'dinheiro no bolso'), ('representação política', 'participação e voz'), ('respeito ao idoso', 'brasil e pertencimento'), ('salário mínimo', 'dinheiro no bolso'), ('saúde e sus', 'família e cuidado'), ('saúde mental', 'família e cuidado'), ('segurança pública', 'família e cuidado'), ('soberania e política externa', 'brasil e pertencimento'), ('violência contra a mulher', 'família e cuidado'), ('voto e acesso à urna', 'participação e voz');
```

**Bloco 3** — Confere que o cache está vazio antes de recriá-lo (precisa devolver 0 e 0)

```sql
SELECT (SELECT COUNT(*) FROM paginas) AS paginas, (SELECT COUNT(*) FROM formatos) AS formatos;
```

**Bloco 4** — Remove a tabela de páginas (vazia) para recriá-la com pauta na chave

```sql
DROP TABLE paginas;
```

**Bloco 5** — Recria a tabela de páginas com pauta na chave

```sql
CREATE TABLE paginas (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, pauta TEXT NOT NULL DEFAULT '', resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa, pauta));
```

**Bloco 6** — Remove a tabela de formatos (vazia) para recriá-la com pauta na chave

```sql
DROP TABLE formatos;
```

**Bloco 7** — Recria a tabela de formatos com pauta na chave

```sql
CREATE TABLE formatos (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, formato TEXT NOT NULL, pauta TEXT NOT NULL DEFAULT '', resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa, formato, pauta));
```

**Bloco 8** — Cria a tabela de trechos nova, com as nove colunas e as restrições

```sql
CREATE TABLE trechos_003 (id TEXT PRIMARY KEY, texto TEXT NOT NULL, publico TEXT NOT NULL CHECK (publico IN ('jovens', '60+', 'mulheres beneficiárias', 'mulheres de 2 a 5 salários mínimos')), macronarrativa TEXT CHECK ((tipo = 'perfil' AND (macronarrativa IS NULL OR macronarrativa IN ('dinheiro no bolso', 'trabalho digno', 'família e cuidado', 'brasil e pertencimento', 'participação e voz'))) OR (tipo <> 'perfil' AND macronarrativa IS NOT NULL AND macronarrativa IN ('dinheiro no bolso', 'trabalho digno', 'família e cuidado', 'brasil e pertencimento', 'participação e voz'))), pauta TEXT REFERENCES pautas(pauta_consolidada) CHECK (pauta IS NOT NULL OR tipo = 'perfil'), tipo TEXT NOT NULL CHECK (tipo IN ('achado', 'funciona', 'afasta', 'contexto', 'exemplo', 'verbatim', 'perfil')), forca TEXT CHECK ((tipo = 'achado' AND forca IS NOT NULL AND forca IN ('forte', 'indício')) OR (tipo <> 'achado' AND forca IS NULL)), link TEXT, pagina TEXT);
```

**Bloco 9** — Libera o nome do primeiro índice

```sql
DROP INDEX idx_trechos_match;
```

**Bloco 10** — Libera o nome do segundo índice

```sql
DROP INDEX idx_trechos_midia;
```

**Bloco 11** — Aposenta a tabela antiga, preservando as linhas

```sql
ALTER TABLE trechos RENAME TO trechos_ate_002;
```

**Bloco 12** — Coloca a tabela nova no lugar (execute logo em seguida ao bloco 11)

```sql
ALTER TABLE trechos_003 RENAME TO trechos;
```

**Bloco 13** — Recria o índice do cruzamento

```sql
CREATE INDEX idx_trechos_match ON trechos (publico, macronarrativa);
```

**Bloco 14** — Recria o índice de pauta

```sql
CREATE INDEX idx_trechos_midia ON trechos (publico, pauta);
```

**Bloco 15** — Verificação final (esperado: 59, 9, 0, 1, 1, 2, e preservados > 0)

```sql
SELECT (SELECT COUNT(*) FROM pautas) AS pautas, (SELECT COUNT(*) FROM pragma_table_info('trechos')) AS colunas_trechos, (SELECT COUNT(*) FROM trechos) AS trechos, (SELECT COUNT(*) FROM pragma_table_info('paginas') WHERE name='pauta') AS paginas_pauta, (SELECT COUNT(*) FROM pragma_table_info('formatos') WHERE name='pauta') AS formatos_pauta, (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_trechos_match','idx_trechos_midia')) AS indices, (SELECT COUNT(*) FROM trechos_ate_002) AS preservados;
```

**Os comandos desta seção são a fonte; copie daqui, não de uma conversa.**
O bloco 2 foi conferido em 02/09/2026 com `openpyxl` contra
`dados/DECISIVAS_pautas_de_para_v1.xlsx`: as 59 `pauta_consolidada` e os 59
`macronarrativa_padrao` batem com o arquivo, sem sobra nem falta, e as 59
pautas usadas em `dados/DECISIVAS_acervo_v5.xlsx` existem todas na tabela, o
que fecha a chave estrangeira. Para reemitir os blocos em arquivo, sem
transcrever nada: `node scripts/extrai-blocos-migracao.js 003`.

**Depois da verificação**, confira que as restrições recusam valor fora da
lista. Este comando **tem de falhar** com `CHECK constraint failed`:

```sql
INSERT INTO trechos (id, texto, publico, macronarrativa, pauta, tipo, forca, link, pagina) VALUES ('TESTE-003', 'teste', 'idosos', 'engajamento cívico', 'custo de vida', 'achado', 'forte', NULL, NULL);
```

Se ele for aceito, a tabela nova não entrou no lugar: refaça do bloco 8.

### Migração 004 (etapa 8A): sai o cache, sai a amostra antiga

**Os comandos estão em `migracao-004.sql`, na raiz do repositório.** Copie de
lá, um por bloco, na ordem — não desta página e nunca de uma conversa. São
cinco blocos: uma conferência, três `DROP` e a verificação.

**Bloco 1** — Conferência que protege os três `DROP`, e não se pula. Precisa
devolver `2405`, `273`, `59` e as duas contagens de cache (quaisquer valores):
com `trechos` em 2.405 e as 59 pautas no lugar, a amostra antiga já foi
substituída e pode sair; se `trechos` vier diferente, **pare**, porque
`trechos_ate_002` seria a última cópia de algo.

**Blocos 2, 3 e 4** — `DROP TABLE trechos_ate_002;`, `DROP TABLE paginas;` e
`DROP TABLE formatos;`, um por bloco. Nada além dessas três tabelas é tocado:
`trechos`, `pautas`, `registros`, `documentos` e `recursos` ficam como estão.

**Bloco 5** — Verificação. Precisa devolver exatamente:

```
tabelas_que_deviam_ter_saido 0 | trechos 2405 | pautas 59
```

Repetir um `DROP` já aplicado falha com `no such table: X: SQLITE_ERROR` —
sinal de que aquela parte já estava feita, não de erro novo. Siga para o bloco
seguinte.

Depois da verificação, `docs/02-schema.sql` descreve o banco resultante: cinco
tabelas (`pautas`, `trechos`, `registros`, `documentos`, `recursos`) e três
índices. O arquivo já está nesse estado, conferido aplicando-o num SQLite
vazio.

**Aplicada em 02/09/2026, pelo console.** O bloco 1 no remoto devolveu
`trechos 2405, antigos 273, pautas 59, paginas 12, formatos 1` — a réplica
local tinha 184 e 60 no lugar dos dois últimos, e a diferença é só o que cada
uma tinha em cache: no remoto, as 12 páginas e o formato gerados entre o deploy
da etapa 7 e a decisão de páginas fixas. O bloco 5 devolveu `0, 2405, 59`.

### O que o código faz quando o schema está atrasado

Desde a correção que acompanha esta seção, schema atrasado **degrada em vez de
derrubar** — mas continua sendo defeito a corrigir, não estado aceitável:

Depois da etapa 8A nenhuma rota lê ou escreve no banco: as páginas são
estáticas, e schema atrasado não alcança quem usa o site. A degradação
descrita aqui valia para as rotas de geração, e volta a valer quando o
"Explorar o acervo" (etapa 10) trouxer consulta e registro de novo.

## Cache de páginas geradas — removido na etapa 8A

As páginas deixaram de ser geradas por modelo no acesso: as 20 são texto fixo,
escrito pela equipe e montado no build (`docs/CONTEXTO_DECISIVAS.md` v3). Com
isso saiu tudo o que sustentava o cache:

- as tabelas `paginas` e `formatos`, na **migração 004**;
- a variável `CACHE_ENABLED`, do `wrangler.toml`;
- o cache do navegador, que vivia na tela de resultado;
- `scripts/gera-cache.js` e `scripts/varre-termos.js`, em `arquivo/`.

O lote de geração da etapa 7 foi **cancelado** pela mesma decisão, e nunca
rodou em produção. A descrição de como o cache funcionava está no histórico do
Git (este arquivo, antes da etapa 8A) e no `arquivo/LEIA-ME.md`.

Página estática não tem cache a invalidar: mudou o texto em `conteudo/`, o
build refaz o HTML e o deploy publica.


## O build, e o que ele gera

Um comando só, declarado em `[build]` no `wrangler.toml`, roda antes de
`wrangler dev` e de `wrangler deploy` — inclusive nos deploys por push:

```sh
node scripts/sincroniza-tokens.js
```

**Tudo que ele escreve fica fora do versionamento.** A regra é simples: se um
arquivo está em `public/`, ele é saída de build; edite a fonte, nunca a cópia.

| Fonte | Saída | Quem gera |
|---|---|---|
| `brand/tokens.css` | `public/tokens.css` | `sincroniza-tokens.js` |
| `dados/vocabulario.json` | `public/vocabulario.js` | `sincroniza-tokens.js` |
| `paginas/index.html`, `paginas/resultado.html` + `parciais/*.html` | `public/*.html` | `gera-paginas.js` |
| **`conteudo/<publico>.json` + `paginas/caminho.html`** | **`public/caminhos/<publico>/<tema>.html`** (20) | `gera-caminhos.js` |
| `conteudo/sobre.json` + `paginas/sobre.html` | `public/sobre.html` | `gera-caminhos.js` |
| `conteudo/sobre.json` + `paginas/privacidade.html` | `public/privacidade.html` | `gera-caminhos.js` |
| `paginas/estilos.css`, `_redirects` | `public/` | `gera-paginas.js` |
| `dados/configuracao.json` | `public/configuracao.js` | `gera-paginas.js` |
| `assets/*`, inclusive `assets/fonts/` | `public/assets/` | `gera-paginas.js` |
| `dados/configuracao.json` + `parciais/*.html` | os marcadores de toda tela | `interface.js` |
| `public/**/*.html` (conferência) | falha o build se houver literal | `verifica-literais.js` |
| `conteudo/*.json`, `dados/configuracao.json` (conferência) | falha o build se houver termo bloqueado | `verifica-conteudo.js` |

Saíram na etapa 8A: `public/versao-acervo.js`, que servia ao cache do
navegador, e `prompts/gerado/*.txt`, os prompts do agente. Na 8B saiu
`public/rodape.js`: o rodapé passou a ser montado no build, com a assinatura e
o contato já dentro.

### O conteúdo, e o que o build recusa

`scripts/conteudo.js` é a única porta de entrada do texto das páginas. Ele
carrega os quatro arquivos de público pelo **mapa explícito** — `jovens.json`,
`70mais.json`, `mulheres-beneficiarias.json`, `mulheres-2-a-5-sm.json` — porque
identificador do banco, nome na tela, slug da URL e nome do arquivo são quatro
coisas diferentes, e o 70+ é a prova (id `60+`, slug `70-mais`, arquivo
`70mais.json`).

Antes de gerar, ele confere: os 4 públicos, os 5 temas de cada um, os campos
obrigatórios, 1 a 3 cards em "o que funciona" e em "o que não funciona", 3
cards de dados, 2 parágrafos em "por que falar", 3 cards em "como chegar" e 5
linhas de resumo. **Qualquer falha derruba o build com o caminho do campo**, do
tipo `conteudo/70mais.json.paginas["trabalho digno"].resumo: deveria ter de 5 a
5 itens, tem 4`.

`revisado_em` é opcional em cada arquivo. Sem ele, o cabeçalho da página diz
"texto em revisão" em vez de uma data.

A seção "Explorar o acervo" precisa dizer quantos trechos existem no
cruzamento e quais pautas há ali: isso vem de `dados/DECISIVAS_acervo_v5.xlsx`
no build (`scripts/acervo.js`), a mesma planilha da carga — nunca de número
escrito à mão. No beta a seção está desligada: os controles aparecem
desabilitados e um aviso diz que o recurso chega em breve.

**Cabeçalho e rodapé são um parcial só** (`parciais/cabecalho.html` e
`parciais/rodape.html`), incluídos em cada tela pelo marcador `{{CABECALHO}}` e
`{{RODAPE}}`. Nenhuma tela repete a barra ou o rodapé: repetir é como duas
telas divergem.

### Texto de interface: nenhum literal em template ou script

Os parciais e os moldes de `paginas/` **só têm marcadores**. Quem os preenche é
`scripts/interface.js`, com os valores de `dados/configuracao.json`: marca,
navegação, títulos e descrições do `<head>`, favicon, imagem de
compartilhamento, banner, rodapé, aviso de privacidade, rótulos de bloco,
ícones, textos do "Explorar o acervo" e as redes da barra lateral, com a cor de
hover de cada uma.

No fim do build, `scripts/verifica-literais.js` lê o que foi publicado em
`public/`, junta toda palavra visível — texto e também `alt`, `title`,
`placeholder`, `aria-label` e as descrições do `<head>` — e confere se cada uma
existe em `dados/configuracao.json`, `conteudo/*.json` ou
`dados/vocabulario.json`, mais os nomes de pauta que vêm do acervo. **Palavra
de fora derruba o build**, com o arquivo e a palavra:

```
FALHA ao gerar as telas: texto de interface fora das fontes de conteúdo (2 palavra(s)).
  "rascunho" em public/caminhos/70-mais/brasil-e-pertencimento.html
```

Não são conferidos o que está dentro de `<script>` e `<style>`, os comentários
de HTML e os números — script é comportamento, comentário não aparece na tela,
número vem do conteúdo ou da contagem do acervo.

Onde falta redigir, a tela mostra `[preencher]` com o arquivo e o campo (por
exemplo `[preencher] dados/configuracao.json → email`); quando quem escreve
deixou a nota dentro do próprio campo, é a nota que aparece.

O build é **idempotente**: só reescreve arquivo cujo conteúdo mudou
(`scripts/escreve-se-mudou.js`). Sem isso, a saída dentro de um diretório
observado pelo `wrangler dev` dispara o watcher e o Worker reinicia no meio das
requisições.

Falha de build é dura, de propósito: marcador não substituído, cor de público
fora da paleta de `brand/tokens.css`, conteúdo com estrutura errada, texto de
interface escrito em template ou termo bloqueado no conteúdo derrubam o build
em vez de publicar tela pela metade.

### Verificação de conteúdo: termos bloqueados (etapa 8C)

`scripts/verifica-conteudo.js` roda no build **antes de escrever qualquer
tela**, e faz duas coisas:

1. **Estrutura.** Chama `scripts/conteudo.js`, a mesma validação descrita
   acima, para que uma execução solta do script confira o que o build confere.
2. **Termos bloqueados.** Varre todo o texto de `conteudo/*.json` e de
   `dados/configuracao.json` contra a lista de `BLOCKED_TERMS`. O resultado
   esperado é **zero ocorrências**: a regra 4 não admite nome de figura
   política, partido ou direção de voto em nenhum texto. Achando qualquer um,
   **o build falha nomeando arquivo, campo e termo**, com o trecho da frase:

```
FALHA na verificação de conteúdo: termo bloqueado no conteúdo (2 ocorrência(s)).
  conteudo/jovens.json · paginas["dinheiro no bolso"].linha · "PT"
    Teste: o PT e o petista, com Lula…
```

**Como a comparação funciona.** Sempre por **palavra inteira** — "PT" não casa
em "parte", "PL" não casa em "plano". E de dois modos:

| Tipo de termo | Exemplos | Comparação |
|---|---|---|
| **Sigla** (só maiúsculas, admitindo conector curto em minúscula) | `PT`, `PL`, `PSDB`, `MDB`, `PSOL`, `PDT`, `PSB`, `PSD`, `PRTB`, `PCdoB` | **sensível a maiúsculas**: casa `PT`, não casa `pt` |
| **Nome** (pessoas, partidos por extenso, adjetivos) | `Lula`, `União Brasil`, `Nikolas Ferreira`, `petista` | **insensível a maiúsculas e a acentos**: casa `união brasil`, `Tarcisio` e `Tarcísio` |

Sem a distinção, qualquer sigla de duas letras viraria falso positivo dentro do
texto corrido; sem a insensibilidade nos nomes, bastaria escrever em minúscula
para escapar.

**Atenção ao montar a lista.** Nome de partido que também é palavra comum do
português não entra: como nome, a comparação ignora maiúsculas, e uma frase que
use a palavra no sentido comum derrubaria o build sem que houvesse menção a
partido nenhum. Quando um termo assim for necessário, a saída mostra o campo e
a frase, e o caminho é **reescrever a frase** — nunca afrouxar a varredura.

**Onde a lista vive.** Em variável de ambiente, `BLOCKED_TERMS`, com os termos
separados por `|` — nunca em arquivo do repositório, que é público e não deve
carregar uma lista de nomes de figuras e partidos.

- **Em produção: variável de build no painel do Cloudflare**, em Workers →
  `decisivas` → Settings → Build → Build variables. É lida pelo mesmo build que
  publica o site, então uma mudança na lista vale a partir do próximo deploy.
  Não é segredo de runtime: nenhuma rota a usa hoje, só o build (na etapa 10 a
  rota `/api/explorar` volta a varrer a saída, e aí ela também será variável do
  Worker).
- **Na máquina de quem desenvolve:** exportada na sessão, com o mesmo valor do
  painel.

```
BLOCKED_TERMS="Sobrenome|Outro Nome|SIGLA" node scripts/verifica-conteudo.js
```

**Sem a variável, o que acontece depende de onde o build roda:**

| Onde | Sem `BLOCKED_TERMS` |
|---|---|
| Build do Cloudflare, ou qualquer esteira | **o build FALHA.** Publicar sem a varredura é publicar sem a rede que sustenta a regra 4 |
| Máquina de quem desenvolve | só avisa (`termos bloqueados: VARREDURA NÃO EXECUTADA`), para `wrangler dev` rodar sem a lista à mão |

A esteira é reconhecida pela presença de `CI`, `WORKERS_CI`, `CF_PAGES` ou
`GITHUB_ACTIONS` no ambiente — o build do Cloudflare define `CI`. Para
reproduzir a falha na mão: `CI=1 node scripts/verifica-conteudo.js` sem a
lista.

**A variável tem de estar no painel ANTES deste comportamento entrar.** Foi por
isso que ele veio depois dos assets: com o painel sem a lista, o build do
Cloudflare falha e o site não republica — o que já está no ar continua no ar,
mas nada novo sobe.

### A lista de pendências no fim do build

O build termina imprimindo o que falta redigir e que asset falta, um por linha,
para a equipe não precisar abrir tela para descobrir:

```
pendências na tela (6):
  - dados/configuracao.json → email
  - dados/configuracao.json → instagram
  - /assets/logo-quid.svg
  - /assets/logo-brief.svg
  - dados/configuracao.json → video_embed
  - conteudo/sobre.json → quem_faz
```

### Assets

`assets/` é a pasta única de imagens e fontes (banner, logotipos, favicon,
retratos dos públicos e os arquivos da Inclusive Sans e da Unbounded em
`assets/fonts/`), copiada para `public/assets/` no build. **Enquanto um arquivo
não existir, a tela mostra um placeholder tracejado com o nome esperado** —
nada quebra e nada é inventado. O que cada arquivo é está em
`assets/LEIA-ME.md`, escrito por quem entrega a identidade.

**Quem escolhe o arquivo é a configuração, não o código:** `marca.logo`,
`favicon`, `favicon_png`, `imagem_compartilhamento`, `banner.imagens` e os
logotipos de `rodape` vivem em `dados/configuracao.json`. A exceção é o retrato
de cada público, que fica em `dados/vocabulario.json` (campo `retrato`), junto
do nome, da cor e do slug — é atributo do público, e a fonte única dele é o
vocabulário. Trocar uma imagem é trocar um caminho nesses dois arquivos.

O pacote da designer entrou em 02/09/2026: logotipos, favicon, três faixas de
banner (2560 × 440, em rotação) e os quatro retratos duotone (800 × 800),
usados no bloco "Quem é este público" como círculo de 160 px. Sem nenhum
`banner-*`, o cabeçalho volta à faixa provisória de linhas coloridas. Faltam só
os logotipos da Quid e do BRIEF em off-white, que seguem como placeholder.

### O aviso de privacidade, e a única coisa guardada no navegador

O aviso aparece **no primeiro acesso**. Ao clicar em "Entendi", o navegador
guarda em `localStorage` a chave de `privacidade.marca_navegador`
(`aviso_privacidade_visto`) com a data; existindo a marca, o aviso não volta.

- **Não é cookie** e não vai a servidor nenhum: a marca fica no aparelho de
  quem navega, e nem o Worker nem o registro a veem.
- O aviso nasce com `hidden` no HTML e o script o mostra quando não há marca,
  para não piscar na tela de quem já o viu.
- `localStorage` pode estar bloqueado (janela privada, configuração do
  navegador). Bloqueado, o aviso aparece e o clique não guarda nada — o aviso é
  informativo, e mostrá-lo de novo não quebra nada.
- O texto da política em `conteudo/sobre.json` declara essa marca, em uma
  frase: é a única coisa que o site guarda no navegador.

### Endereços das telas

O servidor de assets do Cloudflare serve a URL sem `.html`: `/sobre.html`
responde 307 para `/sobre`. Os links internos apontam direto para a forma sem
extensão. As rotas antigas saem em `paginas/_redirects`: `/metodologia` e
`/transparencia`, com e sem `.html`, respondem 301 para `/sobre`.

Os caminhos ficam em `/caminhos/<slug do público>/<slug do tema>`, com os
slugs de `dados/vocabulario.json`: 20 páginas de HTML estático, geradas no
build. `VER CAMINHOS`, na home, monta esse endereço.

A rota antiga `/resultado?publico=...&tema=...` continua de pé: virou uma
página que lê os dois parâmetros, traduz para os slugs e redireciona para o
caminho novo. Link já compartilhado não morre.

## Seções a completar

- Cadastrar `OPENROUTER_API_KEY` como segredo
- Trocar o modelo via `MODEL_ID`
- Desligar o agente via `AGENT_ENABLED`
- Consultar os últimos registros no banco
