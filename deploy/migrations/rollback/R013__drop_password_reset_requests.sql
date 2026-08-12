-- R013 — desfaz V013. DESTRUTIVO: apaga os pedidos registrados (não há outra
-- cópia deles). O backend anterior não conhece a tabela e roda sem ela.
DROP TABLE IF EXISTS password_reset_requests;
