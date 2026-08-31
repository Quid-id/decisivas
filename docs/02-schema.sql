-- DECISIVAS — schema do banco D1
-- D1 é SQLite gerenciado pelo Cloudflare. Este arquivo cria as seis tabelas.

-- Um registro por estudo. Espelha a aba Cabeçalhos da planilha.
CREATE TABLE documentos (
  id_documento   TEXT PRIMARY KEY,          -- ex.: 'D01'
  fonte          TEXT NOT NULL,             -- nome público do estudo, aparece na tela
  autoria        TEXT,
  metodo         TEXT NOT NULL,             -- grupo focal, escuta digital...
  periodo        TEXT NOT NULL,             -- ex.: '08/2026'
  base           TEXT NOT NULL CHECK (base IN ('geral','restrita')),
  risco          TEXT CHECK (risco IN ('baixo','alto'))
  -- ATENÇÃO: o campo interno "motivo da restrição" da planilha NÃO entra no banco.
);

-- A unidade do acervo. Espelha a Fila de revisão, só linhas aceitas.
CREATE TABLE trechos (
  id               TEXT PRIMARY KEY,        -- ex.: 'D01-TR-042'
  texto            TEXT NOT NULL,
  publico          TEXT NOT NULL,
  macronarrativa   TEXT NOT NULL,           -- pode ser 'CONFERIR' apenas na planilha; no banco, nunca
  pauta            TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('achado','funciona','afasta','exemplo','contexto','verbatim')),
  forca            TEXT CHECK (forca IN ('forte','indício')),
  base             TEXT NOT NULL CHECK (base IN ('geral','restrita')),
  despersonalizado TEXT DEFAULT 'nao',
  link             TEXT,                    -- somente tipo 'exemplo'; URL vinda do documento ou da curadoria, nunca gerada pelo modelo
  pagina           TEXT,
  id_documento     TEXT NOT NULL REFERENCES documentos(id_documento)
);

CREATE INDEX idx_trechos_match ON trechos (publico, macronarrativa);
CREATE INDEX idx_trechos_midia ON trechos (publico, pauta);

-- Links curados para materiais complementares (ex.: site BRIEF).
-- O modelo de linguagem nunca lê nem escreve esta tabela; o Worker anexa por código.
CREATE TABLE recursos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL,
  url            TEXT NOT NULL,             -- URL completa e verificada por humano
  descricao      TEXT,
  publico        TEXT NOT NULL,             -- mesmo vocabulário dos trechos
  macronarrativa TEXT NOT NULL,
  pauta          TEXT
);

CREATE INDEX idx_recursos_match ON recursos (publico, macronarrativa);

-- Registro de tudo que o agente entregou. Sem IP, sem identidade.
CREATE TABLE registros (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  rota          TEXT NOT NULL,              -- 'match' ou 'formato'
  publico       TEXT,
  macronarrativa TEXT,
  formato       TEXT,                       -- só na rota formato
  ids_trechos   TEXT,                       -- lista dos ids usados, separada por vírgula
  modelo        TEXT,                       -- qual modelo respondeu (MODEL_ID)
  origem        TEXT,                       -- 'geracao' (modelo/lacuna por código) ou 'cache'
  resposta      TEXT NOT NULL               -- o texto integral entregue
);

-- Cache nível 1: páginas geradas por /api/match, uma por cruzamento.
-- ids_acervo guarda o conjunto ORDENADO de ids de trechos do cruzamento no
-- momento da geração (match + hábitos de mídia); se o conjunto atual do banco
-- for diferente, a entrada é inválida e a página é gerada de novo.
CREATE TABLE paginas (
  publico        TEXT NOT NULL,
  macronarrativa TEXT NOT NULL,
  resposta       TEXT NOT NULL,             -- a página completa, em JSON
  ids_trechos    TEXT NOT NULL,             -- ids usados na página, separados por vírgula
  ids_acervo     TEXT NOT NULL,             -- conjunto ordenado de ids do cruzamento (validade)
  modelo         TEXT,                      -- modelo que gerou (nulo em página só de lacunas)
  gerado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (publico, macronarrativa)
);

-- Cache nível 1 das saídas de /api/formato, uma por cruzamento + formato.
-- Mesma regra de validade da tabela paginas.
CREATE TABLE formatos (
  publico        TEXT NOT NULL,
  macronarrativa TEXT NOT NULL,
  formato        TEXT NOT NULL,             -- whatsapp, carrossel ou roteiro
  resposta       TEXT NOT NULL,             -- a orientação completa, em JSON
  ids_trechos    TEXT NOT NULL,
  ids_acervo     TEXT NOT NULL,
  modelo         TEXT,
  gerado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (publico, macronarrativa, formato)
);
