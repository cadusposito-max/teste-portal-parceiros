-- ==========================================================
-- FASE 2: Proposta Personalizada por Componentes
-- Objetivo: vendedor seleciona módulo + inversor (sem ver
--           preços), custos extras e markup são calculados
--           na RPC com SECURITY DEFINER (invisíveis ao front).
--
-- Execute em staging antes do prod.
-- ==========================================================

BEGIN;

-- ----------------------------------------------------------
-- 1) Tabela: componentes  (módulos e inversores)
--    Preço unitário SÓ visível via RPC — RLS bloqueia SELECT
--    direto. A view v_componentes_public expõe apenas
--    id/tipo/nome/potencia_wp para popular os dropdowns.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.componentes (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo          text          NOT NULL,
  nome          text          NOT NULL,
  potencia_wp   numeric(10,2),          -- apenas para módulos
  preco_unitario numeric(12,2) NOT NULL DEFAULT 0,
  ativo         boolean       NOT NULL  DEFAULT true,
  created_at    timestamptz             DEFAULT now(),
  CONSTRAINT chk_componentes_tipo  CHECK (tipo IN ('modulo', 'inversor')),
  CONSTRAINT chk_componentes_preco CHECK (preco_unitario >= 0)
);

COMMENT ON TABLE  public.componentes              IS 'Módulos e inversores com preço unitário — nunca exposto ao vendedor via API direta.';
COMMENT ON COLUMN public.componentes.potencia_wp  IS 'Potência do módulo em Watts-pico (nulo para inversores).';
COMMENT ON COLUMN public.componentes.preco_unitario IS 'Custo de aquisição unitário — protegido por RLS.';

-- ----------------------------------------------------------
-- 2) Tabela: configuracoes  (chave/valor genérico)
--    Contém markup_padrao e qualquer outra config global.
--    Bloqueada por RLS — leitura apenas via RPC DEFINER.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracoes (
  chave      text          PRIMARY KEY,
  valor      numeric(12,4) NOT NULL DEFAULT 0,
  descricao  text,
  updated_at timestamptz   DEFAULT now()
);

COMMENT ON TABLE public.configuracoes IS 'Parâmetros globais de precificação (markup, etc.) — nunca exposto ao vendedor.';

-- Valor inicial de markup (ajuste conforme necessário)
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('markup_padrao', 20.0, 'Markup percentual padrão aplicado sobre subtotal total')
ON CONFLICT (chave) DO NOTHING;

-- ----------------------------------------------------------
-- 3) Tabela: custos_extras
--    Custo operacional por projeto — embutido no cálculo
--    da RPC, invisível ao vendedor.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custos_extras (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          text          NOT NULL,
  tipo_calculo  text          NOT NULL,
  valor         numeric(12,4) NOT NULL DEFAULT 0,
  ativo         boolean       NOT NULL DEFAULT true,
  ordem         int           NOT NULL DEFAULT 0,
  descricao     text,
  CONSTRAINT chk_custos_tipo CHECK (
    tipo_calculo IN ('por_modulo', 'por_kwp', 'percentual_equip', 'percentual_total', 'fixo')
  ),
  CONSTRAINT chk_custos_valor CHECK (valor >= 0)
);

COMMENT ON TABLE  public.custos_extras             IS 'Custos extras por projeto — incorporados no cálculo RPC, nunca expostos ao vendedor.';
COMMENT ON COLUMN public.custos_extras.tipo_calculo IS
  'por_modulo: R$ × qtd módulos | por_kwp: R$ × kWp total | percentual_equip: % do custo equip. | percentual_total: % do subtotal | fixo: R$ fixo por projeto';

-- Dados iniciais (ajuste valores conforme a empresa)
INSERT INTO public.custos_extras (nome, tipo_calculo, valor, ordem, descricao) VALUES
  ('Mão de Obra',      'por_modulo',        80.00, 1, 'Custo de instalação por módulo'),
  ('Nota Serviço',     'percentual_equip',   5.00, 2, 'Emissão de nota de serviço sobre o custo de equipamento'),
  ('Material CA',      'por_kwp',          150.00, 3, 'Materiais de instalação AC por kWp'),
  ('Deslocamento',     'fixo',             300.00, 4, 'Custo fixo de deslocamento por projeto'),
  ('Projeto de Eng.',  'fixo',             400.00, 5, 'Elaboração de projeto de engenharia'),
  ('Royalties/Fundo',  'percentual_equip',   2.00, 6, 'Royalties e fundo de garantia sobre equipamento');

