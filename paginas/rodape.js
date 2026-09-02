// Rodapé: os valores de contato e a assinatura vêm de dados/configuracao.json,
// publicado no build como /configuracao.js. Valor ainda não redigido aparece
// como caixa [preencher], nunca como texto inventado.
(function () {
  const CONFIG = window.CONFIGURACAO ?? {};
  const pendente = (v) => !v || v === "[preencher]";

  const assinatura = document.getElementById("rodape-assinatura");
  if (assinatura) {
    assinatura.textContent = pendente(CONFIG.assinatura)
      ? "[preencher] assinatura do projeto"
      : CONFIG.assinatura;
  }

  function preencheContato(id, valor, rotuloPendente, href) {
    const alvo = document.getElementById(id);
    if (!alvo) return;
    if (pendente(valor)) { alvo.textContent = rotuloPendente; alvo.classList.add("tagline"); return; }
    const link = document.createElement("a");
    link.href = href(valor);
    link.textContent = valor;
    link.rel = "noopener noreferrer";
    alvo.appendChild(link);
  }

  preencheContato("rodape-email", CONFIG.contato?.email, "[preencher] e-mail", (v) => `mailto:${v}`);
  preencheContato(
    "rodape-instagram", CONFIG.contato?.instagram, "[preencher] Instagram",
    (v) => `https://instagram.com/${String(v).replace(/^@/, "")}`
  );
})();
