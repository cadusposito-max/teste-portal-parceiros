-- ============================================================================
-- Public componentes view
-- Exposes only safe component fields for proposal builder consumption.
-- ============================================================================

drop view if exists public.v_componentes_public;

create view public.v_componentes_public as
select
  c.id,
  c.tipo,
  c.nome,
  c.potencia_wp
from public.componentes c
where coalesce(c.ativo, true) = true;

revoke all on public.v_componentes_public from public, anon;
grant select on public.v_componentes_public to authenticated;
