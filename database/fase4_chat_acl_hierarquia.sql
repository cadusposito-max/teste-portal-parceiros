-- ============================================================
-- FASE 4.1 - CHAT ACL (chat_enabled + hierarquia)
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) Pre-check
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_accounts') is null then
    raise exception 'Tabela public.user_accounts nao encontrada.';
  end if;
  if to_regclass('public.chat_conversations') is null then
    raise exception 'Tabela public.chat_conversations nao encontrada.';
  end if;
  if to_regclass('public.chat_participants') is null then
    raise exception 'Tabela public.chat_participants nao encontrada.';
  end if;
  if to_regclass('public.chat_messages') is null then
    raise exception 'Tabela public.chat_messages nao encontrada.';
  end if;
  if to_regprocedure('public.require_admin()') is null then
    raise exception 'Funcao public.require_admin() nao encontrada.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) User model: chat_enabled + vinculo gestor-vendedor
-- ------------------------------------------------------------
alter table public.user_accounts
  add column if not exists chat_enabled boolean not null default false;

alter table public.user_accounts
  add column if not exists gestor_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_user_accounts_chat_enabled
  on public.user_accounts (chat_enabled);

create index if not exists idx_user_accounts_gestor_user_id
  on public.user_accounts (gestor_user_id);

-- Perfis nao-vendedor nao devem manter gestor vinculado
update public.user_accounts ua
   set gestor_user_id = null,
       updated_at = now()
 where ua.gestor_user_id is not null
   and lower(coalesce(ua.role, 'vendedor')) <> 'vendedor';

-- ------------------------------------------------------------
-- 2) Helpers de acesso/hierarquia
-- ------------------------------------------------------------
create or replace function public.chat_user_chat_enabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select ua.chat_enabled
    from public.user_accounts ua
    where ua.user_id = p_user_id
    limit 1
  ), false)
$$;

create or replace function public.chat_user_gestor_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ua.gestor_user_id
  from public.user_accounts ua
  where ua.user_id = p_user_id
  limit 1
$$;

create or replace function public.chat_has_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      coalesce(ua.chat_enabled, false)
      and coalesce(ua.ativo, (u.banned_until is null or u.banned_until <= now()), false)
    from auth.users u
    left join public.user_accounts ua
      on ua.user_id = u.id
    where u.id = coalesce(p_user_id, auth.uid())
    limit 1
  ), false)
$$;

create or replace function public.chat_is_linked_vendedor_to_gestor(
  p_vendedor_user_id uuid,
  p_gestor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.user_accounts v
    join public.user_accounts g
      on g.user_id = p_gestor_user_id
    where v.user_id = p_vendedor_user_id
      and lower(coalesce(v.role, 'vendedor')) = 'vendedor'
      and lower(coalesce(g.role, 'vendedor')) = 'gestor'
      and v.gestor_user_id = p_gestor_user_id
      and v.franquia_id is not distinct from g.franquia_id
  )
$$;

