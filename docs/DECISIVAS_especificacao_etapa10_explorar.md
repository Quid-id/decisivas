# DECISIVAS. Especificação da etapa 10: Explorar o acervo

Versão 1, 02/09/2026. Entra no beta de 04/09. Lê-se com o CONTEXTO v3, que passa a registrar o recurso como ligado.

## O que é

Dentro de cada página de caminho, o bloco "Explorar o acervo" abre o acervo daquele cruzamento (público × tema) para quem quer ir além do recorte editorial da página. Dois modos:

- **Botões de pauta**: consulta direta ao banco, sem modelo. Devolve os trechos do cruzamento que têm aquela pauta.
- **Pergunta livre**: a pessoa escreve o que procura. O modelo lê a pergunta e a lista de trechos do cruzamento e **escolhe** quais respondem. Não redige, não resume, não completa.

Nos dois modos a resposta é uma lista de trechos do acervo, cada um com etiqueta legível e origem. O modelo nunca produz texto que vá para a tela.

## Rota

`POST /api/explorar`, governada por `AGENT_ENABLED`. Corpo: `{ publico, tema, pauta }` ou `{ publico, tema, pergunta }`. `publico` e `tema` são os identificadores do vocabulário; a página envia os dela.

Resposta:
```
{ modo: "pauta" | "pergunta", grupos: [ { etiqueta, itens: [ { texto, origem } ] } ], lacuna: texto | null, rotulo: texto }
```
`origem` é o prefixo do id (D01 a D13) traduzido pelo nome curto do estudo, de uma tabela em `dados/configuracao.json` (`explorar.origens`), por exemplo "Grupos focais com jovens, 2026". Nunca o id cru na tela.

Etiquetas, na ordem: Achado (`achado`, os `forte` primeiro), O que funciona (`funciona`), O que afasta (`afasta`), Depoimento (`verbatim`), Contexto (`contexto`). `perfil` não entra.

**Cinco trechos por resposta**, nos dois modos, agrupados por etiqueta. No modo pauta, um botão "Ver mais" traz os cinco seguintes (paginação por deslocamento, sem modelo). No modo pergunta, o modelo devolve até 5 ids; não há "ver mais", e a pessoa pode refinar a pergunta.

## Modo pauta

Consulta ao D1: trechos com `publico = ?`, `macronarrativa = ?`, `pauta = ?`, cinco por vez, `forte` primeiro. Sem modelo, sem cache, sem custo. Rótulo: `explorar.rotulo_pauta` ("Trechos do acervo de pesquisa do DECISIVAS, sem edição.").

Os botões da página são as pautas do cruzamento com 3 ou mais trechos, como já definido; `comunicação e linguagem` não vira botão.

## Modo pergunta

1. Normalizar a pergunta (minúsculas, sem acento, espaços simples). Se tiver menos de 3 palavras úteis, responder com `explorar.aviso_pergunta_curta`. Se contiver termo de `BLOCKED_TERMS` (nome de figura política, partido), responder com `explorar.aviso_fora_do_escopo` ("A plataforma não trata de candidatos, partidos ou governos. Ela ajuda a falar com públicos sobre temas."), **sem chamar o modelo** e sem registrar o texto da pergunta.
2. Cache: procurar em `consultas` por `publico + tema + pergunta_normalizada`. Se existir e a versão do acervo for a atual, devolver.
3. Recuperar do D1 todos os trechos do cruzamento (`publico`, `macronarrativa`), exceto `perfil`. Cabem inteiros no prompt: o maior cruzamento tem 222.
4. Chamar o modelo (`MODEL_ID`, temperatura 0), com prompt de sistema em `prompts/explorar.txt`, fonte única, sem cópias:
   - recebe a pergunta e a lista numerada de trechos;
   - devolve **apenas** JSON `{ "ids": [n, n, ...] }` com até 5 números, em ordem de relevância, e `{ "ids": [] }` se nenhum trecho responde à pergunta ou se a pergunta não é sobre comunicação com o público e o tema da página;
   - qualquer coisa fora desse formato é descartada e tratada como resposta vazia.

   Por construção, o modelo não tem canal para responder nada: a única saída aceita é uma lista de números que apontam para trechos do D1. Pergunta aleatória, pedido de opinião, pedido de texto pronto: tudo cai em `ids: []` e a tela mostra o aviso de sem resultado. O acervo é o limite do que a plataforma responde.
