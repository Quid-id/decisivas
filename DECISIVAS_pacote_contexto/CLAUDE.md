# DECISIVAS — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele define o que o projeto é, o que nunca pode ser feito e onde estão as especificações.

## O que é

DECISIVAS é uma plataforma pública e gratuita de uma organização do terceiro setor. A pessoa seleciona um público e um tema (o "match") e recebe uma página de apoio para comunicar aquele tema àquele público, construída exclusivamente a partir de um acervo de pesquisa qualitativa etiquetado e revisado por humanos.

Não é ferramenta eleitoral. Não menciona candidaturas. É um acervo de pesquisa aplicada sobre comunicação de políticas públicas, permanente, que continua no ar depois das eleições de 2026.

## Stack

- Site estático servido pelo Cloudflare (telas em HTML, CSS e JS simples, sem framework pesado)
- Worker do Cloudflare na rota `/api/*`: é o agente, com filtro, regras e registro
- Banco Cloudflare D1 (SQL) com o acervo etiquetado — schema em `docs/02-schema.sql`
- Modelo de linguagem via API do OpenRouter, chamado somente pelo Worker
- Sem CMS. Conteúdo entra por carga versionada (`data/` → script de seed → D1)
- Deploy automático: push na branch principal publica; branches geram pré-visualização

## Regras que nunca se quebram

1. **Nenhuma chave de API no código.** Local: `.dev.vars` (no `.gitignore`). Produção: segredo no painel do Cloudflare. Se encontrar chave em código, pare e avise.
2. **O modelo nunca escreve URLs.** Links vêm da tabela `recursos`, anexados por código depois da geração.
3. **O modelo só responde a partir dos trechos recuperados do banco.** Nada de conhecimento geral, nada de completar lacuna. Sem evidência suficiente, a resposta é lacuna declarada.
4. **Nunca mencionar candidaturas, partidos, políticos ou direção de voto**, nem em código, nem em texto de interface, nem em resposta do agente. As regras completas estão em `docs/03-regras-do-agente.md` e `docs/04-conformidade.md`.
5. **Não coletar dados pessoais.** Sem cadastro, sem cookies de rastreamento, sem análise de perfil. O log guarda conteúdo das respostas, nunca identidade.
6. **Interruptor de desligamento:** o Worker verifica a variável de ambiente `AGENT_ENABLED`; se for `false`, responde com mensagem estática de indisponibilidade. Toda rota do agente passa por essa checagem.
7. **Rótulo de IA visível** em toda saída gerada, com o texto definido na especificação.
8. **Interface exclusivamente com os tokens de `brand/tokens.css`.** Sem cores ou fontes fora deles.
9. Todo texto de interface em português do Brasil.

## Vocabulários fechados (não criar valores novos)

- **Públicos:** idosos · jovens · mulheres beneficiárias · mulheres de 2 a 5 salários mínimos · trabalhadoras informais · pequenas empreendedoras · plataformizadas
- **Macronarrativas:** dinheiro no bolso · proteção do trabalhador · proteção da família · brasil soberano · engajamento cívico
- **Tipos de trecho:** achado · funciona · afasta · exemplo · contexto · verbatim
- **Força:** forte · indício  ·  **Base:** geral · restrita

## Mapa do repositório

- `docs/01-especificacao.md` — telas, blocos da página, formatos, fluxos
- `docs/02-schema.sql` — tabelas do banco
- `docs/03-regras-do-agente.md` — prompt de sistema, recusas, log
- `docs/04-conformidade.md` — linhas vermelhas legais do projeto
- `docs/05-comandos-claude-code.md` — sequência de tarefas planejada
- `brand/` — tokens de design, logotipo e guia (entregues pela equipe de identidade)
- `data/amostra.csv` — amostra real do acervo para desenvolvimento

## Estado atual dos dados

A amostra em `data/` vem do documento D01, extraída e ainda **pendente de revisão humana**. Serve para desenvolver, não para publicar. A carga oficial só acontece com linhas de decisão `aceitar` ou `corrigir e aceitar`.
