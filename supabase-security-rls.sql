-- =============================================================================
-- AUDITORIA DE SEGURANÇA — AGILSOLAR PARCEIROS
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor)
-- REGRA ABSOLUTA: O BACKEND NUNCA DEVE CONFIAR NO FRONTEND
-- =============================================================================
-- ATENÇÃO: Leia cada bloco antes de executar. Execute em ambiente de teste
-- primeiro. Algumas policies podem conflitar com as existentes — use DROP
-- POLICY IF EXISTS antes de recriar.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: FUNÇÕES HELPER PARA RLS
-- Evita repetição de lógica e facilita manutenção
-- =============================================================================

-- Retorna true se o usuário logado tem role = 'admin' (via JWT app_metadata)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
$$;

-- Retorna true se o usuário logado tem role = 'gestor'
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'gestor'
$$;

-- Retorna a franquia_id do usuário logado (via JWT app_metadata)
CREATE OR REPLACE FUNCTION public.current_franquia_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'franquia_id')::uuid
$$;

-- Retorna true se o usuário logado tem role admin ou gestor
CREATE OR REPLACE FUNCTION public.is_admin_or_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'gestor')
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Helper RLS: verifica role admin no JWT app_metadata. SECURITY DEFINER para RLS.';
COMMENT ON FUNCTION public.is_gestor() IS 'Helper RLS: verifica role gestor no JWT app_metadata.';
COMMENT ON FUNCTION public.current_franquia_id() IS 'Helper RLS: retorna franquia_id do JWT app_metadata.';
COMMENT ON FUNCTION public.is_admin_or_gestor() IS 'Helper RLS: verifica role admin ou gestor no JWT app_metadata.';


-- =============================================================================
-- SEÇÃO 2: HABILITAR RLS NAS TABELAS CRÍTICAS
-- Se RLS não estiver habilitado, NENHUMA policy é aplicada e todos os
-- usuários autenticados têm acesso completo via REST API.
-- =============================================================================

ALTER TABLE public.clientes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precos_franquia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franquias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financiadoras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.componentes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custos_extras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicados    ENABLE ROW LEVEL SECURITY;

-- IMPORTANTE: vendedores_stats pode ser uma VIEW.
-- Se for tabela física: habilitar RLS abaixo.
-- Se for VIEW: a segurança depende das tabelas subjacentes.
-- ALTER TABLE public.vendedores_stats ENABLE ROW LEVEL SECURITY;

-- Revogar grants excessivos a roles públicas (anon, authenticated)
-- Execute com cuidado — pode quebrar RPCs que usam SECURITY DEFINER
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
-- Em vez disso, confie nas policies abaixo.


-- =============================================================================
-- SEÇÃO 3: RLS — TABELA clientes
-- Regra: vendedor vê/edita apenas seus clientes (vendedor_email = auth.email())
--        gestor vê todos da franquia
--        admin vê tudo
-- =============================================================================

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;

CREATE POLICY "clientes_select" ON public.clientes
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Vendedor só insere clientes com seu próprio email — backend valida
CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Vendedor só atualiza seus próprios clientes
CREATE POLICY "clientes_update" ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Delete: apenas admin e gestor (vendedor não pode deletar clientes)
CREATE POLICY "clientes_delete" ON public.clientes
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
  );


-- =============================================================================
-- SEÇÃO 4: RLS — TABELA propostas
-- Regra igual à de clientes + anon não pode acessar diretamente
--         (acesso público via RPC get_public_proposta)
-- =============================================================================

DROP POLICY IF EXISTS "propostas_select" ON public.propostas;
DROP POLICY IF EXISTS "propostas_insert" ON public.propostas;
DROP POLICY IF EXISTS "propostas_update" ON public.propostas;
DROP POLICY IF EXISTS "propostas_delete" ON public.propostas;

-- Sem policy para anon — acesso público somente via RPC get_public_proposta
CREATE POLICY "propostas_select" ON public.propostas
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Vendedor só insere propostas com seu próprio vendedor_email
-- Gestor pode inserir para qualquer vendedor da sua franquia
CREATE POLICY "propostas_insert" ON public.propostas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Update: vendedor só atualiza suas próprias, admin/gestor conforme escopo
CREATE POLICY "propostas_update" ON public.propostas
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

