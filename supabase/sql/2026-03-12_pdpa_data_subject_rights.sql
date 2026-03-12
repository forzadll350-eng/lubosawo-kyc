-- PDPA data subject rights requests
-- Run in Supabase SQL Editor before using /dashboard/privacy and /admin/privacy-requests

create extension if not exists pgcrypto;

create table if not exists public.pdpa_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  request_type text not null check (
    request_type in (
      'access',
      'rectification',
      'erasure',
      'withdraw_consent',
      'portability',
      'objection',
      'restriction'
    )
  ),
  subject text not null,
  details text,
  status text not null default 'submitted' check (
    status in ('submitted', 'in_review', 'completed', 'rejected', 'cancelled')
  ),
  response_note text,
  retention_scope text not null default 'kyc_identity_data',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responder_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdpa_data_requests_user_created
  on public.pdpa_data_requests (user_id, created_at desc);

create index if not exists idx_pdpa_data_requests_status_created
  on public.pdpa_data_requests (status, created_at desc);

create or replace function public.set_pdpa_data_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_pdpa_data_requests_updated_at on public.pdpa_data_requests;
create trigger trg_set_pdpa_data_requests_updated_at
before update on public.pdpa_data_requests
for each row
execute function public.set_pdpa_data_requests_updated_at();

create or replace function public.enforce_pdpa_data_requests_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status in ('completed', 'rejected', 'cancelled') and new.status <> old.status then
      raise exception 'Cannot change final status (%).', old.status;
    end if;

    if new.status in ('in_review', 'completed', 'rejected') and new.responder_user_id is null then
      new.responder_user_id := auth.uid();
    end if;

    if new.status in ('completed', 'rejected') and new.responded_at is null then
      new.responded_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_pdpa_data_requests_transition on public.pdpa_data_requests;
create trigger trg_enforce_pdpa_data_requests_transition
before update on public.pdpa_data_requests
for each row
execute function public.enforce_pdpa_data_requests_transition();

create or replace function public.is_admin_user_uid(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = uid
      and up.role_id in (1, 2)
      and coalesce(up.is_active, true) = true
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_user_uid(auth.uid());
$$;

grant execute on function public.is_admin_user_uid(uuid) to authenticated;
grant execute on function public.is_admin_user() to authenticated;

alter table public.pdpa_data_requests enable row level security;

drop policy if exists pdpa_data_requests_select_own on public.pdpa_data_requests;
create policy pdpa_data_requests_select_own
on public.pdpa_data_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists pdpa_data_requests_insert_own on public.pdpa_data_requests;
create policy pdpa_data_requests_insert_own
on public.pdpa_data_requests
for insert
to authenticated
with check (auth.uid() = user_id and status = 'submitted');

drop policy if exists pdpa_data_requests_select_admin on public.pdpa_data_requests;
create policy pdpa_data_requests_select_admin
on public.pdpa_data_requests
for select
to authenticated
using (public.is_admin_user());

drop policy if exists pdpa_data_requests_update_admin on public.pdpa_data_requests;
create policy pdpa_data_requests_update_admin
on public.pdpa_data_requests
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

grant select, insert, update on table public.pdpa_data_requests to authenticated;

