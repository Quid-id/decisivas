# Comandos para o Claude Code, na ordem

Cole um por vez, confira o resultado, siga para o próximo. Cada comando assume que o anterior foi concluído. O Claude Code lê o `CLAUDE.md` e os `docs/` sozinho; os comandos fazem referência a eles.

## 1. Estrutura do projeto

> Leia o CLAUDE.md e os arquivos de docs/. Crie a estrutura inicial do projeto: site estático em `public/` (por enquanto uma página placeholder), Worker em `src/worker.js` com as rotas `/api/match` e `/api/formato` respondendo um JSON de exemplo, e o `wrangler.toml` configurado para servir o site e o Worker juntos, já com a declaração do banco D1 chamado `decisivas` e as variáveis de ambiente `AGENT_ENABLED` e `MODEL_ID`. Crie o `.gitignore` incluindo `.dev.vars` e o arquivo `.dev.vars.example` mostrando quais variáveis existem sem os valores. Não coloque nenhuma chave em nenhum arquivo.

## 2. Teste do OpenRouter

> Crie `scripts/testa-modelos.js`: um script que leio a chave de `OPENROUTER_API_KEY` no ambiente, envia um mesmo prompt de teste para uma lista de modelos definida no topo do arquivo, e imprime para cada um: nome, tempo de resposta, tokens de entrada e saída e custo estimado. Inclua no topo um comentário explicando como rodar. Use o prompt de sistema de docs/03-regras-do-agente.md com três trechos de exemplo tirados de data/amostra.csv, para o teste medir o caso real.

## 3. Banco e carga

> Crie o banco a partir de docs/02-schema.sql. Depois crie `scripts/csv-para-seed.js`, que lê um CSV exportado da planilha de etiquetagem (mesmas colunas de data/amostra.csv), filtra apenas linhas com decisão `aceitar` ou `corrigir e aceitar` quando a coluna existir, valida os vocabulários fechados do CLAUDE.md, recusa qualquer linha com macronarrativa CONFERIR ou alerta VETO, e gera `seed.sql` com os INSERTs para as tabelas documentos e trechos. Nunca inclua no seed o campo de motivo de restrição. Gere também o comando wrangler para aplicar o schema e o seed no D1, local e remoto, e documente os dois em docs/06-operacao.md.

## 4. A rota do match

> Implemente `/api/match` conforme docs/01-especificacao.md, seção Fluxo do match, e docs/03-regras-do-agente.md, na ordem exata: checagens de código antes do modelo, consulta ao D1 com limite de 60 trechos priorizando forte e diversidade de pauta, chamada ao OpenRouter usando MODEL_ID, validação do JSON com uma única retentativa, verificação de termos bloqueados vinda de variável de ambiente, anexação por código dos chips de fonte, nota de base restrita, bloco de hábitos de mídia e links de recursos, gravação em registros, resposta. Trate lacunas conforme os mínimos da especificação.

## 5. A rota de formatos

> Implemente `/api/formato` conforme a especificação: lista fechada whatsapp, carrossel e roteiro, prompts fixos por formato, sem reconsultar o banco, sem aceitar texto livre do usuário, com as mesmas validações de saída e gravação em registros.

## 6. As telas

> Construa a home e a página de resultado conforme docs/01-especificacao.md, usando exclusivamente os tokens de brand/tokens.css. Home com as duas nuvens de tags e a barra de confirmação. Resultado com os nove elementos na ordem da especificação, incluindo o estado de lacuna declarada e o rodapé de rótulo de IA. Crie também as três páginas fixas com texto placeholder marcado como A REDIGIR. Tudo em português do Brasil.

## 7. Proteções

> Adicione o Cloudflare Turnstile nas duas rotas da API, com verificação no Worker, e um limite de requisições por IP por hora configurável por variável de ambiente. Garanta que AGENT_ENABLED=false derruba as duas rotas para a resposta estática de indisponibilidade e coloca um aviso no site. Escreva testes simples que provem os três comportamentos.

## 8. Operação

> Complete docs/06-operacao.md com o passo a passo de: aplicar schema e seed no D1 remoto, cadastrar OPENROUTER_API_KEY como segredo, trocar o modelo via MODEL_ID, desligar o agente via AGENT_ENABLED, e consultar os últimos registros no banco. Linguagem para quem nunca usou o wrangler, explicando cada comando.

## 9. Antes de publicar

> Faça uma revisão final do repositório procurando: qualquer chave ou segredo em código, qualquer URL escrita pelo modelo em vez de vinda da tabela recursos, qualquer texto de interface fora de brand/tokens.css, e qualquer caminho em que uma entrada do usuário chegue ao modelo como texto livre. Liste o que encontrar sem corrigir ainda.

## 10. Conteúdo fixo e registro de alterações

> Crie a pasta content/ com os arquivos markdown das páginas Sobre, Metodologia e Transparência (texto placeholder marcado como A REDIGIR) e o passo de build que converte cada um em página usando os tokens de brand/. Depois crie a página pública /registro-de-alteracoes, gerada automaticamente no build a partir do histórico do Git: data e mensagem de cada commit que alterou content/ ou data/, em lista simples, mais recente primeiro. Nenhuma edição manual nessa página.
