# DECISIVAS. Especificação para o Claude Code

Versão 2, 01/09/2026. Beta em 04/09, lançamento em 14/09.

Revisada após o relatório da etapa 1. O que mudou está nas etapas; em resumo: a etapa 0 aplica a migração 002 pendente; a etapa 2 vira a migração 003 e segue o processo aditivo do docs/06; o acervo passa a ser o v5; o teto de trechos, o mínimo de achado forte e a representação de "até 3" são tratados explicitamente; `data/` vira `dados/`; CLAUDE.md e CONTEXTO são atualizados na mesma entrega para o repositório não contradizer o código.

## Como usar

1. Cole o CONTEXTO_DECISIVAS.md primeiro. Ele prevalece sobre este documento em caso de conflito.
2. Cole este documento.
3. Suba para o repositório, numa pasta `dados/`, os arquivos: `DECISIVAS_acervo_v5.xlsx`, `DECISIVAS_pautas_de_para_v1.xlsx`, `Regra_geral_formatos.xlsx`, `Regra_gatilho.xlsx`, `Regra_selecao.xlsx`. E, numa pasta `referencia/`, o `decisivas_prototipo_v3.html`, que é a referência visual das telas.
4. Peça uma etapa por vez, na ordem abaixo. Confira o resultado antes da próxima. Peça sempre que o Claude Code explique as decisões que tomou.

Este documento descreve comportamento e dados. A stack (linguagem, framework, banco, provedor de deploy) é a que já existe no repositório. O Claude Code deve ler o repositório antes de qualquer alteração e adaptar as instruções ao que encontrar, sem trocar tecnologia.

## Regras que valem em todas as etapas

As nove regras da seção 6 do CONTEXTO, mais:

- Nenhuma alteração de schema sem entregar os comandos de migração para o ambiente remoto, aplicados antes do deploy.
- Variáveis de configuração em arquivo versionado; só segredos no painel do provedor.
- Nenhum texto de conteúdo escrito pelo Claude Code. Onde falta texto, deixar marcador `[preencher]` visível.
- Nenhuma cor, fonte ou espaçamento escrito à mão fora do arquivo de tokens.
- Ao final de cada etapa, listar o que foi alterado e como testar.
- Processo de migração do `docs/06-operacao.md` e regra 10 do `CLAUDE.md`: remoto, verificação, registro numerado, depois deploy. Um comando por bloco. Migração aditiva: no SQLite, remover coluna ou alterar `CHECK` é tabela nova, cópia, troca de nome e recriação dos índices.
- Após todo deploy, procurar as quatro linhas de log de falha de cache e registro descritas no docs/06.
- Sempre que uma etapa mudar vocabulário, dados ou fluxo, atualizar `CLAUDE.md` (seções "Vocabulários fechados" e "Estado atual dos dados") e o docs correspondente na mesma entrega.
- `CACHE_ENABLED` permanece `"false"` até a etapa 7.

---

## Etapa 0. Migração 002

Aplicar a migração 002 no remoto como está (`registros.origem`, `paginas`, `formatos`), rodar o bloco 4 de verificação (esperado `1, 1, 1`) e registrar no docs/06. O código publicado já a espera. Sem alteração de código.

Critério de aceitação: bloco 4 devolve `1, 1, 1`; linha de registro escrita.

---

## Etapa 1. Levantamento

Ler o repositório e responder, sem alterar nada:

- Onde vivem hoje as listas de públicos e de temas, e quais valores existem (há mais de quatro públicos e os nomes antigos de tema).
- Schema atual da tabela de trechos e de qualquer tabela de apoio.
- Como o filtro (camada 2) seleciona trechos e como o agente (camada 3) recebe o recorte.
- Onde estão os textos fixos das páginas, as rotas de Metodologia e Transparência, o rodapé e o cabeçalho.
- Como o cache de páginas é invalidado.
- Onde estão as regras de formato que o agente já usa.

Critério de aceitação: um relatório curto com esses seis pontos e os caminhos dos arquivos. (Concluída em 01/09/2026.)

---

## Etapa 2. Taxonomia no banco

### Listas fechadas

Públicos (identificador guardado no banco → nome na tela):

| identificador | nome na tela | cor |
|---|---|---|
| `jovens` | Jovens | `#26cbff` |
| `60+` | 60+ | `#16c172` |
| `mulheres beneficiárias` | Mulheres beneficiárias | `#ffb23d` |
| `mulheres de 2 a 5 salários mínimos` | Mulheres de 2 a 5 SM | `#7e2dff` |

Macronarrativas (na tela, "tema"; temas não têm cor):

