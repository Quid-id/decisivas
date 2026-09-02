# DECISIVAS — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele define o que o projeto é, o que nunca pode ser feito e onde estão as especificações.

## O que é

DECISIVAS é uma plataforma pública e gratuita da Quid. A pessoa escolhe um público e um tema e recebe um **caminho**: uma página fixa com o que a pesquisa mostra sobre essa conversa — por que ela importa, o que funciona, o que não funciona, quem é esse público, como chegar nele e um resumo. São 20 caminhos.

Não é ferramenta eleitoral. Não pede voto e não fala de candidatos. É pesquisa aplicada sobre comunicação de políticas públicas.

## O que a plataforma faz, e o que não faz

**As 20 páginas são texto fixo**, escrito pela equipe a partir do acervo e validado pelo jurídico. Vivem em `conteudo/*.json`, um arquivo por público, e o build monta o HTML. **Não há modelo de linguagem no acesso** — a geração de página por modelo saiu na etapa 8A porque produzia texto genérico.

O acervo de 2.405 trechos continua no banco: é a base auditável do que está escrito e do recurso **Explorar o acervo** (etapa 10), que devolverá trechos da pesquisa com a origem de cada um. Nem ali o modelo redige: ele pode escolher e ordenar trechos, não escrever texto.

## Stack

- Site estático servido pelo Cloudflare (telas em HTML, CSS e JS simples, sem framework pesado). As fontes ficam em `paginas/` e `parciais/`; **`public/` é saída de build**, inteira
- Worker do Cloudflare na rota `/api/*`: reduzido na etapa 8A a servir os assets — nenhuma rota de API existe hoje. A próxima é `/api/explorar` (etapa 10)
- Banco Cloudflare D1 (SQL) com o acervo etiquetado — schema em `docs/02-schema.sql`
- **Nenhuma chamada a modelo de linguagem em nenhuma rota.** Volta na etapa 10, para escolher e ordenar trechos
- Sem CMS por enquanto (etapa 9). O conteúdo das páginas vive em `conteudo/*.json`; os textos e identificadores das telas, em `dados/configuracao.json`; o acervo entra por carga versionada (planilha em `dados/` → `scripts/carga-acervo.js` → D1)
- Deploy automático: push na branch principal publica; branches geram pré-visualização

## Regras que nunca se quebram

1. **Nenhuma chave de API no código.** Local: `.dev.vars` (no `.gitignore`). Produção: segredo no painel do Cloudflare. Se encontrar chave em código, pare e avise.
2. **Nenhum texto de conteúdo escrito por quem programa.** Todo texto de página vem de `conteudo/*.json`, escrito pela equipe e validado pelo jurídico. Onde falta, aparece `[preencher]` visível na tela — nunca texto inventado para tapar o buraco. Vale para os textos das telas em `dados/configuracao.json`.
3. **O modelo não redige.** Não há chamada a modelo em nenhuma rota. Quando o "Explorar o acervo" for ligado (etapa 10), ele devolve trechos do acervo com a origem de cada um, podendo escolher e ordenar — nunca escrever. Nada de conhecimento geral, nada de completar lacuna.
4. **Nunca mencionar candidaturas, partidos, políticos ou direção de voto**, nem em código, nem em texto de interface, nem em conteúdo de página. Também não avaliar governo ou gestão específica, nem aludir a figura política sem nome. Pesquisa que cite candidato pode ser parafraseada com a fonte nomeada e sem o nome dele. As regras completas estão em `docs/CONTEXTO_DECISIVAS.md` (seção 1, "a regra máxima de conteúdo") e em `docs/04-conformidade.md`.
5. **Não coletar dados pessoais.** Sem cadastro, sem cookie de rastreamento, sem script de terceiro, sem análise de perfil. O registro guarda conteúdo entregue, nunca identidade.
6. **Interruptor de desligamento:** `AGENT_ENABLED` governa a rota `/api/explorar` (etapa 10) e só ela. As páginas são estáticas e não passam por checagem nenhuma.
7. **Rótulo de IA visível onde a inteligência artificial participou:** no Sobre, que explica em que etapas ela entrou, e no "Explorar o acervo" quando ele estiver ligado. Página fixa revisada por pessoas não leva rótulo de geração.
8. **Interface exclusivamente com os tokens de `brand/tokens.css`.** Sem cores ou fontes fora deles.
8.1. **Cabeçalho e rodapé são um parcial só** (`parciais/`), incluído no build. Nenhuma tela repete barra ou rodapé, e nada em `public/` é editado à mão.
8.2. **O que sai de uso vai para `arquivo/`, não para o lixo.** Com uma linha no `arquivo/LEIA-ME.md` dizendo o que era e quando saiu. O repositório descreve só o que existe; o histórico guarda o resto.
9. Todo texto de interface em português do Brasil.
10. **Alterar o schema sem entregar os comandos de migração remota é entrega incompleta.** O D1 não migra sozinho: `docs/02-schema.sql` é só um arquivo, e um `CREATE TABLE` commitado não cria nada em produção. Toda mudança de schema entrega junto os comandos prontos para o console do painel (um por bloco, uma linha, sem comentários), um comando de verificação, e a linha nova no registro de migrações de `docs/06-operacao.md`. A aplicação no remoto vem ANTES do deploy do código que depende dela.

