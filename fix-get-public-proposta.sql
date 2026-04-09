-- ============================================================
-- PASSO 1: Ver a definição atual da RPC antes de alterar
-- Execute esta query primeiro e confirme que a função existe
-- ============================================================

SELECT prosrc
FROM pg_proc
WHERE proname = 'get_public_proposta';


-- ============================================================
-- PASSO 2: Recriar a função preservando todos os campos
-- originais + adicionando kit_list_price
-- SEGURANÇA: remove vendedor_email (exposto indevidamente na
-- versão anterior — viola audit seção 15 do security-rls.sql)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_public_proposta(uuid);

CREATE FUNCTION public.get_public_proposta(p_id uuid)
RETURNS TABLE (
  id                      uuid,
  cliente_nome            text,
  cliente_cidade          text,
  vendedor_nome           text,
  vendedor_telefone       text,
  kit_nome                text,
  kit_brand               text,
  kit_power               numeric,
  kit_price               numeric,
  kit_list_price          numeric,
  proposal_mode           text,
  custom_system_power_kwp numeric,
  custom_total_price      numeric,
  custom_payment_note     text,
  custom_commercial_note  text,
  custom_modulo_nome      text,
  custom_modulo_qty       integer,
  custom_inversor_nome    text,
  custom_inversor_qty     integer,
  geracao_estimada        numeric,
  status                  text,
  created_at              timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.cliente_nome,
    p.cliente_cidade,
    p.vendedor_nome,
    p.vendedor_telefone,
    p.kit_nome,
    p.kit_brand,
    p.kit_power,
    p.kit_price,
    p.kit_list_price,
    p.proposal_mode,
    p.custom_system_power_kwp,
    p.custom_total_price,
    p.custom_payment_note,
    p.custom_commercial_note,
    p.custom_modulo_nome,
    p.custom_modulo_qty,
    p.custom_inversor_nome,
    p.custom_inversor_qty,
    p.geracao_estimada,
    p.status,
    p.created_at
  FROM public.propostas p
  WHERE p.id = p_id
  LIMIT 1;
$$;

-- Garante que usuários anônimos (acesso público) podem chamar a função
GRANT EXECUTE ON FUNCTION public.get_public_proposta(uuid) TO anon;


-- ============================================================
-- PASSO 3: Validar após a execução
-- Deve retornar o objeto com o campo kit_list_price presente
-- Substitua o UUID abaixo por um id real de proposta sua
-- ============================================================

-- SELECT public.get_public_proposta('00000000-0000-0000-0000-000000000000');
