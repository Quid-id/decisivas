# DECISIVAS — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele define o que o projeto é, o que nunca pode ser feito e onde estão as especificações.

## O que é

DECISIVAS é uma plataforma pública e gratuita do **Projeto Brief**. A pessoa escolhe um público e um tema e recebe um **caminho**: uma página fixa com o que a pesquisa mostra sobre essa conversa — por que ela importa, o que funciona, o que não funciona, quem é esse público, como chegar nele e um resumo. São 20 caminhos.

Não é ferramenta eleitoral. Não pede voto e não fala de candidatos. É pesquisa aplicada sobre comunicação de políticas públicas.

## O que a plataforma faz, e o que não faz

**As 20 páginas são texto fixo**, escrito pela equipe a partir do acervo e validado pelo jurídico. Vivem em `conteudo/*.json`, um arquivo por público, e o build monta o HTML. **Não há modelo de linguagem no acesso** — a geração de página por modelo saiu na etapa 8A porque produzia texto genérico.

O acervo de 2.405 trechos continua no banco: é a base auditável do que está escrito e do recurso **Explorar o acervo**, ligado na etapa 10, que devolve trechos da pesquisa com a origem de cada um. Nem ali o modelo redige: ele escolhe e ordena trechos, não escreve texto — a única saída que tem é uma lista de números.

## Stack

- Site estático servido pelo Cloudflare (telas em HTML, CSS e JS simples, sem framework pesado). As fontes ficam em `paginas/` e `parciais/`; **`public/` é saída de build**, inteira
- Worker do Cloudflare na rota `/api/*`: uma rota só, `POST /api/explorar`, o "Explorar o acervo" (etapa 10), governada por `AGENT_ENABLED`. Fora de `/api/*`, o Worker entrega o site estático
- Banco Cloudflare D1 (SQL) com o acervo etiquetado — schema em `docs/02-schema.sql`
- Interface pela **referência visual v8**: tipografia ampliada em tokens, home sem rótulos de público e tema, resumo em cascata no topo do caminho, pilha de cards em "o que funciona" e "o que não funciona", e rodapé com o formulário de inscrição
- **Chamada a modelo em uma rota só**, e só no modo pergunta do `/api/explorar`: o modelo escolhe trechos do acervo e devolve uma lista de números. Prompt em `prompts/explorar.txt`, leitura da resposta em `src/interpreta-ids.js`
- **Painel de edição** (etapa 9) em `/admin`, atrás do Cloudflare Access: a equipe edita os MESMOS arquivos que o build lê (`conteudo/*.json`, `dados/configuracao.json`, `dados/vocabulario.json`, `assets/`), e cada salvamento vira um commit na main feito pelo Worker. Não existe banco de conteúdo separado — o estado é o repositório. Rotas `/api/cms/*` em `src/cms.js`, governadas por `CMS_ENABLED`; o acervo continua entrando por carga versionada (planilha em `dados/` → `scripts/carga-acervo.js` → D1)
- Deploy automático: push na branch principal publica; branches geram pré-visualização

## Regras que nunca se quebram

