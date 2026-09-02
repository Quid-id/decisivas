# DECISIVAS — Contexto do projeto

**Versão 2, 01/09/2026.** Atualizada com as decisões do dia: taxonomia final, pauta como tag, blocos da página, rótulo de IA, links adiados, acervo consolidado sem revisão linha a linha. As mudanças em relação à versão 1 estão marcadas ao longo do texto pelas próprias frases; a versão anterior fica no histórico do repositório.

**Como usar este documento.** Cole o conteúdo inteiro no início de uma conversa nova com o Claude, antes de qualquer pedido. Ele carrega o contexto técnico e o vocabulário do projeto, para que qualquer pessoa da equipe trabalhe a partir das mesmas definições.

Se você é novo no projeto, leia antes de colar. As seções 1 a 4 explicam o que estamos construindo; as seções 5 e 6 explicam por que algumas decisões foram tomadas do jeito que foram, e evitam reabrir discussões já fechadas.

---

## 1. O que é

DECISIVAS é uma plataforma pública e gratuita. A pessoa escolhe **um público** e **um tema**, e recebe o material para construir uma mensagem para aquele público sobre aquele tema.

Quem usa: comunicadoras comunitárias, lideranças locais, gente que precisa falar com essas pessoas e não tem equipe de pesquisa atrás.

**A plataforma não escreve a mensagem.** Ela entrega o gatilho, o que ancorar, o que evitar e como adaptar por formato. Quem escreve é a pessoa.

Essa distinção é a decisão de produto mais importante do projeto. Reduz risco (não distribuímos texto pronto e idêntico) e aumenta utilidade (devolve autoria a quem comunica).

### O que podemos e o que não podemos dizer

Pode: falar de eleições e se apresentar como ferramenta para construir mensagens para públicos decisivos no período eleitoral.

Não pode, em nenhuma circunstância: citar ou aludir a candidatura, partido ou figura política, mesmo sem nome próprio; pedir voto ou sugerir rejeição; produzir material sob encomenda para campanha.

---

## 2. Vocabulário

Cada termo tem um significado, e apenas um.

| Termo | Significado |
|---|---|
| **Acervo** | O conjunto de trechos de pesquisa revisados que alimenta a plataforma |
| **Trecho** | A unidade do acervo: uma informação, com origem, que se entende sozinha |
| **Público** | Um dos quatro grupos abaixo |
| **Macronarrativa** | Um dos cinco temas abaixo. Na tela aparece como "tema" |
| **Pauta** | O assunto concreto dentro de uma macronarrativa. São 59, lista fechada (ver `dados/DECISIVAS_pautas_de_para_v1.xlsx`). Na tela aparece como tag de ângulo, só quando tem 3 ou mais trechos no cruzamento |
| **Cruzamento** | A combinação de um público com uma macronarrativa. São 20 possíveis, cada um é uma página |
| **Tipo** | A função do trecho: achado, funciona, afasta, contexto, exemplo, verbatim, perfil. Nesta versão, exemplo não é usado |
| **Força** | Se o achado é recorrente (`forte`) ou pontual (`indício`) |
| **Bloco** | Cada seção da página de resultado |
| **Gatilho** | O ângulo que mobiliza um público num tema. É um bloco da página, não um tipo de trecho |
| **Lacuna** | O aviso de que o acervo não sustenta um bloco. É conteúdo, não erro |
| **Veto** e **CONFERIR** | Marcações da fase de extração. Deixaram de existir no acervo carregado: tudo entrou, exceto trechos que citam ou aludem a figura política, partido, candidatura ou avaliação de governo específico, removidos pela regra 4 |

### Os quatro públicos

| Identificador | Nome na tela | Abrange |
|---|---|---|
| `jovens` | Jovens | Estudo, trabalho, renda e construção de autonomia |
| `60+` | 60+ | Vida, trabalho, cuidado e participação depois dos 60 |
| `mulheres beneficiárias` | Mulheres beneficiárias | Renda, cuidado e políticas de proteção social |
| `mulheres de 2 a 5 salários mínimos` | Mulheres de 2 a 5 SM | Trabalho, renda e cuidado entre 2 e 5 salários mínimos |

### As cinco macronarrativas

| Identificador | Nome na tela | Abrange |
|---|---|---|
| `dinheiro no bolso` | Dinheiro no bolso | Renda, custo de vida, endividamento, benefícios e impostos |
| `trabalho digno` | Trabalho digno | Jornada, CLT, MEI, proteção, autonomia e tempo |
| `família e cuidado` | Família e cuidado | Educação, saúde, segurança, moradia e redes de proteção |
| `brasil e pertencimento` | Brasil e pertencimento | Identidade, soberania, orgulho, comunidade e país |
| `participação e voz` | Participação e voz | Engajamento, confiança, voto e presença no debate público |

