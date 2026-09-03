# DECISIVAS — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele define o que o projeto é, o que nunca pode ser feito e onde estão as especificações.

## O que é

DECISIVAS é uma plataforma pública e gratuita da Quid. A pessoa escolhe um público e um tema e recebe um **caminho**: uma página fixa com o que a pesquisa mostra sobre essa conversa — por que ela importa, o que funciona, o que não funciona, quem é esse público, como chegar nele e um resumo. São 20 caminhos.

Não é ferramenta eleitoral. Não pede voto e não fala de candidatos. É pesquisa aplicada sobre comunicação de políticas públicas.

## O que a plataforma faz, e o que não faz

**As 20 páginas são texto fixo**, escrito pela equipe a partir do acervo e validado pelo jurídico. Vivem em `conteudo/*.json`, um arquivo por público, e o build monta o HTML. **Não há modelo de linguagem no acesso** — a geração de página por modelo saiu na etapa 8A porque produzia texto genérico.

O acervo de 2.405 trechos continua no banco: é a base auditável do que está escrito e do recurso **Explorar o acervo**, ligado na etapa 10, que devolve trechos da pesquisa com a origem de cada um. Nem ali o modelo redige: ele escolhe e ordena trechos, não escreve texto — a única saída que tem é uma lista de números.

## Stack

- Site estático servido pelo Cloudflare (telas em HTML, CSS e JS simples, sem framework pesado). As fontes ficam em `paginas/` e `parciais/`; **`public/` é saída de build**, inteira
- Worker do Cloudflare na rota `/api/*`: uma rota só, `POST /api/explorar`, o "Explorar o acervo" (etapa 10), governada por `AGENT_ENABLED`. Fora de `/api/*`, o Worker entrega o site estático
- Banco Cloudflare D1 (SQL) com o acervo etiquetado — schema em `docs/02-schema.sql`
- **Chamada a modelo em uma rota só**, e só no modo pergunta do `/api/explorar`: o modelo escolhe trechos do acervo e devolve uma lista de números. Prompt em `prompts/explorar.txt`, leitura da resposta em `src/interpreta-ids.js`
- Sem CMS por enquanto (etapa 9). O conteúdo das páginas vive em `conteudo/*.json`; os textos e identificadores das telas, em `dados/configuracao.json`; o acervo entra por carga versionada (planilha em `dados/` → `scripts/carga-acervo.js` → D1)
- Deploy automático: push na branch principal publica; branches geram pré-visualização

## Regras que nunca se quebram

