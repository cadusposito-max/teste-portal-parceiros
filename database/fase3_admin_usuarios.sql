-- ============================================================
-- FASE 3 - GESTAO DE USUARIOS (ADMIN)
-- Cria base para: listar, criar, editar e ativar/desativar usuarios
-- sem apagar clientes/propostas/vendas historicos.
-- ============================================================

BEGIN;

-- Extensoes necessarias para gerar UUID e hash de senha
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) Tabela de apoio para status e auditoria basica
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nome text,
  role text NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin', 'gestor', 'vendedor')),
  franquia_id uuid REFERENCES public.franquias(id),
  ativo boolean NOT NULL DEFAULT true,
  desativado_em timestamptz,
  desativado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_role ON public.user_accounts(role);
CREATE INDEX IF NOT EXISTS idx_user_accounts_franquia ON public.user_accounts(franquia_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_ativo ON public.user_accounts(ativo);

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_accounts_admin_all" ON public.user_accounts;
CREATE POLICY "user_accounts_admin_all" ON public.user_accounts
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_accounts_self_read" ON public.user_accounts;
CREATE POLICY "user_accounts_self_read" ON public.user_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_role(p_role text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := lower(trim(coalesce(p_role, 'vendedor')));

  IF v_role NOT IN ('admin', 'gestor', 'vendedor') THEN
    RAISE EXCEPTION 'Role invalido. Use: admin, gestor ou vendedor.';
  END IF;

  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.require_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_user_account(
  p_user_id uuid,
  p_email text,
  p_nome text,
  p_role text,
  p_franquia_id uuid,
  p_ativo boolean,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_accounts (
    user_id,
    email,
    nome,
    role,
    franquia_id,
    ativo,
    desativado_em,
    desativado_por,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_nome, '')), ''),
    normalize_role(p_role),
    p_franquia_id,
    coalesce(p_ativo, true),
    CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE now() END,
    CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE p_actor END,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = excluded.email,
    nome = excluded.nome,
    role = excluded.role,
    franquia_id = excluded.franquia_id,
    ativo = excluded.ativo,
    desativado_em = excluded.desativado_em,
    desativado_por = excluded.desativado_por,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_account(uuid, text, text, text, uuid, boolean, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3) Listagem para painel Admin
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  nome text,
  role text,
  franquia_id uuid,
  franquia_nome text,
  ativo boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM require_admin();

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    coalesce(p.nome, ua.nome) AS nome,
    normalize_role(coalesce(u.raw_app_meta_data ->> 'role', ua.role, 'vendedor')) AS role,
    coalesce((u.raw_app_meta_data ->> 'franquia_id')::uuid, ua.franquia_id) AS franquia_id,
    f.nome AS franquia_nome,
    coalesce(ua.ativo, (u.banned_until IS NULL OR u.banned_until <= now())) AS ativo,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.user_accounts ua ON ua.user_id = u.id
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.franquias f ON f.id = coalesce((u.raw_app_meta_data ->> 'franquia_id')::uuid, ua.franquia_id)
  ORDER BY lower(u.email::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ------------------------------------------------------------
-- 4) Criacao de usuario (admin)
--    Obs: utiliza insercao direta em auth.users + auth.identities.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_nome text DEFAULT NULL,
  p_role text DEFAULT 'vendedor',
  p_franquia_id uuid DEFAULT NULL,
  p_ativo boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
  v_role text;
  v_user_id uuid;
  v_actor uuid;
BEGIN
  PERFORM require_admin();

  v_email := lower(trim(coalesce(p_email, '')));
  v_role  := normalize_role(p_role);
  v_actor := auth.uid();

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Email invalido.';
  END IF;

  IF coalesce(length(p_password), 0) < 6 THEN
    RAISE EXCEPTION 'Senha temporaria deve ter no minimo 6 caracteres.';
  END IF;

  IF p_franquia_id IS NULL THEN
    RAISE EXCEPTION 'Franquia obrigatoria.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email::text) = v_email) THEN
    RAISE EXCEPTION 'Ja existe usuario com este email.';
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_sent_at,
    recovery_sent_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    last_sign_in_at,
    is_sso_user,
    is_anonymous,
    banned_until
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    NULL,
    jsonb_build_object(
      'provider', 'email',
      'providers', ARRAY['email'],
      'role', v_role,
      'franquia_id', p_franquia_id::text
    ),
    jsonb_build_object(
      'nome', nullif(trim(coalesce(p_nome, '')), '')
    ),
    now(),
    now(),
    NULL,
    false,
    false,
    CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE (now() + interval '100 years') END
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at,
    last_sign_in_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    NULL
  );

  INSERT INTO public.profiles (id, nome, updated_at)
  VALUES (v_user_id, nullif(trim(coalesce(p_nome, '')), ''), now())
  ON CONFLICT (id) DO UPDATE SET
    nome = excluded.nome,
    updated_at = now();

  INSERT INTO public.vendedores_stats (email, total_logins, franquia_id)
  VALUES (v_email, 0, p_franquia_id)
  ON CONFLICT (email) DO UPDATE SET
    franquia_id = excluded.franquia_id;

  PERFORM sync_user_account(
    v_user_id,
    v_email,
    p_nome,
    v_role,
    p_franquia_id,
    coalesce(p_ativo, true),
    v_actor
  );

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 5) Edicao de usuario (papel, franquia, nome e status ativo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id uuid,
  p_nome text,
  p_role text,
  p_franquia_id uuid,
  p_ativo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_email text;
  v_actor uuid;
BEGIN
  PERFORM require_admin();

  v_role := normalize_role(p_role);
  v_actor := auth.uid();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario invalido.';
  END IF;

  IF p_franquia_id IS NULL THEN
    RAISE EXCEPTION 'Franquia obrigatoria.';
  END IF;

  IF auth.uid() = p_user_id AND coalesce(p_ativo, true) = false THEN
    RAISE EXCEPTION 'Voce nao pode desativar o proprio usuario.';
  END IF;

  SELECT lower(email::text)
  INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado.';
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', v_role, 'franquia_id', p_franquia_id::text),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('nome', nullif(trim(coalesce(p_nome, '')), '')),
    banned_until = CASE WHEN coalesce(p_ativo, true) THEN NULL ELSE (now() + interval '100 years') END,
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.profiles (id, nome, updated_at)
  VALUES (p_user_id, nullif(trim(coalesce(p_nome, '')), ''), now())
  ON CONFLICT (id) DO UPDATE SET
    nome = excluded.nome,
    updated_at = now();

  INSERT INTO public.vendedores_stats (email, total_logins, franquia_id)
  VALUES (v_email, 0, p_franquia_id)
  ON CONFLICT (email) DO UPDATE SET
    franquia_id = excluded.franquia_id;

  PERFORM sync_user_account(
    p_user_id,
    v_email,
    p_nome,
    v_role,
    p_franquia_id,
    coalesce(p_ativo, true),
    v_actor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 6) Funcoes de apoio para login
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_active()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active boolean;
  v_banned_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT ua.ativo
  INTO v_active
  FROM public.user_accounts ua
  WHERE ua.user_id = auth.uid();

  IF v_active IS NOT NULL THEN
    RETURN v_active;
  END IF;

  -- Compatibilidade legado: se a linha ainda nao existir em user_accounts,
  -- usa o bloqueio nativo do auth.users (banned_until).
  SELECT u.banned_until
  INTO v_banned_until
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_banned_until IS NULL OR v_banned_until <= now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_active() TO authenticated;

-- ------------------------------------------------------------
-- 7) Seed inicial da tabela user_accounts a partir dos usuarios atuais
-- ------------------------------------------------------------
INSERT INTO public.user_accounts (user_id, email, nome, role, franquia_id, ativo, created_at, updated_at)
SELECT
  u.id,
  lower(u.email::text),
  p.nome,
  normalize_role(coalesce(u.raw_app_meta_data ->> 'role', 'vendedor')),
  (u.raw_app_meta_data ->> 'franquia_id')::uuid,
  CASE WHEN u.banned_until IS NULL OR u.banned_until <= now() THEN true ELSE false END,
  coalesce(u.created_at, now()),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (user_id) DO UPDATE SET
  email = excluded.email,
  nome = excluded.nome,
  role = excluded.role,
  franquia_id = excluded.franquia_id,
  ativo = excluded.ativo,
  updated_at = now();

COMMIT;
