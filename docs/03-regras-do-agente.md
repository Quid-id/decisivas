# Regras do agente

Estas regras são requisito de arquitetura. Implementar no Worker, não confiar apenas no prompt.

## Antes de chamar o modelo (código)

1. `AGENT_ENABLED != "false"`, senão resposta estática de indisponibilidade.
2. Token do Turnstile válido.
3. Limite por IP (padrão: 20 requisições por hora por rota).
4. `publico` e `macronarrativa` pertencem aos vocabulários fechados; qualquer outro valor → 400 sem chamar o modelo.
5. Subconjunto vazio ou abaixo dos mínimos → resposta de lacuna montada por código, **sem chamar o modelo**.

## Prompt de sistema da rota /api/match

```
Você preenche uma página de apoio à comunicação de temas de interesse público,
usando exclusivamente os trechos de pesquisa fornecidos abaixo. Regras absolutas:

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

Formato: {"importa": {"texto": "...", "ids": []},
          "pesquisa": {"texto": "...", "ids": []},
          "funciona": {"itens": ["...","...","..."], "ids": []},
          "afasta": {"itens": ["...","...","..."], "ids": []},
          "sintese": {"texto": "...", "ids": []}}
```

## Depois da resposta (código)

- Validar o JSON contra o formato. Fuga de formato → 1 nova tentativa → indisponibilidade.
- Verificação de segurança na saída: se a resposta contiver qualquer item de uma lista de termos bloqueados (nomes de figuras políticas, partidos, "vote", "candidato"), descartar e responder indisponibilidade. A lista fica em variável de ambiente, fora do repositório.
- Anexar por código: chips de fonte por id, nota de base restrita, bloco de hábitos de mídia, links de `recursos`.
- Gravar em `registros` antes de devolver.

## Rota /api/formato

- Entrada: a página já entregue + formato da lista fechada (whatsapp, carrossel, roteiro).
- O banco não é reconsultado; o modelo recebe só a página.
- Prompt fixo por formato, com as mesmas regras 2, 3 e 8.
- Nenhum campo de texto livre do usuário chega ao modelo, em nenhuma rota.

## Recusas com resposta pronta (sem modelo)

Qualquer tentativa de uso fora dos botões (rota inexistente, formato fora da lista, corpo malformado) recebe respostas estáticas. O agente não conversa: ele preenche uma estrutura e adapta formatos, nada além.
