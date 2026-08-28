# Especificação funcional

## Telas

### 1. Home
- Barra superior: marca DECISIVAS; links Sobre, Metodologia, Transparência.
- Título: "Com quem você quer falar, e sobre o quê?"
- Duas nuvens de tags: **Públicos** (7 tags) e **Temas** (5 macronarrativas). Uma seleção de cada, destacada visualmente.
- Barra de confirmação com o par selecionado e botão "Ver o que sabemos", ativo só com os dois selecionados.

### 2. Página de resultado (o match)
Estrutura fixa, nesta ordem:

1. Etiquetas do match + contagem de fontes + data da última atualização do acervo
2. **Por que isso importa** — parágrafo curto
3. **O que a pesquisa mostra** — 1 a 2 parágrafos, com chips de fonte (nome do estudo, método, período). Se `base = restrita`, exibir a nota: "Achado referente aos participantes do estudo citado, não generalizável ao conjunto do público."
4. **O que costuma funcionar** / **O que costuma afastar** — duas colunas, três tópicos cada
5. **Síntese do tema** — uma frase em destaque
6. **Hábitos de mídia** — bloco com filtro próprio: `publico = selecionado AND pauta = 'consumo de mídia'`, ignorando a macronarrativa
7. **Materiais complementares** — links da tabela `recursos` filtrados pelo match, anexados por código (nunca gerados pelo modelo)
8. Barra "Adaptar formato": botões WhatsApp, Carrossel, Roteiro de vídeo, Copiar
9. Rodapé do cartão: "Conteúdo organizado com apoio de inteligência artificial a partir do acervo de pesquisa. Não indica voto nem menciona candidaturas."

**Lacuna declarada:** campo sem trechos suficientes exibe caixa de aviso: "Evidência insuficiente no acervo para este item." Nunca ocultar o campo em silêncio, nunca preencher por aproximação.

Mínimos por campo (abaixo disso, lacuna): pesquisa 2 achados sendo 1 forte; funcionar 3; afastar 3; exemplos 2 com link.

### 3. Páginas fixas (a salvaguarda)
- **Sobre**: o que é, para quem, e o bloco "O que DECISIVAS não é".
- **Metodologia**: estudos citados com método, amostra e período. Pesquisas são citadas, não disponibilizadas para download.
- **Transparência**: financiamento, responsabilidade editorial, canais oficiais, canal de correção.
Conteúdo dessas páginas vem de arquivos versionados no repositório; a redação final é da equipe.

## Fluxo do match

1. Front chama `POST /api/match` com `{ publico, macronarrativa }` (valores dos vocabulários fechados; qualquer outro valor → 400).
2. Worker checa `AGENT_ENABLED`, Turnstile e limite por IP.
3. Consulta D1: trechos do match (e o filtro próprio do bloco de mídia). Limitar o subconjunto (padrão: 60 trechos, priorizando `forte` e diversidade de `pauta`).
4. Monta o prompt de sistema (docs/03) + trechos e chama o OpenRouter. Modelo definido por variável de ambiente `MODEL_ID` para facilitar troca.
5. Valida a resposta: JSON no formato fixo dos campos; qualquer fuga de formato → uma nova tentativa; persistindo → resposta de indisponibilidade.
6. Anexa por código: chips de fonte, nota de base, links de `recursos`, links dos trechos tipo `exemplo` (coluna `link`), bloco de mídia.
7. Grava em `registros`: timestamp, match, ids dos trechos usados, resposta integral, modelo. Sem IP, sem identidade.
8. Devolve ao front.

## Formatos (`POST /api/formato`)
Entrada: a página já gerada + formato pedido (lista fechada: whatsapp, carrossel, roteiro). O acervo não é reconsultado. Prompts fixos por formato. Mesmas regras de recusa. Botão de copiar no front; nenhuma integração de envio.

## Conteúdo fixo, sem CMS

Os textos das páginas Sobre, Metodologia e Transparência vivem como arquivos markdown em `content/`, convertidos em página no build. Atualizar conteúdo é editar o arquivo e fazer push; não existe painel de edição. Isso é proposital: elimina uma camada de sistema e faz de cada mudança um commit rastreável.

## Registro de alterações (salvaguarda)

Três registros cobrem tudo, sem plugin externo:

1. **Git**: cada commit guarda autor, data e o diff exato do que mudou em conteúdo e código. É o registro primário.
2. **Página pública `/registro-de-alteracoes`**: gerada automaticamente no build a partir do histórico do Git (data e descrição de cada mudança de conteúdo), como demonstração pública de transparência.
3. **Tabela `registros`** no banco: tudo que o agente entregou aos usuários.

O acervo também é versionado: cada carga do banco corresponde a um arquivo de seed commitado, então é possível provar qual versão do acervo estava no ar em qualquer data.

## O que não existe nesta versão
Cadastro/login; comentários; busca em texto livre; download de pesquisas; painel administrativo (a carga é por script); qualquer disparo de mensagem.
