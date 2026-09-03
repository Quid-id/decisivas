# Arquivo

O que saiu de uso, com o que era e quando saiu. **Nada foi apagado do
histórico**: cada arquivo aqui continua versionado, e o Git guarda tudo o que
existiu antes. Esta pasta existe para o repositório descrever só o que está em
uso — o que está aqui não é lido por nenhum script, build ou rota.

A maior parte saiu na **etapa 8A, em 02/09/2026**, quando as páginas geradas
por modelo no acesso deram lugar a páginas fixas escritas pela equipe. O que
saiu depois traz a data na própria linha.

## Geração de página por modelo

| Item | O que era |
|---|---|
| `match.txt` | prompt de sistema da rota `/api/match`, o recorte geral do cruzamento |
| `pauta.txt` | prompt do recorte por pauta, que entregava só o gatilho |
| `formato.txt` | prompt da rota `/api/formato`, a orientação por formato |
| `gera-prompts.js` | build que injetava as regras das planilhas nesses três prompts |
| `gera-cache.js` | lote que gerava as 20 páginas, as 164 tags e os 60 formatos e gravava no cache |
| `testa-modelos.js` | comparação de modelos do OpenRouter com o prompt real |
| `varre-termos.js` | varredura de `BLOCKED_TERMS` sobre o cache — **volta adaptada na etapa 10** |
| `resultado.html` | a tela de resultado que consumia `/api/match` e `/api/formato` |

## Regras de redação do agente

| Item | O que era |
|---|---|
| `Regra_geral_formatos.xlsx` | as 12 regras RG, que valiam para o match e para o formato |
| `Regra_gatilho.xlsx` | as 7 regras RGT, do bloco gatilho |
| `Regra_selecao.xlsx` | as 7 regras RS, da escolha dos itens de ancorar e evitar |

## Documentos superados

| Item | O que era |
|---|---|
| `01-especificacao.md` | especificação funcional versão 1: telas, blocos e fluxo do match |
| `03-regras-do-agente.md` | prompt de sistema, mínimos de evidência e validações do agente |
| `05-comandos-claude-code.md` | a sequência original de tarefas 1 a 8 |
| `07-mapa-de-recuperacao.md` | qual consulta alimentava cada bloco da página gerada |
| `08-regras-de-formato.md` | governança dos formatos WhatsApp, carrossel e roteiro |
| `DECISIVAS_especificacao_claude_code.md` | especificação em etapas versão 2, das etapas 0 a 7 |
| `decisivas_prototipo_v3.html` | referência visual da etapa 6, substituída pelo protótipo v5 |

## Peças de tela retiradas

| Item | O que era |
|---|---|
| `janela-de-video.html` | a janela do vídeo de abertura do Início, com a marcação e o estilo como estavam. Retirada em 02/09/2026: o vídeo de apresentação passou a viver só na página Sobre, pelo `video_embed` da configuração |
| `caixa-de-lacuna.html` | a caixa bege que declarava a lacuna abaixo do bloco, com a marcação e o estilo como estavam. Retirada em 02/09/2026: o bloco passou a mostrar os cards que existem — 3, 2 ou 1 — e a não ser renderizado quando não há nenhum. O campo `lacuna` segue nos JSON, ignorado pelo build |

## Planilhas de acervo superadas

| Item | O que era |
|---|---|
| `DECISIVAS_acervo_v5.xlsx` | o acervo que foi ao ar na carga de 02/09/2026, 2.405 trechos. Superado em 03/09/2026 pelo v6, que reescreveu 102 trechos em linguagem comum, sem jargão de método — mesmos ids, mesmas colunas, mesmas 2.405 linhas. Fica aqui porque o registro de cargas do `docs/06` cita a carga que ele sustentou |
| `DECISIVAS_acervo_v4.xlsx` | a versão anterior à consolidação da taxonomia nova, nunca carregada no banco. Saiu de uso na etapa 3 e estava em `dados/` desde então |

## Cargas e migrações já aplicadas

| Item | O que era |
|---|---|
| `carga-003/` | os nove blocos SQL da carga do acervo v5, aplicados em 02/09/2026 |
| `migracao-003-bloco-02.sql` | o INSERT das 59 pautas da migração 003, aplicado em 02/09/2026 |