1. **Nenhuma chave de API no código.** Local: `.dev.vars` (no `.gitignore`). Produção: segredo no painel do Cloudflare. Se encontrar chave em código, pare e avise.
2. **Nenhum texto de conteúdo escrito por quem programa.** Todo texto de página vem de `conteudo/*.json`, escrito pela equipe e validado pelo jurídico. Onde falta, aparece `[preencher]` visível na tela — nunca texto inventado para tapar o buraco. Vale para os textos das telas em `dados/configuracao.json`.
2.1. **Nada de texto, rótulo, endereço ou nome de imagem escrito dentro de template ou script.** Tudo o que aparece na tela vem de `dados/configuracao.json`, `conteudo/*.json` ou `dados/vocabulario.json` (mais os nomes de pauta, que são vocabulário fechado do acervo). Quem preenche os marcadores dos parciais com esses valores é `scripts/interface.js`; `scripts/verifica-literais.js` roda no fim do build e **falha a publicação** se achar na tela palavra que não venha dessas fontes. É esta regra que permite ao CMS da etapa 9 editar a interface inteira sem tocar em código.
3. **O modelo não redige.** A única rota que o chama é o `/api/explorar`, no modo pergunta, e ali ele **só escolhe**: recebe a pergunta e a lista numerada de trechos do cruzamento e responde `{"ids": [...]}`, até cinco números. Qualquer outra forma de resposta — prosa, JSON de outro formato, número inexistente — é descartada por `src/interpreta-ids.js` e vale como resultado vazio; cerca de código é a única tolerância, porque o JSON dentro dela é a resposta certa. O texto que vai à tela é sempre o do acervo, palavra por palavra, com a origem. Nada de conhecimento geral, nada de completar lacuna.
4. **Nunca mencionar candidaturas, partidos, políticos ou direção de voto**, nem em código, nem em texto de interface, nem em conteúdo de página. Também não avaliar governo ou gestão específica, nem aludir a figura política sem nome. Pesquisa que cite candidato pode ser parafraseada com a fonte nomeada e sem o nome dele. As regras completas estão em `docs/CONTEXTO_DECISIVAS.md` (seção 1, "a regra máxima de conteúdo") e em `docs/04-conformidade.md`. **O build varre todo o texto de `conteudo/*.json` e de `dados/configuracao.json` contra a lista de `BLOCKED_TERMS` e falha nomeando arquivo, campo e termo** (`scripts/verifica-conteudo.js`); a lista vive em variável de ambiente, e em produção é variável de build no painel do Cloudflare — nunca em arquivo do repositório.
5. **Não coletar dados pessoais.** Sem cadastro, sem cookie de rastreamento, sem script de terceiro, sem análise de perfil. O registro guarda conteúdo entregue, nunca identidade. A **única** coisa guardada no navegador é a marca de que o aviso de privacidade já foi visto (`localStorage`, chave `aviso_privacidade_visto`, com a data): não é cookie, não vai a servidor nenhum, não sai do aparelho de quem navega, e o texto da política declara isso.
6. **Interruptor de desligamento:** `AGENT_ENABLED` governa a rota `/api/explorar` e só ela — desligada, a rota responde com o aviso da configuração e a página continua de pé. As páginas são estáticas e não passam por checagem nenhuma.
7. **Rótulo de IA visível onde a inteligência artificial participou:** no Sobre, que explica em que etapas ela entrou, e no "Explorar o acervo" quando ele estiver ligado. Página fixa revisada por pessoas não leva rótulo de geração.
8. **Interface exclusivamente com os tokens de `brand/tokens.css`.** Sem cores ou fontes fora deles.
8.1. **Cabeçalho e rodapé são um parcial só** (`parciais/`), incluído no build. Nenhuma tela repete barra ou rodapé, e nada em `public/` é editado à mão.
8.2. **O que sai de uso vai para `arquivo/`, não para o lixo.** Com uma linha no `arquivo/LEIA-ME.md` dizendo o que era e quando saiu. O repositório descreve só o que existe; o histórico guarda o resto.
9. Todo texto de interface em português do Brasil.
10. **Alterar o schema sem entregar os comandos de migração remota é entrega incompleta.** O D1 não migra sozinho: `docs/02-schema.sql` é só um arquivo, e um `CREATE TABLE` commitado não cria nada em produção. Toda mudança de schema entrega junto os comandos prontos para o console do painel (um por bloco, uma linha, sem comentários), um comando de verificação, e a linha nova no registro de migrações de `docs/06-operacao.md`. A aplicação no remoto vem ANTES do deploy do código que depende dela.

## Vocabulários fechados (não criar valores novos)

**A fonte única é `dados/vocabulario.json`**, com identificador, nome na tela e cor. O Worker importa esse arquivo, os scripts o exigem por `require`, e o build publica `public/vocabulario.js` para o front. Nenhuma outra cópia destas listas pode existir no repositório: quatro cópias literais divergindo foi o problema que a migração 003 resolveu. A lista abaixo é resumo, não fonte.

- **Públicos (4):** identificador no banco · nome na tela · slug da URL e dos assets. Cada um traz também a cor, a cor de texto sobre ela e o `retrato` (o arquivo em `assets/retrato-<slug>.webp`, usado no bloco "Quem é este público"):
  - `jovens` · Jovens · `jovens`
  - `60+` · **70+** · `70-mais` — o público é de 70 anos ou mais; o identificador `60+` só muda no banco na migração 006, depois do beta, e `vocabulario.json` faz a ponte
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
- `paginas/` — fonte das telas: `index.html` (Início), `caminho.html` (o molde das 20 páginas), `sobre.html`, `privacidade.html`, `resultado.html` (redireciona a rota antiga), mais `estilos.css` e `_redirects`
- `parciais/` — cabeça, cabeçalho, rodapé e a barra lateral (voltar ao início e compartilhar), comuns às telas e incluídos no build. Só marcadores: os valores entram por `scripts/interface.js`
- `dados/configuracao.json` — **fonte única dos textos, rótulos, endereços e nomes de imagem da interface**; o que falta redigir está como `[preencher]`, e asset que ainda não existe aparece como placeholder com o nome esperado
- `assets/` — pasta única de imagens e fontes (banner, logotipos, favicon, retratos dos públicos, símbolos e padrões da identidade); enquanto um arquivo não existe, a tela mostra placeholder com o nome esperado. Qual arquivo cada tela usa vem de `dados/configuracao.json` — e o retrato, de `dados/vocabulario.json`
- `referencia/decisivas_prototipo_v5.html` — referência visual oficial da etapa 8
- `arquivo/` — o que saiu de uso, com o `LEIA-ME.md` dizendo o que era cada coisa e quando saiu
- `migracao-004.sql` — os comandos da migração 004, um por bloco, para o console
- `brand/` — tokens de design, logotipo e guia (entregues pela equipe de identidade)
- `dados/versao-acervo.txt` — marca de versão do acervo; muda a cada carga, no mesmo commit dos blocos. É a validade do cache de perguntas: carga nova invalida o que estava guardado
- `prompts/explorar.txt` — o prompt de sistema do modo pergunta, lugar único, importado pelo Worker
- `src/interpreta-ids.js` — a leitura da resposta do modelo, em módulo próprio para ser testável fora do Worker
- `migracao-005.sql` — os comandos da migração 005 (tabela `consultas`), um por bloco, para o console
- `arquivo/carga-003/` — os blocos SQL da carga do acervo v5, aplicados em 02/09/2026: provam qual acervo foi para o ar e quando. Uma carga nova escreve em `carga-acervo/`