1. **Nenhuma chave de API no código.** Local: `.dev.vars` (no `.gitignore`). Produção: segredo no painel do Cloudflare. Se encontrar chave em código, pare e avise.
2. **Nenhum texto de conteúdo escrito por quem programa.** Todo texto de página vem de `conteudo/*.json`, escrito pela equipe e validado pelo jurídico. Onde falta, aparece `[preencher]` visível na tela — nunca texto inventado para tapar o buraco. Vale para os textos das telas em `dados/configuracao.json`.
2.1. **Nada de texto, rótulo, endereço ou nome de imagem escrito dentro de template ou script.** Tudo o que aparece na tela vem de `dados/configuracao.json`, `conteudo/*.json` ou `dados/vocabulario.json` (mais os nomes de pauta, que são vocabulário fechado do acervo). Quem preenche os marcadores dos parciais com esses valores é `scripts/interface.js`; `scripts/verifica-literais.js` roda no fim do build e **falha a publicação** se achar na tela palavra que não venha dessas fontes. É esta regra que permite ao CMS da etapa 9 editar a interface inteira sem tocar em código.
3. **O modelo não redige.** A única rota que o chama é o `/api/explorar`, no modo pergunta, e ali ele **só escolhe**: recebe a pergunta e a lista numerada de trechos do cruzamento e responde `{"ids": [...]}`, até cinco números. Qualquer outra forma de resposta — prosa, JSON de outro formato, número inexistente — é descartada por `src/interpreta-ids.js` e vale como resultado vazio; cerca de código é a única tolerância, porque o JSON dentro dela é a resposta certa. O texto que vai à tela é sempre o do acervo, palavra por palavra, com a origem. Nada de conhecimento geral, nada de completar lacuna.
4. **Nunca mencionar candidaturas, partidos, políticos ou direção de voto**, nem em código, nem em texto de interface, nem em conteúdo de página. Também não avaliar governo ou gestão específica, nem aludir a figura política sem nome. Pesquisa que cite candidato pode ser parafraseada com a fonte nomeada e sem o nome dele. As regras completas estão em `docs/CONTEXTO_DECISIVAS.md` (seção 1, "a regra máxima de conteúdo") e em `docs/04-conformidade.md`. **O build varre todo o texto de `conteudo/*.json` e de `dados/configuracao.json` contra a lista de `BLOCKED_TERMS` e falha nomeando arquivo, campo e termo** (`scripts/verifica-conteudo.js`); a lista vive em variável de ambiente, e em produção é variável de build no painel do Cloudflare — nunca em arquivo do repositório.
5. **Não coletar dados pessoais na navegação.** Sem cadastro para ler, sem cookie de rastreamento, sem análise de perfil. O registro guarda conteúdo entregue, nunca identidade. Duas coisas, e só duas, fogem disso, as duas declaradas no aviso e na política de privacidade:
   - a marca de que o aviso de privacidade já foi visto (`localStorage`, chave `aviso_privacidade_visto`, com a data): não é cookie, não vai a servidor nenhum e não sai do aparelho de quem navega;
   - **o formulário de inscrição do Projeto Brief no rodapé, incorporado do Substack — a ÚNICA exceção à regra de nenhum script de terceiro** (`substack_embed`, em `dados/configuracao.json`). Ele grava cookies próprios, do Substack, para quem se inscreve; nenhuma outra parte do site carrega script de fora, e navegar pelas páginas não passa por ele.
