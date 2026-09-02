# Mapa de recuperação do agente

O agente não navega pelo acervo e não decide onde buscar. O Worker executa as consultas abaixo e entrega ao modelo um recorte pronto e travado. Este mapa define, para cada bloco da página de resultado, qual consulta o alimenta, o mínimo para exibir e o que acontece abaixo do mínimo.

O filtro é camada de código, sem IA (etapa 4 de `docs/DECISIVAS_especificacao_claude_code.md`).

| Bloco da página | Consulta no banco | Mínimo | Abaixo do mínimo |
|---|---|---|---|
| O gatilho | publico + macronarrativa, tipo achado (derivado dos achados) | 2, sendo 1 forte (o mesmo da pesquisa) | Lacuna declarada |
| O que ancorar | publico + macronarrativa, tipo funciona | 3 | Lacuna declarada |
| O que evitar | publico + macronarrativa, tipo afasta | 3 | Lacuna declarada |
| Por que isso importa (contexto) | publico + macronarrativa, tipos contexto ou achado | 1 | Lacuna declarada |
| O que a pesquisa mostra | publico + macronarrativa, tipo achado | 2, sendo 1 forte | Lacuna declarada |
| Tags de pauta | publico + macronarrativa, contagem de trechos por pauta | 3 trechos na pauta | A pauta não vira tag |
| O gatilho de uma pauta | publico + macronarrativa, pauta selecionada + `comunicação e linguagem` | o mesmo do gatilho geral, aplicado ao recorte da pauta | Lacuna declarada naquela tag |
| Hábitos de mídia | nenhuma: a consulta por pauta `consumo de mídia` saiu na etapa 4, porque essa pauta não existe entre as 59 da migração 003 | — | Lacuna declarada, sempre, até a planilha própria de hábitos de mídia chegar |
| Exemplos públicos | publico + macronarrativa, tipo exemplo com link preenchido | 2 | Lacuna declarada |
| Materiais complementares | tabela recursos, publico + macronarrativa | 0 (bloco omitido se vazio) | Bloco omitido |

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

## Regras transversais

1. Trechos com decisão diferente de aceitar nunca chegam ao banco, portanto nunca chegam ao agente.
2. Links (tabela `recursos` e coluna `link`) são anexados por código depois da geração. O modelo nunca os vê nem os escreve. Nesta versão não há link nenhum na página.
3. O modelo recebe somente o recorte; não tem acesso a SQL, à base completa ou a qualquer ferramenta de busca.