## Estado atual dos dados

**O acervo v5 está no remoto:** 2.405 trechos, aplicados em 02/09/2026 pelo console, a partir dos blocos de `arquivo/carga-003/`. A verificação devolveu `trechos 2405, cruzamentos 20, perfil 91, achados_forte 94, pautas_usadas 59`.

**A migração 004 foi aplicada em 02/09/2026, pelo console.** Removeu `trechos_ate_002` e as duas tabelas de cache. O banco remoto tem hoje as cinco tabelas de `docs/02-schema.sql`; comandos e resultado em `migracao-004.sql` e no registro do `docs/06`.

A fonte do acervo é `dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`, 2.405 linhas, já na taxonomia nova. Consolidado por regras aprovadas em lote, sem revisão linha a linha: tudo que estava nas extrações entrou, exceto o que a regra 4 veda. Conferido contra as restrições do banco: as 2.405 linhas passam, nenhuma violação.

As 273 linhas da amostra antiga saíram do banco com a migração 004.

**O texto das 20 páginas está em `conteudo/` e já monta as páginas**, em revisão pela equipe e pelo jurídico. Falta redigir: "quem faz" no Sobre, contato do rodapé e o código de incorporação do vídeo (`video_embed`) — tudo marcado `[preencher]`. O vídeo de apresentação vive **só na página Sobre**: não há janela de abertura no Início. Nenhum arquivo traz `revisado_em`, então as páginas mostram "texto em revisão" no lugar da data.

**Os assets da identidade chegaram em 02/09/2026** (logotipos, favicon, três faixas de banner e os quatro retratos duotone), ligados à configuração e ao vocabulário. Faltam só os logotipos da Quid e do BRIEF em off-white, que seguem como placeholder no rodapé.

Onde o acervo não sustenta um bloco, a página **mostra os cards que existem e nada mais**: 3, 2 ou 1, e bloco sem nenhum card não é renderizado. Não há caixa de aviso de lacuna — saiu em 02/09/2026 (`arquivo/caixa-de-lacuna.html`), e o campo `lacuna` continua nos JSON, ignorado pelo build. O acervo rende menos em 70+ com dinheiro, trabalho e Brasil, e em trabalho digno para os dois públicos femininos: são as páginas com dois ou um card. O tipo `exemplo` tem zero linhas no acervo e a coluna `link` está sempre vazia.

**Endereços:** `/` (Início), `/caminhos/<slug do público>/<slug do tema>` (as 20 páginas), `/sobre`, `/privacidade`. `/resultado?publico=...&tema=...` redireciona para o caminho novo; `/metodologia` e `/transparencia` vão para `/sobre`.

**Estado das etapas:** 0 a 7 concluídas (a 7 teve o lote de geração cancelado pela decisão de páginas fixas). 8A limpou o repositório e aplicou a migração 004; 8B montou as 20 páginas fixas, o compartilhamento e o aviso de privacidade; 8C entregou a verificação de conteúdo no build (estrutura, varredura de termos bloqueados e lista de pendências) e a publicação pela main. A **10 entra no beta**: o "Explorar o acervo" ligado, com botões de pauta (sem modelo) e pergunta livre (o modelo escolhe trechos), cache em `consultas`, limite por hora e varredura de termos na entrada e na saída — **a migração 005 tem de ser aplicada no remoto antes do deploy**. Depois do beta: 9 CMS e 11 migração 006 (`70+` no banco).

**Datas:** beta em 04/09/2026, lançamento em 14/09/2026.
