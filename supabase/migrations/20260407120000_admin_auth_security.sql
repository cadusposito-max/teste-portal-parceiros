-- ============================================================================
-- Admin auth security baseline
-- Centralizes admin + aal2 enforcement, critical RLS policies and admin RPCs.
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.current_user_aal()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_role() = 'admin'
$$;

create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_role() = 'gestor'
$$;

create or replace function public.current_franquia_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'franquia_id', '')::uuid
$$;

create or replace function public.is_admin_or_gestor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_role() in ('admin', 'gestor')
$$;

create or replace function public.is_admin_with_aal2()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_role() = 'admin'
     and public.current_user_aal() = 'aal2'
$$;

create or replace function public.assert_admin_aal2()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := public.current_user_role();
  v_aal text := public.current_user_aal();
begin
  if v_role <> 'admin' then
    raise exception 'permission_denied'
      using detail = 'Apenas administradores podem executar esta acao.',
            hint = 'role=' || coalesce(v_role, ''),
            errcode = 'P0001';
  end if;

  if v_aal <> 'aal2' then
    raise exception 'mfa_required'
      using detail = 'Esta acao requer autenticacao MFA verificada (aal2).',
            hint = 'aal=' || coalesce(v_aal, ''),
            errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_admin_aal2() is
  'Raises P0001 unless caller is admin with aal2.';

create table if not exists public.chat_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_enabled boolean not null default false,
  gestor_user_id uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create index if not exists chat_user_access_gestor_user_id_idx
  on public.chat_user_access (gestor_user_id);

create table if not exists public.vendedores_stats (
  email text primary key,
  comissao_pct numeric(5,2) not null default 5,
  total_logins integer not null default 0,
  ultimo_acesso timestamptz null,
  franquia_id uuid null references public.franquias(id) on delete set null
);

create index if not exists vendedores_stats_franquia_id_idx
  on public.vendedores_stats (franquia_id);

alter table public.chat_user_access enable row level security;

do $$
begin
  if to_regclass('public.chat_user_access') is not null then
    execute 'drop policy if exists "chat_user_access_none" on public.chat_user_access';
    execute 'create policy "chat_user_access_none" on public.chat_user_access for all to authenticated using (false) with check (false)';
  end if;
end
$$;

create or replace function public.is_current_user_active()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_active boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select coalesce(p.ativo, true)
    into v_active
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    return false;
  end if;

  return coalesce(v_active, false);
end;
$$;

create or replace function public.chat_can_use_current_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_active boolean := false;
  v_chat_enabled boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  select coalesce(p.ativo, true), coalesce(cua.chat_enabled, false)
    into v_active, v_chat_enabled
  from public.profiles p
  left join public.chat_user_access cua on cua.user_id = p.id
  where p.id = auth.uid();

  if not found then
    return false;
  end if;

  return v_active and v_chat_enabled;
end;
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_nome text,
  p_role text,
  p_franquia_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_metadata jsonb;
begin
  perform public.assert_admin_aal2();

  if v_role not in ('admin', 'gestor', 'vendedor') then
    raise exception 'invalid_role'
      using detail = 'Perfil invalido para o usuario.', errcode = 'P0001';
  end if;

  if v_role in ('gestor', 'vendedor') and p_franquia_id is null then
    raise exception 'franquia_required'
      using detail = 'Gestor e vendedor precisam de franquia vinculada.', errcode = 'P0001';
  end if;

  select coalesce(raw_app_meta_data, '{}'::jsonb)
    into v_metadata
  from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found'
      using detail = 'Usuario nao encontrado em auth.users.', errcode = 'P0001';
  end if;

  v_metadata := jsonb_set(v_metadata, '{role}', to_jsonb(v_role), true);
  v_metadata := jsonb_set(
    v_metadata,
    '{franquia_id}',
    case when p_franquia_id is null then 'null'::jsonb else to_jsonb(p_franquia_id::text) end,
    true
  );

  update auth.users
     set raw_app_meta_data = v_metadata,
         updated_at = now()
   where id = p_user_id;

  insert into public.profiles (id, nome, franquia_id, ativo, updated_at)
  values (p_user_id, nullif(trim(coalesce(p_nome, '')), ''), p_franquia_id, coalesce(p_ativo, true), now())
  on conflict (id) do update
    set nome = coalesce(excluded.nome, public.profiles.nome),
        franquia_id = excluded.franquia_id,
        ativo = excluded.ativo,
        updated_at = now();
