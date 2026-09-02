# Mapa de recuperação do agente

O agente não navega pelo acervo e não decide onde buscar. O Worker executa as consultas abaixo e entrega ao modelo um recorte pronto e travado. Este mapa define, para cada bloco da página de resultado, qual consulta o alimenta, o mínimo para exibir e o que acontece abaixo do mínimo.

O filtro é camada de código, sem IA (etapa 4 de `docs/DECISIVAS_especificacao_claude_code.md`).

| Bloco da página | Consulta no banco | Mínimo | Abaixo do mínimo |
|---|---|---|---|
| O gatilho | publico + macronarrativa, tipo achado | 1 achado de **qualquer força** (RGT07) | Lacuna declarada |
| O que ancorar | publico + macronarrativa, tipo funciona | 1; entrega **até 3**, pelas RS | Lacuna declarada |
| O que evitar | publico + macronarrativa, tipo afasta | 1; entrega **até 3**, pelas RS | Lacuna declarada |
| Por que falar (contexto) | publico + macronarrativa, tipo **contexto** | 1 (achado não substitui) | Lacuna declarada |
| O que a pesquisa mostra | publico + macronarrativa, tipo achado | 1 achado de qualquer força | Lacuna declarada |
| Tags de pauta | publico + macronarrativa, contagem de trechos por pauta | 3 trechos na pauta | A pauta não vira tag |
| O gatilho de uma pauta | publico + macronarrativa, pauta selecionada + `comunicação e linguagem` | o mesmo do gatilho geral, aplicado ao recorte da pauta | Lacuna declarada naquela tag |
| Hábitos de mídia | nenhuma: a consulta por pauta `consumo de mídia` saiu na etapa 4, porque essa pauta não existe entre as 59 da migração 003 | — | Lacuna declarada, sempre, até a planilha própria de hábitos de mídia chegar |
| Quem é este público | publico, tipo `perfil` (não depende do tema) | 1 | Lacuna declarada |

Os blocos de **exemplos públicos** e **materiais complementares** saíram na etapa 6, com o bloco "Exemplos e materiais" da tela. A tabela `recursos` deixou de ser consultada e nenhuma resposta da plataforma carrega link.

## O recorte geral

O recorte de um cruzamento é **todo** trecho de `publico + macronarrativa`, mais os trechos de tipo `perfil` daquele público (que não dependem do tema). **Não há teto**: a geração acontece uma vez por recorte e vai para o cache, então o custo é fixo por versão do acervo, não por acesso.

Os trechos vão ao modelo agrupados por tipo, cada grupo com um cabeçalho que diz o que aquele tipo é. Dois têm tratamento próprio:

- **`verbatim`**: entra marcado como **referência de linguagem** — serve para calibrar vocabulário e tom, e **não sustenta afirmação**. O prompt proíbe usar verbatim como evidência de um achado.
- **`perfil`**: entra marcado como descrição do público, que não depende do tema.

`exemplo` fica fora do prompt de propósito: não tem linha no acervo desta versão e carrega link, e o modelo nunca vê link.

## Tags de pauta e recortes por pauta

O filtro conta os trechos de cada pauta do cruzamento. **Pauta com 3 trechos ou mais vira tag**; abaixo disso, não. A pauta `comunicação e linguagem` **nunca vira tag**: ela entra em todo recorte por pauta, porque linguagem atravessa qualquer ângulo, mas não é um ângulo que a pessoa escolhe.

Para cada tag, o filtro monta um recorte próprio — os trechos daquela pauta mais os da `comunicação e linguagem` — do qual o agente entrega **só o gatilho**. A adaptação de formato por pauta fica para depois do beta.

Cada recorte (o geral e o de cada pauta) tem entrada e validade de cache próprias: mexer numa pauta invalida aquela tag e o recorte geral, e não as outras tags.

Na tela, selecionar uma tag troca **só o gatilho**, com um selo indicando a pauta ativa; os demais blocos não mudam. A adaptação de formato por pauta fica para depois do beta, e a saída de formato diz isso quando há tag selecionada.

## Blocos de lista: até três, mais a lacuna

`ancorar` e `evitar` entregam **o número de trechos elegíveis, no máximo três** (RS06). Quem decide quantos é o código, e o número vai na mensagem ao modelo; o modelo escolhe **quais**, pelas regras de seleção. Com menos de três, a página traz os itens que vieram **e** a caixa de lacuna abaixo deles — nunca no lugar deles.

No acervo v5 isso aparece em 3 dos 20 cruzamentos, todos em `ancorar`: `60+` × `brasil e pertencimento` (1), `60+` × `dinheiro no bolso` (2) e `60+` × `trabalho digno` (2). Nenhum cruzamento tem menos de três em `evitar`.

Com o mínimo de `contexto` restrito ao tipo `contexto`, três cruzamentos ficam com "por que falar" em lacuna: `jovens` × `brasil e pertencimento`, `mulheres beneficiárias` × `brasil e pertencimento` e `mulheres de 2 a 5 salários mínimos` × `família e cuidado`. É lacuna de acervo, não de código.

## Regras transversais

1. Trechos com decisão diferente de aceitar nunca chegam ao banco, portanto nunca chegam ao agente.
2. Nesta versão **não há link nenhum** na página: a tabela `recursos` não é consultada e a coluna `link` não é lida. O modelo nunca vê nem escreve URL.
3. O modelo recebe somente o recorte; não tem acesso a SQL, à base completa ou a qualquer ferramenta de busca.