## Vocabulários fechados (não criar valores novos)

**A fonte única é `dados/vocabulario.json`**, com identificador, nome na tela e cor. O Worker importa esse arquivo, os scripts o exigem por `require`, e o build publica `public/vocabulario.js` para o front. Nenhuma outra cópia destas listas pode existir no repositório: quatro cópias literais divergindo foi o problema que a migração 003 resolveu. A lista abaixo é resumo, não fonte.

- **Públicos (4):** identificador no banco · nome na tela · slug da URL e dos assets:
  - `jovens` · Jovens · `jovens`
  - `60+` · **70+** · `70-mais` — o público é de 70 anos ou mais; o identificador `60+` só muda no banco na migração 005, depois do beta, e `vocabulario.json` faz a ponte
  - `mulheres beneficiárias` · Mulheres beneficiárias · `mulheres-beneficiarias`
  - `mulheres de 2 a 5 salários mínimos` · Mulheres de 2 a 5 SM · `mulheres-2-a-5-sm`
- **Macronarrativas (5):** dinheiro no bolso · trabalho digno · família e cuidado · brasil e pertencimento · participação e voz — cada uma com o slug da URL em `vocabulario.json` (`dinheiro-no-bolso`, `trabalho-digno`, `familia-e-cuidado`, `brasil-e-pertencimento`, `participacao-e-voz`)
- **Tipos de trecho (7):** achado · funciona · afasta · contexto · exemplo · verbatim · perfil — `exemplo` não é usado. Os tipos etiquetam o acervo, que sustenta a escrita das páginas e o "Explorar o acervo"; a página fixa não é montada por tipo
- **Força:** forte · indício, só em `achado`
- **Pautas (59):** vocabulário fechado na tabela `pautas`, de `dados/DECISIVAS_pautas_de_para_v1.xlsx`. Voltam à tela como botões do "Explorar o acervo" (etapa 10)

Os nomes antigos (`idosos`, `proteção do trabalhador`, `proteção da família`, `brasil soberano`, `engajamento cívico`, e os públicos `trabalhadoras informais`, `pequenas empreendedoras`, `plataformizadas`) saíram do sistema na migração 003. As restrições do banco recusam qualquer um deles.

## Mapa do repositório