6. **Interruptor de desligamento:** `AGENT_ENABLED` governa a rota `/api/explorar` e só ela — desligada, a rota responde com o aviso da configuração e a página continua de pé. `CMS_ENABLED` faz o mesmo pelo painel de edição, e só por ele. As páginas são estáticas e não passam por checagem nenhuma.
7. **Rótulo de IA visível onde a inteligência artificial participou:** no Sobre, que explica em que etapas ela entrou, e no "Explorar o acervo" quando ele estiver ligado. Página fixa revisada por pessoas não leva rótulo de geração.
8. **Interface exclusivamente com os tokens de `brand/tokens.css`.** Sem cores, fontes ou tamanhos fora deles — inclusive a regra do aviso, que é sempre itálico, minúsculas e 15px (`--texto-aviso`, `--estilo-aviso`, `--caixa-aviso`).
8.1. **Cabeçalho e rodapé são um parcial só** (`parciais/`), incluído no build. Nenhuma tela repete barra ou rodapé, e nada em `public/` é editado à mão.
8.2. **O que sai de uso vai para `arquivo/`, não para o lixo.** Com uma linha no `arquivo/LEIA-ME.md` dizendo o que era e quando saiu. O repositório descreve só o que existe; o histórico guarda o resto.
9. Todo texto de interface em português do Brasil.
9.1. **O painel de edição não é uma segunda fonte de verdade.** Ele grava nos arquivos do repositório, e valida antes de gravar com as MESMAS funções que o build usa — `src/valida-conteudo.cjs` (estrutura) e `src/varre-termos.cjs` (termos bloqueados), compartilhados por `scripts/` e pelo Worker. Regra nova de conteúdo entra nesses módulos, nunca em cópia dentro do painel: cópia divergindo é conteúdo passando por um caminho e sendo barrado no outro. E o painel só grava na lista de arquivos editáveis conferida no servidor — o token do GitHub alcança o repositório inteiro, e é a lista que o segura.
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
- `dados/DECISIVAS_acervo_v6.xlsx` — o acervo (2.405 linhas); o v5, que sustentou a carga da etapa 3, está em `arquivo/`
- `dados/DECISIVAS_pautas_de_para_v1.xlsx` — as 59 pautas consolidadas
- `conteudo/` — **o texto das 20 páginas**, um JSON por público, mais `sobre.json`. Escrito e revisado pela equipe; o build monta o HTML
- `paginas/` — fonte das telas: `index.html` (Início), `caminho.html` (o molde das 20 páginas), `sobre.html`, `privacidade.html`, `resultado.html` (redireciona a rota antiga), mais `estilos.css` e `_redirects`
- `parciais/` — cabeça, cabeçalho, rodapé e a barra lateral (voltar ao início e compartilhar), comuns às telas e incluídos no build. Só marcadores: os valores entram por `scripts/interface.js`
- `dados/configuracao.json` — **fonte única dos textos, rótulos, endereços e nomes de imagem da interface**; o que falta redigir está como `[preencher]`, e asset que ainda não existe aparece como placeholder com o nome esperado
- `assets/` — pasta única de imagens e fontes (banner, logotipos, favicon, retratos dos públicos, símbolos e padrões da identidade); enquanto um arquivo não existe, a tela mostra placeholder com o nome esperado. Qual arquivo cada tela usa vem de `dados/configuracao.json` — e o retrato, de `dados/vocabulario.json`
- `referencia/decisivas_prototipo_v8.html` — **referência visual oficial**; substitui a v5 em tudo (tipografia ampliada, home sem rótulos, resumo em cascata, pilha de cards, rodapé com o formulário)
- `arquivo/` — o que saiu de uso, com o `LEIA-ME.md` dizendo o que era cada coisa e quando saiu
- `migracao-004.sql` — os comandos da migração 004, um por bloco, para o console
- `brand/` — tokens de design, logotipo e guia (entregues pela equipe de identidade)
- `dados/versao-acervo.txt` — marca de versão do acervo; muda a cada carga, no mesmo commit dos blocos. É a validade do cache de perguntas: carga nova invalida o que estava guardado
- `prompts/explorar.txt` — o prompt de sistema do modo pergunta, lugar único, importado pelo Worker
- `src/interpreta-ids.js` — a leitura da resposta do modelo, em módulo próprio para ser testável fora do Worker
- `src/valida-conteudo.cjs` e `src/varre-termos.cjs` — as regras de estrutura e a varredura de termos, **compartilhadas** pelo build e pelo Worker (`.cjs` porque os scripts são CommonJS e o Worker é ESM); `src/escapa-html.cjs` faz o mesmo pelo escape de HTML
- `src/cms.js`, `src/acesso.js`, `src/github.js` — o painel de edição: as rotas `/api/cms/*`, a conferência do crachá do Cloudflare Access e a gravação no repositório
- `paginas/admin.html`, `paginas/admin.css`, `scripts/admin/painel.js` — a tela do painel; o script é de navegador, e o build só o copia para `public/admin/`
- `migracao-005.sql` — os comandos da migração 005 (tabela `consultas`), um por bloco, para o console
- `arquivo/carga-003/` — os blocos SQL da carga do acervo v5, aplicados em 02/09/2026: provam qual acervo foi para o ar e quando. Uma carga nova escreve em `carga-acervo/`

## Estado atual dos dados

**O acervo v6 está no remoto:** 2.405 trechos. A carga do v5 foi aplicada em 02/09/2026 pelo console, a partir dos blocos de `arquivo/carga-003/`, e a verificação devolveu `trechos 2405, cruzamentos 20, perfil 91, achados_forte 94, pautas_usadas 59`; em 03/09/2026 o v6 reescreveu 102 textos por `UPDATE`, sem mexer em id nem em etiqueta.

**A migração 004 foi aplicada em 02/09/2026, pelo console.** Removeu `trechos_ate_002` e as duas tabelas de cache. O banco remoto tem hoje as cinco tabelas de `docs/02-schema.sql`; comandos e resultado em `migracao-004.sql` e no registro do `docs/06`.