5. Validar: só números que existem na lista; máximo 5. Agrupar por tipo. Gravar em `consultas`.
6. Se vazio: `lacuna = explorar.aviso_sem_resultado` ("O acervo não tem trechos sobre isso para este cruzamento. Tente um dos assuntos acima.").

Rótulo: `explorar.rotulo_pergunta` ("Seleção feita com apoio de inteligência artificial, apenas com trechos do acervo de pesquisa do DECISIVAS. Não indica voto nem menciona candidaturas.").

## Guardas

- **Saída**: varrer os textos devolvidos com `BLOCKED_TERMS` (segredo de runtime, já existe). Ocorrência remove o trecho e registra.
- **Entrada**: a pergunta passa pela mesma lista `BLOCKED_TERMS` antes de qualquer coisa (ver modo pergunta, passo 1). A pergunta não vai para a tela em nenhum caso; só para o modelo e para o registro, e nem para o registro quando barrada.
- **Limite**: 30 perguntas livres por hora por origem, contadas em memória do Worker por hash da rota com sal diário; o endereço não é gravado. Botões de pauta sem limite.
- **Registro**: em `registros`, uma linha por consulta: rota, público, tema, modo, pauta ou pergunta normalizada, ids devolvidos, origem (`cache` ou `modelo`). Sem identificação de quem perguntou.
- **Custo**: só o modo pergunta chama o modelo, uma vez por pergunta nova. Cache por pergunta normalizada.

## Banco: migração 005

Uma tabela, aditiva:
```
consultas (publico, macronarrativa, pergunta TEXT, ids TEXT, versao_acervo TEXT, modelo TEXT, criado_em, PRIMARY KEY (publico, macronarrativa, pergunta))
```
Processo do docs/06. A migração do identificador 70+ passa a ser a 006.

## Tela

Como no protótipo v5: título, texto de apoio, botões de pauta, campo de texto e botão "Quero explorar mais", tudo vindo de `configuracao.json`. Resultado abaixo, agrupado por etiqueta, cada item com o texto e a origem em tipo menor; rótulo em itálico no fim. Estado de carregando no botão. Erro de rede ou limite atingido: mensagem de `configuracao.json`, nunca texto técnico. Tudo funciona sem recarregar a página.

## Configuração

`wrangler.toml`: `AGENT_ENABLED = "true"`, `MODEL_ID` (o mesmo modelo usado antes, fixo, sem roteamento). Segredos no painel: `OPENROUTER_API_KEY` (já existe), `BLOCKED_TERMS` (já existe).

## Critérios de aceitação

1. `mulheres beneficiárias` × `dinheiro no bolso`, botão "bolsa família e transferência de renda": devolve 5 trechos, `forte` primeiro, sem modelo, em menos de 1 s; "Ver mais" traz os 5 seguintes.
2. Mesma página, pergunta "como falar de gás de cozinha e conta de luz": o modelo devolve só ids válidos; a tela mostra trechos e nenhum texto que não esteja no acervo; segunda chamada igual vem do cache.
3. Pergunta sem relação ("receita de bolo"): `ids: []`, tela mostra o aviso de sem resultado. Pergunta com nome de figura política: aviso de fora do escopo, sem chamada ao modelo, nada registrado.
4. Resposta do modelo fora do formato: tratada como vazia, sem erro na tela.
5. 31ª pergunta na mesma hora: mensagem de limite, sem chamada ao modelo.
6. Varredura de `BLOCKED_TERMS` na saída testada com um trecho plantado localmente.
7. CONTEXTO, CLAUDE.md e docs/06 atualizados: Explorar ligado no beta, o que é o modo pergunta, o que o modelo faz e não faz.