-- Delete: apenas admin
CREATE POLICY "propostas_delete" ON public.propostas
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- SEÇÃO 5: RLS — TABELA vendas
-- =============================================================================

DROP POLICY IF EXISTS "vendas_select" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete" ON public.vendas;

CREATE POLICY "vendas_select" ON public.vendas
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

CREATE POLICY "vendas_insert" ON public.vendas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

CREATE POLICY "vendas_update" ON public.vendas
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR vendedor_email = auth.email()
  );

CREATE POLICY "vendas_delete" ON public.vendas
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- SEÇÃO 6: RLS — TABELA profiles
-- Usuário só lê/edita o próprio perfil. Admin pode listar todos (via RPC).
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- WITH CHECK: garante que o usuário não pode fazer upsert com ID de outro
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- SEÇÃO 7: RLS — TABELA produtos
-- Leitura: todos autenticados
-- Escrita: apenas admin (gestor não deve criar/deletar produtos globais,
--          apenas ajustar preços via precos_franquia)
-- =============================================================================

DROP POLICY IF EXISTS "produtos_select" ON public.produtos;
DROP POLICY IF EXISTS "produtos_insert" ON public.produtos;
DROP POLICY IF EXISTS "produtos_update" ON public.produtos;
DROP POLICY IF EXISTS "produtos_delete" ON public.produtos;

CREATE POLICY "produtos_select" ON public.produtos
  FOR SELECT
  TO authenticated
  USING (true);  -- todos autenticados podem ler

CREATE POLICY "produtos_insert" ON public.produtos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "produtos_update" ON public.produtos
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "produtos_delete" ON public.produtos
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- =============================================================================
-- SEÇÃO 8: RLS — TABELA precos_franquia
-- Leitura: todos autenticados (JOIN com produtos)
-- Escrita:
--   admin: qualquer franquia
--   gestor: somente sua franquia_id (do JWT app_metadata)
-- =============================================================================

DROP POLICY IF EXISTS "precos_franquia_select" ON public.precos_franquia;
DROP POLICY IF EXISTS "precos_franquia_insert" ON public.precos_franquia;
DROP POLICY IF EXISTS "precos_franquia_update" ON public.precos_franquia;
DROP POLICY IF EXISTS "precos_franquia_delete" ON public.precos_franquia;

CREATE POLICY "precos_franquia_select" ON public.precos_franquia
  FOR SELECT
  TO authenticated
  USING (true);

-- CRÍTICO: gestor só pode escrever preços da SUA franquia
CREATE POLICY "precos_franquia_insert" ON public.precos_franquia
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
  );

CREATE POLICY "precos_franquia_update" ON public.precos_franquia
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
  );

CREATE POLICY "precos_franquia_delete" ON public.precos_franquia
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
  );


-- =============================================================================
-- SEÇÃO 9: RLS — TABELAS de catálogo (financiadoras, componentes, custos_extras)
-- Leitura pública (autenticados). Escrita: apenas admin.
-- =============================================================================

-- financiadoras
DROP POLICY IF EXISTS "financiadoras_select" ON public.financiadoras;
DROP POLICY IF EXISTS "financiadoras_write" ON public.financiadoras;

CREATE POLICY "financiadoras_select" ON public.financiadoras
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "financiadoras_write" ON public.financiadoras
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- componentes
DROP POLICY IF EXISTS "componentes_select" ON public.componentes;
DROP POLICY IF EXISTS "componentes_write" ON public.componentes;

CREATE POLICY "componentes_select" ON public.componentes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "componentes_write" ON public.componentes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- custos_extras
DROP POLICY IF EXISTS "custos_extras_select" ON public.custos_extras;
DROP POLICY IF EXISTS "custos_extras_write" ON public.custos_extras;

CREATE POLICY "custos_extras_select" ON public.custos_extras
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "custos_extras_write" ON public.custos_extras
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =============================================================================
-- SEÇÃO 10: RLS — TABELA franquias
-- Leitura: todos autenticados
-- Escrita: apenas admin
-- =============================================================================

DROP POLICY IF EXISTS "franquias_select" ON public.franquias;
DROP POLICY IF EXISTS "franquias_write" ON public.franquias;

CREATE POLICY "franquias_select" ON public.franquias
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "franquias_write" ON public.franquias
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =============================================================================
-- SEÇÃO 11: RLS — TABELA comunicados
-- Leitura: autenticados veem apenas publicados. Admin vê tudo.
-- Escrita: apenas admin.
-- =============================================================================

