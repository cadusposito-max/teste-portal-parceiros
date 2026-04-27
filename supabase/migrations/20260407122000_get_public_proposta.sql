-- ============================================================================
-- Public proposal RPC
-- Keeps public proposal data minimal and avoids leaking seller email.
-- ============================================================================

drop function if exists public.get_public_proposta(uuid);

create function public.get_public_proposta(p_id uuid)
returns table (
  id uuid,
  cliente_nome text,
  cliente_cidade text,
  vendedor_nome text,
  vendedor_telefone text,
  kit_nome text,
  kit_brand text,
  kit_power numeric,
  kit_price numeric,
  kit_list_price numeric,
  proposal_mode text,
  custom_system_power_kwp numeric,
  custom_total_price numeric,
  custom_payment_note text,
  custom_commercial_note text,
  custom_modulo_nome text,
  custom_modulo_qty integer,
  custom_inversor_nome text,
  custom_inversor_qty integer,
  geracao_estimada numeric,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
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
  from public.propostas p
  where p.id = p_id
  limit 1
$$;

revoke execute on function public.get_public_proposta(uuid) from public;
grant execute on function public.get_public_proposta(uuid) to anon;
grant execute on function public.get_public_proposta(uuid) to authenticated;