| identificador | nome na tela |
|---|---|
| `dinheiro no bolso` | Dinheiro no bolso |
| `trabalho digno` | Trabalho digno |
| `família e cuidado` | Família e cuidado |
| `brasil e pertencimento` | Brasil e pertencimento |
| `participação e voz` | Participação e voz |

Tipos: `achado`, `funciona`, `afasta`, `contexto`, `exemplo`, `verbatim`, `perfil`.
Força: `forte`, `indício`. Só em achado.

De-para dos nomes antigos, para migrar o que já existe no banco: `proteção do trabalhador` e `trabalho e direitos` → `trabalho digno`; `proteção da família` → `família e cuidado`; `brasil soberano` → `brasil e pertencimento`; `engajamento cívico` → `participação e voz`; `idosos` → `60+`.

Qualquer valor de público fora dos quatro é removido do sistema (listas, telas, rotas, cache).

Uma fonte só para as listas: um módulo compartilhado com identificador, nome na tela e cor, importado pelo Worker, pelos scripts e usado no build do front. As quatro cópias literais atuais (`src/worker.js`, `public/index.html`, `scripts/csv-para-seed.js`, `scripts/gera-cache.js`) passam a ler dele.

### Tabela de pautas

Nova tabela com as 59 pautas de `DECISIVAS_pautas_de_para_v1.xlsx`: `pauta_consolidada`, `macronarrativa_padrao`. A coluna `pauta_original` é histórico e não precisa entrar no banco. A pauta `comunicação e linguagem` tem tema padrão "vale para os 5 temas".

### Tabela de trechos

Nove colunas, nomes exatos: `id`, `texto`, `publico`, `macronarrativa`, `pauta`, `tipo`, `forca`, `link`, `pagina`.

Restrições:
- `id` único, texto.
- `publico` em lista fechada. Obrigatório.
- `macronarrativa` em lista fechada. Vazia apenas quando `tipo = perfil`.
- `pauta` referencia a tabela de pautas. Vazia apenas quando `tipo = perfil`.
- `tipo` em lista fechada.
- `forca` em lista fechada. Preenchida apenas quando `tipo = achado`; vazia nos demais.
- `link` sempre vazio nesta versão. A coluna existe, não se usa.
- `pagina` texto livre, só auditoria.

Remover `base` e `despersonalizado`. Remover a obrigatoriedade e a chave estrangeira de `id_documento`: o documento de origem está no prefixo do `id` (D01 a D13). A coluna pode ficar, vazia, ou sair; decidir pelo menor custo de migração e registrar.

Tabelas `documentos` e `recursos` permanecem, sem uso nesta versão. Registrar isso no docs/02 e no CLAUDE.md (regra 2 sobre links passa a "adiado para depois do beta").

`CHECK` de `tipo` passa a incluir `perfil`. Índices `idx_trechos_match` e `idx_trechos_midia` recriados.

Cache com pauta: `paginas` e `formatos` ganham a coluna `pauta` na chave (valor vazio para a visão geral). Como a 002 acabou de criá-las, isso entra na mesma 003, aditiva.

Critério de aceitação: migração 003 escrita, aplicada no remoto antes do push, verificada, registrada no docs/06; as restrições rejeitam um insert com valor fora da lista; CLAUDE.md e docs/02 atualizados.

---

## Etapa 3. Carga do acervo

Fonte: `dados/DECISIVAS_acervo_v5.xlsx`, aba `acervo`, 2.405 linhas.

Caminho de carga: um script novo (substitui `csv-para-seed.js`) lê o xlsx, valida contra as restrições da etapa 2, e emite o SQL em blocos; a aplicação no remoto é por `wrangler d1 execute --remote` autenticado. Se `wrangler` não estiver autenticado na máquina, o script grava os blocos em arquivos `.sql` numerados para colar no console, e o relatório de validação sai antes, no terminal.

Junto com a carga: mover `data/` para `dados/` (`versao-acervo.txt` e referências em código, `wrangler.toml`, `.gitignore`, CLAUDE.md e docs), aposentar `data/amostra.csv`, atualizar `dados/versao-acervo.txt` para a data da carga e criar `ACERVO_ATUALIZADO_EM` no `wrangler.toml` com a mesma data.

- Carga idempotente: rodar duas vezes não duplica.
- Substitui integralmente o acervo anterior. Nada do que existia antes permanece se não estiver no arquivo.
- Validar antes de gravar: todas as linhas passam nas restrições da etapa 2. Se uma falhar, abortar e listar.
- Após a carga, imprimir a contagem por público × tema × tipo. Referência esperada: 20 cruzamentos com trechos; perfil por público: jovens 20, 60+ 30, beneficiárias 22, mulheres de 2 a 5 SM 19; 94 achados `forte` em 1.219.
- Invalidar o cache das 20 páginas.

