# Operação

Passo a passo das tarefas de operação do DECISIVAS. Este arquivo começa
pelo banco (tarefa 3 de docs/05); as demais seções serão completadas na
tarefa 8.

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
migração 003** e grava os blocos em `carga-003/`. O que é verificado, com o
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

O primeiro bloco (`01-limpeza.sql`) apaga `trechos`, `paginas` e `formatos`:
a carga **substitui** o acervo por inteiro, e página em cache da carga
anterior não sobrevive a ela. O último (`09-verificacao.sql`) é o `SELECT` de
conferência; para o acervo v5 ele devolve:

```
trechos 2405 | cruzamentos 20 | perfil 91 | achados_forte 94 | pautas_usadas 59 | paginas 0 | formatos 0
```

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
for f in carga-003/*.sql; do npx wrangler d1 execute decisivas --local --file="$f"; done

# remoto (carga oficial — confira o relatório do script antes)
for f in carga-003/*.sql; do npx wrangler d1 execute decisivas --remote --file="$f"; done
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
| v5 (`dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`) | `carga-003/01` a `09` | 2.405 trechos | **Não aplicada ainda.** Os blocos estão validados contra uma réplica local do schema pós-003 (os nove rodaram, o bloco 09 devolveu os números esperados, e a segunda passada não duplicou nada) |

A linha só vira "aplicada" com a saída do bloco `09` do remoto em mãos, como no
registro de migrações — a regra de quem aplica é a mesma, mais abaixo.

### Conferir a carga

```sh
npx wrangler d1 execute decisivas --local --command="SELECT COUNT(*) AS trechos FROM trechos"
```

(Troque `--local` por `--remote` para conferir a produção.)

### Depois de CADA carga: versão do acervo e regeneração do cache

A carga muda o acervo, e três coisas dependem dele:

1. **Atualize `dados/versao-acervo.txt`** com uma marca nova (ex.:
   `2026-09-15-carga-oficial-1`) **no mesmo commit dos blocos de carga**. Essa
   marca vai para o site no deploy e é o que faz o navegador das pessoas
   descartar páginas guardadas da carga anterior.
2. **Atualize `ACERVO_ATUALIZADO_EM`** em `[vars]` do `wrangler.toml`, no
   mesmo commit, com a data em `dd/mm/aaaa`. É o que a página mostra na
   identificação — a marca do item 1 é técnica, esta é a que a pessoa lê. As
   duas mudam juntas, sempre; separadas, a tela diz uma data e o cache
   raciocina com outra.
3. **Regenere o cache de páginas** (obrigatório — ver seção Cache abaixo):

```sh
BASE_URL=https://SEU-DOMINIO node scripts/gera-cache.js
```

Sem esse passo nada quebra — o cache invalida sozinho —, mas a primeira
pessoa de cada cruzamento paga o tempo de geração.

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
| 004 | depois da etapa 3 | Remover `trechos_ate_002`, quando a carga nova estiver no ar e conferida | Não escrita ainda |

A migração 002 foi a **etapa 0** de `docs/DECISIVAS_especificacao_claude_code.md`:
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

### O que o código faz quando o schema está atrasado

Desde a correção que acompanha esta seção, schema atrasado **degrada em vez de
derrubar** — mas continua sendo defeito a corrigir, não estado aceitável:

- Falha ao ler ou gravar o cache: a rota gera a página normalmente e o log traz
  `cache de páginas indisponível, gerando normalmente: ...`.
- Falha ao gravar em `registros`: a pessoa é atendida e o log traz
  `FALHA AO GRAVAR REGISTRO — ... | registro: {...}`, com o conteúdo íntegro,
  para o registro não se perder até a migração ser aplicada.

Qualquer uma dessas duas linhas no log significa migração pendente. Elas são a
condição de alerta a procurar depois de todo deploy.

## Cache de páginas geradas

Dois níveis, ambos desligáveis pela variável `CACHE_ENABLED=false` (em
`[vars]` no `wrangler.toml`; localmente em `.dev.vars` — reinicie o
`wrangler dev` ao mudar, a troca a quente nem sempre é aplicada).

**Nível 1 — servidor (tabelas `paginas` e `formatos` no D1).** As duas rotas
consultam o cache antes de qualquer chamada ao modelo; havendo entrada
válida, devolvem-na e gravam em `registros` com `origem = 'cache'`. O
mecanismo de validade é a **comparação literal do conjunto ordenado de ids
de trechos do cruzamento** (match + hábitos de mídia): o conjunto é guardado
na coluna `ids_acervo` no momento da geração e comparado com o conjunto
atual do banco a cada consulta. Escolhemos comparação do conjunto inteiro,
não hash nem data: não existe colisão possível, e a string guardada é
auditável direto no banco (`SELECT ids_acervo FROM paginas WHERE ...`).
Qualquer linha incluída, removida ou com id trocado invalida a entrada na
hora, sem passo manual.

Atenção: a tabela `recursos` não entra na validade (a regra cobre trechos).
Se só os recursos mudarem, rode a regeneração do cache — por isso o passo é
obrigatório após qualquer carga.

A validade tem **dois critérios**, ambos verificados na leitura:

1. o conjunto de ids de trechos do cruzamento, como descrito acima;
2. o **modelo** que gerou a entrada, comparado com o `MODEL_ID` atual — página
   feita por outro modelo não é reutilizada. Páginas só de lacuna têm `modelo`
   nulo (nenhum modelo foi chamado) e seguem válidas em qualquer modelo.

Limitação conhecida: mudanças de **prompt** não entram na validade. Editar
`docs/03-regras-do-agente.md` ou `docs/08-regras-de-formato.md` não invalida
nada — nesses deploys, limpe o cache à mão (ver o fim desta seção).

**Nível 2 — navegador (localStorage).** A página de resultado guarda as
páginas já vistas com a marca de versão de `dados/versao-acervo.txt`
(publicada no site no build como `/versao-acervo.js`). Versão igual: exibe
imediatamente, sem chamar o servidor. Versão diferente: descarta e busca.
Guarda somente conteúdo de página (nunca dado da pessoa), com teto de 12
páginas — estourou, a mais antiga sai.

O interruptor alcança este nível **sem custo de requisição**: o build publica
`window.CACHE_HABILITADO` em `/versao-acervo.js`, lido de `CACHE_ENABLED`
(`.dev.vars` em desenvolvimento, `[vars]` do `wrangler.toml` em produção).
Como a variável vive no `wrangler.toml`, mudá-la exige commit e deploy — o
mesmo ciclo que regenera o arquivo, então os dois lados nunca discordam. Com
o cache desligado, o front não lê nada guardado e **apaga todas** as páginas
que tinha, não só a do match atual.

**Gerar o cache em lote** (`scripts/gera-cache.js`): percorre os 20
cruzamentos chamando `/api/match`; cruzamento sem acervo suficiente vira
página de lacunas, sem custo de modelo. Reporta quantas páginas gerou,
quantas já estavam em cache, quantas ficaram em lacuna e o custo total do
lote (medido pela diferença de uso na conta OpenRouter, se
`OPENROUTER_API_KEY` estiver no ambiente).

```sh
# local (wrangler dev rodando em outro terminal)
node scripts/gera-cache.js

# produção
BASE_URL=https://SEU-DOMINIO OPENROUTER_API_KEY=... node scripts/gera-cache.js
```

**Banco criado antes do cache existir?** O schema atual já traz as tabelas.
Para um banco que rodou o schema antigo, aplique uma vez (local e remoto):

```sh
npx wrangler d1 execute decisivas --remote --command="
ALTER TABLE registros ADD COLUMN origem TEXT;
CREATE TABLE paginas (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa));
CREATE TABLE formatos (publico TEXT NOT NULL, macronarrativa TEXT NOT NULL, formato TEXT NOT NULL, resposta TEXT NOT NULL, ids_trechos TEXT NOT NULL, ids_acervo TEXT NOT NULL, modelo TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (publico, macronarrativa, formato));
"
```

**Limpar o cache na mão** (raramente necessário; regenerar já substitui):

```sh
npx wrangler d1 execute decisivas --remote --command="DELETE FROM paginas; DELETE FROM formatos;"
```

## Seções a completar (tarefa 8 de docs/05)

- Cadastrar `OPENROUTER_API_KEY` como segredo
- Trocar o modelo via `MODEL_ID`
- Desligar o agente via `AGENT_ENABLED`
- Consultar os últimos registros no banco
