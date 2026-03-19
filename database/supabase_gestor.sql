-- ============================================================
-- MIGRAÇÃO: ROLE GESTOR + FRANQUIA SJC — Ágil Solar
-- Pré-requisito: supabase_multifranquia.sql já executado.
-- Execute este arquivo INTEIRO no Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- PASSO 1: Função auxiliar is_gestor()
-- ============================================================
CREATE OR REPLACE FUNCTION is_gestor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'gestor',
    false
  );
$$;


-- ============================================================
-- PASSO 2: Criar franquia Ágil Solar São José dos Campos
-- ============================================================
INSERT INTO franquias (nome, cidade)
VALUES ('Ágil Solar São José dos Campos', 'São José dos Campos')
ON CONFLICT DO NOTHING;


-- ============================================================
-- PASSO 3: Copiar preços da Matriz para SJC (ponto de partida)
-- ============================================================
INSERT INTO precos_franquia (produto_id, franquia_id, price, list_price)
SELECT
  pf.produto_id,
  sjc.id,
  pf.price,
  pf.list_price
FROM precos_franquia pf
CROSS JOIN (
  SELECT id FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1
) sjc
WHERE pf.franquia_id = (
  SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM precos_franquia pf2
  WHERE pf2.produto_id = pf.produto_id
    AND pf2.franquia_id = sjc.id
);


-- ============================================================
-- PASSO 4: Adicionar franquia_id em vendedores_stats
-- (permite que gestor enxergue apenas vendedores da sua franquia)
-- ============================================================
ALTER TABLE vendedores_stats
  ADD COLUMN IF NOT EXISTS franquia_id uuid REFERENCES franquias(id);

-- Associar registros existentes à Matriz
UPDATE vendedores_stats
SET franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
WHERE franquia_id IS NULL;

-- Habilitar RLS (pode já estar habilitado — idempotente)
ALTER TABLE vendedores_stats ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PASSO 5: Atualizar políticas RLS para incluir gestor
-- ============================================================

-- ── clientes ──
DROP POLICY IF EXISTS "clientes_vendedor_own" ON clientes;
CREATE POLICY "clientes_vendedor_own" ON clientes
  FOR ALL
  USING (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  );

-- ── propostas ──
DROP POLICY IF EXISTS "propostas_vendedor_own"    ON propostas;
DROP POLICY IF EXISTS "propostas_public_select"   ON propostas;

-- Parceiros autenticados — acesso completo ao próprio escopo
CREATE POLICY "propostas_vendedor_own" ON propostas
  FOR ALL
  USING (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  );

-- Leitura pública de proposta via link compartilhado (proposta.html)
-- auth.role() = 'anon' garante que SÓ usuários NÃO logados podem ler via UUID.
-- Usuários autenticados ficam restritos pela policy propostas_vendedor_own acima.
CREATE POLICY "propostas_public_select" ON propostas
  FOR SELECT
  USING (auth.role() = 'anon');

-- ── vendas ──
DROP POLICY IF EXISTS "vendas_vendedor_own" ON vendas;
CREATE POLICY "vendas_vendedor_own" ON vendas
  FOR ALL
  USING (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  );

-- ── logs_propostas ──
DROP POLICY IF EXISTS "logs_own" ON logs_propostas;
CREATE POLICY "logs_own" ON logs_propostas
  FOR ALL
  USING (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  )
  WITH CHECK (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR (vendedor_email = (auth.jwt() ->> 'email') AND franquia_id = get_franquia_id())
  );

-- ── precos_franquia: gestor edita preços da sua franquia ──
DROP POLICY IF EXISTS "precos_read_own"      ON precos_franquia;
DROP POLICY IF EXISTS "precos_admin_write"   ON precos_franquia;
DROP POLICY IF EXISTS "precos_gestor_write"  ON precos_franquia;

CREATE POLICY "precos_read_own" ON precos_franquia
  FOR SELECT USING (
    is_admin() OR franquia_id = get_franquia_id()
  );

CREATE POLICY "precos_admin_write" ON precos_franquia
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "precos_gestor_write" ON precos_franquia
  FOR ALL
  USING  (is_gestor() AND franquia_id = get_franquia_id())
  WITH CHECK (is_gestor() AND franquia_id = get_franquia_id());

-- ── vendedores_stats: gestor vê todos da sua franquia, vendedor só o próprio ──
DROP POLICY IF EXISTS "stats_own"            ON vendedores_stats;
DROP POLICY IF EXISTS "stats_gestor_read"    ON vendedores_stats;

CREATE POLICY "stats_own" ON vendedores_stats
  FOR ALL
  USING (
    is_admin()
    OR (is_gestor() AND franquia_id = get_franquia_id())
    OR email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    is_admin()
    OR email = (auth.jwt() ->> 'email')
  );


-- ============================================================
-- CORREÇÃO: policy propostas_public_select (já aplicada acima)
-- Se você já rodou supabase_gestor.sql antes, rode este bloco
-- isolado para corrigir o USING (true) que vazava propostas:
-- ============================================================
DROP POLICY IF EXISTS "propostas_public_select" ON propostas;
CREATE POLICY "propostas_public_select" ON propostas
  FOR SELECT
  USING (auth.role() = 'anon');


-- ============================================================
-- PASSO 6: Atribuir role GESTOR a um usuário
-- Substitua 'gestor@email.com.br' pelo e-mail real do gestor.
-- ============================================================
/*
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',        'gestor',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1)
     )
WHERE email = 'gestor@email.com.br';
*/


-- ============================================================
-- VERIFICAÇÃO — execute após a migração para confirmar
-- ============================================================
/*
-- Ver franquias cadastradas:
SELECT id, nome, cidade, ativo FROM franquias ORDER BY created_at;

-- Ver preços copiados para SJC:
SELECT COUNT(*) FROM precos_franquia
WHERE franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar São José dos Campos' LIMIT 1);

-- Ver políticas ativas:
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clientes','propostas','vendas','vendedores_stats','precos_franquia')
ORDER BY tablename, policyname;
*/
