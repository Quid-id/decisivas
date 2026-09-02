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
- Sem CMS. Conteúdo entra por carga versionada (planilha em `dados/` → script de carga → D1). Os textos fixos hoje vivem no HTML de `public/`; a pasta `content/` prevista no plano antigo nunca foi criada
- Deploy automático: push na branch principal publica; branches geram pré-visualização

## Regras que nunca se quebram

1. **Nenhuma chave de API no código.** Local: `.dev.vars` (no `.gitignore`). Produção: segredo no painel do Cloudflare. Se encontrar chave em código, pare e avise.
2. **O modelo nunca escreve URLs.** Quando houver links na página, eles vêm de tabela curada e são anexados por código depois da geração — nunca gerados. **Nesta versão não há links na página:** o bloco de exemplos e materiais foi adiado para depois do beta, e as tabelas `recursos` e `documentos` seguem no banco sem uso.
3. **O modelo só responde a partir dos trechos recuperados do banco.** Nada de conhecimento geral, nada de completar lacuna. Sem evidência suficiente, a resposta é lacuna declarada.
4. **Nunca mencionar candidaturas, partidos, políticos ou direção de voto**, nem em código, nem em texto de interface, nem em resposta do agente. As regras completas estão em `docs/03-regras-do-agente.md` e `docs/04-conformidade.md`.
5. **Não coletar dados pessoais.** Sem cadastro, sem cookies de rastreamento, sem análise de perfil. O log guarda conteúdo das respostas, nunca identidade.
6. **Interruptor de desligamento:** o Worker verifica a variável de ambiente `AGENT_ENABLED`; se for `false`, responde com mensagem estática de indisponibilidade. Toda rota do agente passa por essa checagem.
7. **Rótulo de IA visível** em toda saída gerada, com o texto definido na especificação.
8. **Interface exclusivamente com os tokens de `brand/tokens.css`.** Sem cores ou fontes fora deles.
9. Todo texto de interface em português do Brasil.
10. **Alterar o schema sem entregar os comandos de migração remota é entrega incompleta.** O D1 não migra sozinho: `docs/02-schema.sql` é só um arquivo, e um `CREATE TABLE` commitado não cria nada em produção. Toda mudança de schema entrega junto os comandos prontos para o console do painel (um por bloco, uma linha, sem comentários), um comando de verificação, e a linha nova no registro de migrações de `docs/06-operacao.md`. A aplicação no remoto vem ANTES do deploy do código que depende dela.

## Vocabulários fechados (não criar valores novos)

**A fonte única é `dados/vocabulario.json`**, com identificador, nome na tela e cor. O Worker importa esse arquivo, os scripts o exigem por `require`, e o build publica `public/vocabulario.js` para o front. Nenhuma outra cópia destas listas pode existir no repositório: quatro cópias literais divergindo foi o problema que a migração 003 resolveu. A lista abaixo é resumo, não fonte.

- **Públicos (4):** jovens · 60+ · mulheres beneficiárias · mulheres de 2 a 5 salários mínimos
- **Macronarrativas (5):** dinheiro no bolso · trabalho digno · família e cuidado · brasil e pertencimento · participação e voz
- **Tipos de trecho (7):** achado · funciona · afasta · contexto · exemplo · verbatim · perfil — `exemplo` não é usado nesta versão
- **Força:** forte · indício, só em `achado`
- **Pautas (59):** vocabulário fechado na tabela `pautas`, de `dados/DECISIVAS_pautas_de_para_v1.xlsx`. Na tela aparecem como tag de ângulo, e só com 3 ou mais trechos no cruzamento

Os nomes antigos (`idosos`, `proteção do trabalhador`, `proteção da família`, `brasil soberano`, `engajamento cívico`, e os públicos `trabalhadoras informais`, `pequenas empreendedoras`, `plataformizadas`) saíram do sistema na migração 003. As restrições do banco recusam qualquer um deles.

## Mapa do repositório

- `docs/01-especificacao.md` — telas, blocos da página, formatos, fluxos
- `docs/02-schema.sql` — tabelas do banco
- `docs/03-regras-do-agente.md` — prompt de sistema, recusas, log
- `docs/04-conformidade.md` — linhas vermelhas legais do projeto
- `docs/05-comandos-claude-code.md` — sequência de tarefas planejada
- `docs/07-mapa-de-recuperacao.md` — qual consulta alimenta cada bloco da página
- `docs/CONTEXTO_DECISIVAS.md` — contexto do projeto, versão 2; prevalece em caso de conflito
- `docs/DECISIVAS_especificacao_claude_code.md` — especificação em etapas, versão 2
- `dados/vocabulario.json` — **fonte única** dos vocabulários fechados
- `dados/DECISIVAS_acervo_v5.xlsx` — o acervo (2.405 linhas); fonte da carga da etapa 3
- `dados/DECISIVAS_pautas_de_para_v1.xlsx` — as 59 pautas consolidadas
- `dados/Regra_geral_formatos.xlsx`, `dados/Regra_gatilho.xlsx`, `dados/Regra_selecao.xlsx` — regras que entram no prompt (etapa 5)
- `referencia/decisivas_prototipo_v3.html` — referência visual das telas (etapa 6)
- `brand/` — tokens de design, logotipo e guia (entregues pela equipe de identidade)
- `dados/versao-acervo.txt` — marca de versão do acervo; muda a cada carga e invalida o cache do navegador
- `carga-003/` — os blocos SQL da carga do acervo v5, gerados por `scripts/carga-acervo.js`, versionados: provam qual acervo foi para o ar e quando

## Estado atual dos dados

**A tabela `trechos` no remoto está vazia.** A migração 003 (etapa 2) criou a tabela nova, com a taxonomia final e as restrições. A etapa 3 gerou os blocos de carga em `carga-003/` — 2.405 linhas, validadas contra as restrições, nenhuma recusa —, mas **aplicá-los no remoto é trabalho de uma pessoa no console do painel**: o ambiente do Claude Code não tem credencial do Cloudflare (ver docs/06, "Quem aplica, e de onde"). Enquanto não forem aplicados, os 20 cruzamentos respondem com lacuna declarada em todos os blocos — comportamento correto, não erro.

A fonte do acervo é `dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`, 2.405 linhas, já na taxonomia nova. Consolidado por regras aprovadas em lote, sem revisão linha a linha: tudo que estava nas extrações entrou, exceto o que a regra 4 veda. Conferido contra as restrições do banco: as 2.405 linhas passam, nenhuma violação.

As 273 linhas da amostra antiga continuam preservadas no banco remoto, na tabela `trechos_ate_002`, que a migração 004 remove depois da carga e do deploy. **Elas não podem ser publicadas** e nenhuma consulta do código as alcança.

Ausências conhecidas, que o código deve tratar como lacuna e não como erro: a pauta `consumo de mídia` não existe entre as 59, então o bloco de hábitos de mídia sai vazio até a planilha própria chegar; o tipo `exemplo` tem zero linhas no acervo; e a coluna `link` está sempre vazia nesta versão.
