-- ============================================================
-- MIGRAÇÃO: MULTI-FRANQUIA — Ágil Solar
-- Execute este arquivo INTEIRO no Supabase SQL Editor.
-- Ordem importa — execute de cima para baixo.
-- ============================================================


-- ============================================================
-- PASSO 1: Criar tabela franquias
-- ============================================================
CREATE TABLE IF NOT EXISTS franquias (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  cidade     text,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Inserir a Matriz (dados atuais são todos dela)
INSERT INTO franquias (nome, cidade)
VALUES ('Ágil Solar Matriz', 'Araçatuba')
ON CONFLICT DO NOTHING;


-- ============================================================
-- PASSO 2: Criar tabela precos_franquia
-- (catálogo único, preços diferentes por franquia)
-- ============================================================
CREATE TABLE IF NOT EXISTS precos_franquia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id  uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  franquia_id uuid NOT NULL REFERENCES franquias(id) ON DELETE CASCADE,
  price       numeric NOT NULL DEFAULT 0,
  list_price  numeric NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (produto_id, franquia_id)
);


-- ============================================================
-- PASSO 3: Popular precos_franquia com os preços atuais da Matriz
-- (products.price e products.list_price são da Matriz)
-- ============================================================
INSERT INTO precos_franquia (produto_id, franquia_id, price, list_price)
SELECT
  p.id,
  f.id,
  p.price,
  p.list_price
FROM produtos p
CROSS JOIN franquias f
WHERE f.nome = 'Ágil Solar Matriz'
ON CONFLICT (produto_id, franquia_id) DO NOTHING;


-- ============================================================
-- PASSO 4: Adicionar franquia_id nas tabelas operacionais
-- ============================================================

-- clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS franquia_id uuid REFERENCES franquias(id);

-- propostas
ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS franquia_id uuid REFERENCES franquias(id);

-- vendas
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS franquia_id uuid REFERENCES franquias(id);

-- logs_propostas
ALTER TABLE logs_propostas
  ADD COLUMN IF NOT EXISTS franquia_id uuid REFERENCES franquias(id);


-- ============================================================
-- PASSO 5: Associar dados existentes (NULL) à Matriz
-- ============================================================
UPDATE clientes
SET franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
WHERE franquia_id IS NULL;

UPDATE propostas
SET franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
WHERE franquia_id IS NULL;

UPDATE vendas
SET franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
WHERE franquia_id IS NULL;

UPDATE logs_propostas
SET franquia_id = (SELECT id FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
WHERE franquia_id IS NULL;


-- ============================================================
-- PASSO 6: Tornar franquia_id NOT NULL após migração
-- ============================================================
ALTER TABLE clientes    ALTER COLUMN franquia_id SET NOT NULL;
ALTER TABLE propostas   ALTER COLUMN franquia_id SET NOT NULL;
ALTER TABLE vendas      ALTER COLUMN franquia_id SET NOT NULL;
ALTER TABLE logs_propostas ALTER COLUMN franquia_id SET NOT NULL;


-- ============================================================
-- PASSO 7: Funções helper para RLS
-- ============================================================

-- Verifica se o usuário logado é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Retorna o franquia_id do usuário logado (via app_metadata do JWT)
CREATE OR REPLACE FUNCTION get_franquia_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'franquia_id')::uuid;
$$;


-- ============================================================
-- PASSO 8: Definir admin (cadusposito@gmail.com)
-- ============================================================
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'role',       'admin',
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
     )
WHERE email = 'cadusposito@gmail.com';


-- ============================================================
-- PASSO 9: Habilitar RLS em todas as tabelas
-- ============================================================
ALTER TABLE franquias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE precos_franquia ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE propostas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_propostas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE componentes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE custos_extras   ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiadoras   ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PASSO 10: Remover políticas antigas problemáticas
-- ============================================================

-- clientes: remover política ampla demais
DROP POLICY IF EXISTS "Vendedor gerencia seus clientes" ON clientes;
DROP POLICY IF EXISTS "Vendors see own clients"         ON clientes;

-- propostas: remover política que expunha tudo para anônimos (CRÍTICO)
DROP POLICY IF EXISTS "Clientes podem ver a proposta"   ON propostas;
DROP POLICY IF EXISTS "Vendors see own proposals"       ON propostas;
DROP POLICY IF EXISTS "Vendedores criam propostas"      ON propostas;

-- produtos: remover escrita irrestrita para qualquer autenticado
DROP POLICY IF EXISTS "Permitir alteração de produtos"              ON produtos;
DROP POLICY IF EXISTS "Permitir leitura de produtos para logados"   ON produtos;
DROP POLICY IF EXISTS "Auth users can read products"                ON produtos;

-- vendedores_stats: remover política ampla
DROP POLICY IF EXISTS "Permitir leitura e edição de stats"          ON vendedores_stats;

-- configuracoes: remover política deny_all inútil
DROP POLICY IF EXISTS "configuracoes_deny_all"                      ON configuracoes;


-- ============================================================
-- PASSO 11: Novas políticas RLS corretas
-- ============================================================

-- ── franquias (leitura pública para usuários autenticados) ──
DROP POLICY IF EXISTS "franquias_read"         ON franquias;
DROP POLICY IF EXISTS "franquias_admin_write"  ON franquias;

CREATE POLICY "franquias_read" ON franquias
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "franquias_admin_write" ON franquias
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── precos_franquia ──
DROP POLICY IF EXISTS "precos_read_own"        ON precos_franquia;
DROP POLICY IF EXISTS "precos_admin_write"     ON precos_franquia;

