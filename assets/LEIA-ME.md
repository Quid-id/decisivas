# Assets do DECISIVAS

Pasta única de imagens da identidade. O build copia tudo daqui para
`public/assets/`, e as telas apontam para `/assets/<arquivo>`.

**Enquanto um arquivo não existir, a tela mostra um placeholder tracejado com o
nome esperado.** Nada é inventado por código, e nenhuma tela quebra por asset
faltando.

| Arquivo | O que é | Tamanho |
|---|---|---|
| `banner-1.svg` … `banner-N.svg` (ou `.png`) | imagens do banner do cabeçalho, em rotação a cada 5 s | 2560 × 360 |
| `logo-decisivas.svg` | logotipo DECISIVAS | vetor · **ainda não usado**: a barra desenha o logotipo em texto, como no protótipo v3 |
| `logo-quid.svg` | logo da Quid, monocromático off-white | vetor, 24 px de altura na tela |
| `logo-brief.svg` | logo do BRIEF, monocromático off-white | vetor, 24 px de altura na tela |
| `card-jovens.png` | card semiótico do público jovens | 1000 × 1250 |
| `card-60-mais.png` | card semiótico do público 60+ | 1000 × 1250 |
| `card-beneficiarias.png` | card semiótico das mulheres beneficiárias | 1000 × 1250 |
| `card-2-a-5-sm.png` | card semiótico das mulheres de 2 a 5 salários mínimos | 1000 × 1250 |
| `favicon.svg` | favicon vetorial | vetor |
| `favicon-512.png` | favicon rasterizado | 512 × 512 |

O nome curto de cada público (`jovens`, `60-mais`, `beneficiarias`, `2-a-5-sm`)
vem do campo `slug` de `dados/vocabulario.json`, que é a fonte única do
vocabulário — se um slug mudar lá, o nome do arquivo muda junto.

Enquanto não houver nenhum `banner-*`, o build escreve no cabeçalho a faixa
provisória com o padrão de linhas coloridas do protótipo v3.
