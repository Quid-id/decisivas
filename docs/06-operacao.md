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

### Aplicar o schema (cria as quatro tabelas)

```sh
# local
npx wrangler d1 execute decisivas --local --file=docs/02-schema.sql

# remoto
npx wrangler d1 execute decisivas --remote --file=docs/02-schema.sql
```

O schema só é aplicado em banco vazio. Para recriar o banco local do zero,
apague a pasta `.wrangler/` e rode o comando de novo.

### Gerar o seed a partir da planilha

```sh
# desenvolvimento: usa a amostra do repositório (documentos ficam A PREENCHER)
node scripts/csv-para-seed.js data/amostra.csv

# carga oficial: CSV da Fila de revisão + CSV da aba Cabeçalhos
node scripts/csv-para-seed.js export-trechos.csv export-cabecalhos.csv
```

O script filtra apenas linhas com decisão `aceitar` ou `corrigir e aceitar`
(quando a coluna existir), valida os vocabulários fechados, recusa
macronarrativa `CONFERIR` e alerta `VETO`, nunca inclui o motivo interno de
restrição, e imprime o relatório do que aceitou e recusou. O resultado é o
arquivo `seed.sql` (gerado, fora do versionamento), que começa limpando as
tabelas `trechos` e `documentos` antes dos INSERTs — aplicá-lo substitui a
carga anterior por inteiro.

### Aplicar o seed

```sh
# local
npx wrangler d1 execute decisivas --local --file=seed.sql

# remoto (carga oficial — confira o relatório do script antes)
npx wrangler d1 execute decisivas --remote --file=seed.sql
```

### Sem terminal: pelo painel do Cloudflare

O painel tem um console SQL que dispensa o wrangler:

1. dash.cloudflare.com → **Storage & Databases → D1 SQL Database → decisivas** → aba **Console**.
2. Cole o conteúdo de `docs/02-schema.sql` e execute (uma vez só, em banco vazio).
3. Cole o `seed.sql` em partes (o console não aceita arquivos grandes de uma
   vez; use blocos de ±60 comandos) e execute as partes **na ordem**. A parte 1
   começa com os `DELETE`, então recomeçar do zero é executar de novo a partir
   da parte 1 — nunca reexecutar uma parte do meio isolada, porque os INSERTs
   duplicados falham por chave primária.
4. Confira com `SELECT COUNT(*) FROM trechos;`.

### Conferir a carga

```sh
npx wrangler d1 execute decisivas --local --command="SELECT COUNT(*) AS trechos FROM trechos"
```

(Troque `--local` por `--remote` para conferir a produção.)

### Depois de CADA carga: versão do acervo e regeneração do cache

A carga muda o acervo, e duas coisas dependem dele:

1. **Atualize `data/versao-acervo.txt`** com uma marca nova (ex.:
   `2026-09-15-carga-oficial-1`) **no mesmo commit do seed**. Essa marca vai
   para o site no deploy e é o que faz o navegador das pessoas descartar
   páginas guardadas da carga anterior.
2. **Regenere o cache de páginas** (obrigatório — ver seção Cache abaixo):

```sh
BASE_URL=https://SEU-DOMINIO node scripts/gera-cache.js
```

Sem esse passo nada quebra — o cache invalida sozinho —, mas a primeira
pessoa de cada cruzamento paga o tempo de geração.

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

**Nível 2 — navegador (localStorage).** A página de resultado guarda as
páginas já vistas com a marca de versão de `data/versao-acervo.txt`
(publicada no site no build como `/versao-acervo.js`). Versão igual: exibe
imediatamente, sem chamar o servidor. Versão diferente: descarta e busca.
Guarda somente conteúdo de página (nunca dado da pessoa), com teto de 12
páginas — estourou, a mais antiga sai. Com `CACHE_ENABLED=false`, as
respostas avisam o navegador, que descarta o que guardou e para de guardar.

**Gerar o cache em lote** (`scripts/gera-cache.js`): percorre os 35
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
