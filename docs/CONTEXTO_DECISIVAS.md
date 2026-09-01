# DECISIVAS — Contexto do projeto

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
| **Pauta** | O assunto concreto dentro de uma macronarrativa. Não aparece na tela |
| **Cruzamento** | A combinação de um público com uma macronarrativa. São 20 possíveis, cada um é uma página |
| **Tipo** | A função do trecho: achado, funciona, afasta, contexto, exemplo, verbatim, perfil |
| **Força** | Se o achado é recorrente (`forte`) ou pontual (`indício`) |
| **Bloco** | Cada seção da página de resultado |
| **Gatilho** | O ângulo que mobiliza um público num tema. É um bloco da página, não um tipo de trecho |
| **Lacuna** | O aviso de que o acervo não sustenta um bloco. É conteúdo, não erro |
| **Veto** | Marcação de que o trecho não vai ao ar. Pode ser derrubada por quem revisa |
| **CONFERIR** | Marcação de dúvida sobre a etiqueta. Exige decisão humana, não significa descarte |

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
| O que ancorar | Botão do especial BRIEF |
| O que evitar | Materiais complementares |
| Por que falar com este público sobre este tema | Caracterização do público |
| O que a pesquisa mostra | Rótulo de IA e avisos de lacuna |

**Por quê:** modelo de linguagem inventa URL com naturalidade. Ao anexar links por código, a partir de tabelas curadas por pessoas, essa classe inteira de erro deixa de existir.

---

## 4. Os blocos da página de resultado

Na ordem em que aparecem:

1. **Identificação** — público, tema e data da última atualização do acervo
2. **Por que falar com este público sobre este tema** — vem dos trechos de tipo `contexto`
3. **O que a pesquisa mostra** — vem dos trechos de tipo `achado`
4. **O gatilho da mensagem** — composto a partir dos achados
5. **O que ancorar** — três itens, dos trechos de tipo `funciona`
6. **O que evitar** — três itens, dos trechos de tipo `afasta`
7. **Quem é este público** — dos trechos de tipo `perfil`
8. **Hábitos de mídia** — de planilha própria, filtrada só por público
9. **Exemplos e materiais** — links curados
10. **Adaptar formato** — WhatsApp, carrossel, roteiro de vídeo
11. **Rodapé** — aviso de uso de inteligência artificial

Quando o acervo não sustenta um bloco, a página **declara a lacuna** em vez de preencher por aproximação. Várias páginas terão dois ou três blocos assim. Isso é comportamento correto.

---

## 5. Decisões já tomadas, e por quê

Estas estão fechadas. Reabrir só com motivo novo.

**A plataforma orienta, não escreve.** Mudamos de "gerar a mensagem pronta" para "entregar o material e ensinar a construir". Reduz risco e devolve autoria.

**Cache de páginas.** Cada cruzamento é gerado uma vez e servido indefinidamente, até o acervo mudar. Isso trocou "custo proporcional ao tráfego" por "custo proporcional aos 20 cruzamentos". Com cache, a plataforma custa poucos dólares por mês em qualquer volume de acesso; sem cache, com 5.000 acessos diários, custaria centenas.

**Sem painel de edição de conteúdo.** Os textos fixos vivem como arquivos no repositório, editáveis pela interface do GitHub. Construir um painel consumiria semanas e cada mudança já fica registrada no histórico, o que serve de salvaguarda.

**Links nunca são gerados pelo modelo.** Vêm de planilha curada e verificada por pessoas, e são anexados por código.

**Regras de formato são escritas por nós.** O que funciona no WhatsApp, no carrossel e no roteiro está num documento do repositório. O agente aplica essas regras ao acervo daquele cruzamento; ele não inventa técnica de comunicação.

**O modelo é fixo e auditável.** Não usamos roteamento automático entre modelos, porque isso tornaria o custo imprevisível e a resposta irreprodutível.

---

## 6. As regras que não se quebram

Valem para código, conteúdo e qualquer peça.

1. **Nenhuma chave de API em código.** Segredos vivem no painel do provedor, nunca em arquivo versionado.
2. **O modelo só responde a partir dos trechos recuperados.** Sem conhecimento geral, sem completar lacuna.
3. **O modelo nunca escreve URL.**
4. **Nunca mencionar candidatura, partido ou figura política.**
5. **Não coletar dados pessoais.** Sem cadastro, sem rastreamento. O registro interno guarda o que foi entregue, nunca quem pediu.
6. **Rótulo de IA visível** em toda saída gerada.
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

**Em migração:** a taxonomia nova (nomes de público e macronarrativa) ainda não foi aplicada ao banco nem às telas.

**Pendente de código:** proteção anti-abuso (verificação anti-robô e limite de requisições por pessoa), correção do cache do navegador, revisão final de segurança.

**Pendente de conteúdo:** acervo revisado, textos das páginas institucionais, planilha de hábitos de mídia, planilha de links, identidade visual definitiva, política de privacidade.

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
