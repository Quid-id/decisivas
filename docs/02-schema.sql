-- DECISIVAS — schema do banco D1
-- D1 é SQLite gerenciado pelo Cloudflare. Este arquivo descreve o estado do
-- banco DEPOIS da migração 003 (etapa 2). Aplicar em banco vazio produz
-- exatamente o mesmo schema que as migrações 001 + 002 + 003 produzem num
-- banco existente. As listas fechadas abaixo espelham dados/vocabulario.json,
-- que é a fonte única lida pelo Worker, pelos scripts e pelo build.
--
-- Histórico das migrações e comandos para o remoto: docs/06-operacao.md.

-- As 59 pautas consolidadas (dados/DECISIVAS_pautas_de_para_v1.xlsx).
-- A pauta 'comunicação e linguagem' vale para os cinco temas.
CREATE TABLE pautas (
  pauta_consolidada     TEXT PRIMARY KEY,
  macronarrativa_padrao TEXT NOT NULL CHECK (macronarrativa_padrao IN ('dinheiro no bolso','trabalho digno','família e cuidado','brasil e pertencimento','participação e voz','vale para os 5 temas'))
);

-- As 59 pautas são vocabulário fechado, não acervo: entram junto com o schema.
INSERT INTO pautas (pauta_consolidada, macronarrativa_padrao) VALUES
  ('acesso a benefícios e atendimento', 'dinheiro no bolso'),
  ('aposentadoria e previdência', 'dinheiro no bolso'),
  ('atribuição de políticas públicas', 'participação e voz'),
  ('autonomia e amparo', 'trabalho digno'),
  ('bolsa família e transferência de renda', 'dinheiro no bolso'),
  ('brasil cotidiano', 'brasil e pertencimento'),
  ('cansaço cívico', 'participação e voz'),
  ('clima', 'brasil e pertencimento'),
  ('competência e autoestima política', 'participação e voz'),
  ('comunicação de serviço', 'família e cuidado'),
  ('comunicação e linguagem', 'vale para os 5 temas'),
  ('condição juvenil', 'trabalho digno'),
  ('confiança nas instituições', 'participação e voz'),
  ('cuidado e sobrecarga', 'família e cuidado'),
  ('cultura e lazer', 'família e cuidado'),
  ('custo de vida', 'dinheiro no bolso'),
  ('decisão de voto', 'participação e voz'),
  ('desigualdade', 'brasil e pertencimento'),
  ('direitos trabalhistas', 'trabalho digno'),
  ('educação', 'família e cuidado'),
  ('endividamento e crédito', 'dinheiro no bolso'),
  ('envelhecimento e autonomia', 'família e cuidado'),
  ('estigma do benefício', 'dinheiro no bolso'),
  ('etarismo', 'trabalho digno'),
  ('família e maternidade', 'família e cuidado'),
  ('funcionamento do legislativo', 'participação e voz'),
  ('futuro possível', 'brasil e pertencimento'),
  ('fé e religiosidade', 'família e cuidado'),
  ('gênero e trabalho', 'trabalho digno'),
  ('impostos', 'dinheiro no bolso'),
  ('informação e desinformação', 'participação e voz'),
  ('informação sobre direitos', 'trabalho digno'),
  ('jornada de trabalho', 'trabalho digno'),
  ('juventude e trabalho', 'trabalho digno'),
  ('mei e trabalho autônomo', 'trabalho digno'),
  ('memória e legado', 'participação e voz'),
  ('moradia e cidade', 'família e cuidado'),
  ('orgulho e identidade nacional', 'brasil e pertencimento'),
  ('orçamento e planejamento', 'dinheiro no bolso'),
  ('participação política', 'participação e voz'),
  ('país em disputa', 'brasil e pertencimento'),
  ('pertencimento regional', 'brasil e pertencimento'),
  ('polarização', 'participação e voz'),
  ('potências do país', 'brasil e pertencimento'),
  ('promessa e entrega', 'participação e voz'),
  ('proteção da infância', 'família e cuidado'),
  ('reconhecimento do trabalho', 'trabalho digno'),
  ('rede de apoio', 'família e cuidado'),
  ('rede de proteção social', 'família e cuidado'),
  ('renda e sustento', 'dinheiro no bolso'),
  ('representação política', 'participação e voz'),
  ('respeito ao idoso', 'brasil e pertencimento'),
  ('salário mínimo', 'dinheiro no bolso'),
  ('saúde e sus', 'família e cuidado'),
  ('saúde mental', 'família e cuidado'),
  ('segurança pública', 'família e cuidado'),
  ('soberania e política externa', 'brasil e pertencimento'),
  ('violência contra a mulher', 'família e cuidado'),
  ('voto e acesso à urna', 'participação e voz');