CREATE POLICY "precos_read_own" ON precos_franquia
  FOR SELECT USING (
    is_admin() OR franquia_id = get_franquia_id()
  );

CREATE POLICY "precos_admin_write" ON precos_franquia
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── clientes ──
DROP POLICY IF EXISTS "clientes_vendedor_own"  ON clientes;

CREATE POLICY "clientes_vendedor_own" ON clientes
  FOR ALL
  USING (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  )
  WITH CHECK (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  );

-- ── propostas ──
DROP POLICY IF EXISTS "propostas_vendedor_own" ON propostas;

CREATE POLICY "propostas_vendedor_own" ON propostas
  FOR ALL
  USING (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  )
  WITH CHECK (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  );

-- ── vendas ──
DROP POLICY IF EXISTS "vendas_vendedor_own"    ON vendas;

CREATE POLICY "vendas_vendedor_own" ON vendas
  FOR ALL
  USING (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  )
  WITH CHECK (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  );

-- ── logs_propostas ──
DROP POLICY IF EXISTS "logs_own"               ON logs_propostas;

CREATE POLICY "logs_own" ON logs_propostas
  FOR ALL
  USING (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  )
  WITH CHECK (
    is_admin() OR (
      vendedor_email = (auth.jwt() ->> 'email') AND
      franquia_id = get_franquia_id()
    )
  );

-- ── produtos (catálogo — somente leitura para vendedores) ──
DROP POLICY IF EXISTS "produtos_read"          ON produtos;
DROP POLICY IF EXISTS "produtos_admin_write"   ON produtos;

CREATE POLICY "produtos_read" ON produtos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "produtos_admin_write" ON produtos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── componentes (bloqueado para acesso direto — usa view v_componentes_public) ──
-- Mantém política existente de bloqueio total. A view contorna isso com SECURITY DEFINER.

-- ── configuracoes (leitura para autenticados, escrita só admin) ──
DROP POLICY IF EXISTS "Auth users can read config"    ON configuracoes;
DROP POLICY IF EXISTS "configuracoes_read"            ON configuracoes;
DROP POLICY IF EXISTS "configuracoes_admin_write"     ON configuracoes;

CREATE POLICY "configuracoes_read" ON configuracoes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "configuracoes_admin_write" ON configuracoes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── custos_extras (admin only) ──
DROP POLICY IF EXISTS "custos_extras_deny_all" ON custos_extras;
DROP POLICY IF EXISTS "custos_extras_admin"    ON custos_extras;

CREATE POLICY "custos_extras_admin" ON custos_extras
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── financiadoras (leitura para autenticados, escrita admin) ──
DROP POLICY IF EXISTS "financiadoras_read"         ON financiadoras;
DROP POLICY IF EXISTS "financiadoras_admin_write"  ON financiadoras;

CREATE POLICY "financiadoras_read" ON financiadoras
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "financiadoras_admin_write" ON financiadoras
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ============================================================
-- PASSO 12: View pública de componentes (sem preço)
-- Se já existir, recria com a mesma lógica.
-- ============================================================
CREATE OR REPLACE VIEW v_componentes_public
WITH (security_invoker = false)
AS
  SELECT id, tipo, nome, potencia_wp
  FROM componentes
  WHERE ativo = true;


-- ============================================================
-- PASSO 13: Como cadastrar uma nova franquia (INSTRUÇÕES)
-- ============================================================
-- 1. Inserir a franquia:
--    INSERT INTO franquias (nome, cidade) VALUES ('Ágil Solar São José dos Campos', 'São José dos Campos');
--
-- 2. Copiar os preços da Matriz para a nova franquia (ponto de partida):
--    INSERT INTO precos_franquia (produto_id, franquia_id, price, list_price)
--    SELECT p.produto_id, f.id, p.price, p.list_price
--    FROM precos_franquia p
--    CROSS JOIN franquias f
--    WHERE f.nome = 'Ágil Solar São José dos Campos'
--    AND NOT EXISTS (
--      SELECT 1 FROM precos_franquia pf2
--      WHERE pf2.produto_id = p.produto_id AND pf2.franquia_id = f.id
--    );
--
-- 3. No Supabase Dashboard → Authentication → Users:
--    Criar o usuário do vendedor.
--
-- 4. Rodar o SQL abaixo com o UUID da franquia e o email do usuário:
--    UPDATE auth.users
--    SET raw_app_meta_data = raw_app_meta_data
--      || jsonb_build_object('role', 'vendedor', 'franquia_id', '<UUID_DA_FRANQUIA>')
--    WHERE email = 'vendedor@franquia.com.br';
-- ============================================================


-- ============================================================
-- PASSO 14: Cadastro de vendedores — exemplos prontos
-- Execute APÓS criar o usuário no Dashboard (Authentication → Users → Add user)
-- ============================================================

-- ── matheuscarvalho@agilsolar.com → Ágil Solar Matriz ──
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object(
       'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'Ágil Solar Matriz' LIMIT 1)
     )
WHERE email = 'matheuscarvalho@agilsolar.com';

-- Verificar se foi aplicado corretamente:
-- SELECT email, raw_app_meta_data FROM auth.users WHERE email = 'matheuscarvalho@agilsolar.com';

-- ============================================================
-- TEMPLATE: Para cada novo vendedor, copie o bloco abaixo
-- ============================================================
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data
--   || jsonb_build_object(
--        'franquia_id', (SELECT id::text FROM franquias WHERE nome = 'NOME_DA_FRANQUIA' LIMIT 1)
--      )
-- WHERE email = 'email@vendedor.com';
-- ============================================================
