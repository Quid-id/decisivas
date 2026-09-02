# Assets do DECISIVAS

Pasta única de imagens da identidade. O build copia tudo daqui para
`public/assets/`, e as telas apontam para `/assets/<arquivo>`.

**Enquanto um arquivo não existir, a tela mostra um placeholder tracejado com o
nome esperado.** Nada é inventado por código, e nenhuma tela quebra por asset
faltando.

| Arquivo | O que é | Tamanho |
|---|---|---|
| `banner-1.svg` … `banner-N.svg` (ou `.png`) | imagens do banner do cabeçalho, em rotação a cada 5 s | 2560 × 360 |
| `logo-decisivas.svg` | logotipo DECISIVAS | vetor · **ainda não usado**: a barra desenha o logotipo em texto, como no protótipo v5 |
| `logo-quid.svg` | logo da Quid, monocromático off-white | vetor, 24 px de altura na tela |
| `logo-brief.svg` | logo do BRIEF, monocromático off-white | vetor, 24 px de altura na tela |
| `fonts/inclusive-sans-latin.woff2` | Inclusive Sans, romana, pesos 300 a 700 (variável) | woff2 |
| `fonts/inclusive-sans-latin-italico.woff2` | Inclusive Sans, itálica | woff2 |
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

A fonte Inclusive Sans é servida pelo próprio site (etapa 8B): **nenhuma
chamada ao Google Fonts**. Os arquivos vão em `assets/fonts/`, declarados em
`@font-face` no `paginas/estilos.css`; enquanto não chegarem, as telas caem na
pilha de fontes do sistema, sem erro visível.

Enquanto não houver nenhum `banner-*`, o build escreve no cabeçalho a faixa
provisória com o padrão de linhas coloridas do protótipo.