-- ----------------------------------------------------------
-- 4) View pública sem preços — usada pelos dropdowns
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW public.v_componentes_public AS
  SELECT id, tipo, nome, potencia_wp
  FROM public.componentes
  WHERE ativo = true
  ORDER BY tipo, nome;

COMMENT ON VIEW public.v_componentes_public IS 'Visão segura de componentes — expõe apenas id/tipo/nome/potencia sem preço.';

-- ----------------------------------------------------------
-- 5) RLS — bloqueia acesso direto às tabelas sensíveis
-- ----------------------------------------------------------
ALTER TABLE public.componentes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custos_extras ENABLE ROW LEVEL SECURITY;

-- Negar SELECT direto em componentes (preço oculto)
DROP POLICY IF EXISTS "componentes_deny_direct" ON public.componentes;
CREATE POLICY "componentes_deny_direct" ON public.componentes
  FOR SELECT USING (false);

-- Negar todo acesso direto em configuracoes
DROP POLICY IF EXISTS "configuracoes_deny_all" ON public.configuracoes;
CREATE POLICY "configuracoes_deny_all" ON public.configuracoes
  FOR SELECT USING (false);

-- Negar todo acesso direto em custos_extras
DROP POLICY IF EXISTS "custos_extras_deny_all" ON public.custos_extras;
CREATE POLICY "custos_extras_deny_all" ON public.custos_extras
  FOR SELECT USING (false);

-- Conceder SELECT na view pública
GRANT SELECT ON public.v_componentes_public TO anon, authenticated;

