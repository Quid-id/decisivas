# DECISIVAS. Especificação da etapa 8: páginas fixas

Versão 1, 02/09/2026. Substitui, a partir da etapa 8, a especificação anterior (etapas 0 a 7). Lê-se junto com o CONTEXTO_DECISIVAS.md versão 3, que prevalece em conflito.

## O que mudou e por quê

As páginas geradas pelo modelo no acesso saíram com texto genérico. Decisão de 02/09/2026: as 20 páginas passam a ser texto fixo, escrito pela equipe a partir do acervo e validado pelo jurídico. O modelo deixa de escrever página. O acervo e o banco ficam, como base de um recurso futuro, "Explorar o acervo", que devolve trechos da pesquisa e não redige.

## Como usar

1. Cole `docs/CONTEXTO_DECISIVAS.md` (v3) e este documento.
2. Suba `conteudo/` (cinco JSON) e `referencia/decisivas_prototipo_v5.html`.
3. Peça uma sub-etapa por vez: 8A, 8B, 8C. Confira antes de seguir.

## Regras que valem em todas as sub-etapas

- Nenhum texto de conteúdo escrito pelo Code. Tudo vem de `conteudo/*.json`. Onde faltar, `[preencher]` visível.
- Nenhuma cor, fonte ou espaçamento fora de `brand/tokens.css`.
- Migração no remoto antes do deploy, processo do docs/06.
- Sem cookie próprio, sem script de terceiro. Fontes servidas pelo próprio site.
- Um PR por sub-etapa, com "o que mudou" e "como testar".

---

## 8A. Limpeza e arquivamento

Objetivo: o repositório descreve só o que existe. Nada apagado do histórico; o que sai vai para `arquivo/` com um `LEIA-ME.md` de uma linha por item dizendo o que era e quando saiu.

Sai para `arquivo/`:
- Geração de página por modelo: `prompts/match.txt`, `prompts/pauta.txt`, `prompts/formato.txt`, `scripts/gera-prompts.js`, `scripts/gera-cache.js`, `scripts/testa-modelos.js`, `scripts/varre-termos.js` (volta adaptado na etapa 10).
- Regras de redação do agente: `dados/Regra_geral_formatos.xlsx`, `dados/Regra_gatilho.xlsx`, `dados/Regra_selecao.xlsx`.
- Docs superados: `docs/01`, `docs/03`, `docs/05`, `docs/07`, `docs/08`, `docs/DECISIVAS_especificacao_claude_code.md` (v2).
- Cargas e migrações já aplicadas: `carga-003/`, `migracao-003-bloco-02.sql`.
- `referencia/decisivas_prototipo_v3.html`.

Fica:
- `dados/DECISIVAS_acervo_v5.xlsx`, `dados/DECISIVAS_pautas_de_para_v1.xlsx`, `dados/vocabulario.json`, `dados/versao-acervo.txt`, `dados/configuracao.json`.
- `conteudo/` (novo). `brand/`. `paginas/`, `parciais/`, `scripts/gera-paginas.js`, `scripts/sincroniza-tokens.js`, `scripts/carga-acervo.js`, `scripts/extrai-blocos-migracao.js`.
- `docs/02-schema.sql`, `docs/06-operacao.md`, `docs/CONTEXTO_DECISIVAS.md` (v3), este documento.
- `src/worker.js`, reduzido: só o que a 8B pedir.

Worker: remover `/api/match`, `/api/formato`, cache de páginas e tags, `PROMPT_SISTEMA_*`, `gatilhosPorPauta`, `consultaRecorte` e o que só eles usavam. Registrar em `registros` apenas o que a 8B e a 10 usarem. `AGENT_ENABLED` passa a governar só a rota `/api/explorar` (8B a cria desligada).