- `docs/CONTEXTO_DECISIVAS.md` — contexto do projeto, **versão 3**; prevalece em caso de conflito
- `docs/DECISIVAS_especificacao_etapa8.md` — especificação das sub-etapas 8A, 8B e 8C, e o que vem depois
- `docs/02-schema.sql` — tabelas do banco, no estado pós-migração 004
- `docs/04-conformidade.md` — linhas vermelhas legais do projeto
- `docs/06-operacao.md` — banco, migrações e build
- `dados/vocabulario.json` — **fonte única** dos vocabulários fechados
- `dados/DECISIVAS_acervo_v5.xlsx` — o acervo (2.405 linhas); fonte da carga da etapa 3
- `dados/DECISIVAS_pautas_de_para_v1.xlsx` — as 59 pautas consolidadas
- `conteudo/` — **o texto das 20 páginas**, um JSON por público, mais `sobre.json`. Escrito e revisado pela equipe; o build monta o HTML
- `paginas/` — fonte das telas (Início, Sobre, Política de privacidade), mais `estilos.css` e `_redirects`
- `parciais/` — cabeça, cabeçalho e rodapé comuns a todas as telas, incluídos no build
- `dados/configuracao.json` — textos e identificadores das telas; o que falta redigir está como `[preencher]`
- `assets/` — pasta única de imagens (banner, logotipos, cards semióticos, favicon); enquanto um arquivo não existe, a tela mostra placeholder com o nome esperado
- `referencia/decisivas_prototipo_v5.html` — referência visual oficial da etapa 8
- `arquivo/` — o que saiu de uso, com o `LEIA-ME.md` dizendo o que era cada coisa e quando saiu
- `migracao-004.sql` — os comandos da migração 004, um por bloco, para o console
- `brand/` — tokens de design, logotipo e guia (entregues pela equipe de identidade)
- `dados/versao-acervo.txt` — marca de versão do acervo; muda a cada carga, no mesmo commit dos blocos
- `arquivo/carga-003/` — os blocos SQL da carga do acervo v5, aplicados em 02/09/2026: provam qual acervo foi para o ar e quando. Uma carga nova escreve em `carga-acervo/`

## Estado atual dos dados

**O acervo v5 está no remoto:** 2.405 trechos, aplicados em 02/09/2026 pelo console, a partir dos blocos de `arquivo/carga-003/`. A verificação devolveu `trechos 2405, cruzamentos 20, perfil 91, achados_forte 94, pautas_usadas 59`.

**A migração 004 está escrita e não aplicada.** Ela remove `trechos_ate_002` e as duas tabelas de cache, `paginas` e `formatos`. Comandos em `migracao-004.sql`; registro e procedimento em `docs/06`. Até ela ser aplicada, o banco remoto tem três tabelas que o repositório já não descreve.

A fonte do acervo é `dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`, 2.405 linhas, já na taxonomia nova. Consolidado por regras aprovadas em lote, sem revisão linha a linha: tudo que estava nas extrações entrou, exceto o que a regra 4 veda. Conferido contra as restrições do banco: as 2.405 linhas passam, nenhuma violação.

As 273 linhas da amostra antiga seguem em `trechos_ate_002` até a 004 ser aplicada. **Elas não podem ser publicadas** e nenhuma consulta do código as alcança.

**O texto das 20 páginas está em `conteudo/`**, em revisão pela equipe e pelo jurídico. Falta redigir: "quem faz" no Sobre, assinatura e contato do rodapé, o id do vídeo — tudo marcado `[preencher]`. Faltam também os assets da identidade (banner, cards semióticos, logos, arquivos da fonte).

Onde o acervo não sustenta um bloco, a página declara a lacuna: hoje isso acontece em 70+ com dinheiro, trabalho e Brasil, e em trabalho digno para os dois públicos femininos. Lacuna é conteúdo, não erro. O tipo `exemplo` tem zero linhas no acervo e a coluna `link` está sempre vazia.

**Estado das etapas:** 0 a 7 concluídas (a 7 teve o lote de geração cancelado pela decisão de páginas fixas). 8A é esta limpeza; 8B monta as páginas fixas; 8C verifica e publica. Depois do beta: 9 CMS, 10 Explorar o acervo, 11 migração 005 (`70+` no banco).

**Datas:** beta em 04/09/2026, lançamento em 14/09/2026.