DROP POLICY IF EXISTS "comunicados_select" ON public.comunicados;
DROP POLICY IF EXISTS "comunicados_write" ON public.comunicados;

CREATE POLICY "comunicados_select" ON public.comunicados
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (is_published = true AND status = 'published')
  );

-- Anon pode ler apenas publicados (para proposta.html se necessário)
-- Se comunicados não forem acessados anonimamente, remover a policy abaixo
CREATE POLICY "comunicados_select_anon" ON public.comunicados
  FOR SELECT
  TO anon
  USING (is_published = true AND status = 'published');

CREATE POLICY "comunicados_write" ON public.comunicados
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =============================================================================
-- SEÇÃO 12: VENDEDORES_STATS — proteção de escrita
-- Se for tabela física (não VIEW):
-- =============================================================================

-- Descomente se vendedores_stats for tabela física
/*
ALTER TABLE public.vendedores_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedores_stats_select" ON public.vendedores_stats;
DROP POLICY IF EXISTS "vendedores_stats_update" ON public.vendedores_stats;

CREATE POLICY "vendedores_stats_select" ON public.vendedores_stats
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_gestor() AND franquia_id = public.current_franquia_id())
    OR email = auth.email()
  );

-- CRÍTICO: apenas admin pode alterar comissão
CREATE POLICY "vendedores_stats_update" ON public.vendedores_stats
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
*/


-- =============================================================================
-- SEÇÃO 13: v_componentes_public — VIEW PÚBLICA
-- Verificar se a view vaza dados sensíveis (preco_unitario)
-- A view deve expor apenas: id, tipo, nome, potencia_wp (sem preço)
-- =============================================================================

-- Recriar view sem dados de preço se necessário
-- CREATE OR REPLACE VIEW public.v_componentes_public
--   SECURITY INVOKER  -- usa RLS da tabela subjacente
-- AS
--   SELECT id, tipo, nome, potencia_wp
--   FROM public.componentes
--   WHERE ativo = true;
--
-- GRANT SELECT ON public.v_componentes_public TO authenticated;


-- =============================================================================
-- SEÇÃO 14: FUNÇÕES RPC — Verificação obrigatória de role interno
--
-- CRÍTICO: as funções abaixo devem verificar role = 'admin' DENTRO da função.
-- Se forem SECURITY DEFINER sem essa verificação, qualquer usuário
-- autenticado pode chamá-las.
--
-- Modelos de verificação interna:
-- =============================================================================

-- Modelo para admin_update_user (adapte ao corpo existente):
/*
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id uuid,
  p_nome    text,
  p_role    text,
  p_franquia_id uuid,
  p_ativo   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VERIFICAÇÃO DE SEGURANÇA — nunca confiar no frontend
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;

  -- Validação de role para evitar injeção de valor inválido
  IF p_role NOT IN ('admin', 'gestor', 'vendedor') THEN
    RAISE EXCEPTION 'invalid role value';
  END IF;

  UPDATE public.profiles
    SET nome       = p_nome,
        updated_at = NOW()
    WHERE id = p_user_id;

  -- Atualizar app_metadata via auth.users (requer service_role key)
  -- Isso deve ser feito via Edge Function admin-create-user, não diretamente aqui.
END;
$$;
*/

-- Modelo para admin_list_users_chat:
/*
CREATE OR REPLACE FUNCTION public.admin_list_users_chat()
RETURNS TABLE (
  user_id      uuid,
  email        text,
  nome         text,
  role         text,
  franquia_id  uuid,
  franquia_nome text,
  ativo        boolean,
  chat_enabled boolean,
  last_sign_in_at timestamptz,
  gestor_user_id uuid,
  gestor_nome  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VERIFICAÇÃO DE SEGURANÇA
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;

  RETURN QUERY
    -- sua query existente aqui
    SELECT ...;
END;
$$;
*/

