-- ============================================================
-- FASE 4 - CHAT INTERNO (popup desktop + full-screen mobile)
-- ============================================================
-- Revisões aplicadas:
-- 1) Trigger de update da conversa com SECURITY DEFINER
-- 2) chat_start_direct com ON CONFLICT (race-safe)
-- 3) Franquia/role com source-of-truth em public.user_accounts
-- 4) Políticas de leitura sem bypass desnecessário para admin
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0) Pré-check
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.franquias') is null then
    raise exception 'Tabela public.franquias não encontrada.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Tabela public.profiles não encontrada.';
  end if;
  if to_regclass('public.user_accounts') is null then
    raise exception 'Tabela public.user_accounts não encontrada (necessária para franquia/ativo confiáveis).';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Função public.is_admin() não encontrada.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) Tabelas
-- ------------------------------------------------------------
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  franquia_id uuid not null references public.franquias(id) on delete restrict,
  kind text not null default 'direct' check (kind in ('direct', 'group', 'proposal')),
  title text,
  proposal_id uuid references public.propostas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  direct_key text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text
);

-- Garante índice único não-parcial para suportar upsert/race-safe por direct_key
drop index if exists public.ux_chat_conversations_direct_key;
create unique index ux_chat_conversations_direct_key
  on public.chat_conversations (direct_key);

create index if not exists idx_chat_conversations_franquia_updated
  on public.chat_conversations (franquia_id, updated_at desc);

create index if not exists idx_chat_conversations_last_message
  on public.chat_conversations (last_message_at desc nulls last);

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  archived boolean not null default false,
  pinned boolean not null default false,
  primary key (conversation_id, user_id)
);

create index if not exists idx_chat_participants_user
  on public.chat_participants (user_id, archived, pinned, joined_at desc);

create index if not exists idx_chat_participants_conversation
  on public.chat_participants (conversation_id);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  kind text not null default 'text' check (kind in ('text', 'system')),
  reply_to_message_id bigint references public.chat_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists idx_chat_messages_conversation_created
  on public.chat_messages (conversation_id, created_at desc, id desc);

create index if not exists idx_chat_messages_sender
  on public.chat_messages (sender_id, created_at desc);

-- ------------------------------------------------------------
-- 2) Triggers
-- ------------------------------------------------------------
create or replace function public.chat_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_chat_conversations_updated_at on public.chat_conversations;
create trigger trg_chat_conversations_updated_at
before update on public.chat_conversations
for each row execute function public.chat_set_updated_at();

-- SECURITY DEFINER para garantir update de last_message_* sem depender da policy de quem inseriu mensagem
create or replace function public.chat_after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations
     set last_message_at = new.created_at,
         last_message_preview = case
           when new.kind = 'text' then left(regexp_replace(new.body, '\s+', ' ', 'g'), 120)
           else '[mensagem]'
         end,
         updated_at = new.created_at
   where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists trg_chat_after_message_insert on public.chat_messages;
create trigger trg_chat_after_message_insert
after insert on public.chat_messages
for each row execute function public.chat_after_message_insert();

-- ------------------------------------------------------------
-- 3) Helpers
-- ------------------------------------------------------------
create or replace function public.chat_user_franquia(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when ua.user_id is not null then ua.franquia_id
    when nullif(u.raw_app_meta_data ->> 'franquia_id', '') is null then null
    else (u.raw_app_meta_data ->> 'franquia_id')::uuid
  end
  from auth.users u
  left join public.user_accounts ua
    on ua.user_id = u.id
  where u.id = p_user_id
  limit 1
$$;

create or replace function public.chat_user_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(
    case
      when ua.user_id is not null then coalesce(nullif(ua.role, ''), 'vendedor')
      else coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'vendedor')
    end
  )
  from auth.users u
  left join public.user_accounts ua
    on ua.user_id = u.id
  where u.id = p_user_id
  limit 1
