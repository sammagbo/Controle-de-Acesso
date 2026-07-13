# Banco de dados (magbodb @ PC)

- **app_users**: id PK(String), nome, tipo(ALUNO/PROFESSOR/FUNCIONARIO), turma, foto_url, responsavel_id, responsavel2_id, meal_count(dormante), ativo, hikvision_employee_id UNIQUE.
- **access_logs**: id BIGSERIAL, user_id, point_id, action(ENTRADA/SAIDA), timestamp(local BRT, sem tz), created_by_user(nulo=webhook), flag(≤32: FORA_HORARIO|EXCEDEU_TEMPO|null).
- **door_mappings**: id, terminal_ip, door_no(NULL p/ match por IP — constraint local já corrigida via ALTER), reader_no, point_id, action, label, ativo, created_at, updated_at. Seeds: .167→PORT1/ENTRADA, .166→PORT1/SAIDA. Bench: id15 = terminal de mesa→REFEI1/ENTRADA (IP volátil!).
- **class_schedules**: classe PK, lun/mar/mer/jeu/ven_midi VARCHAR(8) — hora de início da janela; 'N' = dia sem refeição (gera FORA_HORARIO).
- **responsaveis**: id, nome, parentesco, telefone, foto_url.
- **system_users**: operadores (username UNIQUE, senha BCrypt, role, setoresPermitidos, ativo…).
Notas: ddl-auto=update (aditivo); data.sql é H2-only (falha silenciosa em prod); dumps p/ VM somente após correções de schema.