create or replace function public.chat_can_contact(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  if p_actor_user_id is null or p_target_user_id is null then
    return false;
  end if;

  if p_actor_user_id = p_target_user_id then
    return false;
  end if;

  if not public.chat_has_access(p_actor_user_id) then
    return false;
  end if;

  if not public.chat_has_access(p_target_user_id) then
    return false;
  end if;

  v_actor_role := public.chat_user_role(p_actor_user_id);
  v_target_role := public.chat_user_role(p_target_user_id);

  if v_actor_role = 'admin' then
    return true;
  end if;

  if v_actor_role = 'gestor' then
    if v_target_role = 'admin' then
      return true;
    end if;

    if v_target_role = 'vendedor' then
      return public.chat_is_linked_vendedor_to_gestor(p_target_user_id, p_actor_user_id);
    end if;

    return false;
  end if;

  if v_actor_role = 'vendedor' then
    if v_target_role = 'gestor' then
      return public.chat_is_linked_vendedor_to_gestor(p_actor_user_id, p_target_user_id);
    end if;

    return false;
  end if;

  return false;
end;
$$;

create or replace function public.chat_can_use_current_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return public.chat_has_access(auth.uid());
end;
$$;

create or replace function public.chat_can_access_conversation(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_conversation_id is null or p_user_id is null then
    return false;
  end if;

  if not public.chat_has_access(p_user_id) then
    return false;
  end if;

  if not public.chat_is_participant(p_conversation_id, p_user_id) then
    return false;
  end if;

  -- Conversa invalida se houver participante sem acesso ao chat
  if exists (
    select 1
    from public.chat_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id <> p_user_id
      and not public.chat_has_access(cp.user_id)
  ) then
    return false;
  end if;

  -- Conversa invalida se o usuario atual nao puder falar com algum outro participante
  if exists (
    select 1
    from public.chat_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id <> p_user_id
      and not public.chat_can_contact(p_user_id, cp.user_id)
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.chat_user_chat_enabled(uuid) from public;
revoke all on function public.chat_user_gestor_id(uuid) from public;
revoke all on function public.chat_has_access(uuid) from public;
revoke all on function public.chat_is_linked_vendedor_to_gestor(uuid, uuid) from public;
revoke all on function public.chat_can_contact(uuid, uuid) from public;
revoke all on function public.chat_can_use_current_user() from public;
revoke all on function public.chat_can_access_conversation(uuid, uuid) from public;

grant execute on function public.chat_user_chat_enabled(uuid) to authenticated;
grant execute on function public.chat_user_gestor_id(uuid) to authenticated;
grant execute on function public.chat_has_access(uuid) to authenticated;
grant execute on function public.chat_is_linked_vendedor_to_gestor(uuid, uuid) to authenticated;
grant execute on function public.chat_can_contact(uuid, uuid) to authenticated;
grant execute on function public.chat_can_use_current_user() to authenticated;
grant execute on function public.chat_can_access_conversation(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3) RLS reforcada para acesso ao chat
-- ------------------------------------------------------------
drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select" on public.chat_conversations
for select
using (
  public.chat_has_access(auth.uid())
  and public.chat_is_participant(id, auth.uid())
  and public.chat_can_access_conversation(id, auth.uid())
);

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert" on public.chat_conversations
for insert
with check (
  auth.role() = 'authenticated'
  and public.chat_has_access(auth.uid())
  and created_by = auth.uid()
  and public.chat_user_role(auth.uid()) = 'admin'
);

drop policy if exists "chat_conversations_update" on public.chat_conversations;
create policy "chat_conversations_update" on public.chat_conversations
for update
using (
  public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(id, auth.uid())
)
with check (
  public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(id, auth.uid())
);

drop policy if exists "chat_participants_select" on public.chat_participants;
create policy "chat_participants_select" on public.chat_participants
for select
using (
  public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
);

drop policy if exists "chat_participants_update_self" on public.chat_participants;
create policy "chat_participants_update_self" on public.chat_participants
for update
using (
  user_id = auth.uid()
  and public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
)
with check (
  user_id = auth.uid()
  and public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
);

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
for select
using (
  public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
);

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
for insert
with check (
  auth.role() = 'authenticated'
  and sender_id = auth.uid()
  and public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
);

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own" on public.chat_messages
for update
using (
  sender_id = auth.uid()
  and kind = 'text'
  and created_at > now() - interval '15 minutes'
  and public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
)
with check (
  sender_id = auth.uid()
  and kind = 'text'
  and public.chat_has_access(auth.uid())
  and public.chat_can_access_conversation(conversation_id, auth.uid())
);

-- ------------------------------------------------------------
-- 4) RPCs de chat com enforcement por chat_enabled + hierarquia
-- ------------------------------------------------------------
create or replace function public.chat_start_direct(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_conv_id uuid;
  v_me_franquia uuid;
  v_other_franquia uuid;
begin
  if v_me is null then
    raise exception 'Sessao invalida.';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Usuario destino invalido.';
  end if;

  if not public.chat_has_access(v_me) then
    raise exception 'Usuario atual sem acesso ao chat.';
  end if;

  if not public.chat_has_access(p_other_user_id) then
    raise exception 'Usuario destino sem acesso ao chat.';
  end if;

  if not public.chat_can_contact(v_me, p_other_user_id) then
    raise exception 'Sem permissao para conversar com este usuario.';
  end if;

  v_me_franquia := public.chat_user_franquia(v_me);
  v_other_franquia := public.chat_user_franquia(p_other_user_id);

  if v_me_franquia is null and v_other_franquia is null then
    raise exception 'Franquia nao encontrada para os usuarios da conversa.';
  end if;

  v_key := md5(least(v_me::text, p_other_user_id::text) || ':' || greatest(v_me::text, p_other_user_id::text));

  with inserted as (
    insert into public.chat_conversations (
      franquia_id,
      kind,
      title,
      direct_key,
      created_by
    )
    values (
      coalesce(v_me_franquia, v_other_franquia),
      'direct',
      null,
      v_key,
      v_me
    )
    on conflict (direct_key) do nothing
    returning id
  )
  select x.id
    into v_conv_id
  from (
    select i.id, 0 as ord from inserted i
    union all
    select c.id, 1 as ord
    from public.chat_conversations c
    where c.direct_key = v_key
  ) x
  order by x.ord
  limit 1;

  if v_conv_id is null then
    raise exception 'Falha ao criar/obter conversa direta.';
  end if;

  insert into public.chat_participants (conversation_id, user_id, member_role, joined_at, last_read_at)
  values
    (v_conv_id, v_me, 'owner', now(), now()),
    (v_conv_id, p_other_user_id, 'member', now(), null)
  on conflict do nothing;

  return v_conv_id;
end;
$$;

create or replace function public.chat_create_group(
  p_title text,
  p_member_ids uuid[] default array[]::uuid[],
  p_franquia_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_me_role text;
  v_conv_id uuid;
  v_target_franquia uuid;
  v_member uuid;
begin
  if v_me is null then
    raise exception 'Sessao invalida.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Titulo do grupo e obrigatorio.';
  end if;

  if not public.chat_has_access(v_me) then
    raise exception 'Usuario atual sem acesso ao chat.';
  end if;

  v_me_role := public.chat_user_role(v_me);
  if v_me_role = 'vendedor' then
    raise exception 'Vendedor nao pode criar grupos.';
  end if;

  if v_me_role = 'admin' and p_franquia_id is not null then
    v_target_franquia := p_franquia_id;
  else
    v_target_franquia := public.chat_user_franquia(v_me);
  end if;

  if v_target_franquia is null then
    raise exception 'Franquia alvo nao definida.';
  end if;

  insert into public.chat_conversations (
    franquia_id, kind, title, created_by
  )
  values (
    v_target_franquia, 'group', trim(p_title), v_me
  )
  returning id into v_conv_id;

  insert into public.chat_participants (conversation_id, user_id, member_role, joined_at, last_read_at)
  values (v_conv_id, v_me, 'owner', now(), now())
  on conflict do nothing;

  foreach v_member in array p_member_ids loop
    continue when v_member is null or v_member = v_me;

    if not public.chat_has_access(v_member) then
      raise exception 'Participante % sem acesso ao chat.', v_member;
    end if;

    if not public.chat_can_contact(v_me, v_member) then
      raise exception 'Sem permissao para incluir participante % no grupo.', v_member;
    end if;

    insert into public.chat_participants (conversation_id, user_id, member_role, joined_at, last_read_at)
    values (v_conv_id, v_member, 'member', now(), null)
    on conflict do nothing;
  end loop;

  return v_conv_id;
end;
$$;

create or replace function public.chat_send_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_message_id bigint default null,
  p_kind text default 'text'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text;
  v_message_id bigint;
  v_reply_ok boolean;
begin
  if v_me is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(v_me) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  if not public.chat_can_access_conversation(p_conversation_id, v_me) then
    raise exception 'Sem permissao para enviar mensagem nessa conversa.';
  end if;

  v_body := trim(coalesce(p_body, ''));

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'Mensagem deve ter entre 1 e 4000 caracteres.';
  end if;

  if coalesce(p_kind, 'text') <> 'text' and public.chat_user_role(v_me) <> 'admin' then
    raise exception 'Tipo de mensagem nao permitido.';
  end if;

  if p_reply_to_message_id is not null then
    select exists(
      select 1
      from public.chat_messages m
      where m.id = p_reply_to_message_id
        and m.conversation_id = p_conversation_id
    ) into v_reply_ok;

    if not v_reply_ok then
      raise exception 'Mensagem de resposta invalida para essa conversa.';
    end if;
  end if;

  insert into public.chat_messages (
    conversation_id, sender_id, body, kind, reply_to_message_id
  )
  values (
    p_conversation_id, v_me, v_body, coalesce(p_kind, 'text'), p_reply_to_message_id
  )
  returning id into v_message_id;

  update public.chat_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = v_me;

  return v_message_id;
end;
$$;

create or replace function public.chat_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(auth.uid()) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  if not public.chat_can_access_conversation(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissao nessa conversa.';
  end if;

  update public.chat_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

create or replace function public.chat_set_prefs(
  p_conversation_id uuid,
  p_archived boolean default null,
  p_muted boolean default null,
  p_pinned boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(auth.uid()) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  if not public.chat_can_access_conversation(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissao nessa conversa.';
  end if;

  update public.chat_participants
     set archived = coalesce(p_archived, archived),
         muted = coalesce(p_muted, muted),
         pinned = coalesce(p_pinned, pinned)
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

drop function if exists public.chat_list_conversations(text, integer, integer, boolean);

create or replace function public.chat_list_conversations(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_include_archived boolean default false
)
returns table (
  conversation_id uuid,
  kind text,
  title text,
  franquia_id uuid,
  other_user_id uuid,
  other_profile_nome text,
  other_nome text,
  other_avatar_url text,
  other_email text,
  other_role text,
  other_franquia_nome text,
  participant_count integer,
  unread_count integer,
  archived boolean,
  muted boolean,
  pinned boolean,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(auth.uid()) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  return query
  with base as (
    select
      c.id,
      c.kind,
      c.title,
      c.franquia_id,
      c.last_message_at,
      c.last_message_preview,
      c.created_at,
      c.updated_at,
      me.archived,
      me.muted,
      me.pinned,
      me.last_read_at
    from public.chat_conversations c
    join public.chat_participants me
      on me.conversation_id = c.id
    where me.user_id = auth.uid()
      and public.chat_can_access_conversation(c.id, auth.uid())
  ),
  calc as (
    select
      b.*,
      (select count(*)::int from public.chat_participants cp where cp.conversation_id = b.id) as participant_count,
      (
        select count(*)::int
        from public.chat_messages m
        where m.conversation_id = b.id
          and m.sender_id <> auth.uid()
          and m.created_at > coalesce(b.last_read_at, 'epoch'::timestamptz)
      ) as unread_count
    from base b
  ),
  named as (
    select
      c.*,
      d.user_id as other_user_id,
      d.other_profile_nome,
      d.other_nome,
      d.other_avatar_url,
      d.other_email,
      d.other_role,
      d.other_franquia_nome
    from calc c
    left join lateral (
      select
        cp2.user_id,
        nullif(trim(p.nome), '') as other_profile_nome,
        coalesce(
          nullif(trim(ua.nome), ''),
          nullif(split_part(coalesce(u.email::text, ''), '@', 1), ''),
          'Usuario'
        ) as other_nome,
        p.avatar_url as other_avatar_url,
        nullif(u.email::text, '') as other_email,
        public.chat_user_role(cp2.user_id) as other_role,
        f.nome as other_franquia_nome
      from public.chat_participants cp2
      join auth.users u on u.id = cp2.user_id
      left join public.profiles p on p.id = cp2.user_id
      left join public.user_accounts ua on ua.user_id = cp2.user_id
      left join public.franquias f on f.id = public.chat_user_franquia(cp2.user_id)
      where cp2.conversation_id = c.id
        and cp2.user_id <> auth.uid()
      order by cp2.joined_at
      limit 1
    ) d on true
  )
  select
    n.id as conversation_id,
    n.kind,
    case
      when n.kind = 'direct' then coalesce(
        n.other_profile_nome,
        nullif(trim(n.other_nome), ''),
        nullif(split_part(coalesce(n.other_email, ''), '@', 1), ''),
        'Usuario'
      )
      else coalesce(nullif(trim(n.title), ''), 'Grupo')
    end as title,
    n.franquia_id,
    n.other_user_id,
    n.other_profile_nome,
    n.other_nome,
    n.other_avatar_url,
    n.other_email,
    n.other_role,
    n.other_franquia_nome,
    n.participant_count,
    n.unread_count,
    n.archived,
    n.muted,
    n.pinned,
    n.last_message_at,
    n.last_message_preview,
    n.created_at,
    n.updated_at
  from named n
  where
    (p_include_archived or n.archived = false)
    and (
      p_search is null
      or trim(p_search) = ''
      or lower(
        case
          when n.kind = 'direct' then coalesce(
            n.other_profile_nome,
            nullif(trim(n.other_nome), ''),
            nullif(split_part(coalesce(n.other_email, ''), '@', 1), ''),
            'Usuario'
          )
          else coalesce(nullif(trim(n.title), ''), 'Grupo')
        end
      ) like '%' || lower(trim(p_search)) || '%'
    )
  order by n.pinned desc, coalesce(n.last_message_at, n.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.chat_list_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  id bigint,
  conversation_id uuid,
  sender_id uuid,
  sender_nome text,
  sender_email text,
  sender_avatar_url text,
  body text,
  kind text,
  reply_to_message_id bigint,
  created_at timestamptz,
  edited_at timestamptz,
  is_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(auth.uid()) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  if not public.chat_can_access_conversation(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissao para essa conversa.';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    coalesce(p.nome, split_part(u.email::text, '@', 1)) as sender_nome,
    u.email::text as sender_email,
    p.avatar_url as sender_avatar_url,
    m.body,
    m.kind,
    m.reply_to_message_id,
    m.created_at,
    m.edited_at,
    (m.sender_id = auth.uid()) as is_me
  from public.chat_messages m
  join auth.users u on u.id = m.sender_id
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.chat_list_directory(
  p_search text default null,
  p_limit integer default 30
)
returns table (
  user_id uuid,
  nome text,
  email text,
  role text,
  franquia_id uuid,
  franquia_nome text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.chat_has_access(auth.uid()) then
    raise exception 'Usuario sem acesso ao chat.';
  end if;

  return query
  select
    u.id as user_id,
    coalesce(p.nome, split_part(u.email::text, '@', 1)) as nome,
    u.email::text as email,
    public.chat_user_role(u.id) as role,
    public.chat_user_franquia(u.id) as franquia_id,
    f.nome as franquia_nome,
    p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.franquias f on f.id = public.chat_user_franquia(u.id)
  where u.id <> auth.uid()
    and public.chat_has_access(u.id)
    and public.chat_can_contact(auth.uid(), u.id)
    and (
      p_search is null
      or trim(p_search) = ''
      or lower(coalesce(p.nome, u.email::text)) like '%' || lower(trim(p_search)) || '%'
      or lower(u.email::text) like '%' || lower(trim(p_search)) || '%'
    )
  order by lower(coalesce(p.nome, u.email::text))
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

revoke all on function public.chat_can_use_current_user() from public;
grant execute on function public.chat_can_use_current_user() to authenticated;

revoke all on function public.chat_start_direct(uuid) from public;
revoke all on function public.chat_create_group(text, uuid[], uuid) from public;
revoke all on function public.chat_send_message(uuid, text, bigint, text) from public;
revoke all on function public.chat_mark_read(uuid) from public;
revoke all on function public.chat_set_prefs(uuid, boolean, boolean, boolean) from public;
revoke all on function public.chat_list_conversations(text, integer, integer, boolean) from public;
revoke all on function public.chat_list_messages(uuid, integer, timestamptz) from public;
revoke all on function public.chat_list_directory(text, integer) from public;

grant execute on function public.chat_start_direct(uuid) to authenticated;
grant execute on function public.chat_create_group(text, uuid[], uuid) to authenticated;
grant execute on function public.chat_send_message(uuid, text, bigint, text) to authenticated;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_set_prefs(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.chat_list_conversations(text, integer, integer, boolean) to authenticated;
grant execute on function public.chat_list_messages(uuid, integer, timestamptz) to authenticated;
grant execute on function public.chat_list_directory(text, integer) to authenticated;

-- ------------------------------------------------------------
-- 5) RPCs para gerenciador de usuarios
-- ------------------------------------------------------------
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
  gestor_user_id uuid,
  gestor_nome text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_admin();

  return query
  select
    u.id as user_id,
    u.email::text as email,
    coalesce(p.nome, ua.nome) as nome,
    normalize_role(coalesce(ua.role, u.raw_app_meta_data ->> 'role', 'vendedor')) as role,
    coalesce(ua.franquia_id, (u.raw_app_meta_data ->> 'franquia_id')::uuid) as franquia_id,
    f.nome as franquia_nome,
    coalesce(ua.ativo, (u.banned_until is null or u.banned_until <= now())) as ativo,
    coalesce(ua.chat_enabled, false) as chat_enabled,
    ua.gestor_user_id,
    coalesce(pg.nome, uga.nome, split_part(ug.email::text, '@', 1)) as gestor_nome,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.user_accounts ua on ua.user_id = u.id
  left join public.profiles p on p.id = u.id
  left join public.franquias f on f.id = coalesce(ua.franquia_id, (u.raw_app_meta_data ->> 'franquia_id')::uuid)
  left join auth.users ug on ug.id = ua.gestor_user_id
  left join public.user_accounts uga on uga.user_id = ua.gestor_user_id
  left join public.profiles pg on pg.id = ua.gestor_user_id
  order by lower(u.email::text);
end;
$$;

create or replace function public.admin_set_user_chat_access(
  p_user_id uuid,
  p_chat_enabled boolean default false,
  p_gestor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nome text;
  v_role text;
  v_franquia_id uuid;
  v_ativo boolean;
  v_next_gestor_id uuid;
  v_gestor_role text;
  v_gestor_franquia_id uuid;
begin
  perform require_admin();

  if p_user_id is null then
    raise exception 'Usuario invalido.';
  end if;

  select
    lower(u.email::text),
    coalesce(p.nome, ua.nome, u.raw_user_meta_data ->> 'nome'),
    lower(coalesce(ua.role, u.raw_app_meta_data ->> 'role', 'vendedor')),
    coalesce(ua.franquia_id, (u.raw_app_meta_data ->> 'franquia_id')::uuid),
    coalesce(ua.ativo, (u.banned_until is null or u.banned_until <= now()))
  into
    v_email,
    v_nome,
    v_role,
    v_franquia_id,
    v_ativo
  from auth.users u
  left join public.user_accounts ua on ua.user_id = u.id
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if v_email is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  v_next_gestor_id := p_gestor_user_id;

  if v_role <> 'vendedor' then
    v_next_gestor_id := null;
  elsif v_next_gestor_id is not null then
    select
      lower(coalesce(ua.role, u.raw_app_meta_data ->> 'role', 'vendedor')),
      coalesce(ua.franquia_id, (u.raw_app_meta_data ->> 'franquia_id')::uuid)
    into
      v_gestor_role,
      v_gestor_franquia_id
    from auth.users u
    left join public.user_accounts ua on ua.user_id = u.id
    where u.id = v_next_gestor_id;

    if v_gestor_role is null then
      raise exception 'Gestor vinculado nao encontrado.';
    end if;

    if v_gestor_role <> 'gestor' then
      raise exception 'Vinculo invalido: selecione um usuario com role gestor.';
    end if;

    if v_franquia_id is distinct from v_gestor_franquia_id then
      raise exception 'Vendedor e gestor devem ser da mesma franquia.';
    end if;
  end if;

  insert into public.user_accounts (
    user_id, email, nome, role, franquia_id, ativo, chat_enabled, gestor_user_id, created_at, updated_at
  )
  values (
    p_user_id,
    v_email,
    nullif(trim(coalesce(v_nome, '')), ''),
    coalesce(v_role, 'vendedor'),
    v_franquia_id,
    coalesce(v_ativo, true),
    coalesce(p_chat_enabled, false),
    v_next_gestor_id,
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    nome = excluded.nome,
    role = excluded.role,
    franquia_id = excluded.franquia_id,
    ativo = excluded.ativo,
    chat_enabled = excluded.chat_enabled,
    gestor_user_id = case
      when lower(coalesce(excluded.role, 'vendedor')) = 'vendedor' then excluded.gestor_user_id
      else null
    end,
    updated_at = now();
end;
$$;

revoke all on function public.admin_list_users_chat() from public;
revoke all on function public.admin_set_user_chat_access(uuid, boolean, uuid) from public;

grant execute on function public.admin_list_users_chat() to authenticated;
grant execute on function public.admin_set_user_chat_access(uuid, boolean, uuid) to authenticated;

commit;