-- A unidade do acervo. Nove colunas, nomes exatos (etapa 2 da especificação).
-- Toda linha vem do acervo revisado; a carga é da etapa 3.
CREATE TABLE trechos (
  id             TEXT PRIMARY KEY,          -- ex.: 'D01-TR-042-jov'; o prefixo guarda o documento de origem
  texto          TEXT NOT NULL,
  publico        TEXT NOT NULL CHECK (publico IN ('jovens','60+','mulheres beneficiárias','mulheres de 2 a 5 salários mínimos')),
  -- Vazia apenas quando tipo = 'perfil'. O CHECK trata NULL nos dois ramos:
  -- sem isso a expressão vira NULL e o SQLite aceita a linha.
  macronarrativa TEXT CHECK ((tipo = 'perfil' AND (macronarrativa IS NULL OR macronarrativa IN ('dinheiro no bolso','trabalho digno','família e cuidado','brasil e pertencimento','participação e voz'))) OR (tipo <> 'perfil' AND macronarrativa IS NOT NULL AND macronarrativa IN ('dinheiro no bolso','trabalho digno','família e cuidado','brasil e pertencimento','participação e voz'))),
  -- Referencia a tabela de pautas; vazia apenas quando tipo = 'perfil'.
  pauta          TEXT REFERENCES pautas(pauta_consolidada) CHECK (pauta IS NOT NULL OR tipo = 'perfil'),
  tipo           TEXT NOT NULL CHECK (tipo IN ('achado','funciona','afasta','contexto','exemplo','verbatim','perfil')),
  -- Preenchida apenas quando tipo = 'achado'; vazia nos demais.
  forca          TEXT CHECK ((tipo = 'achado' AND forca IS NOT NULL AND forca IN ('forte','indício')) OR (tipo <> 'achado' AND forca IS NULL)),
  link           TEXT,                      -- existe, não se usa nesta versão; links voltam depois do beta
  pagina         TEXT                       -- texto livre, só auditoria
);

CREATE INDEX idx_trechos_match ON trechos (publico, macronarrativa);
CREATE INDEX idx_trechos_midia ON trechos (publico, pauta);

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

-- Cache nível 1: páginas geradas por /api/match, uma por recorte.
-- A chave inclui a pauta: '' é a visão geral do cruzamento, e um nome de pauta
-- é o recorte daquela tag (etapa 4). ids_acervo guarda o conjunto ORDENADO de
-- ids do recorte no momento da geração; conjunto diferente invalida a entrada,
-- e a leitura também compara o modelo que gerou.
CREATE TABLE paginas (
  publico        TEXT NOT NULL,
  macronarrativa TEXT NOT NULL,
  pauta          TEXT NOT NULL DEFAULT '',
  resposta       TEXT NOT NULL,             -- a página completa, em JSON
  ids_trechos    TEXT NOT NULL,             -- ids usados na página, separados por vírgula
  ids_acervo     TEXT NOT NULL,             -- conjunto ordenado de ids do recorte (validade)
  modelo         TEXT,                      -- modelo que gerou (nulo em página só de lacunas)
  gerado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (publico, macronarrativa, pauta)
);

-- Cache nível 1 das saídas de /api/formato. Mesma regra de validade.
CREATE TABLE formatos (
  publico        TEXT NOT NULL,
  macronarrativa TEXT NOT NULL,
  formato        TEXT NOT NULL,             -- whatsapp, carrossel ou roteiro
  pauta          TEXT NOT NULL DEFAULT '',
  resposta       TEXT NOT NULL,             -- a orientação completa, em JSON
  ids_trechos    TEXT NOT NULL,
  ids_acervo     TEXT NOT NULL,
  modelo         TEXT,
  gerado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (publico, macronarrativa, formato, pauta)
);

-- ---------------------------------------------------------------------------
-- SEM USO nesta versão, mantidas para não perder o que já existe.
-- Os links da página foram adiados para depois do beta (CONTEXTO v2, seção 5),
-- então nada no código lê estas duas tabelas. Não remover sem migração própria.
-- ---------------------------------------------------------------------------

-- Um registro por estudo. Espelhava a aba Cabeçalhos da planilha.
CREATE TABLE documentos (
  id_documento   TEXT PRIMARY KEY,
  fonte          TEXT NOT NULL,
  autoria        TEXT,
  metodo         TEXT NOT NULL,
  periodo        TEXT NOT NULL,
  base           TEXT NOT NULL CHECK (base IN ('geral','restrita')),
  risco          TEXT CHECK (risco IN ('baixo','alto'))
);

-- Links curados para materiais complementares.
CREATE TABLE recursos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL,
  url            TEXT NOT NULL,
  descricao      TEXT,
  publico        TEXT NOT NULL,
  macronarrativa TEXT NOT NULL,
  pauta          TEXT
);

CREATE INDEX idx_recursos_match ON recursos (publico, macronarrativa);