Banco, migração 004, um bloco por comando: `DROP TABLE trechos_ate_002;`, `DROP TABLE paginas;`, `DROP TABLE formatos;`. Verificação: as três ausentes, `trechos` com 2.405 linhas, `pautas` com 59. `CACHE_ENABLED` sai do `wrangler.toml`. `docs/02` reescrito para o estado pós-004. `CLAUDE.md` atualizado: vocabulários (70+ na tela), estado dos dados, "o que a plataforma faz".

Critério de aceitação: `grep` sem referência viva a match, formato, cache de páginas ou tags; migração 004 aplicada e verificada; build limpo; site respondendo com as telas da 8B.

---

## 8B. Páginas fixas, cards, compartilhamento

Referência visual: `referencia/decisivas_prototipo_v5.html`. Reproduzir estrutura, ordem, comportamento e tokens.

### Conteúdo

`conteudo/jovens.json`, `conteudo/70mais.json`, `conteudo/mulheres-beneficiarias.json`, `conteudo/mulheres-2-a-5-sm.json`, `conteudo/sobre.json`. Estrutura de cada arquivo de público:

```
publico, nome
quem_e: { destaque: {n, titulo, texto}, texto }
como_chegar: [ {titulo, texto, fonte} × 3 ]
paginas: { <tema>: {
  titulo, linha,
  por_que: { texto: [p1, p2], dados: [ {n?, titulo, texto} × 3 ] },
  funciona: [ {titulo, texto} × 1 a 3 ],
  nao_funciona: [ {titulo, texto} × 1 a 3 ],
  lacuna?: texto,
  resumo: [ 5 linhas ]
} × 5 }
```

O build valida antes de gerar: 4 públicos, 5 temas cada, campos obrigatórios presentes, 1 a 3 cards em funciona e não funciona, 5 linhas de resumo. Falha derruba o build com o caminho do campo.

### Rotas

- `/` Início.
- `/caminhos/<publico>/<tema>`, com slugs: `jovens`, `70-mais`, `mulheres-beneficiarias`, `mulheres-2-a-5-sm`; `dinheiro-no-bolso`, `trabalho-digno`, `familia-e-cuidado`, `brasil-e-pertencimento`, `participacao-e-voz`. A rota antiga `/resultado?publico=...&tema=...` redireciona para a nova.
- `/sobre`, `/privacidade`. `/metodologia` e `/transparencia` seguem redirecionando para `/sobre`.
- 20 páginas geradas no build como HTML estático. Sem chamada de API para exibir página.

### Início

Pergunta "Com quem você quer falar hoje?" (variações em `configuracao.json`), 4 pílulas de público na cor de cada um, 5 de tema com borda preta, botão **VER CAMINHOS** em rosa (`--rosa`), menor que as pílulas, sombra dura, desabilitado até haver público e tema. Janela do vídeo na primeira visita, sem armazenamento local, botão "Fechar e ver caminhos".

### Página de caminho, blocos nesta ordem

1. Cabeçalho: pílula do público (na cor dele), pílula do tema, "texto revisado em [data do conteúdo]". Título `publico × tema`, linha de resumo.
2. **Por que falar com este público sobre este tema**: card de prosa (dois parágrafos) e três cards de dados; o primeiro card de dados usa a cor do público quando tem `n`.
3. **O que funciona**: até três cards em `--verde-claro`, texto preto, prefixo ✓.
4. **O que não funciona**: até três cards em `--vermelho`, texto off-white, prefixo ✕.
5. Se `lacuna` existir, caixa de lacuna logo abaixo do bloco a que se refere, no estilo bege do protótipo.
6. **Quem é este público**: card numérico (`destaque`) na cor do público mais card de texto ocupando duas colunas.
7. **Como chegar nele**: três cards, com a linha de fonte em tipo menor.
8. **Resumo**: bloco preto com as cinco linhas.
9. **Explorar o acervo**: seção presente, com título, texto de apoio, botões de pauta e campo com o botão "Quero explorar mais", **desligada** no beta: os controles aparecem desabilitados e um aviso curto diz que o recurso chega em breve. Nenhuma chamada de rede.

