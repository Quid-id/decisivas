# DECISIVAS — Contexto do projeto

**Versão 3, 02/09/2026.** Reescrita após a decisão de trocar páginas geradas por modelo por páginas fixas escritas pela equipe. Substitui as versões 1 e 2, que ficam no histórico do repositório.

**Como usar este documento.** Cole o conteúdo inteiro no início de uma conversa nova com o Claude, antes de qualquer pedido. Se a resposta contradisser algo daqui, o documento vale. Avise para corrigirmos.

---

## 1. O que é

DECISIVAS é uma plataforma pública e gratuita da Quid para o período eleitoral de 2026. A pessoa escolhe **um público** e **um tema** e recebe uma página fixa com o que a pesquisa mostra sobre essa conversa: por que ela importa, o que funciona, o que não funciona, quem é esse público, como chegar nele e um resumo.

Quem usa: comunicadoras comunitárias, lideranças locais, organizações e gente que precisa falar com esses públicos sem ter uma equipe de pesquisa atrás.

**A plataforma entrega dados e achados. Não escreve a mensagem.** Quem escreve é a pessoa.

### A regra máxima de conteúdo

A plataforma fala de eleições e de **com quem falar, sobre o que falar e como falar**. Não pede voto e não fala de candidatos. Pode citar pesquisas e fontes que mencionem candidatos, parafraseando sem nomeá-los nem preteri-los. Exemplo: "pesquisas recentes, como a Quaest, contrariam o senso comum de que idosos tendem a ser mais conservadores". Sem nome, sem preferência, com a fonte.

Ficam fora também: avaliação ou aprovação de governo ou gestão específica, e alusão a figura política sem nome ("o pai", "quem está no poder").

---

## 2. Vocabulário

| Termo | Significado |
|---|---|
| **Acervo** | Os 2.405 trechos de pesquisa, revisados e etiquetados, que vivem no banco e são a base das páginas e do recurso Explorar |
| **Trecho** | A unidade do acervo: uma informação, com origem, que se entende sozinha |
| **Público** | Um dos quatro grupos abaixo |
| **Tema** | Uma das cinco macronarrativas abaixo |
| **Pauta** | O assunto concreto dentro de um tema. São 59, lista fechada em `dados/DECISIVAS_pautas_de_para_v1.xlsx` |
| **Caminho** | A página fixa de um público com um tema. São 20 |
| **Tipo** | A função do trecho: achado, funciona, afasta, contexto, verbatim, perfil |
| **Bloco** | Cada seção de um caminho |
| **Lacuna** | O aviso de que o acervo não sustenta um bloco. É conteúdo, não erro |
| **Explorar o acervo** | Recurso, ainda desligado, que devolve trechos do acervo para uma pauta ou pergunta. Não redige |

### Os quatro públicos

| Identificador no banco | Nome na tela | Cor | Abrange |
|---|---|---|---|
| `jovens` | Jovens | azul claro | 16 a 34 anos. Estudo, trabalho, renda e autonomia |
| `60+` | 70+ | verde | Pessoas de 70 anos ou mais. O acervo vem de grupos de 70 a 78; dados de mídia usam o recorte nacional 60+ |
| `mulheres beneficiárias` | Mulheres beneficiárias | laranja | Até 2 salários mínimos, inclusive CLT. Renda, cuidado e proteção social |
| `mulheres de 2 a 5 salários mínimos` | Mulheres de 2 a 5 SM | roxo | Microempreendedoras e trabalhadoras de renda média. Trabalho, renda e cuidado |

O identificador `60+` no banco muda para `70+` na migração 005, depois do beta. A regra de renda que separa os dois públicos femininos é interna e não vai para a tela.

### Os cinco temas

`dinheiro no bolso` · `trabalho digno` · `família e cuidado` · `brasil e pertencimento` · `participação e voz`. Temas não têm cor. As duas listas são fechadas.

---

## 3. Como funciona

**Conteúdo fixo.** As 20 páginas vivem em `conteudo/*.json`, um arquivo por público. Foram escritas pela equipe a partir do acervo e da justificativa de públicos e macronarrativas da Quid, revisadas e validadas pelo jurídico. O build monta o HTML. Não há modelo de linguagem no acesso.

**Acervo no banco.** Os trechos ficam no D1 (`trechos`, `pautas`). Servem de base para escrever e revisar as páginas e para o recurso Explorar o acervo.

**Explorar o acervo (desligado no beta).** Dentro de cada caminho, botões com as pautas do cruzamento e um campo de texto. A resposta é uma lista de trechos do acervo com etiquetas legíveis (Achado, Depoimento, O que funciona, O que afasta) e a origem de cada um. O modelo pode escolher e ordenar trechos; não escreve texto. Rótulo de IA, cache por pergunta, limite por pessoa.