A fonte do acervo é `dados/DECISIVAS_acervo_v6.xlsx`, aba `acervo`, 2.405 linhas, já na taxonomia nova. Consolidado por regras aprovadas em lote, sem revisão linha a linha: tudo que estava nas extrações entrou, exceto o que a regra 4 veda. Conferido contra as restrições do banco: as 2.405 linhas passam, nenhuma violação.

**O v6 substituiu o v5 em 03/09/2026**, aplicado no banco por `UPDATE`: os mesmos 2.405 ids e a mesma etiquetagem, com **102 textos reescritos** em linguagem comum, sem jargão de método. A marca em `dados/versao-acervo.txt` passou a `2026-09-03-acervo-v6`, o que invalida o cache de perguntas do "Explorar o acervo" — de propósito, porque os trechos mudaram.

As 273 linhas da amostra antiga saíram do banco com a migração 004.

**O texto das 20 páginas está em `conteudo/` e já monta as páginas**, em revisão pela equipe e pelo jurídico. Falta redigir: contato do rodapé e o código de incorporação do vídeo (`video_embed`) — os dois marcados `[preencher]`. A seção "quem faz" saiu do Sobre em 03/09/2026, com o campo `quem_faz` de `conteudo/sobre.json`. O vídeo de apresentação vive **só na página Sobre**: não há janela de abertura no Início. Nenhum arquivo traz `revisado_em`, então as páginas mostram "texto em revisão" no lugar da data.

**Os assets da identidade estão no lugar:** logotipos (inclusive o do brief, no rodapé), favicon, retratos duotone dos quatro públicos, ícones de compartilhamento e o ícone de clique da pilha de cards. As três faixas do banner são as artes finais em `banner-0*.webp` — as composições provisórias em SVG foram para `arquivo/banner-provisorio/`.

Onde o acervo não sustenta um bloco, a página **mostra os cards que existem e nada mais**: 3, 2 ou 1, e bloco sem nenhum card não é renderizado. Não há caixa de aviso de lacuna — saiu em 02/09/2026 (`arquivo/caixa-de-lacuna.html`), e o campo `lacuna` continua nos JSON, ignorado pelo build. O acervo rende menos em 70+ com dinheiro, trabalho e Brasil, e em trabalho digno para os dois públicos femininos: são as páginas com dois ou um card. O tipo `exemplo` tem zero linhas no acervo e a coluna `link` está sempre vazia.

**Endereços:** `/` (Início), `/caminhos/<slug do público>/<slug do tema>` (as 20 páginas), `/sobre`, `/privacidade`. `/resultado?publico=...&tema=...` redireciona para o caminho novo; `/metodologia` e `/transparencia` vão para `/sobre`.

**O painel de edição está entregue (etapa 9).** `/admin`, atrás do Access com e-mail e código de uso único; salvar vira commit na main com o e-mail de quem editou no autor. Falta, do lado do painel do Cloudflare: criar a aplicação do Access para `decisivas.com.br/admin*`, o segredo `GITHUB_TOKEN`, o segredo `ACCESS_AUD`, o segredo de runtime `BLOCKED_TERMS` e o domínio principal — o passo a passo está em `docs/06-operacao.md`.

**Estado das etapas:** 0 a 7 concluídas (a 7 teve o lote de geração cancelado pela decisão de páginas fixas). 8A limpou o repositório e aplicou a migração 004; 8B montou as 20 páginas fixas, o compartilhamento e o aviso de privacidade; 8C entregou a verificação de conteúdo no build (estrutura, varredura de termos bloqueados e lista de pendências) e a publicação pela main. A **10 entra no beta**: o "Explorar o acervo" ligado, com botões de pauta (sem modelo) e pergunta livre (o modelo escolhe trechos), cache em `consultas`, limite por hora e varredura de termos na entrada e na saída; a migração 005 foi aplicada em 03/09/2026. A resposta é **uma lista só de "Insights do acervo"**, sem etiqueta de tipo e sem linha de origem na tela — os ids continuam no registro, que é onde a auditoria olha. A **9, o painel de edição, está entregue** e depende de configuração no painel do Cloudflare para entrar em uso. Depois do beta: 11, migração 006 (`70+` no banco).

**Datas:** beta em 04/09/2026, lançamento em 14/09/2026.
