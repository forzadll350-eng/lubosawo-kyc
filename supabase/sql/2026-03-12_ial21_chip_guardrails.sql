-- IAL2.1 strict chip-reader guardrails (ETDA eKYC IAL2.1 profile)
-- Run this after 2026-03-12_ial21_guardrails.sql

-- 1) Table check:
--    Pending KYC must use thai_id_chip as evidence method and include full chip proof.
alter table public.kyc_submissions
  drop constraint if exists kyc_submissions_chip_method_requires_chip_proof;

alter table public.kyc_submissions
  add constraint kyc_submissions_chip_method_requires_chip_proof
  check (
    status <> 'pending'
    or (
      coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') = 'thai_id_chip'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_name_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_dob_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_photo_present', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_photo_url', '')), '') is not null
      and lower(coalesce(ocr_data->'ial21_submission'->>'contact_channel_verified', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'contact_verified_at', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
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
  or (
    coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') = 'thai_id_chip'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_name_match', 'false')) = 'true'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_dob_match', 'false')) = 'true'
    and lower(coalesce(ocr_data->'ial21_submission'->>'chip_photo_present', 'false')) = 'true'
    and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_photo_url', '')), '') is not null
    and lower(coalesce(ocr_data->'ial21_submission'->>'contact_channel_verified', 'false')) = 'true'
    and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'contact_verified_at', '')), '') is not null
    and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
    and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
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
    or (
      coalesce(ocr_data->'ial21_submission'->>'evidence_method', '') = 'thai_id_chip'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_read_verified', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_id_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_name_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_dob_match', 'false')) = 'true'
      and lower(coalesce(ocr_data->'ial21_submission'->>'chip_photo_present', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_photo_url', '')), '') is not null
      and lower(coalesce(ocr_data->'ial21_submission'->>'contact_channel_verified', 'false')) = 'true'
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'contact_verified_at', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'chip_read_at', '')), '') is not null
      and nullif(trim(coalesce(ocr_data->'ial21_submission'->>'evidence_reference', '')), '') is not null
    )
  )
);