-- Modelo para chat_list_directory (restringir por franquia se não-admin):
/*
CREATE OR REPLACE FUNCTION public.chat_list_directory(p_search text, p_limit int)
RETURNS TABLE (email text, nome text, telefone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text := (auth.jwt() -> 'app_metadata' ->> 'role');
  v_franquia   uuid := (auth.jwt() -> 'app_metadata' ->> 'franquia_id')::uuid;
BEGIN
  -- Admin vê tudo, outros só veem da própria franquia
  RETURN QUERY
    SELECT p.email_field, p.nome, p.telefone
    FROM ... p
    WHERE (v_role = 'admin' OR p.franquia_id = v_franquia)
      AND (p_search IS NULL OR p.nome ILIKE '%' || p_search || '%'
           OR p.email_field ILIKE '%' || p_search || '%')
    LIMIT COALESCE(NULLIF(p_limit, 0), 50);
END;
$$;
*/


-- =============================================================================
-- SEÇÃO 15: RPC get_public_proposta — auditoria de campos retornados
-- Esta função já existe. Verificar que não retorna dados sensíveis.
-- =============================================================================

-- Campos PERMITIDOS para expor publicamente:
--   cliente_nome, kit_nome, kit_brand, kit_power, kit_price,
--   proposal_mode, custom_total_price, custom_system_power_kwp,
--   custom_payment_note, custom_commercial_note,
--   geracao_estimada, created_at
--   vendedor_nome, vendedor_telefone (para contato comercial)

-- Campos que NÃO devem ser retornados:
--   vendedor_email (identidade interna)
--   franquia_id (estrutura interna)
--   id (retornar apenas se necessário para logs)
--   qualquer campo de metadados internos

-- Verificar a definição atual:
-- SELECT prosrc FROM pg_proc WHERE proname = 'get_public_proposta';


-- =============================================================================
-- SEÇÃO 16: AUDITORIA DE GRANTS
-- Verificar grants excessivos concedidos a anon e authenticated
-- =============================================================================

-- Verificar quais tabelas têm grant para anon (execute para auditar):
/*
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND table_schema = 'public'
ORDER BY grantee, table_name, privilege_type;
*/

-- Revogar SELECT de anon em tabelas que não devem ser acessadas publicamente:
-- REVOKE SELECT ON public.clientes FROM anon;
-- REVOKE SELECT ON public.propostas FROM anon;
-- REVOKE SELECT ON public.vendas FROM anon;
-- REVOKE SELECT ON public.profiles FROM anon;
-- REVOKE SELECT ON public.vendedores_stats FROM anon;
-- REVOKE SELECT ON public.componentes FROM anon;
-- REVOKE SELECT ON public.custos_extras FROM anon;
-- REVOKE ALL ON public.financiadoras FROM anon;
-- REVOKE ALL ON public.franquias FROM anon;

-- Manter grant para authenticated (RLS filtra por policy):
-- GRANT SELECT ON public.produtos TO authenticated;
-- GRANT SELECT ON public.precos_franquia TO authenticated;
-- GRANT SELECT ON public.financiadoras TO authenticated;
-- GRANT SELECT ON public.franquias TO authenticated;
-- etc.


-- =============================================================================
-- SEÇÃO 17: REVISÕES ADICIONAIS MANUAIS OBRIGATÓRIAS
-- Items que não podem ser confirmados/corrigidos apenas com SQL aqui
-- =============================================================================

-- 1. Supabase Auth Dashboard:
--    → Authentication → Providers → desabilitar "Enable email sign-up" se não
--      houver fluxo de signup público controlado.
--    → Habilitar "Confirm email" obrigatório.
--    → Authentication → Rate Limits → verificar se está ativo.

-- 2. Storage bucket "avatars":
--    → Verificar se bucket é PÚBLICO ou PRIVADO.
--    → Se público: qualquer pessoa pode listar/acessar avatares por URL direta.
--    → Se privado: URLs assinadas expiram, mais seguro.
--    → Verificar RLS em storage.objects se bucket for controlado.

-- 3. Edge Function admin-create-user:
--    → Verificar que valida o JWT Bearer token e que o role = 'admin'.
--    → Não usar service_role key direto no body/response.

-- 4. MFA:
--    → Considerar tornar MFA obrigatório para admin e gestor via custom claim
--      + verificação de AAL level na RPC is_current_user_active.

-- 5. Supabase Auth → Email Templates:
--    → Verificar que links de recovery/invite têm expiração curta (< 1h).
--    → Verificar que os templates não revelam informações sobre existência de conta.

-- 6. Verificar se supabase_functions_admin tem grants excessivos.


-- =============================================================================
-- FIM DO SCRIPT
-- =============================================================================
