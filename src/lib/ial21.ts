type Ial21Submission = {
  evidence_method?: string | null;
  evidence_reference?: string | null;
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
