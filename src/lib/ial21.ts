type Ial21Submission = {
  evidence_method?: string | null;
  evidence_reference?: string | null;
  chip_read_verified?: boolean | null;
  chip_id_match?: boolean | null;
  chip_name_match?: boolean | null;
  chip_dob_match?: boolean | null;
  chip_photo_present?: boolean | null;
  chip_photo_url?: string | null;
  chip_card_preview_url?: string | null;
  contact_channel_verified?: boolean | null;
  contact_channel_type?: string | null;
  contact_channel_ref?: string | null;
  contact_otp_reference?: string | null;
  contact_verification_id?: string | null;
  contact_verified_at?: string | null;
};

type Ial21Review = {
  evidence_source_checked?: boolean;
  face_match_checked?: boolean;
  data_consistency_checked?: boolean;
};

type Ial21OcrData = {
  ial21_submission?: Ial21Submission | null;
  ial21_review?: Ial21Review | null;
};

type KycLike = {
  status?: string | null;
  ocr_data?: Ial21OcrData | null;
} | null | undefined;

type Ial21AccessResult = {
  allowed: boolean;
  reason: string;
};

export function evaluateIal21Access(
  emailConfirmedAt: string | null | undefined,
  kyc: KycLike
): Ial21AccessResult {
  if (!emailConfirmedAt) {
    return { allowed: false, reason: "กรุณายืนยันอีเมลก่อนใช้งานการลงนาม" };
  }

  if (!kyc) {
    return { allowed: false, reason: "ยังไม่พบคำขอ KYC ของผู้ใช้" };
  }

  if (kyc.status !== "approved") {
    return { allowed: false, reason: "KYC ของคุณยังไม่ได้รับการอนุมัติ" };
  }

  const submission = kyc.ocr_data?.ial21_submission;
  if (!submission?.evidence_method || !submission?.evidence_reference) {
    return {
      allowed: false,
      reason: "ยังไม่มีหลักฐาน IAL2.1 (Proof Source / Proof Reference)",
    };
  }

  if (submission.evidence_method !== "thai_id_chip") {
    return {
      allowed: false,
      reason: "ระบบนี้กำหนดให้ใช้การยืนยันผ่าน Thai ID Chip Reader เท่านั้น",
    };
  }

  const chipEvidenceOk =
    Boolean(submission.chip_read_verified) &&
    Boolean(submission.chip_id_match) &&
    Boolean(submission.chip_name_match) &&
    Boolean(submission.chip_dob_match) &&
    Boolean(submission.chip_photo_present) &&
    Boolean(submission.chip_photo_url);

  if (!chipEvidenceOk) {
    return {
      allowed: false,
      reason: "หลักฐานจากชิปบัตรยังไม่ครบถ้วน (read/id/name/dob/photo/url)",
    };
  }

  if (
    !submission.contact_channel_verified ||
    !submission.contact_verified_at ||
    submission.contact_channel_type !== "email_otp" ||
    !submission.contact_otp_reference ||
    !submission.contact_verification_id
  ) {
    return {
      allowed: false,
      reason: "ยังไม่มีหลักฐานยืนยันช่องทางติดต่อแบบ email OTP",
    };
  }

  const review = kyc.ocr_data?.ial21_review;
  const reviewed =
    Boolean(review?.evidence_source_checked) &&
    Boolean(review?.face_match_checked) &&
    Boolean(review?.data_consistency_checked);

  if (!reviewed) {
    return {
      allowed: false,
      reason: "คำขอ KYC ยังไม่ผ่าน checklist ตรวจสอบ IAL2.1 โดยเจ้าหน้าที่",
    };
  }

  return { allowed: true, reason: "" };
}
