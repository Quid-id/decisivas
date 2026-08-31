# Regras do agente

Estas regras são requisito de arquitetura. Implementar no Worker, não confiar apenas no prompt.

## O papel do agente

**O agente não escreve a mensagem pronta. Ele entrega o material para que a pessoa escreva** (docs/08-regras-de-formato.md, Parte 1). Em `/api/match`, esse material são cinco campos: o gatilho, o que ancorar, o que evitar, o contexto e o que a pesquisa mostra. Em `/api/formato`, é a orientação para adaptar esse material a um formato, regida exclusivamente por docs/08.

## Antes de chamar o modelo (código)

1. `AGENT_ENABLED != "false"`, senão resposta estática de indisponibilidade.
2. Token do Turnstile válido.
3. Limite por IP (padrão: 20 requisições por hora por rota).
4. `publico` e `macronarrativa` pertencem aos vocabulários fechados; qualquer outro valor → 400 sem chamar o modelo.
5. Subconjunto vazio ou abaixo dos mínimos → resposta de lacuna montada por código, **sem chamar o modelo**.

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
6. Liberdade de forma, fidelidade de substância: você pode reformular e
   reordenar, mas toda afirmação deve estar sustentada por um trecho fornecido.
7. Trechos com base "restrita" que afirmem prevalência mantêm o escopo
   "entre os participantes do estudo".
8. Responda apenas com o JSON no formato abaixo, sem nenhum texto fora dele.

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

## Validação da resposta de /api/match (código)

Cada um dos cinco campos é `"LACUNA"` ou o objeto esperado:

- `gatilho`, `contexto`, `pesquisa`: `{ "texto": string, "ids": array }`.
- `ancorar`, `evitar`: `{ "itens": array de exatamente três strings, "ids": array }`.

Fuga de formato → 1 nova tentativa → indisponibilidade.

## Depois da resposta (código)

- Verificação de segurança na saída: se a resposta contiver qualquer item da lista de termos bloqueados, descartar e responder indisponibilidade. A lista fica em variável de ambiente (`BLOCKED_TERMS`), fora do repositório, e traz **somente nomes próprios** — sobrenomes de figuras políticas, nomes e siglas de partidos, nomes de coligações. Nunca palavras temáticas ("voto", "eleição", "candidato"): são vocabulário legítimo do acervo. A comparação ignora maiúsculas e acentos e casa palavras inteiras.
- Ids fora do subconjunto fornecido são removidos dos campos.
- Anexar por código: chips de fonte por id, nota de base restrita, bloco de hábitos de mídia, links dos trechos tipo `exemplo` e links de `recursos`.
- Gravar em `registros` antes de devolver.

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
