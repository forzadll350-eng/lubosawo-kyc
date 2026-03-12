-- IAL2.1 strict chip-reader guardrails
-- Run this after 2026-03-12_ial21_guardrails.sql

-- 1) Table check: if pending + evidence_method=thai_id_chip,
--    must include chip-read proof fields from local reader flow.
alter table public.kyc_submissions
  drop constraint if exists kyc_submissions_chip_method_requires_chip_proof;

alter table public.kyc_submissions
  add constraint kyc_submissions_chip_method_requires_chip_proof
  check (
    status <> 'pending'
    or coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') <> 'thai_id_chip'
    or (
      lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
    )
  );

-- 2) Restrictive policies: enforce same rule at RLS policy level.
drop policy if exists kyc_chip_method_requires_proof_insert on public.kyc_submissions;
create policy kyc_chip_method_requires_proof_insert
on public.kyc_submissions
as restrictive
for insert
to authenticated
with check (
  status <> 'pending'
  or coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') <> 'thai_id_chip'
  or (
    lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
    and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
  )
);

drop policy if exists kyc_chip_method_requires_proof_update on public.kyc_submissions;
create policy kyc_chip_method_requires_proof_update
on public.kyc_submissions
as restrictive
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    status <> 'pending'
    or coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') <> 'thai_id_chip'
    or (
      lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
    )
  )
);
