SELECT (SELECT COUNT(*) FROM trechos) AS trechos, (SELECT COUNT(*) FROM trechos_ate_002) AS trechos_ate_002, (SELECT COUNT(*) FROM pautas) AS pautas, (SELECT COUNT(*) FROM paginas) AS paginas, (SELECT COUNT(*) FROM formatos) AS formatos;
DROP TABLE trechos_ate_002;
DROP TABLE paginas;
DROP TABLE formatos;
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('trechos_ate_002', 'paginas', 'formatos')) AS tabelas_que_deviam_ter_saido, (SELECT COUNT(*) FROM trechos) AS trechos, (SELECT COUNT(*) FROM pautas) AS pautas;
