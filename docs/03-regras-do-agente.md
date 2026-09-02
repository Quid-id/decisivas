# Regras do agente

Estas regras são requisito de arquitetura. Implementar no Worker, não confiar apenas no prompt.

## O papel do agente

**O agente não escreve a mensagem pronta. Ele entrega o material para que a pessoa escreva** (docs/08-regras-de-formato.md, Parte 1). Em `/api/match`, esse material são cinco campos: o gatilho, o que ancorar, o que evitar, o contexto e o que a pesquisa mostra. Em `/api/formato`, é a orientação para adaptar esse material a um formato, regida exclusivamente por docs/08.

O agente é chamado uma vez por **recorte** (etapa 4). O recorte geral do cruzamento rende os cinco campos; cada tag de pauta rende **só o gatilho**, com o prompt próprio mais abaixo. O que vai em cada recorte está em docs/07-mapa-de-recuperacao.md — o agente não escolhe.

## Antes de chamar o modelo (código)

1. `AGENT_ENABLED != "false"`, senão resposta estática de indisponibilidade.
2. Token do Turnstile válido.
3. Limite por IP (padrão: 20 requisições por hora por rota).
4. `publico` e `macronarrativa` pertencem aos vocabulários fechados; qualquer outro valor → 400 sem chamar o modelo.
5. Recorte vazio ou abaixo dos mínimos → resposta de lacuna montada por código, **sem chamar o modelo**. Vale por recorte: uma tag pode ficar em lacuna sem que a página fique.

## Onde vivem os prompts

**O prompt de sistema existe num só lugar.** Este documento não traz cópia dele: cópia divergente foi o problema que a etapa 5 resolveu. As fontes são

| Arquivo | Serve a |
|---|---|
| `prompts/match.txt` | rota `/api/match`, recorte geral (cinco campos) |
| `prompts/pauta.txt` | recorte de uma pauta (só o gatilho) |
| `prompts/formato.txt` | rota `/api/formato` |

e as regras entram neles **no build**, por marcador, a partir das planilhas:

| Marcador | Fonte |
|---|---|
| `{{REGRAS_GERAIS}}` | `dados/Regra_geral_formatos.xlsx` (RG, 12 regras) |
| `{{REGRAS_GATILHO}}` | `dados/Regra_gatilho.xlsx` (RGT, 7 regras) |
| `{{REGRAS_SELECAO}}` | `dados/Regra_selecao.xlsx` (RS, 7 regras) |
| `{{REGRAS_DE_FORMATO}}` | `docs/08-regras-de-formato.md`, na íntegra |

`scripts/gera-prompts.js` faz a composição e escreve `prompts/gerado/*.txt`, que é o que o Worker importa e o que `scripts/testa-modelos.js` lê. A pasta gerada fica fora do versionamento: mudar uma regra é **mudar a planilha**, não o código.

De cada planilha entram as linhas com id (`RG01`, `RGT03`, `RS07`), com a categoria e a **verificação** — é ela que torna a regra conferível. Ficam de fora o cabeçalho, as notas de manutenção, a coluna `origem` (rastreabilidade interna, com nome de pessoa, que não tem por que ir ao modelo) e as linhas "Em aberto", que são justamente o que ainda não foi decidido. A linha "Ordem de aplicação" da planilha de seleção entra: é regra de precedência entre as RS. Regra sem verificação **derruba o build** — a própria planilha diz que ela não orienta o agente.

**Em conflito entre planilha e `docs/08`, a planilha prevalece**, e está escrito nos dois lugares. O `docs/08` continua sendo a fonte dos limites de cada formato: extensão, estrutura, cuidados próprios.

## Mínimos de evidência (etapa 5)

| Campo | Mínimo | Abaixo do mínimo |
|---|---|---|
| `gatilho` | 1 achado de **qualquer força** (RGT07: indício serve; a recorrência é desempate, não requisito) | Lacuna declarada |
| `pesquisa` | 1 achado de qualquer força | Lacuna declarada |
| `contexto` ("por que falar") | 1 trecho de tipo `contexto`. Achado **não** substitui contexto | Lacuna declarada |
| `ancorar` | 1 trecho de tipo `funciona`; entrega **até 3**, pelas RS | Lacuna declarada |
| `evitar` | 1 trecho de tipo `afasta`; entrega **até 3**, pelas RS | Lacuna declarada |

**Quantos itens** cada bloco de lista traz é decidido por código — é o número de trechos elegíveis, no máximo três — e dito na mensagem do usuário, não no prompt de sistema. O modelo escolhe **quais**, pelas RS; nunca quantos.

Os trechos chegam ao modelo **agrupados por tipo**, cada grupo com um cabeçalho que diz o que aquele tipo é. `verbatim` vai marcado como referência de linguagem, que calibra vocabulário e tom e não sustenta afirmação; `perfil` vai marcado como descrição do público, que não depende do tema. Não há teto de trechos: o recorte inteiro entra.

O formato de saída do recorte geral:

```
{"contexto": {"texto": "...", "ids": []},
 "pesquisa": {"texto": "...", "ids": []},
 "gatilho":  {"texto": "...", "ids": []},
 "ancorar":  {"itens": ["..."], "ids": []},
 "evitar":   {"itens": ["..."], "ids": []}}
```

