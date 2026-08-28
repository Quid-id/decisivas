# brand/

**Estado atual: identidade PROVISÓRIA, para desenvolvimento.**

Três arquivos, todos substituíveis sem tocar em nenhuma tela:

- `tokens.css` — variáveis de cor, tipografia, espaçamento e raio. As telas usam exclusivamente estas variáveis.
- `guia.md` — regras de uso em texto.
- `logo.svg` — logotipo em vetor, usando `currentColor`.
- `exemplo.html` — página de referência visual, abrir no navegador.

## Como substituir pela identidade definitiva

1. Troque os VALORES em `tokens.css`. Não mude os NOMES das variáveis: eles são contrato com as telas.
2. Substitua `guia.md` e `logo.svg`.
3. Abra `exemplo.html` e confira se todos os componentes continuam legíveis e com contraste suficiente.
4. Nenhum arquivo de interface deve precisar de alteração. Se precisar, é porque alguma tela usou cor ou fonte fora dos tokens, e isso é defeito a corrigir.
