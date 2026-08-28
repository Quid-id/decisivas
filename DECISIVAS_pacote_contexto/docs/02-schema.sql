-- DECISIVAS — schema do banco D1
-- D1 é SQLite gerenciado pelo Cloudflare. Este arquivo cria as quatro tabelas.

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
  resposta      TEXT NOT NULL               -- o texto integral entregue
);