As duas listas são **fechadas**. Nenhum valor novo pode ser criado durante a revisão ou o desenvolvimento.

---

## 3. Como funciona, em quatro camadas

**Camada 1, o acervo.** Trechos de pesquisa qualitativa recortados e etiquetados por público, macronarrativa, pauta e tipo. Vive num banco de dados. Toda linha passou por revisão humana antes de entrar.

**Camada 2, o filtro.** Quando alguém escolhe um cruzamento, o sistema trava o subconjunto de trechos com aquelas duas etiquetas. O agente só enxerga esse recorte. É código, sem IA.

**Camada 3, o agente.** Um modelo de linguagem compõe cinco campos usando **apenas** os trechos recebidos. Não tem acesso ao banco inteiro, não faz busca, não usa conhecimento próprio.

**Camada 4, a montagem.** Hábitos de mídia, links, notas e rótulos são anexados por código, depois da geração. O modelo nunca os vê.

### A fronteira entre IA e código

Isso é central e vale decorar:

| Escrito pelo agente | Anexado por código |
|---|---|
| Gatilho da mensagem | Hábitos de mídia do público |
| O que ancorar | (links e materiais: adiados para depois do beta) |
| O que evitar | |
| Por que falar com este público sobre este tema | Caracterização do público |
| O que a pesquisa mostra | Rótulo de IA e avisos de lacuna |
| Versões do gatilho e da adaptação de formato por pauta (tag) | Tags de pauta e card semiótico do público |

**Por quê:** modelo de linguagem inventa URL com naturalidade. Ao anexar links por código, a partir de tabelas curadas por pessoas, essa classe inteira de erro deixa de existir.

---

## 4. Os blocos da página de resultado

Na ordem em que aparecem:

1. **Identificação** — público, tema e data da última atualização do acervo. Sem contador nem chips de fonte
2. **Tags de pauta** — "Ajustar o ângulo da mensagem". Trocam só o gatilho e a adaptação de formato
3. **Por que falar com este público sobre este tema** — vem dos trechos de tipo `contexto`
4. **O que a pesquisa mostra** — vem dos trechos de tipo `achado`, de qualquer força
5. **O gatilho da mensagem** — composto a partir dos achados, pelas regras de gatilho
6. **O que ancorar** — até três itens, dos trechos de tipo `funciona`, pelas regras de seleção
7. **O que evitar** — até três itens, dos trechos de tipo `afasta`, pelas regras de seleção
8. **Quem é este público** — dos trechos de tipo `perfil`
9. **Hábitos de mídia** — card semiótico do público e planilha própria, filtrada só por público
10. **Adaptar formato** — WhatsApp, carrossel, roteiro de vídeo
11. **Rótulo de IA** — em itálico, pequeno, abaixo da saída gerada e anexado ao texto copiado

O bloco de exemplos e materiais (links curados, especial BRIEF) está adiado para depois do beta. Quando um bloco tem menos de três itens, mostra os que existem e declara a lacuna.

Quando o acervo não sustenta um bloco, a página **declara a lacuna** em vez de preencher por aproximação. Várias páginas terão dois ou três blocos assim. Isso é comportamento correto.

---

## 5. Decisões já tomadas, e por quê

Estas estão fechadas. Reabrir só com motivo novo.

**A plataforma orienta, não escreve.** Mudamos de "gerar a mensagem pronta" para "entregar o material e ensinar a construir". Reduz risco e devolve autoria.

**Cache de páginas.** Cada cruzamento é gerado uma vez e servido indefinidamente, até o acervo mudar. Isso trocou "custo proporcional ao tráfego" por "custo proporcional aos 20 cruzamentos". Com cache, a plataforma custa poucos dólares por mês em qualquer volume de acesso; sem cache, com 5.000 acessos diários, custaria centenas.

**Sem painel de edição de conteúdo.** Os textos fixos vivem como arquivos no repositório, editáveis pela interface do GitHub. Construir um painel consumiria semanas e cada mudança já fica registrada no histórico, o que serve de salvaguarda.

**Links nunca são gerados pelo modelo.** Vêm de planilha curada e verificada por pessoas, e são anexados por código. Nesta versão não há links na página; a planilha entra depois do beta.

**Regras de formato são escritas por nós.** O que funciona no WhatsApp, no carrossel e no roteiro está num documento do repositório. O agente aplica essas regras ao acervo daquele cruzamento; ele não inventa técnica de comunicação.

**O modelo é fixo e auditável.** Não usamos roteamento automático entre modelos, porque isso tornaria o custo imprevisível e a resposta irreprodutível.

**Sem revisão humana linha a linha do acervo.** O acervo v5 foi consolidado por regras aprovadas em lote por Lucas em 01/09/2026. Tudo o que estava nas extrações entrou, exceto o que a regra 4 veda.