end;
$$;

create or replace function public.admin_set_user_chat_access(
  p_user_id uuid,
  p_chat_enabled boolean,
  p_gestor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target_role text;
  v_target_franquia uuid;
  v_gestor_role text;
  v_gestor_franquia uuid;
begin
  perform public.assert_admin_aal2();

  select coalesce(u.raw_app_meta_data ->> 'role', 'vendedor'),
         coalesce(p.franquia_id, nullif(u.raw_app_meta_data ->> 'franquia_id', '')::uuid)
    into v_target_role, v_target_franquia
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if not found then
    raise exception 'user_not_found'
      using detail = 'Usuario nao encontrado para configuracao de chat.', errcode = 'P0001';
  end if;

  if p_gestor_user_id is not null then
    if v_target_role <> 'vendedor' then
      raise exception 'invalid_gestor_binding'
        using detail = 'Apenas vendedor pode ter gestor vinculado no chat.', errcode = 'P0001';
    end if;

    select coalesce(u.raw_app_meta_data ->> 'role', ''),
           coalesce(p.franquia_id, nullif(u.raw_app_meta_data ->> 'franquia_id', '')::uuid)
      into v_gestor_role, v_gestor_franquia
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_gestor_user_id;

    if not found or v_gestor_role <> 'gestor' then
      raise exception 'invalid_gestor'
        using detail = 'Gestor vinculado invalido para o chat.', errcode = 'P0001';
    end if;

    if v_target_franquia is distinct from v_gestor_franquia then
      raise exception 'franquia_mismatch'
        using detail = 'Gestor vinculado deve pertencer a mesma franquia do vendedor.', errcode = 'P0001';
    end if;
  end if;

  insert into public.chat_user_access (user_id, chat_enabled, gestor_user_id, updated_at, updated_by)
  values (
    p_user_id,
    coalesce(p_chat_enabled, false),
    case when coalesce(p_chat_enabled, false) then p_gestor_user_id else null end,
    now(),
    auth.uid()
  )
  on conflict (user_id) do update
    set chat_enabled = excluded.chat_enabled,
        gestor_user_id = excluded.gestor_user_id,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

create or replace function public.admin_list_users_chat()
returns table (
  user_id uuid,
  email text,
  nome text,
  role text,
  franquia_id uuid,
  franquia_nome text,
  ativo boolean,
  chat_enabled boolean,
  last_sign_in_at timestamptz,
  gestor_user_id uuid,
  gestor_nome text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_admin_aal2();

  return query
  select
    u.id as user_id,
    lower(trim(u.email)) as email,
    coalesce(nullif(trim(p.nome), ''), split_part(coalesce(u.email, ''), '@', 1)) as nome,
    coalesce(u.raw_app_meta_data ->> 'role', 'vendedor') as role,
    coalesce(p.franquia_id, nullif(u.raw_app_meta_data ->> 'franquia_id', '')::uuid) as franquia_id,
    f.nome as franquia_nome,
    coalesce(p.ativo, true) as ativo,
    coalesce(cua.chat_enabled, false) as chat_enabled,
    u.last_sign_in_at,
    cua.gestor_user_id,
    gp.nome as gestor_nome
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.chat_user_access cua on cua.user_id = u.id
  left join public.profiles gp on gp.id = cua.gestor_user_id
  left join public.franquias f on f.id = coalesce(p.franquia_id, nullif(u.raw_app_meta_data ->> 'franquia_id', '')::uuid)
  order by lower(coalesce(nullif(trim(p.nome), ''), u.email));
end;
$$;

create or replace function public.admin_update_vendedor_comissao(
  p_email text,
  p_comissao_pct numeric
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.assert_admin_aal2();

  if v_email = '' then
    raise exception 'invalid_email'
      using detail = 'E-mail obrigatorio para atualizar comissao.', errcode = 'P0001';
  end if;

  if p_comissao_pct is null or p_comissao_pct < 0 or p_comissao_pct > 100 then
    raise exception 'invalid_commission'
      using detail = 'Comissao deve ficar entre 0 e 100.', errcode = 'P0001';
  end if;

  insert into public.vendedores_stats (email, comissao_pct)
  values (v_email, p_comissao_pct)
  on conflict (email) do update
    set comissao_pct = excluded.comissao_pct;
end;
$$;

create or replace function public.record_current_user_login()
returns table (
  email text,
  comissao_pct numeric,
  total_logins integer,
  ultimo_acesso timestamptz,
  franquia_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := public.current_user_email();
  v_role text := public.current_user_role();
  v_franquia_id uuid := public.current_franquia_id();
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'session_required'
      using detail = 'Sessao autenticada obrigatoria.', errcode = 'P0001';
  end if;

  if v_role <> 'vendedor' then
    return;
  end if;

  insert into public.vendedores_stats (email, total_logins, ultimo_acesso, franquia_id)
  values (v_email, 1, now(), v_franquia_id)
  on conflict (email) do update
    set total_logins = coalesce(public.vendedores_stats.total_logins, 0) + 1,
        ultimo_acesso = excluded.ultimo_acesso,
        franquia_id = excluded.franquia_id;

  return query
  select vs.email,
         coalesce(vs.comissao_pct, 5) as comissao_pct,
         coalesce(vs.total_logins, 0) as total_logins,
         vs.ultimo_acesso,
         vs.franquia_id
  from public.vendedores_stats vs
  where vs.email = v_email
  limit 1;
end;
$$;

alter table public.clientes enable row level security;
alter table public.propostas enable row level security;
alter table public.vendas enable row level security;
alter table public.profiles enable row level security;
alter table public.produtos enable row level security;
alter table public.precos_franquia enable row level security;
alter table public.franquias enable row level security;
alter table public.financiadoras enable row level security;
alter table public.componentes enable row level security;
alter table public.custos_extras enable row level security;
alter table public.comunicados enable row level security;

drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_insert" on public.clientes;
drop policy if exists "clientes_update" on public.clientes;
drop policy if exists "clientes_delete" on public.clientes;

create policy "clientes_select" on public.clientes
  for select
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "clientes_insert" on public.clientes
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "clientes_update" on public.clientes
  for update
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  )
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "clientes_delete" on public.clientes
  for delete
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
  );

drop policy if exists "propostas_select" on public.propostas;
drop policy if exists "propostas_insert" on public.propostas;
drop policy if exists "propostas_update" on public.propostas;
drop policy if exists "propostas_delete" on public.propostas;

create policy "propostas_select" on public.propostas
  for select
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "propostas_insert" on public.propostas
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "propostas_update" on public.propostas
  for update
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  )
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "propostas_delete" on public.propostas
  for delete
  to authenticated
  using (public.is_admin_with_aal2());

drop policy if exists "vendas_select" on public.vendas;
drop policy if exists "vendas_insert" on public.vendas;
drop policy if exists "vendas_update" on public.vendas;
drop policy if exists "vendas_delete" on public.vendas;

create policy "vendas_select" on public.vendas
  for select
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "vendas_insert" on public.vendas
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "vendas_update" on public.vendas
  for update
  to authenticated
  using (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  )
  with check (
    public.is_admin()
    or (public.is_gestor() and franquia_id = public.current_franquia_id())
    or lower(trim(coalesce(vendedor_email, ''))) = public.current_user_email()
  );

create policy "vendas_delete" on public.vendas
  for delete
  to authenticated
  using (public.is_admin_with_aal2());

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;

create policy "profiles_select" on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert" on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "produtos_select" on public.produtos;
drop policy if exists "produtos_insert" on public.produtos;
drop policy if exists "produtos_update" on public.produtos;
drop policy if exists "produtos_delete" on public.produtos;

create policy "produtos_select" on public.produtos
  for select
  to authenticated
  using (true);

create policy "produtos_insert" on public.produtos
  for insert
  to authenticated
  with check (public.is_admin_with_aal2());

create policy "produtos_update" on public.produtos
  for update
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

create policy "produtos_delete" on public.produtos
  for delete
  to authenticated
  using (public.is_admin_with_aal2());

drop policy if exists "precos_franquia_select" on public.precos_franquia;
drop policy if exists "precos_franquia_insert" on public.precos_franquia;
drop policy if exists "precos_franquia_update" on public.precos_franquia;
drop policy if exists "precos_franquia_delete" on public.precos_franquia;

create policy "precos_franquia_select" on public.precos_franquia
  for select
  to authenticated
  using (true);

create policy "precos_franquia_insert" on public.precos_franquia
  for insert
  to authenticated
  with check (public.is_admin_with_aal2());

create policy "precos_franquia_update" on public.precos_franquia
  for update
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

create policy "precos_franquia_delete" on public.precos_franquia
  for delete
  to authenticated
  using (public.is_admin_with_aal2());

drop policy if exists "franquias_select" on public.franquias;
drop policy if exists "franquias_write" on public.franquias;

create policy "franquias_select" on public.franquias
  for select
  to authenticated
  using (true);

create policy "franquias_write" on public.franquias
  for all
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

drop policy if exists "financiadoras_select" on public.financiadoras;
drop policy if exists "financiadoras_write" on public.financiadoras;

create policy "financiadoras_select" on public.financiadoras
  for select
  to authenticated
  using (true);

create policy "financiadoras_write" on public.financiadoras
  for all
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

drop policy if exists "componentes_select" on public.componentes;
drop policy if exists "componentes_write" on public.componentes;

create policy "componentes_select" on public.componentes
  for select
  to authenticated
  using (true);

create policy "componentes_write" on public.componentes
  for all
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

drop policy if exists "custos_extras_select" on public.custos_extras;
drop policy if exists "custos_extras_write" on public.custos_extras;

create policy "custos_extras_select" on public.custos_extras
  for select
  to authenticated
  using (true);

create policy "custos_extras_write" on public.custos_extras
  for all
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

drop policy if exists "comunicados_select" on public.comunicados;
drop policy if exists "comunicados_select_anon" on public.comunicados;
drop policy if exists "comunicados_write" on public.comunicados;

create policy "comunicados_select" on public.comunicados
  for select
  to authenticated
  using (
    public.is_admin()
    or (is_published = true and status = 'published')
  );

create policy "comunicados_select_anon" on public.comunicados
  for select
  to anon
  using (is_published = true and status = 'published');

create policy "comunicados_write" on public.comunicados
  for all
  to authenticated
  using (public.is_admin_with_aal2())
  with check (public.is_admin_with_aal2());

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vendedores_stats'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.vendedores_stats enable row level security';
    execute 'drop policy if exists "vendedores_stats_select" on public.vendedores_stats';
    execute 'drop policy if exists "vendedores_stats_update" on public.vendedores_stats';
    execute 'drop policy if exists "vendedores_stats_insert" on public.vendedores_stats';
    execute 'drop policy if exists "vendedores_stats_delete" on public.vendedores_stats';
    execute $policy$
      create policy "vendedores_stats_select" on public.vendedores_stats
        for select
        to authenticated
        using (
          public.is_admin()
          or (public.is_gestor() and franquia_id = public.current_franquia_id())
          or lower(trim(coalesce(email, ''))) = public.current_user_email()
        )
    $policy$;
  end if;
end
$$;

revoke execute on function public.assert_admin_aal2() from public, anon;
revoke execute on function public.is_current_user_active() from public, anon;
revoke execute on function public.chat_can_use_current_user() from public, anon;
revoke execute on function public.admin_update_user(uuid, text, text, uuid, boolean) from public, anon;
revoke execute on function public.admin_set_user_chat_access(uuid, boolean, uuid) from public, anon;
revoke execute on function public.admin_list_users_chat() from public, anon;
revoke execute on function public.admin_update_vendedor_comissao(text, numeric) from public, anon;
revoke execute on function public.record_current_user_login() from public, anon;

grant execute on function public.is_current_user_active() to authenticated;
grant execute on function public.chat_can_use_current_user() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_chat_access(uuid, boolean, uuid) to authenticated;
grant execute on function public.admin_list_users_chat() to authenticated;
grant execute on function public.admin_update_vendedor_comissao(text, numeric) to authenticated;
grant execute on function public.record_current_user_login() to authenticated;