Critério de aceitação: contagem impressa igual à do arquivo; nenhuma linha rejeitada; cache vazio; nenhuma referência a `data/` no repositório.

---

## Etapa 4. Filtro e tags de pauta

O filtro (camada 2, código sem IA) entrega ao agente:

1. Todos os trechos do cruzamento (público × tema), agrupados por tipo, inclusive `verbatim`, marcados como referência de linguagem que não sustenta afirmação. Sem teto: a geração acontece uma vez por recorte e vai para o cache, então o custo é fixo. `TETO_TRECHOS` e `limitaSubconjunto` deixam de existir.
2. Os trechos de tipo `perfil` do público, que não dependem do tema.
3. A lista de pautas presentes naquele cruzamento, com a contagem de trechos em cada uma. Essas são as tags da página.

Versões por pauta: além da versão geral do cruzamento, o filtro produz um recorte por pauta (os trechos daquela pauta mais os de pauta `comunicação e linguagem`). No beta, o agente gera para cada recorte de pauta **só o gatilho**; a adaptação de formato por pauta fica para depois do beta. Tudo é gerado uma vez e vai para o cache; nada é gerado no clique.

Pautas com menos de 3 trechos no cruzamento não viram tag. `comunicação e linguagem` não é tag: entra em todo recorte, mas não aparece como botão.

A validade do cache (`idsAcervoAtual`) passa a considerar o recorte, com pauta, e o modelo.

Critério de aceitação: para o cruzamento `mulheres beneficiárias` × `dinheiro no bolso`, listar as tags que o filtro produz e o número de trechos de cada uma; `comunicação e linguagem` não está entre elas.

---

## Etapa 5. Agente

O agente recebe: o recorte do filtro e as três planilhas de regra da pasta `dados/`: `Regra_geral_formatos` (RG, vale para o match e para o formato), `Regra_gatilho` (RGT, só para o bloco gatilho) e `Regra_selecao` (RS, para escolher até 3 itens de ancorar e de evitar). Na rota de formato, também o `docs/08-regras-de-formato.md`, que continua sendo a fonte dos limites por formato (linhas do WhatsApp, estrutura do carrossel, roteiro). Em conflito entre planilha e docs/08, a planilha prevalece; registrar isso no cabeçalho do docs/08. As regras entram no prompt como texto; converter cada planilha em bloco de texto no build (`sincroniza-tokens.js` ou script irmão), não à mão. O prompt de sistema passa a existir num só lugar; `docs/03` e `scripts/testa-modelos.js` leem dele.

Mínimos por bloco, substituindo os atuais: gatilho e "o que a pesquisa mostra" exigem 1 achado de qualquer força (RGT07: indício serve; a recorrência é desempate, não requisito). "Por que falar" exige 1 `contexto`; sem contexto, lacuna, como manda o CONTEXTO. Ancorar e evitar: até 3, pelas RS.

O agente escreve cinco campos: por que falar com este público sobre este tema; o que a pesquisa mostra; o gatilho; o que ancorar (até 3); o que evitar (até 3). Mais as adaptações de formato (WhatsApp, carrossel, roteiro de vídeo).

Regras fixas no prompt:
- Usar apenas os trechos recebidos. Não completar.
- Quando um bloco não tem trecho, devolver o marcador de lacuna, nunca texto.
- Ancorar e evitar: exatamente o número de trechos elegíveis, até 3, escolhidos pelas RS. Se há menos de 3, devolver os que há e o marcador de lacuna. Isso exige mudar o contrato: o JSON da página aceita lista de 0 a 3 itens mais um campo de lacuna; `formatoValido` deixa de exigir exatamente 3; `resultado.html` mostra os itens que vieram e a caixa de lacuna abaixo quando são menos de 3.
- Nunca escrever URL.
- Nunca citar ou aludir a candidatura, partido ou figura política.
- Português do Brasil.
- Modelo fixo, sem roteamento.

Texto do rótulo de IA, anexado por código ao final de cada saída gerada e ao texto copiado, em itálico, tamanho pequeno:
"Texto organizado por inteligência artificial a partir do banco de pesquisa próprio do DECISIVAS. Não usa fontes externas, não indica voto e não menciona candidaturas."

