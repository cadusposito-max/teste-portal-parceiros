-- ============================================================
-- GERENCIAMENTO DE USUÁRIOS — FRANQUIAS ÁGIL SOLAR
-- Execute os blocos que precisar no Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- CONSULTA: Ver todos os usuários e suas franquias atuais
-- ============================================================
SELECT
  u.email,
  u.raw_app_meta_data->>'role'        AS role,
  u.raw_app_meta_data->>'franquia_id' AS franquia_id,
  f.nome                               AS franquia_nome
FROM auth.users u
LEFT JOIN franquias f
  ON f.id = (u.raw_app_meta_data->>'franquia_id')::uuid
ORDER BY f.nome, u.email;


-- ============================================================
-- FRANQUIAS: Ver IDs disponíveis
-- ============================================================
SELECT id, nome, cidade, hsp_medio, ativo FROM franquias ORDER BY created_at;


-- ============================================================
-- DEFINIR USUÁRIO COMO ADMIN — MATRIZ (ARAÇATUBA)
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'admin',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
     )
WHERE email = 'email@exemplo.com';
*/


-- ============================================================
-- DEFINIR USUÁRIO COMO GESTOR — MATRIZ (ARAÇATUBA)
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'gestor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
     )
WHERE email = 'email@exemplo.com';
*/


-- ============================================================
-- DEFINIR USUÁRIO COMO VENDEDOR — MATRIZ (ARAÇATUBA)
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'vendedor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
     )
WHERE email = 'email@exemplo.com';
*/


-- ============================================================
-- DEFINIR USUÁRIO COMO GESTOR — SÃO JOSÉ DOS CAMPOS
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'gestor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1)
     )
WHERE email = 'email@exemplo.com';
*/


-- ============================================================
-- DEFINIR USUÁRIO COMO VENDEDOR — SÃO JOSÉ DOS CAMPOS
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'vendedor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1)
     )
WHERE email = 'email@exemplo.com';
*/


-- ============================================================
-- MÚLTIPLOS USUÁRIOS DE UMA VEZ (SÃO JOSÉ DOS CAMPOS — GESTORES)
-- Substitua os e-mails e rode sem os comentários
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'gestor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1)
     )
WHERE email IN (
  'eng.cadusposito@gmail.com',
  'julianacarvalho@agilsolar.com'
);
*/


-- ============================================================
-- AJUSTAR HSP DE UMA FRANQUIA
-- ============================================================
/*
UPDATE franquias SET hsp_medio = 4.9 WHERE nome = 'Ágil Solar São José dos Campos';
UPDATE franquias SET hsp_medio = 5.4 WHERE nome = 'Ágil Solar Matriz';
*/


-- ============================================================
-- REMOVER ROLE (reverter para vendedor sem role explícita)
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE email = 'email@exemplo.com';
*/