$$;

create or replace function public.chat_is_active_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ua.ativo,
    (u.banned_until is null or u.banned_until <= now()),
    false
  )
  from auth.users u
  left join public.user_accounts ua
    on ua.user_id = u.id
  where u.id = p_user_id
  limit 1
$$;

create or replace function public.chat_is_participant(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.chat_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = coalesce(p_user_id, auth.uid())
  )
$$;

revoke all on function public.chat_user_franquia(uuid) from public;
revoke all on function public.chat_user_role(uuid) from public;
revoke all on function public.chat_is_active_user(uuid) from public;
revoke all on function public.chat_is_participant(uuid, uuid) from public;

grant execute on function public.chat_user_franquia(uuid) to authenticated;
grant execute on function public.chat_user_role(uuid) to authenticated;
grant execute on function public.chat_is_active_user(uuid) to authenticated;
grant execute on function public.chat_is_participant(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

-- Leitura: apenas participante (admin não vê tudo por default)
drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select" on public.chat_conversations
for select
using (
  public.chat_is_participant(id, auth.uid())
);

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert" on public.chat_conversations
for insert
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
  and (
    is_admin()
    or franquia_id = public.chat_user_franquia(auth.uid())
  )
  and (
    kind <> 'direct'
    or direct_key is not null
  )
);

drop policy if exists "chat_conversations_update" on public.chat_conversations;
create policy "chat_conversations_update" on public.chat_conversations
for update
using (
  is_admin() or created_by = auth.uid()
)
with check (
  is_admin() or created_by = auth.uid()
);

drop policy if exists "chat_conversations_delete" on public.chat_conversations;
create policy "chat_conversations_delete" on public.chat_conversations
for delete
using (
  is_admin() or created_by = auth.uid()
);

-- Participantes: leitura só dentro de conversa que o usuário participa
drop policy if exists "chat_participants_select" on public.chat_participants;
create policy "chat_participants_select" on public.chat_participants
for select
using (
  public.chat_is_participant(conversation_id, auth.uid())
);

-- Usuário atual pode alterar só suas preferências (mute/pin/archive/last_read)
drop policy if exists "chat_participants_update_self" on public.chat_participants;
create policy "chat_participants_update_self" on public.chat_participants
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Mensagens: leitura só participante
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
for select
using (
  public.chat_is_participant(conversation_id, auth.uid())
);

-- Insert mensagem pelo próprio remetente participante
drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
for insert
with check (
  auth.role() = 'authenticated'
  and sender_id = auth.uid()
  and public.chat_is_participant(conversation_id, auth.uid())
);

-- Edição própria (janela curta)
drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own" on public.chat_messages
for update
using (
  sender_id = auth.uid()
  and kind = 'text'
  and created_at > now() - interval '15 minutes'
)
with check (
  sender_id = auth.uid()
  and kind = 'text'
  and created_at > now() - interval '15 minutes'
);

-- Grants de tabela para authenticated (RLS continua valendo)
grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert, update, delete on public.chat_participants to authenticated;
grant select, insert, update on public.chat_messages to authenticated;

do $$
begin
  if to_regclass('public.chat_messages_id_seq') is not null then
    execute 'grant usage, select on sequence public.chat_messages_id_seq to authenticated';
  end if;
end $$;

-- ------------------------------------------------------------
-- 5) RPCs
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
  v_conv_franquia uuid;