Critério de aceitação: gerar `60+` × `trabalho digno` e conferir que "O que ancorar" traz 2 itens e a lacuna. Gerar `jovens` × `brasil e pertencimento` (19 achados, nenhum forte) e conferir que o gatilho é gerado, não lacuna. Gerar `jovens` × `participação e voz` e conferir 3 e 3, de pautas diferentes quando possível.

---

## Etapa 6. Telas

Referência visual: `referencia/decisivas_prototipo_v3.html`. Reproduzir estrutura, ordem e comportamento; a identidade final vem dos tokens abaixo.

### Tokens

Único arquivo de tokens. Nenhum valor fora dele.

Cores: `#ff5aac` rosa, `#16c172` verde, `#26cbff` azul claro, `#ffb23d` laranja, `#b4db00` verde claro, `#ffcc32` amarelo, `#0f02fd` azul, `#ff3131` vermelho, `#7e2dff` roxo, `#f7f7ed` off-white, `#000000` preto.

Fundo da página: off-white com grade suave (linhas finas em preto a 6% de opacidade, passo de 22 px). Cartões: branco ou off-white com borda preta de 2 px.

Tipografia: Inclusive Sans (Google Fonts), pesos 300 a 700. Títulos em 700.

Contraste, conforme a identidade: texto corrido em off-white sobre roxo, vermelho, azul e verde; em preto sobre amarelo, verde claro, laranja, azul claro e rosa. Não combinar vermelho com rosa nem azul com roxo.

Cor por público conforme a tabela da etapa 2. Temas não têm cor.

### Estrutura do site

Três páginas: Início, Sobre, Política de privacidade. Remover Metodologia e Transparência; redirecionar `/metodologia.html` e `/transparencia.html` para `/sobre.html` via `public/_redirects` (o Worker só roda em `/api/*`).

Cabeçalho, em toda página, de cima para baixo:
1. Banner de identidade: conforme o protótipo v3 (220 px, troca a cada 5 s, com transição; respeitar `prefers-reduced-motion`), rotação entre as imagens da pasta de assets. Enquanto os assets não chegarem, faixa provisória com o padrão de linhas coloridas do protótipo. Cabeçalho e rodapé saem de um único parcial incluído no build, não repetidos em cada HTML.
2. Barra preta com o logotipo DECISIVAS à esquerda e a navegação à direita: Início, Sobre.

### Início

Pergunta em destaque: "Com quem você quer falar hoje?" por padrão. Abaixo, os 4 públicos como pílulas na cor de cada um (nome na tela, não o identificador), depois os 5 temas como pílulas com borda preta. Botão principal: **VER CAMINHOS**, ativo quando há um público e um tema escolhidos. Leva à página de resultado do cruzamento.

As variações da pergunta para teste são as duas que o protótipo v3 já traz, definidas em arquivo de configuração, com a padrão acima como primeira.

### Resultado

Blocos nesta ordem, com estes títulos:

1. Identificação: pílula do público, pílula do tema, "acervo atualizado em [data da última carga]". Sem contador de fontes, sem chips de fonte.
2. Tags de pauta: rótulo "Ajustar o ângulo da mensagem", botão "Visão geral" selecionado por padrão, uma tag por pauta que o filtro produziu. Selecionar uma tag troca só o gatilho e a adaptação de formato pela versão daquela pauta, com um selo indicando a pauta ativa. Os demais blocos não mudam.
3. Por que falar com este público sobre este tema
4. O que a pesquisa mostra
5. O gatilho da mensagem
6. O que ancorar (lado a lado com o 7 em telas largas)
7. O que evitar
8. Quem é este público
9. Hábitos de mídia: à esquerda, o card semiótico do público (imagem fixa 1000 × 1250, uma por público, da pasta de assets; placeholder até chegar); à direita, o conteúdo da planilha de hábitos de mídia, filtrado só por público. Enquanto a planilha não existir, lacuna.
10. Adaptar formato: botões WhatsApp, Carrossel, Roteiro de vídeo em cores diferentes da paleta, botão Copiar. Identificadores de formato os que o Worker já usa (`whatsapp`, `carrossel`, `roteiro`). Área de saída em texto puro.
11. Rótulo de IA em itálico pequeno abaixo da área de saída, e anexado ao texto copiado.

Não existe mais o bloco "Exemplos e materiais" nem qualquer link externo na página. Não existe botão para especial BRIEF.

Lacuna: quando um bloco não tem material, mostrar "Evidência insuficiente no acervo para este item." em caixa própria. Nunca esconder o bloco.

### Sobre

