-- IAL2.1 email OTP evidence registry + relational guardrail
-- Run after 2026-03-12_ial21_chip_guardrails.sql

create extension if not exists pgcrypto;

create table if not exists public.ial21_contact_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kyc_submission_id uuid references public.kyc_submissions(id) on delete set null,
  channel text not null check (channel in ('email')),
  method text not null check (method in ('supabase_email_otp')),
  verification_target text,
  otp_reference text not null,
  status text not null default 'verified' check (status in ('sent', 'verified', 'failed', 'expired')),
  sent_at timestamptz,
  verified_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ial21_contact_verifications_user_created
  on public.ial21_contact_verifications(user_id, created_at desc);

create unique index if not exists idx_ial21_contact_verifications_verified_submission
  on public.ial21_contact_verifications(kyc_submission_id)
  where kyc_submission_id is not null and status = 'verified';

create or replace function public.set_ial21_contact_verifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_ial21_contact_verifications_updated_at on public.ial21_contact_verifications;
create trigger trg_set_ial21_contact_verifications_updated_at
before update on public.ial21_contact_verifications
for each row
execute function public.set_ial21_contact_verifications_updated_at();

alter table public.ial21_contact_verifications enable row level security;

drop policy if exists ial21_contact_verifications_select_own on public.ial21_contact_verifications;
create policy ial21_contact_verifications_select_own
on public.ial21_contact_verifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists ial21_contact_verifications_insert_own on public.ial21_contact_verifications;
create policy ial21_contact_verifications_insert_own
on public.ial21_contact_verifications
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists ial21_contact_verifications_update_own on public.ial21_contact_verifications;
create policy ial21_contact_verifications_update_own
on public.ial21_contact_verifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on table public.ial21_contact_verifications to authenticated;

create or replace function public.enforce_ial21_contact_verification_link()
returns trigger
language plpgsql
as $$
declare
  ial_submission jsonb;
  contact_verification_id_text text;
  contact_verification_id uuid;
  contact_record public.ial21_contact_verifications%rowtype;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  ial_submission := coalesce(new.ocr_data->'ial21_submission', '{}'::jsonb);

  if coalesce(ial_submission->>'evidence_method', '') <> 'thai_id_chip' then
    return new;
  end if;

  contact_verification_id_text := nullif(trim(coalesce(ial_submission->>'contact_verification_id', '')), '');
  if contact_verification_id_text is null then
    raise exception 'IAL2.1 requires contact_verification_id';
  end if;

  begin
    contact_verification_id := contact_verification_id_text::uuid;
  exception
    when others then
      raise exception 'IAL2.1 contact_verification_id is invalid';
  end;

  select *
    into contact_record
  from public.ial21_contact_verifications
  where id = contact_verification_id;

  if not found then
    raise exception 'IAL2.1 contact verification record not found';
  end if;

  if contact_record.user_id <> new.user_id then
    raise exception 'IAL2.1 contact verification user mismatch';
  end if;

  if contact_record.status <> 'verified' then
    raise exception 'IAL2.1 contact verification status must be verified';
  end if;

  if contact_record.channel <> 'email' or contact_record.method <> 'supabase_email_otp' then
    raise exception 'IAL2.1 contact verification method must be email OTP';
  end if;

  if contact_record.verified_at is null then
    raise exception 'IAL2.1 contact verification timestamp missing';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_ial21_contact_verification_link on public.kyc_submissions;
create trigger trg_enforce_ial21_contact_verification_link
before insert or update on public.kyc_submissions
for each row
execute function public.enforce_ial21_contact_verification_link();
