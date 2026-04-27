-- =============================================================================
-- MFA ENFORCEMENT — BACKEND AGILSOLAR
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor)
-- 
-- OBJETIVO: Verificar role=admin E aal2 (MFA verificado) nas RPCs críticas.
-- O claim 'aal' no JWT é preenchido pelo Supabase Auth após MFA verification.
--
-- IMPORTANTE:
--   1. Execute SEÇÃO 1 primeiro (helpers).
--   2. Para cada RPC em SEÇÃO 2: copie o corpo EXISTENTE da sua função,
--      cole-o logo após o bloco de verificação indicado no template,
--      e rode o CREATE OR REPLACE.
--   3. Teste em homologação antes de produção.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: HELPERS DE SEGURANÇA MFA
-- =============================================================================

-- Retorna true se: role = admin AND sessão em aal2 (MFA verificado)
CREATE OR REPLACE FUNCTION public.is_admin_with_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
COMMENT ON FUNCTION public.is_admin_with_aal2()
  IS 'Retorna true se o caller é admin com sessão MFA verificada (aal2). Usar em RPCs críticas.';

-- Procedure que levanta exceção padronizada se quem chama não for admin com aal2.
-- Ideal para chamar via PERFORM no início de cada RPC crítica.
CREATE OR REPLACE FUNCTION public.assert_admin_aal2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_aal  text;
BEGIN
  v_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_aal  := COALESCE(auth.jwt() ->> 'aal', 'aal1');

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'permission_denied'
      USING
        DETAIL  = 'Apenas administradores podem executar esta ação.',
        HINT    = 'role=' || v_role,
        ERRCODE = 'P0001';
  END IF;

  IF v_aal != 'aal2' THEN
    RAISE EXCEPTION 'mfa_required'
      USING
        DETAIL  = 'Esta ação requer autenticação MFA verificada (aal2). Faça login com MFA ativo.',
        HINT    = 'aal=' || v_aal,
        ERRCODE = 'P0001';
  END IF;
END;
$$;
COMMENT ON FUNCTION public.assert_admin_aal2()
  IS 'Levanta exceção P0001 se caller não for admin aal2. Chamar com PERFORM no início de RPCs críticas.';


-- =============================================================================
-- SEÇÃO 2: TEMPLATES PARA ATUALIZAR RPCs CRÍTICAS
--
-- Para cada RPC abaixo:
--   a) Abra a função atual no Supabase Dashboard → Database → Functions
--   b) Copie o corpo da função
--   c) Cole no template abaixo substituindo "-- [ CORPO ORIGINAL AQUI ]"
--   d) Execute o CREATE OR REPLACE resultante
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEMPLATE: admin_update_user
-- Parâmetros esperados (ajuste à assinatura real da sua função):
-- -----------------------------------------------------------------------------
/*
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id   uuid,
  p_nome      text,
  p_role      text,
  p_franquia_id uuid,
  p_ativo     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VERIFICAÇÃO DE SEGURANÇA: admin + aal2 obrigatórios
  PERFORM public.assert_admin_aal2();

  -- [ COLE AQUI O CORPO ORIGINAL DA FUNÇÃO admin_update_user ]

END;
$$;
*/

-- -----------------------------------------------------------------------------
-- TEMPLATE: admin_set_user_chat_access
-- -----------------------------------------------------------------------------
/*
CREATE OR REPLACE FUNCTION public.admin_set_user_chat_access(
  p_user_id       uuid,
  p_chat_enabled  boolean,
  p_gestor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VERIFICAÇÃO DE SEGURANÇA: admin + aal2 obrigatórios
  PERFORM public.assert_admin_aal2();

  -- [ COLE AQUI O CORPO ORIGINAL DA FUNÇÃO admin_set_user_chat_access ]

END;
$$;
*/


-- =============================================================================
-- SEÇÃO 3: POLÍTICAS RLS ADICIONAIS PARA AÇÕES ADMIN CRÍTICAS
-- Adicionar após as políticas existentes para reforçar o backend.
-- =============================================================================

-- Política extra: admin só pode fazer UPDATE em profiles com aal2
-- (complementa o assert nos RPCs; as tabelas podem ter writes diretos também)
-- ATENÇÃO: só execute se sua política UPDATE de admin estiver definida como abaixo.

-- DROP POLICY IF EXISTS "Admin com MFA pode atualizar profiles" ON public.profiles;
-- CREATE POLICY "Admin com MFA pode atualizar profiles"
--   ON public.profiles
--   FOR UPDATE
--   TO authenticated
--   USING     (public.is_admin_with_aal2())
--   WITH CHECK(public.is_admin_with_aal2());

-- DROP POLICY IF EXISTS "Admin com MFA pode atualizar franquias" ON public.franquias;
-- CREATE POLICY "Admin com MFA pode atualizar franquias"
--   ON public.franquias
--   FOR ALL
--   TO authenticated
--   USING     (public.is_admin_with_aal2())
--   WITH CHECK(public.is_admin_with_aal2());


-- =============================================================================
-- SEÇÃO 4: VERIFICAÇÃO
-- Execute para confirmar que os helpers foram criados corretamente.
-- =============================================================================

-- SELECT proname, prosrc FROM pg_proc
--   WHERE proname IN ('is_admin_with_aal2', 'assert_admin_aal2')
--   AND pronamespace = 'public'::regnamespace;