begin
  if v_me is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Usuário destino inválido.';
  end if;

  if not public.chat_is_active_user(v_me) then
    raise exception 'Usuário atual inativo.';
  end if;

  if not public.chat_is_active_user(p_other_user_id) then
    raise exception 'Usuário destino inativo.';
  end if;

  v_me_franquia := public.chat_user_franquia(v_me);
  v_other_franquia := public.chat_user_franquia(p_other_user_id);

  if v_me_franquia is null or v_other_franquia is null then
    raise exception 'Franquia não encontrada para um dos usuários.';
  end if;

  if not is_admin() and v_me_franquia <> v_other_franquia then
    raise exception 'Sem permissão para conversar com usuário de outra franquia.';
  end if;

  v_key := md5(least(v_me::text, p_other_user_id::text) || ':' || greatest(v_me::text, p_other_user_id::text));

  -- Race-safe sem depender de UPDATE em conflito:
  -- se outra transação criou antes, pega a conversa já existente.
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
    returning id, franquia_id
  )
  select x.id, x.franquia_id
  into v_conv_id, v_conv_franquia
  from (
    select i.id, i.franquia_id, 0 as ord
    from inserted i
    union all
    select c.id, c.franquia_id, 1 as ord
    from public.chat_conversations c
    where c.direct_key = v_key
  ) x
  order by x.ord
  limit 1;

  if v_conv_id is null then
    raise exception 'Falha ao criar/obter conversa direta.';
  end if;

  if not is_admin() and v_conv_franquia <> v_me_franquia then
    raise exception 'Conversa direta encontrada fora da sua franquia.';
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
  v_conv_id uuid;
  v_target_franquia uuid;
  v_member uuid;
  v_member_franquia uuid;
begin
  if v_me is null then
    raise exception 'Sessão inválida.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Título do grupo é obrigatório.';
  end if;

  if not public.chat_is_active_user(v_me) then
    raise exception 'Usuário atual inativo.';
  end if;

  if is_admin() and p_franquia_id is not null then
    v_target_franquia := p_franquia_id;
  else
    v_target_franquia := public.chat_user_franquia(v_me);
  end if;

  if v_target_franquia is null then
    raise exception 'Franquia alvo não definida.';
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

    if not public.chat_is_active_user(v_member) then
      raise exception 'Participante % está inativo.', v_member;
    end if;

    v_member_franquia := public.chat_user_franquia(v_member);

    if not is_admin() and v_member_franquia <> v_target_franquia then
      raise exception 'Participante % é de outra franquia.', v_member;
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
    raise exception 'Sessão inválida.';
  end if;

  if not public.chat_is_participant(p_conversation_id, v_me) then
    raise exception 'Sem permissão para enviar mensagem nessa conversa.';
  end if;

  if not public.chat_is_active_user(v_me) then
    raise exception 'Usuário inativo.';
  end if;

  v_body := trim(coalesce(p_body, ''));

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'Mensagem deve ter entre 1 e 4000 caracteres.';
  end if;

  if coalesce(p_kind, 'text') <> 'text' and not is_admin() then
    raise exception 'Tipo de mensagem não permitido.';
  end if;

  if p_reply_to_message_id is not null then
    select exists(
      select 1
      from public.chat_messages m
      where m.id = p_reply_to_message_id
        and m.conversation_id = p_conversation_id
    ) into v_reply_ok;

    if not v_reply_ok then
      raise exception 'Mensagem de resposta inválida para essa conversa.';
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
    raise exception 'Sessão inválida.';
  end if;

  if not public.chat_is_participant(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissão nessa conversa.';
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
    raise exception 'Sessão inválida.';
  end if;

  if not public.chat_is_participant(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissão nessa conversa.';
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
    raise exception 'Sess?o inv?lida.';
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
    raise exception 'Sessão inválida.';
  end if;

  if not public.chat_is_participant(p_conversation_id, auth.uid()) then
    raise exception 'Sem permissão para essa conversa.';
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
declare
  v_me_franquia uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  v_me_franquia := public.chat_user_franquia(auth.uid());

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
    and coalesce(public.chat_is_active_user(u.id), false)
    and (
      is_admin()
      or public.chat_user_franquia(u.id) = v_me_franquia
    )
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
-- 6) Realtime publication
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_participants'
  ) then
    alter publication supabase_realtime add table public.chat_participants;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_conversations'
  ) then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;

commit;
