-- MAGBO Access Control — V008: camera_person_id em app_users
-- Identificacao das pessoas pelas CAMERAS DeepinView da portaria
-- (iDS-2CD7A46G2-IZHSY). Adiciona a coluna a uma tabela EXISTENTE.
-- Idempotente: pode ser executado mais de uma vez.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/User.java
--   @Column(name = "camera_person_id", unique = true, length = 64)
--     -> VARCHAR(64), nullable, UNIQUE.
--
-- O QUE E: o reserve_field.certificateNumber que a camera devolve quando
-- reconhece alguem — o numero do documento com que a pessoa foi cadastrada na
-- biblioteca facial DA CAMERA.
--
-- NAO E hikvision_employee_id. Aquele e o employeeNo dos terminais MinMoe do
-- CDI e da cantina; este e de outro produto, com outra base de pessoas,
-- preenchida a mao por outra equipe. A mesma pessoa pode ter os dois, um so ou
-- nenhum — por isso duas colunas e nao uma.
--
-- ATENCAO: NULLABLE, obrigatoriamente. Quase ninguem tem este numero hoje. Ele
-- se preenche sozinho na primeira vez que a camera reconhece a pessoa E o nome
-- casa com exatamente UM cadastro ativo (CameraIdentityService). Um NOT NULL
-- aqui invalidaria as 923+ linhas existentes de uma vez.
--
-- UNIQUE de proposito: duas pessoas com o mesmo numero de documento e erro de
-- cadastro. Sem a restricao, a camera identificaria como sendo a pessoa que o
-- banco devolvesse primeiro — e numa portaria isso e liberar a saida de um
-- aluno no nome de outro. Com a restricao, o erro aparece na hora de gravar,
-- em vez de virar uma passagem errada.
--
-- ADITIVA e nao destrutiva: nao toca em hikvision_employee_id, nem no seu
-- indice UNIQUE, nem em coluna nenhuma existente.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS camera_person_id VARCHAR(64);

-- UNIQUE em bloco proprio: ADD COLUMN IF NOT EXISTS nao aceita a restricao
-- inline de forma idempotente, e uma segunda execucao falharia no duplicado.
DO $$ BEGIN
  ALTER TABLE app_users ADD CONSTRAINT app_users_camera_person_id_key
    UNIQUE (camera_person_id);
EXCEPTION WHEN duplicate_table THEN NULL;
          WHEN duplicate_object THEN NULL; END $$;