**Regras vivem em planilha.** Regra_geral_formatos (RG), Regra_gatilho (RGT) e Regra_selecao (RS), em `dados/`, entram no prompt como texto no build. Em conflito com `docs/08-regras-de-formato.md`, a planilha prevalece; os limites numéricos por formato continuam no docs/08.

---

## 6. As regras que não se quebram

Valem para código, conteúdo e qualquer peça.

1. **Nenhuma chave de API em código.** Segredos vivem no painel do provedor, nunca em arquivo versionado.
2. **O modelo só responde a partir dos trechos recuperados.** Sem conhecimento geral, sem completar lacuna.
3. **O modelo nunca escreve URL.**
4. **Nunca mencionar candidatura, partido ou figura política.** Vale também para alusão sem nome ("quem está no poder", "o pai", "proximidade com o governo") e para avaliação ou aprovação de governo ou gestão específica.
5. **Não coletar dados pessoais.** Sem cadastro, sem rastreamento. O registro interno guarda o que foi entregue, nunca quem pediu.
6. **Rótulo de IA visível** em toda saída gerada, em itálico e tamanho pequeno, com a explicação completa na página Sobre. Texto: "Texto organizado por inteligência artificial a partir do banco de pesquisa próprio do DECISIVAS. Não usa fontes externas, não indica voto e não menciona candidaturas."
7. **Lacuna declarada, nunca preenchimento por aproximação.**
8. **Interface usa apenas os tokens da identidade.** Nenhuma cor, fonte ou espaçamento escrito à mão.
9. **Todo texto em português do Brasil.**

---

## 7. Como trabalhamos

**O repositório é a fonte de verdade.** O Claude Code não lê conversas anteriores; ele lê os arquivos. Tudo que precisa persistir vira arquivo.

**Variáveis de configuração vivem no arquivo de configuração, não no painel.** Valor digitado no painel do provedor é sobrescrito no próximo deploy. Só segredos sobrevivem.

**Toda alteração de estrutura do banco exige migração no ambiente remoto** antes do deploy. Alterar o schema sem entregar os comandos de migração é entrega incompleta.

**Um comando por vez, conferindo o resultado.** Comandos empilhados produzem trabalho que ninguém revisou.

**Ao pedir algo ao Claude:** diga o que quer, o critério de aceitação, e o que não pode acontecer. Peça para ele explicar as decisões que tomou, não só entregar o código.

---

## 8. Estado atual

**Funcionando:** infraestrutura, banco, filtro, agente, telas, adaptação de formatos, cache, identidade provisória. A plataforma está no ar, protegida por login enquanto o acervo não é revisado.

**Em migração:** a taxonomia nova (4 públicos, 5 temas, 7 tipos, 59 pautas) e o acervo v5 (2.405 linhas), conforme `docs/DECISIVAS_especificacao_claude_code.md`. Sem páginas de Metodologia e Transparência: só Sobre, com o vídeo de apresentação.

**Pendente de código:** proteção anti-abuso (verificação anti-robô e limite de requisições por pessoa), correção do cache do navegador, revisão final de segurança.

**Pendente de conteúdo:** textos da página Sobre (projeto, públicos, temas, quem faz, aviso de IA), planilha de hábitos de mídia, cards semióticos e demais assets da identidade, assinatura e contato do rodapé, política de privacidade. Planilha de links: depois do beta.

---

## 9. O que estamos construindo agora

**Regras de gatilho.** Uma planilha com as regras que orientam o agente a formular o gatilho de cada cruzamento. Segue a mesma lógica das regras de formato: nós escrevemos a regra, o agente a aplica ao acervo. Ele não inventa o critério.

Ao contribuir com essa planilha, três princípios:

- A regra descreve **como pensar**, não o que dizer. "Comece pela situação concreta que a pessoa reconhece" é regra; "diga que o preço subiu" não é.
- A regra vale para qualquer cruzamento. Se só serve para um público específico, isso é conteúdo de acervo, não regra.
- A regra precisa ser verificável. Se ninguém consegue dizer se foi cumprida, ela não orienta nada.

---

## 10. Quando pedir ajuda ao Claude

Depois de colar este documento, exemplos de pedidos que funcionam bem:

- "Explique como o filtro decide quais trechos entram numa página"
- "Revise esta regra de gatilho: ela é verificável? Vale para qualquer cruzamento?"
- "Este trecho está bem etiquetado? Público X, macronarrativa Y, tipo Z"
- "O que acontece se um cruzamento não tiver nenhum trecho do tipo afasta?"
- "Escreva o comando para o Claude Code fazer [tarefa], considerando as regras da seção 6"

Se a resposta contradisser algo deste documento, **o documento vale**. Avise para corrigirmos.