Barra de compartilhamento: fixa à direita, vertical, aparece quando banner e barra de menu saíram da tela e some quando o rodapé começa a entrar (folga de 60 px nas duas pontas). WhatsApp, X, Facebook, LinkedIn, Bluesky e copiar link, por URL de compartilhamento simples, sem script externo. Em telas de até 900 px, horizontal no pé da tela.

Aviso de privacidade: caixa no canto inferior esquerdo, "Este site não usa cookies de rastreamento nem coleta dados pessoais", link para `/privacidade`, botão "Entendi". Sem persistência: reaparece a cada visita.

### Sobre e privacidade

Montadas de `conteudo/sobre.json`: projeto, como foi feito, os quatro públicos (mesmo texto de `quem_e`), os cinco temas, uso de inteligência artificial, quem faz. Vídeo no topo (`youtube-nocookie`, id em `configuracao.json`). `/privacidade` com o texto de `privacidade`, e a data de revisão.

### Identidade

Tokens de `brand/tokens.css`. Fonte Inclusive Sans servida pelo próprio site (arquivos em `assets/fonts/`), sem chamada ao Google Fonts. Banner rotativo de 220 px, imagens em `assets/banner-*`, faixa provisória enquanto não houver. Grade suave no fundo. Rodapé preto com ORGANIZAÇÃO (Quid) e REALIZAÇÃO (BRIEF).

### Responsivo

Três larguras testadas: 390, 820, 1280. Em 390: cards em coluna única, menu compacto, banner de 140 px, barra de compartilhamento horizontal, aviso de privacidade ocupando a largura.

### Público 70+

Nome na tela e slug `70-mais`. O identificador `60+` no banco permanece até a migração 005, depois do beta; `vocabulario.json` faz a ponte (`id: "60+"`, `slug: "70-mais"`, `nome: "70+"`).

Critério de aceitação: 20 páginas geradas do JSON, sem `[preencher]` fora de "quem faz", contato, assinatura e id do vídeo; nenhuma chamada a modelo em nenhuma rota; barra de compartilhamento respeitando cabeçalho e rodapé; três larguras conferidas com captura; Lighthouse de acessibilidade sem erro de contraste nos cards pintados.

---

## 8C. Verificação de conteúdo e publicação

1. Script `scripts/verifica-conteudo.js`: valida a estrutura dos JSON (como no build) e varre todos os textos de `conteudo/` com `BLOCKED_TERMS` (nomes de figuras e partidos). Zero ocorrências. Roda no build e falha se encontrar.
2. Lista de `[preencher]` restantes impressa no fim do build.
3. Deploy pela main. Login de proteção permanece até a data do beta.

---

## Etapa 9. CMS (depois do beta)

CMS de arquivos ligado ao GitHub (Decap CMS ou equivalente), em `/admin`, com login. Coleções: páginas (20), públicos (4), temas (5), Sobre, privacidade, configuração, assets. Cada salvamento é um commit na main; o deploy publica. O CMS edita os mesmos `conteudo/*.json`; não há segundo banco de conteúdo.

## Etapa 10. Explorar o acervo (depois do beta)

Rota `/api/explorar` (`AGENT_ENABLED`). Entrada: público, tema, pauta escolhida ou texto livre. Saída: lista de trechos do acervo (`trechos` no D1) filtrados pelo cruzamento e pela pauta, ou por busca no texto, agrupados por tipo com etiquetas legíveis (Achado, Depoimento, O que funciona, O que afasta). O modelo pode reordenar e escolher os trechos, não redigir. Cache por pergunta, limite de requisições por pessoa, rótulo de IA. Varredura de `BLOCKED_TERMS` na saída. Especificação própria antes de começar.

## Etapa 11. Migração 005 (depois do beta)

Identificador `60+` vira `70+` no banco e no acervo. Tabela recriada pelo processo aditivo do docs/06.
