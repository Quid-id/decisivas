// DECISIVAS — escape de texto para HTML, em módulo compartilhado.
//
// Todo texto de conteúdo passa por aqui antes de entrar numa tela: o conteúdo é
// editado por pessoas, em JSON, e um `<` perdido não pode virar marcação.
//
// Compartilhado porque duas partes precisam escapar do MESMO jeito: o build,
// que monta as telas (scripts/html.js), e a pré-visualização do painel, que
// troca o texto antigo pelo novo dentro da tela já publicada (src/cms.js). Se
// os dois escapassem diferente, a troca não acharia o texto.
function escapa(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = { escapa };
