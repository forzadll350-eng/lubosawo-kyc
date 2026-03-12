-- IAL2.1 guardrails for kyc_submissions
-- Run this in Supabase SQL Editor (Primary Database)

-- 1) Enforce pending KYC rows to include IAL2.1 evidence fields.
alter table public.kyc_submissions
  drop constraint if exists kyc_submissions_pending_requires_ial21_evidence;

alter table public.kyc_submissions
  add constraint kyc_submissions_pending_requires_ial21_evidence
  check (
    status <> 'pending'
    or (
      nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_method', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
    )
  );

-- 2) Optional RLS hardening (kept idempotent).
alter table public.kyc_submissions enable row level security;

drop policy if exists kyc_pending_requires_ial21_evidence_insert on public.kyc_submissions;
create policy kyc_pending_requires_ial21_evidence_insert
on public.kyc_submissions
as restrictive
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    status <> 'pending'
    or (
      nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_method', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
    )
  )
);

drop policy if exists kyc_pending_requires_ial21_evidence_update on public.kyc_submissions;
create policy kyc_pending_requires_ial21_evidence_update
on public.kyc_submissions
as restrictive
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    status <> 'pending'
    or (
      nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_method', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
    )
  )
);
