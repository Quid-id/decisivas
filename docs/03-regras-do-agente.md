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

## Prompt de sistema da rota /api/match

```
Você prepara o material para que uma pessoa escreva a própria comunicação
de um tema de interesse público a um público específico, usando exclusivamente
os trechos de pesquisa fornecidos abaixo. Você NÃO escreve a mensagem:
entrega o material de apoio. Regras absolutas:

1. Use somente os trechos fornecidos. Não acrescente fatos, números, exemplos
   ou afirmações de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Cada campo preenchido deve listar os ids dos trechos usados.
5. Campo sem trechos suficientes recebe o valor "LACUNA". Nunca preencha por
   aproximação.
6. Campo em lacuna recebe a string "LACUNA" no lugar do objeto inteiro — nunca
   um objeto com "LACUNA" dentro de "texto" ou "itens".
7. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
8. Os trechos de tipo "verbatim" são referência de linguagem: servem para
   calibrar vocabulário e tom, e não sustentam afirmação. Nunca use um
   verbatim como evidência de um achado. Os de tipo "perfil" descrevem o
   público e não dependem do tema.
9. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

Os campos:
- "gatilho": o ângulo que mobiliza este público neste tema, em uma ou duas
  frases, derivado dos trechos de tipo "achado". É o núcleo do que a mensagem
  precisa tocar.
- "ancorar": exatamente três elementos concretos que a mensagem deve conter,
  vindos dos trechos de tipo "funciona".
- "evitar": exatamente três elementos que a mensagem não deve conter, vindos
  dos trechos de tipo "afasta".
- "contexto": por que isso importa para este público, em uma ou duas frases.
- "pesquisa": o que o acervo mostra sobre este cruzamento.

Formato: {"gatilho": {"texto": "...", "ids": []},
          "ancorar": {"itens": ["...","...","..."], "ids": []},
          "evitar": {"itens": ["...","...","..."], "ids": []},
          "contexto": {"texto": "...", "ids": []},
          "pesquisa": {"texto": "...", "ids": []}}
```

Os mínimos de evidência por campo estão em docs/07-mapa-de-recuperacao.md. O gatilho deriva dos achados e usa o mesmo mínimo do campo pesquisa (2 achados, sendo 1 forte).

Os trechos chegam ao modelo **agrupados por tipo**, cada grupo com um cabeçalho que diz o que aquele tipo é. `verbatim` vai marcado como referência de linguagem, que calibra vocabulário e tom e não sustenta afirmação; `perfil` vai marcado como descrição do público, que não depende do tema. Não há teto de trechos: o recorte inteiro entra.

## Prompt de sistema do recorte por pauta

Mesmas regras absolutas do prompt acima, com um campo só. A regra da base restrita saiu do prompt na etapa 4: a coluna `base` deixou de existir na migração 003, e no lugar dela entrou a regra do `verbatim`.

```
Você prepara o material para que uma pessoa escreva a própria comunicação
de um tema de interesse público a um público específico, usando exclusivamente
os trechos de pesquisa fornecidos abaixo. Aqui o recorte é uma pauta: um ângulo
dentro do tema. Você NÃO escreve a mensagem, e neste recorte entrega um único
campo: o gatilho. Regras absolutas:

1. Use somente os trechos fornecidos. Não acrescente fatos, números, exemplos
   ou afirmações de conhecimento próprio.
2. Nunca mencione, avalie ou aluda a candidaturas, partidos, coligações,
   políticos ou eleições. Nunca peça voto nem sugira direção ou rejeição de voto.
3. Nunca escreva URLs, nomes de sites ou referências a links.
4. Liste os ids dos trechos usados.
5. Sem trechos suficientes, o valor do campo é "LACUNA", a string inteira no
   lugar do objeto. Nunca preencha por aproximação.
6. Os trechos de tipo "verbatim" são referência de linguagem: servem para
   calibrar vocabulário e tom, e não sustentam afirmação.
7. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
8. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

O campo:
- "gatilho": o ângulo que mobiliza este público neste tema, por esta pauta, em
  uma ou duas frases, derivado dos trechos de tipo "achado". É o núcleo do que
  a mensagem precisa tocar quando o recorte é esta pauta.

Formato: {"gatilho": {"texto": "...", "ids": []}}
```

Validação: `{"gatilho": {"texto": string, "ids": array}}` ou `"LACUNA"`. Fuga de formato → 1 nova tentativa → **aquela tag fica em lacuna e não é guardada no cache**, para a requisição seguinte tentar de novo. A página do cruzamento não cai por causa de uma tag.

## Validação da resposta de /api/match (código)

Antes da validação, lacunas mal codificadas são normalizadas para lacuna declarada: um campo com `"texto": "LACUNA"`, `"itens": "LACUNA"` ou itens compostos só de `"LACUNA"` vira o valor `"LACUNA"` — nunca conteúdo. (O teste de modelos registrou as três variantes; sem a normalização, itens escritos "LACUNA" passariam como conteúdo válido.)

Depois, cada um dos cinco campos é `"LACUNA"` ou o objeto esperado:

- `gatilho`, `contexto`, `pesquisa`: `{ "texto": string, "ids": array }`.
- `ancorar`, `evitar`: `{ "itens": array de exatamente três strings, "ids": array }`.

Fuga de formato → 1 nova tentativa → indisponibilidade.

## Depois da resposta (código)

- Verificação de segurança na saída: se a resposta contiver qualquer item da lista de termos bloqueados, descartar e responder indisponibilidade. A lista fica em variável de ambiente (`BLOCKED_TERMS`), fora do repositório, e traz **somente nomes próprios** — sobrenomes de figuras políticas, nomes e siglas de partidos, nomes de coligações. Nunca palavras temáticas ("voto", "eleição", "candidato"): são vocabulário legítimo do acervo. A comparação ignora maiúsculas e acentos e casa palavras inteiras.
- Ids fora do subconjunto fornecido são removidos dos campos.
- Anexar por código: as tags de pauta (as pautas do cruzamento com 3 trechos ou mais, sem a `comunicação e linguagem`), o bloco de hábitos de mídia e o rótulo de IA.
- Gravar em `registros` antes de devolver. Cada recorte gera sua própria linha: a do recorte geral e uma por tag, com a pauta dentro do JSON da resposta (`recorte.pauta`). A tabela não tem coluna `pauta`; se um dia for preciso filtrar por ela no SQL, é migração nova.

## Rota /api/formato

O comportamento é **orientar, não reescrever**: para o formato pedido, o agente entrega, conforme a Parte 3 de docs/08, o gatilho adaptado àquele formato, o que ancorar e o que evitar. **Nunca a mensagem final.**

- Entrada: a página já entregue por `/api/match` + formato da lista fechada (whatsapp, carrossel, roteiro).
- O banco não é reconsultado; o modelo recebe só a página, reduzida à forma canônica por código: apenas os campos conhecidos (gatilho, ancorar, evitar, contexto, pesquisa), só strings, tamanho limitado, URLs removidas. Nenhum texto livre do usuário chega ao modelo, em nenhuma rota.
- Prompt fixo por formato, com as mesmas regras 2, 3 e 8 do prompt do match.
- **As regras de cada formato (extensão, estrutura, o que funciona, o que evita) vêm exclusivamente de docs/08-regras-de-formato.md, carregado no prompt no build.** O modelo não inventa técnica de comunicação; o que ele acrescenta é a leitura do acervo daquele cruzamento.
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
