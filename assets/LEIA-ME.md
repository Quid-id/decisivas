# assets/

Preparado em 02/09/2026 a partir do pacote da designer (Gabriela Bravin). Nomes seguem o que o build espera.

| Arquivo | Uso |
|---|---|
| logo-decisivas-sobre-escuro.svg | marca na barra superior e no rodapé (fundo preto) |
| logo-decisivas-sobre-claro.svg | marca sobre fundo claro (Sobre, materiais) |
| logo-decisivas-caixa.svg | versão em caixa preta, uso livre |
| favicon.svg, favicon-512.png | ícone do site (asterisco rosa) |
| banner-01.svg, banner-02.svg, banner-03.svg | faixa rotativa do topo, 2560 × 440. Composições provisórias feitas com os padrões da identidade; a designer pode substituir mantendo os nomes |
| retrato-<slug>.webp | retrato duotone do público, 800 × 800, para o bloco "Quem é este público" |
| padrao-linha-*.svg, padrao-bolinha-*.svg | elementos da identidade para novas composições |
| simbolo-asterisco-*.svg, simbolo-seta-*.svg | símbolos da identidade, por cor |

Faltam: logo da Quid e logo do BRIEF em SVG off-white (rodapé). As fontes já estão em assets/fonts/.

**Qual arquivo cada tela usa não está escrito em código.** Está em
`dados/configuracao.json` (`marca.logo`, `favicon`, `favicon_png`,
`imagem_compartilhamento`, `banner.imagens` e os logotipos do `rodape`) — e o
retrato de cada público, em `dados/vocabulario.json`, campo `retrato`, junto do
nome, da cor e do slug. Substituir uma imagem mantendo o nome não pede nada;
trocar o nome é trocar o caminho nesses arquivos. Arquivo que não existe aparece
na tela como placeholder tracejado com o nome esperado, e o build lista as
pendências no fim.