-- ----------------------------------------------------------
-- 6) RPC segura: recebe IDs + quantidades + desconto,
--    devolve APENAS total_final, potencia_kwp e desconto_aplicado.
--    SECURITY DEFINER → acessa tabelas ignorando RLS do caller.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_proposta_personalizada(
  p_modulo_id      uuid,
  p_modulo_qty     int,
  p_inversor_id    uuid,
  p_inversor_qty   int,
  p_discount_type  text    DEFAULT 'value',
  p_discount_value numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mod_preco   numeric;
  v_mod_wp      numeric;
  v_inv_preco   numeric;
  v_markup      numeric;
  v_equipment   numeric;
  v_potencia    numeric;
  v_custos      numeric := 0;
  v_custo       record;
  v_subtotal    numeric;
  v_antes_desc  numeric;
  v_desconto    numeric;
  v_total       numeric;
BEGIN
  -- Valida quantidades
  IF p_modulo_qty  < 1 THEN RAISE EXCEPTION 'Quantidade de módulos deve ser >= 1';   END IF;
  IF p_inversor_qty < 1 THEN RAISE EXCEPTION 'Quantidade de inversores deve ser >= 1'; END IF;

  -- Módulo
  SELECT preco_unitario, potencia_wp
    INTO v_mod_preco, v_mod_wp
    FROM public.componentes
   WHERE id = p_modulo_id AND tipo = 'modulo' AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo inválido ou inativo (id: %)', p_modulo_id;
  END IF;

  -- Inversor
  SELECT preco_unitario
    INTO v_inv_preco
    FROM public.componentes
   WHERE id = p_inversor_id AND tipo = 'inversor' AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inversor inválido ou inativo (id: %)', p_inversor_id;
  END IF;

  -- Custo de equipamento
  v_equipment := (v_mod_preco * p_modulo_qty) + (v_inv_preco * p_inversor_qty);

  -- Potência total em kWp
  v_potencia := (v_mod_wp * p_modulo_qty) / 1000.0;

  -- Markup
  SELECT valor INTO v_markup FROM public.configuracoes WHERE chave = 'markup_padrao';
  IF NOT FOUND THEN v_markup := 0; END IF;

  -- Custos extras
  FOR v_custo IN
    SELECT tipo_calculo, valor
      FROM public.custos_extras
     WHERE ativo = true
     ORDER BY ordem
  LOOP
    CASE v_custo.tipo_calculo
      WHEN 'por_modulo'        THEN v_custos := v_custos + (v_custo.valor * p_modulo_qty);
      WHEN 'por_kwp'           THEN v_custos := v_custos + (v_custo.valor * v_potencia);
      WHEN 'percentual_equip'  THEN v_custos := v_custos + (v_equipment * v_custo.valor / 100.0);
      WHEN 'percentual_total'  THEN v_custos := v_custos + ((v_equipment + v_custos) * v_custo.valor / 100.0);
      WHEN 'fixo'              THEN v_custos := v_custos + v_custo.valor;
      ELSE NULL;
    END CASE;
  END LOOP;

  v_subtotal   := v_equipment + v_custos;
  v_antes_desc := v_subtotal * (1.0 + v_markup / 100.0);

  -- Desconto
  IF p_discount_type = 'percent' THEN
    v_desconto := v_antes_desc * (COALESCE(p_discount_value, 0) / 100.0);
  ELSE
    v_desconto := COALESCE(p_discount_value, 0);
  END IF;
  v_desconto := LEAST(GREATEST(v_desconto, 0), v_antes_desc);

  v_total := GREATEST(v_antes_desc - v_desconto, 0);

  RETURN json_build_object(
    'total_final',       ROUND(v_total,    2),
    'potencia_kwp',      ROUND(v_potencia, 2),
    'desconto_aplicado', ROUND(v_desconto, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_proposta_personalizada(uuid, int, uuid, int, text, numeric)
  TO anon, authenticated;

-- ----------------------------------------------------------
-- 7) Novas colunas em propostas para rastrear componentes
-- ----------------------------------------------------------
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS custom_modulo_id     uuid,
  ADD COLUMN IF NOT EXISTS custom_modulo_nome   text,
  ADD COLUMN IF NOT EXISTS custom_modulo_qty    int,
  ADD COLUMN IF NOT EXISTS custom_inversor_id   uuid,
  ADD COLUMN IF NOT EXISTS custom_inversor_nome text,
  ADD COLUMN IF NOT EXISTS custom_inversor_qty  int;

COMMENT ON COLUMN public.propostas.custom_modulo_id     IS 'ID do módulo usado na proposta personalizada.';
COMMENT ON COLUMN public.propostas.custom_modulo_nome   IS 'Nome snapshot do módulo no momento da proposta.';
COMMENT ON COLUMN public.propostas.custom_modulo_qty    IS 'Quantidade de módulos.';
COMMENT ON COLUMN public.propostas.custom_inversor_id   IS 'ID do inversor usado na proposta personalizada.';
COMMENT ON COLUMN public.propostas.custom_inversor_nome IS 'Nome snapshot do inversor no momento da proposta.';
COMMENT ON COLUMN public.propostas.custom_inversor_qty  IS 'Quantidade de inversores.';

COMMIT;

-- ==========================================================
-- EXEMPLOS DE INSERT de componentes (ajuste conforme catálogo)
-- Executar separadamente após o COMMIT acima:
-- ==========================================================
/*
-- Módulos
INSERT INTO public.componentes (tipo, nome, potencia_wp, preco_unitario) VALUES
  ('modulo', 'Canadian Solar 540W',  540, 850.00),
  ('modulo', 'Jinko Tiger 550W',     550, 870.00),
  ('modulo', 'Trina Vertex 580W',    580, 920.00),
  ('modulo', 'BYD 420W',             420, 700.00);

-- Inversores
INSERT INTO public.componentes (tipo, nome, potencia_wp, preco_unitario) VALUES
  ('inversor', 'Growatt MIN 3000TL-X',   NULL, 2100.00),
  ('inversor', 'Growatt MIN 5000TL-X',   NULL, 2600.00),
  ('inversor', 'Fronius Primo 5.0-1',    NULL, 4800.00),
  ('inversor', 'SMA Sunny Boy 5.0',      NULL, 5200.00),
  ('inversor', 'Deye 5kW Híbrido',       NULL, 5500.00);
*/