**Edição.** No beta, pela interface do GitHub. Depois, por um CMS de arquivos ligado ao repositório (etapa 9). Cada edição é um commit.

---

## 4. Os blocos de um caminho

1. **Cabeçalho**: público, tema, data da revisão do texto, título e uma linha de resumo.
2. **Por que falar com este público sobre este tema**: dois parágrafos e três cards de dados.
3. **O que funciona**: até três cards.
4. **O que não funciona**: até três cards.
5. **Quem é este público**: texto fixo por público, com um número em destaque.
6. **Como chegar nele**: três cards de hábitos de mídia, com fonte.
7. **Resumo**: cinco linhas.
8. **Explorar o acervo**: presente, desligado no beta.

Quando o acervo não sustenta um bloco, a página mostra o que existe e declara a lacuna. Hoje isso acontece em 70+ com dinheiro, trabalho e Brasil, e em trabalho digno para os dois públicos femininos.

---

## 5. Decisões já tomadas, e por quê

**Páginas fixas escritas por pessoas.** A geração por modelo no acesso produziu texto genérico. Texto fixo permite revisão, validação jurídica e edição.

**O acervo fica.** É a base auditável de tudo o que está escrito e do recurso Explorar.

**Explorar o acervo devolve trechos, não prosa.** O que quebrou foi o modelo redigindo. Escolher e ordenar trechos é seguro; escrever não é.

**Sem cookie, sem rastreamento, sem script de terceiro.** Fonte tipográfica servida pelo site. Vídeo do YouTube em modo sem cookie. Compartilhamento por link simples. Por isso o aviso de privacidade é informativo, não um pedido de consentimento.

**Identidade em tokens.** Cores, fonte e espaçamentos em `brand/tokens.css`. Cor por público; temas sem cor. Verde-claro e vermelho para funciona e não funciona, porque não são cores de público.

**Repositório como fonte de verdade.** Conteúdo, configuração e regras vivem em arquivo. O que não usamos mais fica em `arquivo/`, não é apagado.

---

## 6. As regras que não se quebram

1. Nenhuma chave de API em código.
2. Nenhum texto publicado sem revisão humana e validação do jurídico.
3. Não pedir voto. Não nomear candidato, partido ou figura política, nem aludir sem nome. Não avaliar governo ou gestão específica.
4. Não coletar dados pessoais. Sem cadastro, sem cookie de rastreamento, sem script de terceiro.
5. Rótulo de IA visível onde a inteligência artificial participou (Sobre e, quando ligado, Explorar o acervo).
6. Lacuna declarada, nunca preenchida por aproximação.
7. Interface só com os tokens da identidade.
8. Todo texto em português do Brasil.
9. Dados citados têm fonte nomeada.

---

## 7. Como trabalhamos

O repositório é a fonte de verdade; o Claude Code lê arquivos, não conversas. Uma etapa por vez, com "o que vai mudar" antes e "o que mudou e como testar" depois. Migração no remoto antes do deploy, um comando por bloco, registro no `docs/06`. Comandos SQL se copiam de arquivo, nunca de conversa. Quem aplica no banco é uma pessoa, pelo console.

---

## 8. Estado atual

**No ar (atrás de login):** telas da etapa 6, acervo v5 no banco, Worker ainda com geração por modelo (a ser removida na etapa 8A).

**Em produção de conteúdo:** as 20 páginas escritas (`DECISIVAS_20_paginas_v1.docx`), em revisão pela equipe e pelo jurídico.

**Próximas etapas:** 8A limpeza e migração 004; 8B páginas fixas em cards, compartilhamento, privacidade, responsivo; 8C verificação e publicação. Depois do beta: 9 CMS, 10 Explorar o acervo, 11 migração 005 (70+).

**Pendente de conteúdo:** "quem faz" no Sobre, assinatura e contato do rodapé, id do vídeo, assets da identidade (banner, cards, logos, fontes).

**Datas:** beta em 04/09/2026, lançamento em 14/09/2026.

---

## 9. Quando pedir ajuda ao Claude

Exemplos que funcionam bem depois de colar este documento:

- "Revise o texto do caminho jovens × trabalho digno contra a regra máxima de conteúdo."
- "Este trecho do acervo cabe em qual pauta?"
- "Escreva a sub-etapa 8B para o Claude Code a partir da especificação."
- "O que muda no CONTEXTO se ligarmos o Explorar o acervo?"
