# Mapa de recuperação do agente

O agente não navega pelo acervo e não decide onde buscar. O Worker executa as consultas abaixo e entrega ao modelo um subconjunto pronto e travado. Este mapa define, para cada bloco da página de resultado, qual consulta o alimenta, o mínimo para exibir e o que acontece abaixo do mínimo.

| Bloco da página | Consulta no banco | Mínimo | Abaixo do mínimo |
|---|---|---|---|
| O gatilho | publico + macronarrativa, tipo achado (derivado dos achados) | 2, sendo 1 forte (o mesmo da pesquisa) | Lacuna declarada |
| O que ancorar | publico + macronarrativa, tipo funciona | 3 | Lacuna declarada |
| O que evitar | publico + macronarrativa, tipo afasta | 3 | Lacuna declarada |
| Por que isso importa (contexto) | publico + macronarrativa, tipos contexto ou achado | 1 | Lacuna declarada |
| O que a pesquisa mostra | publico + macronarrativa, tipo achado | 2, sendo 1 forte | Lacuna declarada |
| Hábitos de mídia | **publico + pauta 'consumo de mídia', ignorando a macronarrativa** | 1 | Lacuna declarada |
| Exemplos públicos | publico + macronarrativa, tipo exemplo com link preenchido | 2 | Lacuna declarada |
| Materiais complementares | tabela recursos, publico + macronarrativa | 0 (bloco omitido se vazio) | Bloco omitido |

Regras transversais:

1. Teto de 60 trechos por chamada, priorizando força forte e diversidade de pauta.
2. Trechos com decisão diferente de aceitar nunca chegam ao banco, portanto nunca chegam ao agente.
3. Linhas com base restrita carregam a nota de escopo, anexada por código.
4. Links (recursos e coluna link dos exemplos) são anexados por código depois da geração. O modelo nunca os vê nem os escreve.
5. O modelo recebe somente o subconjunto; não tem acesso a SQL, à base completa ou a qualquer ferramenta de busca.
