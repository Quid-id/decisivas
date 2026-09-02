# Assets do DECISIVAS

Pasta única de imagens da identidade. O build copia tudo daqui para
`public/assets/`, e as telas apontam para `/assets/<arquivo>`. **O nome de cada
arquivo está em `dados/configuracao.json`**, não escrito dentro de template ou
script: é lá que se troca uma imagem por outra (`marca`, `banner`, `favicon`,
`imagem_compartilhamento` e os logotipos do `rodape`).

**Enquanto um arquivo não existir, a tela mostra um placeholder tracejado com o
nome esperado.** Nada é inventado por código, e nenhuma tela quebra por asset
faltando.

| Arquivo | O que é | Tamanho |
|---|---|---|
| `banner-1.svg`, `banner-2.svg`, `banner-3.svg` | imagens do banner do cabeçalho, em rotação (a lista e o intervalo estão em `banner`, na configuração) | 2560 × 360 |
| `logo-decisivas.svg` | logotipo DECISIVAS, da barra e do rodapé | vetor · enquanto não existir, a barra escreve `marca.nome` em tipografia de destaque |
| `simbolo-asterisco.svg` | símbolo da marca | vetor · registrado em `marca.simbolo` |
| `logo-quid.svg` | logo da Quid, monocromático off-white | vetor, 24 px de altura na tela |
| `logo-brief.svg` | logo do BRIEF, monocromático off-white | vetor, 24 px de altura na tela |
| `compartilhamento.png` | imagem que aparece ao compartilhar o link (`og:image`) | 1200 × 630 |
| `fonts/inclusive-sans-latin.woff2` | Inclusive Sans, romana, pesos 300 a 700 (variável) — **no repositório** | 30 KB |
| `fonts/inclusive-sans-latin-italico.woff2` | Inclusive Sans, itálica — **no repositório** | 31 KB |
| `fonts/unbounded-latin.woff2` | Unbounded, a fonte de destaque, pesos 200 a 900 (variável) — **no repositório** | 50 KB |
| `favicon.svg` | favicon vetorial | vetor |
| `favicon-512.png` | favicon rasterizado | 512 × 512 |

Os quatro cards semióticos (`card-<slug>.png`, 1000 × 1250) saíram da lista na
etapa 8B: a página de caminho do protótipo v5 não tem card de imagem — "Quem é
este público" é um card numérico mais um card de texto. Se voltarem a ser
usados, a linha volta aqui.

O nome curto de cada público (`jovens`, `70-mais`, `mulheres-beneficiarias`,
`mulheres-2-a-5-sm`) vem do campo `slug` de `dados/vocabulario.json`, que é a
fonte única do vocabulário — se um slug mudar lá, o nome do arquivo muda junto.
É o mesmo slug que aparece na URL de cada caminho.

As duas fontes são servidas pelo próprio site: **nenhuma chamada ao Google
Fonts**. Os arquivos estão em `assets/fonts/`, declarados em `@font-face` no
`paginas/estilos.css`, com as licenças ao lado (`LICENCA-*.txt`) — as duas são
SIL Open Font License 1.1, que permite uso e redistribuição.

- **Inclusive Sans** é a fonte de corpo: leitura, cards, prosa.
- **Unbounded** é a de destaque, no token `--tipo-destaque`: a marca DECISIVAS
  na barra e no rodapé, o título e a chamada da home, o título de cada caminho
  e os títulos de bloco em caixa alta. Não é fonte de leitura, e não entra no
  corpo.

Se um arquivo faltar, a tela cai na pilha de fontes do sistema, sem erro
visível.

Enquanto não houver nenhum `banner-*`, o build escreve no cabeçalho a faixa
provisória com o padrão de linhas coloridas do protótipo.