E o do recorte por pauta: `{"gatilho": {"texto": "...", "ids": []}}`. Validação: o objeto ou `"LACUNA"`. Fuga de formato → 1 nova tentativa → **aquela tag fica em lacuna e não é guardada no cache**, para a requisição seguinte tentar de novo. A página do cruzamento não cai por causa de uma tag.

## Validação da resposta de /api/match (código)

Antes da validação, lacunas mal codificadas são normalizadas para lacuna declarada: um campo com `"texto": "LACUNA"`, `"itens": "LACUNA"` ou itens compostos só de `"LACUNA"` vira o valor `"LACUNA"` — nunca conteúdo. (O teste de modelos registrou as três variantes; sem a normalização, itens escritos "LACUNA" passariam como conteúdo válido.)

Depois, cada um dos cinco campos é `"LACUNA"` ou o objeto esperado:

- `gatilho`, `contexto`, `pesquisa`: `{ "texto": string, "ids": array }`.
- `ancorar`, `evitar`: `{ "itens": array de **zero a três** strings, "ids": array }`. O contrato deixou de exigir exatamente três na etapa 5 (RS06). A validação recusa só o que passa do teto; o que vier acima do número pedido é cortado por código, porque item sem trecho por trás é invenção.

Fuga de formato → 1 nova tentativa → indisponibilidade.

Na página, um bloco de lista com **menos de três itens** sai com os itens que vieram **e** o sinal de lacuna, com dois avisos diferentes: "Evidência insuficiente no acervo para este item." quando não veio nenhum, e "O acervo tem menos de três itens para este bloco neste cruzamento." quando veio um ou dois. A tela mostra a caixa **abaixo** dos itens, nunca no lugar deles.

## Depois da resposta (código)

- Verificação de segurança na saída: se a resposta contiver qualquer item da lista de termos bloqueados, descartar e responder indisponibilidade. A lista fica em variável de ambiente (`BLOCKED_TERMS`), fora do repositório, e traz **somente nomes próprios** — sobrenomes de figuras políticas, nomes e siglas de partidos, nomes de coligações. Nunca palavras temáticas ("voto", "eleição", "candidato"): são vocabulário legítimo do acervo. A comparação ignora maiúsculas e acentos e casa palavras inteiras.
- Ids fora do subconjunto fornecido são removidos dos campos.
- Anexar por código: as tags de pauta (as pautas do cruzamento com 3 trechos ou mais, sem a `comunicação e linguagem`), o bloco de hábitos de mídia e o rótulo de IA, com este texto: “Texto organizado por inteligência artificial a partir do banco de pesquisa próprio do DECISIVAS. Não usa fontes externas, não indica voto e não menciona candidaturas.”
- Gravar em `registros` antes de devolver. Cada recorte gera sua própria linha: a do recorte geral e uma por tag, com a pauta dentro do JSON da resposta (`recorte.pauta`). A tabela não tem coluna `pauta`; se um dia for preciso filtrar por ela no SQL, é migração nova.

## Rota /api/formato

O comportamento é **orientar, não reescrever**: para o formato pedido, o agente entrega, conforme a Parte 3 de docs/08, o gatilho adaptado àquele formato, o que ancorar e o que evitar. **Nunca a mensagem final.**

- Entrada: a página já entregue por `/api/match` + formato da lista fechada (whatsapp, carrossel, roteiro).
- O banco não é reconsultado; o modelo recebe só a página, reduzida à forma canônica por código: apenas os campos conhecidos (gatilho, ancorar, evitar, contexto, pesquisa), só strings, tamanho limitado, URLs removidas. Nenhum texto livre do usuário chega ao modelo, em nenhuma rota.
- Prompt em `prompts/formato.txt`, com as regras gerais (RG) e o documento de formatos já dentro; o único marcador resolvido em tempo de execução é o nome do formato.
- **As regras de cada formato (extensão, estrutura, o que funciona, o que evita) vêm exclusivamente de docs/08-regras-de-formato.md, carregado no prompt no build.** O modelo não inventa técnica de comunicação; o que ele acrescenta é a leitura do acervo daquele cruzamento. Em conflito com as RG da planilha, a planilha prevalece.
- Se a página não trouxer itens de ancorar nem de evitar, o Worker sinaliza por código que a orientação é geral, não específica daquele público (docs/08, Parte 3).

### Validação da resposta de /api/formato (código)

```
{"gatilho": "...", "ancorar": ["..."], "evitar": ["..."]}
```

- `gatilho`: string não vazia.
- `ancorar` e `evitar`: listas com pelo menos um item, todos strings não vazias.

Fuga de formato → 1 nova tentativa → indisponibilidade. Mesma verificação de termos bloqueados e mesma gravação em `registros` da rota match.

## Recusas com resposta pronta (sem modelo)

Qualquer tentativa de uso fora dos botões (rota inexistente, formato fora da lista, corpo malformado) recebe respostas estáticas. O agente não conversa: ele entrega o material de escrita e orienta a adaptação de formatos, nada além.