Página única. Estrutura, de cima para baixo: vídeo de apresentação (embed do YouTube via `youtube-nocookie.com`, 16:9, id em configuração, `[preencher]`); texto sobre o projeto `[preencher]`; os 4 públicos com o texto de cada um `[preencher]`; os 5 temas com o texto de cada um `[preencher]`; quem faz `[preencher]`; aviso completo sobre o uso de inteligência artificial e a origem dos dados `[preencher]`.

Vídeo na abertura: na primeira tela do Início, abrir o vídeo em janela sobreposta, com botão "Fechar e ver caminhos". Sem armazenamento local: a janela aparece a cada visita. Sem reprodução automática com som.

### Rodapé

Preto, em toda página, três colunas: à esquerda, DECISIVAS e uma linha de assinatura `[preencher]`; ao centro, NAVEGAÇÃO (Início, Sobre o projeto, Vídeo de apresentação, Política de privacidade); à direita, CONTATO (e-mail `[preencher]`, Instagram `[preencher]`, São Paulo · Brasil). Barra inferior: à esquerda, "ORGANIZAÇÃO" seguido do logo da Quid e "REALIZAÇÃO" seguido do logo do BRIEF, ambos SVG monocromáticos off-white, 24 px de altura; à direita, "© 2026 · Todos os direitos reservados".

### Assets

Pasta única de assets com: imagens do banner (SVG ou PNG 2560 × 360), logo DECISIVAS (SVG), logos Quid e BRIEF (SVG off-white), 4 cards semióticos (1000 × 1250), favicon (SVG e PNG 512). Enquanto um asset não existir, placeholder com borda tracejada e o nome do arquivo esperado.

Critério de aceitação: percorrer os 20 cruzamentos sem erro; lacunas aparecem como texto; nenhuma referência a público ou tema antigo em listas, etiquetas, rotas ou telas (o campo `texto` dos trechos pode citar "idosos" ou nomes antigos: é conteúdo de pesquisa e não conta); rotas de Metodologia e Transparência redirecionam; nenhum link externo na página de resultado; a data em "acervo atualizado em" aparece.

---

## Etapa 7. Regenerar e publicar

1. Commit de `CACHE_ENABLED = "true"` e deploy **antes** do lote, senão a geração paga e não grava. `DELETE FROM paginas; DELETE FROM formatos;` antes de gerar, porque prompt e regras mudaram e isso não invalida o cache sozinho. Reescrever `scripts/gera-cache.js` para os 20 cruzamentos, os recortes por pauta e os três formatos. Gerar e gravar.
2. Conferir os três cruzamentos com lacuna em "O que ancorar": `60+` × `dinheiro no bolso`, `60+` × `trabalho digno`, `60+` × `brasil e pertencimento`.
3. Script novo que lê as páginas e formatos gravados no cache e varre com `BLOCKED_TERMS`. Zero ocorrências. Sem `[env.*]` no `wrangler.toml`, a pré-visualização de branch usa o mesmo D1 e o mesmo cache da produção: rodar o lote só a partir da main.
4. Deploy. Login de proteção permanece até a data do beta.

---

## Etapa 8. Depois do beta

Pendências de código já listadas na seção 8 do CONTEXTO, nesta ordem: proteção anti-abuso (verificação anti-robô e limite de requisições por pessoa), correção do cache do navegador, revisão final de segurança. Não entram antes do beta salvo sobra de tempo.

---

## Decisões aplicadas neste documento, para registro

- Rótulo de IA: só onde há conteúdo gerado, itálico pequeno; explicação completa no Sobre.
- Tags de pauta versionam gatilho e adaptação de formato; ancorar e evitar não mudam.
- Contador de fontes e chips de fonte: removidos.
- Bloco de exemplos e links: removido nesta versão.
- Vídeo de abertura sem armazenamento local.
- Rótulos do rodapé: ORGANIZAÇÃO para Quid, REALIZAÇÃO para BRIEF.
- Textos fixos: todos `[preencher]` até Lucas enviar.
- Teto de trechos removido; geração única por recorte.
- Mínimo de achado forte removido; indício basta (RGT07).
- Versões por pauta no beta: só gatilho. Adaptação de formato por pauta depois.
- `comunicação e linguagem` entra em todo recorte e não é tag.
- Planilhas de regra prevalecem sobre docs/08 em conflito; docs/08 segue dono dos limites por formato.
- `data/` vira `dados/`. `documentos` e `recursos` ficam sem uso.
- Acervo v5: 38 trechos removidos pela regra 4 (alusão a figura, avaliação de governo, segmento por intenção de voto), 35 verbatim do D06 sem a atribuição de grupo político, ids sem ponto, 5 pautas completadas, 7 duplicatas dentro do mesmo cruzamento removidas.
