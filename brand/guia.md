# Guia de uso da identidade — VERSÃO PROVISÓRIA

Este guia acompanha o `tokens.css` provisório. Ele existe para que as telas sejam construídas com regras estáveis enquanto a identidade definitiva não chega.

**Quando a identidade real chegar:** substitua os valores em `tokens.css`, o texto deste guia e o `logo.svg`. Os nomes das variáveis não mudam, então nenhuma tela precisa ser reescrita.

## O tom visual desta versão

Sóbrio e editorial. A plataforma é um acervo de pesquisa, não uma peça de campanha, e o visual precisa dizer isso antes de qualquer texto. Fundo claro de papel, tipografia sem serifa, bordas finas, sem sombra e sem gradiente. A hierarquia vem de superfície, espaço e peso de texto, não de efeito.

## Quando usar cada cor

**Fundo e superfície.** `--cor-fundo` é a página. `--cor-superficie` é todo cartão que se destaca dela. `--cor-superficie-alt` é para blocos secundários, como um campo em repouso.

**Destaque.** `--cor-destaque` é a cor da marca e deve ser econômica: título de página, botão principal, tag selecionada. Se tudo é destaque, nada é. `--cor-destaque-suave` é o fundo de tag não selecionada, e por isso aparece bastante; ela é discreta de propósito.

**Aviso.** Reservado à lacuna declarada e a alertas de conteúdo. Não use para erro de sistema. É a cor mais importante do produto depois do destaque, porque a lacuna é conteúdo legítimo e precisa ser visível sem parecer falha.

**Erro.** Só para falha de operação, como requisição que não completou. Nunca para lacuna.

**Positivo.** Confirmações discretas, como conteúdo copiado. Não use para "sucesso" genérico.

## Tipografia

Uma família só, do sistema, o que garante carregamento instantâneo e boa leitura em qualquer aparelho. A distinção entre elementos vem de tamanho e peso, não de troca de fonte.

Corpo em `--texto-base` com `--entrelinha-normal`. Títulos de bloco em `--texto-lg` e `--peso-forte`. Rótulos de campo em `--texto-sm`, `--peso-forte` e `--cor-texto-secundario`. Metadados como fontes e datas em `--texto-xs` e `--cor-texto-suave`.

Texto corrido não passa de `--largura-texto`. Linha longa demais cansa e prejudica quem tem dificuldade de leitura.

## Tags

As nuvens de público e tema são o principal elemento da home. Tag não selecionada usa `--cor-destaque-suave` com texto `--cor-destaque-texto`. Selecionada inverte: fundo `--cor-destaque` e texto `--cor-texto-invertido`. Raio sempre `--raio-tag`.

A diferença entre selecionada e não selecionada precisa ser perceptível sem depender de cor, porque nem todo mundo distingue. Use também peso de texto.

## O que esta identidade não faz

Sem sombra e sem gradiente. Sem ícone decorativo: ícone só quando carrega significado. Sem animação além de transição sutil de estado. Sem caixa alta em texto corrido, apenas em rótulos curtos. Sem cor fora dos tokens, em nenhuma hipótese.

## Acessibilidade

Todos os pares de cor deste arquivo foram escolhidos para contraste suficiente de texto sobre fundo. Ao trocar valores, verifique o contraste antes de publicar.

Foco visível em todo elemento interativo, usando `--foco-cor`, `--foco-espessura` e `--foco-offset`. Nunca remova o contorno de foco sem colocar outro no lugar: parte do público da plataforma navega por teclado.

O público inclui pessoas com mais de 70 anos. Por isso o corpo de texto começa em 15px e não em 13px, e por isso alvos de toque devem ter pelo menos 44 pixels de altura.

## Logotipo

O `logo.svg` provisório é apenas a palavra DECISIVAS desenhada em texto, sem símbolo. Isso é deliberado: qualquer símbolo inventado agora entraria em conflito com a identidade real e criaria apego indevido. Ele usa `currentColor`, então herda a cor do contexto em que for colocado.
