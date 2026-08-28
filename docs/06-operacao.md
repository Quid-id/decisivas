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

### Conferir a carga

```sh
npx wrangler d1 execute decisivas --local --command="SELECT COUNT(*) AS trechos FROM trechos"
```

(Troque `--local` por `--remote` para conferir a produção.)

## Seções a completar (tarefa 8 de docs/05)

- Cadastrar `OPENROUTER_API_KEY` como segredo
- Trocar o modelo via `MODEL_ID`
- Desligar o agente via `AGENT_ENABLED`
- Consultar os últimos registros no banco
