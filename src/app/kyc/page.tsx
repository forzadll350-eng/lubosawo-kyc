"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit";

type OcrData = {
  name_th: string;
  name_en: string;
  id_number: string;
  dob: string;
  expiry: string;
  address: string;
};

type ProofMethod = "thai_id_chip" | "external_idp" | "manual_offline";
const REQUIRE_CHIP_READER = true;
const PDPA_NOTICE_VERSION = "PDPA-KYC-v1.0-2026-03-12";
const PDPA_RETENTION_DAYS = 3650;

type CardReadProof = {
  id_number: string;
  name_th: string;
  name_en: string;
  dob: string;
  read_at: string;
  reference_id: string;
  source: string;
  chip_photo_present: boolean;
  photo_base64: string;
};

function digitsOnly(input: string) {
  return (input || "").replace(/\D/g, "");
}

function isValidThaiCitizenId(input: string) {
  const id = digitsOnly(input);
  if (id.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(id[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(id[12]);
}

function normalizeNameForCompare(input: string) {
  return (input || "")
    .replace(/[.#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDateForCompare(input: string) {
  const raw = (input || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!m) return raw;
  let y = Number(m[1]);
  if (y > 2400) y -= 543;
  return `${String(y).padStart(4, "0")}-${m[2]}-${m[3]}`;
}

function createOtpReference() {
  const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `otp-${ts}-${rand}`;
}

function normalizeChipText(input: string) {
  return (input || "")
    .replace(/[#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatThaiIdDisplay(input: string) {
  const id = digitsOnly(input);
  if (id.length !== 13) return id;
  return `${id.slice(0, 1)}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id.slice(12, 13)}`;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = (text || "").split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("load image failed"));
    image.src = dataUrl;
  });
}

async function generateThaiIdCardPreviewBlob(input: {
  idNumber: string;
  nameTh: string;
  nameEn: string;
  dob: string;
  expiry: string;
  address: string;
  referenceId: string;
  photoBase64: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("cannot create preview canvas");
  }

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#f8fafc");
  bg.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cardX = 70;
  const cardY = 60;
  const cardW = 1140;
  const cardH = 680;

  drawRoundedRect(ctx, cardX + 10, cardY + 12, cardW, cardH, 30);
  ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
  ctx.fill();

  const cardBg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cardBg.addColorStop(0, "#fff7ed");
  cardBg.addColorStop(1, "#ffe4e6");
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fillStyle = cardBg;
  ctx.fill();
  ctx.strokeStyle = "#be123c";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#881337";
  ctx.font = "700 48px 'Noto Sans Thai', sans-serif";
  ctx.fillText("บัตรประจำตัวประชาชน", cardX + 60, cardY + 90);
  ctx.font = "600 24px 'Noto Sans Thai', sans-serif";
  ctx.fillText("Thai National ID (Preview from chip data)", cardX + 60, cardY + 128);

  const faceX = cardX + cardW - 320;
  const faceY = cardY + 170;
  const faceW = 220;
  const faceH = 280;
  drawRoundedRect(ctx, faceX - 10, faceY - 10, faceW + 20, faceH + 20, 16);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#9f1239";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (input.photoBase64) {
    const photoDataUrl = `data:image/jpeg;base64,${input.photoBase64}`;
    const faceImage = await loadImageFromDataUrl(photoDataUrl);
    ctx.drawImage(faceImage, faceX, faceY, faceW, faceH);
  } else {
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(faceX, faceY, faceW, faceH);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 22px 'Noto Sans Thai', sans-serif";
    ctx.fillText("No chip face", faceX + 30, faceY + faceH / 2);
  }

  const leftX = cardX + 60;
  const valueX = leftX + 250;
  let rowY = cardY + 210;
  const rowGap = 66;

  const rows: Array<[string, string]> = [
    ["เลขบัตรประชาชน", formatThaiIdDisplay(input.idNumber)],
    ["ชื่อ-นามสกุล (ไทย)", normalizeChipText(input.nameTh)],
    ["Name (English)", normalizeChipText(input.nameEn)],
    ["วันเกิด", normalizeDateForCompare(input.dob)],
    ["วันหมดอายุ", normalizeDateForCompare(input.expiry)],
  ];

  rows.forEach(([label, value]) => {
    ctx.fillStyle = "#475569";
    ctx.font = "600 25px 'Noto Sans Thai', sans-serif";
    ctx.fillText(label, leftX, rowY);
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 28px 'Noto Sans Thai', sans-serif";
    ctx.fillText(value || "-", valueX, rowY);
    rowY += rowGap;
  });

  ctx.fillStyle = "#475569";
  ctx.font = "600 25px 'Noto Sans Thai', sans-serif";
  ctx.fillText("ที่อยู่", leftX, rowY);
  ctx.fillStyle = "#0f172a";
  ctx.font = "600 24px 'Noto Sans Thai', sans-serif";
  drawWrappedText(ctx, normalizeChipText(input.address) || "-", valueX, rowY, 500, 34);

  ctx.fillStyle = "#7f1d1d";
  ctx.font = "600 21px 'Noto Sans Thai', sans-serif";
  ctx.fillText(`Chip Ref: ${input.referenceId || "-"}`, cardX + 60, cardY + cardH - 36);
  ctx.textAlign = "right";
  ctx.fillText("Generated from Thai ID chip reader data", cardX + cardW - 40, cardY + cardH - 36);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error("cannot encode chip card preview"));
    }, "image/png");
  });

  return blob;
}

export default function KYCPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState("");

  const [selfieData, setSelfieData] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ocrData, setOcrData] = useState<OcrData>({
    name_th: "",
    name_en: "",
    id_number: "",
    dob: "",
    expiry: "",
    address: "",
  });

  const [proofMethod, setProofMethod] = useState<ProofMethod | "">(REQUIRE_CHIP_READER ? "thai_id_chip" : "");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [readingCard, setReadingCard] = useState(false);
  const [cardReadError, setCardReadError] = useState("");
  const [cardReadProof, setCardReadProof] = useState<CardReadProof | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpStatus, setOtpStatus] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpReference, setOtpReference] = useState("");
  const [otpSentAt, setOtpSentAt] = useState<string | null>(null);
  const [otpVerifiedAt, setOtpVerifiedAt] = useState<string | null>(null);
  const [chipCardPreviewLocalUrl, setChipCardPreviewLocalUrl] = useState("");
  const [consentGeneral, setConsentGeneral] = useState(false);
  const [consentBiometric, setConsentBiometric] = useState(false);

  const steps = [
    { num: 1, label: "บัตรประชาชน" },
    { num: 2, label: "Selfie" },
    { num: 3, label: "หลักฐาน IAL2.1" },
    { num: 4, label: "ยืนยัน" },
  ];

  useEffect(() => {
    async function init() {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!u) {
        router.push("/");
        return;
      }
      setUser(u);
      setIsEmailVerified(Boolean(u.email_confirmed_at));
    }

    init();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [router, supabase.auth]);

  useEffect(() => {
    return () => {
      if (chipCardPreviewLocalUrl) {
        URL.revokeObjectURL(chipCardPreviewLocalUrl);
      }
    };
  }, [chipCardPreviewLocalUrl]);

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrontFile(file);
    setFrontPreview(URL.createObjectURL(file));
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch {
      alert("ไม่สามารถเปิดกล้องได้");
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;

    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    setSelfieData(c.toDataURL("image/jpeg", 0.8));

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setCameraOn(false);
  }

  function retakeSelfie() {
    setSelfieData("");
    startCamera();
  }

  async function sendEmailOtp() {
    if (!user?.email) {
      setOtpError("ไม่พบอีเมลผู้ใช้ในระบบ");
      return;
    }

    setOtpSending(true);
    setOtpStatus("");
    setOtpError("");

    try {
      const reference = createOtpReference();
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
          data: {
            otp_purpose: "kyc_ial21_submission",
            otp_reference: reference,
          },
        },
      });

      if (error) throw error;

      const sentAt = new Date().toISOString();
      setOtpReference(reference);
      setOtpSentAt(sentAt);
      setOtpVerifiedAt(null);
      setOtpCode("");
      setOtpStatus("ส่ง OTP แล้ว กรุณากรอกรหัสจากอีเมลเพื่อยืนยัน");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setOtpError(`ส่ง OTP ไม่สำเร็จ: ${msg}`);
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyEmailOtp() {
    if (!user?.email) {
      setOtpError("ไม่พบอีเมลผู้ใช้ในระบบ");
      return;
    }
    if (!otpReference) {
      setOtpError("กรุณากดส่ง OTP ก่อน");
      return;
    }
    if (!otpCode.trim()) {
      setOtpError("กรุณากรอกรหัส OTP");
      return;
    }

    setOtpVerifying(true);
    setOtpStatus("");
    setOtpError("");

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: user.email,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) throw error;

      const verifiedAt = new Date().toISOString();
      setOtpVerifiedAt(verifiedAt);
      setIsEmailVerified(true);
      setOtpStatus("ยืนยัน OTP สำเร็จ");

      const {
        data: { user: refreshedUser },
      } = await supabase.auth.getUser();
      if (refreshedUser) {
        setUser(refreshedUser);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setOtpError(`ยืนยัน OTP ไม่สำเร็จ: ${msg}`);
    } finally {
      setOtpVerifying(false);
    }
  }

  async function readThaiIdFromLocalAgent() {
    setCardReadError("");
    setReadingCard(true);

    try {
      const endpoints = [
        "http://127.0.0.1:18080/read-thai-id",
        "http://localhost:18080/read-thai-id",
      ];
      let payload: Record<string, unknown> | null = null;
      let lastError = "";

      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            cache: "no-store",
          });
          if (!resp.ok) {
            const detail = await resp.text().catch(() => "");
            throw new Error(`agent ${resp.status}${detail ? `: ${detail}` : ""}`);
          }
          payload = await resp.json();
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      if (!payload) {
        throw new Error(lastError || "cannot connect to local card reader agent");
      }
      const cardId = digitsOnly(String(payload.id_number || ""));
      if (!isValidThaiCitizenId(cardId)) {
        throw new Error("การ์ดที่อ่านได้ไม่ใช่บัตรประชาชนไทย หรือเลขบัตรไม่ถูกต้อง");
      }
      const readAt = String(payload.read_at || new Date().toISOString());
      const dob = normalizeDateForCompare(String(payload.dob || ""));
      const photoBase64 = String(
        (payload as Record<string, unknown>).photo_base64 ||
        ((payload as Record<string, unknown>).raw as { photo?: string } | undefined)?.photo ||
        ""
      );
      const chipPhotoPresent = Boolean((payload as Record<string, unknown>).chip_photo_present) ||
        Boolean(photoBase64);
      const refId = String(payload.reference_id || payload.tx_id || "chip-read-local");

      setOcrData((prev) => ({
        ...prev,
        name_th: (payload.name_th as string) || prev.name_th,
        name_en: (payload.name_en as string) || prev.name_en,
        id_number: cardId || prev.id_number,
        dob: dob || prev.dob,
        expiry: (payload.expiry as string) || prev.expiry,
        address: (payload.address as string) || prev.address,
      }));

      setCardReadProof({
        id_number: cardId,
        name_th: String(payload.name_th || ""),
        name_en: String(payload.name_en || ""),
        dob,
        read_at: readAt,
        reference_id: refId,
        source: String(payload.source || "thai_id_chip"),
        chip_photo_present: chipPhotoPresent,
        photo_base64: photoBase64,
      });

      const chipCardPreviewBlob = await generateThaiIdCardPreviewBlob({
        idNumber: cardId,
        nameTh: String(payload.name_th || ""),
        nameEn: String(payload.name_en || ""),
        dob,
        expiry: String(payload.expiry || ""),
        address: String(payload.address || ""),
        referenceId: refId,
        photoBase64,
      });
      const chipCardPreviewUrl = URL.createObjectURL(chipCardPreviewBlob);
      setChipCardPreviewLocalUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return chipCardPreviewUrl;
      });

      setProofMethod("thai_id_chip");
      if (!proofReference) {
        setProofReference(refId);
      }
    } catch (err: unknown) {
      setCardReadProof(null);
      setChipCardPreviewLocalUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
      const msg = err instanceof Error ? err.message : "unknown error";
      setCardReadError(`อ่านบัตรอัตโนมัติไม่สำเร็จ: ${msg}. ตรวจ local agent ที่พอร์ต 18080 หรือกรอกข้อมูลด้วยตนเอง`);
    } finally {
      setReadingCard(false);
    }
  }

  async function uploadKycFile(path: string, body: File | Blob, contentType?: string) {
    const { error } = await supabase.storage.from("kyc-documents").upload(path, body, {
      upsert: true,
      contentType,
    });
    if (error) throw error;

    const { data } = supabase.storage.from("kyc-documents").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit() {
    if (!user) return;

    if (!consentGeneral || !consentBiometric) {
      alert("กรุณายินยอม PDPA และยินยอมใช้ข้อมูลชีวมิติโดยชัดแจ้งก่อนส่ง KYC");
      return;
    }
    if (!isEmailVerified) {
      alert("ต้องยืนยันอีเมลก่อนส่ง KYC ตามมาตรฐาน IAL2.1");
      return;
    }
    if (!otpVerifiedAt || !otpReference) {
      alert("ต้องยืนยัน Email OTP ก่อนส่ง KYC ตามมาตรฐาน IAL2.1");
      setStep(2);
      return;
    }
    if (!proofMethod || !proofReference.trim()) {
      alert("กรุณาระบุแหล่งอ้างอิงการพิสูจน์ตัวตน (Proof Source + Reference)");
      setStep(2);
      return;
    }
    if (REQUIRE_CHIP_READER && proofMethod !== "thai_id_chip") {
      alert("ระบบนี้บังคับใช้การอ่านบัตรประชาชนจากชิป (Thai ID Chip Reader)");
      setStep(2);
      return;
    }
    if (proofMethod === "thai_id_chip" && !cardReadProof) {
      alert("เลือก Thai ID Chip Reader แล้ว ต้องกดอ่านบัตรจากเครื่องอ่านให้สำเร็จก่อน");
      setStep(2);
      return;
    }
    if (proofMethod === "thai_id_chip") {
      const formId = digitsOnly(ocrData.id_number);
      if (!isValidThaiCitizenId(formId)) {
        alert("เลขบัตรประชาชนที่ส่งไม่ถูกต้อง");
        setStep(2);
        return;
      }
      const chipId = digitsOnly(cardReadProof?.id_number || "");
      const idMatch = chipId === formId;
      const nameMatch =
        normalizeNameForCompare(cardReadProof?.name_th || "") ===
        normalizeNameForCompare(ocrData.name_th || "");
      const dobMatch =
        normalizeDateForCompare(cardReadProof?.dob || "") ===
        normalizeDateForCompare(ocrData.dob || "");

      if (!idMatch || !nameMatch || !dobMatch) {
        alert("ข้อมูลที่รวบรวมได้ไม่ตรงกับข้อมูลจากชิปบัตร (เลขบัตร/ชื่อ/วันเกิด) จึงยังส่ง KYC ไม่ได้");
        setStep(2);
        return;
      }
      if (!cardReadProof?.chip_photo_present) {
        alert("อ่านชิปสำเร็จแต่ไม่พบภาพใบหน้าจากชิปบัตร จึงยังไม่ผ่านเงื่อนไข IAL 2.1");
        setStep(2);
        return;
      }
    }

    setLoading(true);
    try {
      let frontUrl = "";
      let selfieUrl = "";
      let chipPhotoUrl = "";
      let chipCardPreviewUrl = "";
      let contactVerificationId = "";
      const consentAt = new Date().toISOString();

      if (frontFile) {
        const ext = frontFile.name.split(".").pop() || "jpg";
        frontUrl = await uploadKycFile(user.id + "/id_front." + ext, frontFile);
      }

      if (selfieData) {
        const blob = await (await fetch(selfieData)).blob();
        selfieUrl = await uploadKycFile(user.id + "/selfie.jpg", blob, "image/jpeg");
      }
      if (proofMethod === "thai_id_chip" && cardReadProof?.photo_base64) {
        const chipDataUrl = `data:image/jpeg;base64,${cardReadProof.photo_base64}`;
        const chipBlob = await (await fetch(chipDataUrl)).blob();
        chipPhotoUrl = await uploadKycFile(user.id + "/chip_face.jpg", chipBlob, "image/jpeg");
      }
      if (proofMethod === "thai_id_chip" && cardReadProof) {
        const chipCardPreviewBlob = await generateThaiIdCardPreviewBlob({
          idNumber: digitsOnly(ocrData.id_number) || cardReadProof.id_number,
          nameTh: ocrData.name_th || cardReadProof.name_th,
          nameEn: ocrData.name_en || cardReadProof.name_en,
          dob: ocrData.dob || cardReadProof.dob,
          expiry: ocrData.expiry,
          address: ocrData.address,
          referenceId: cardReadProof.reference_id || proofReference.trim(),
          photoBase64: cardReadProof.photo_base64,
        });
        chipCardPreviewUrl = await uploadKycFile(user.id + "/chip_id_preview.png", chipCardPreviewBlob, "image/png");
      }

      if (!user.email) {
        throw new Error("ไม่พบอีเมลผู้ใช้สำหรับบันทึกหลักฐาน OTP");
      }

      const { data: contactVerification, error: contactVerificationError } = await supabase
        .from("ial21_contact_verifications")
        .insert({
          user_id: user.id,
          channel: "email",
          method: "supabase_email_otp",
          verification_target: user.email,
          otp_reference: otpReference,
          status: "verified",
          sent_at: otpSentAt,
          verified_at: otpVerifiedAt,
          details: {
            verification_context: "kyc_ial21_submission",
            auth_email_confirmed_at: user.email_confirmed_at || null,
          },
        })
        .select("id")
        .single();

      if (contactVerificationError) {
        throw new Error(`บันทึกหลักฐาน Email OTP ไม่สำเร็จ: ${contactVerificationError.message}`);
      }

      contactVerificationId = String(contactVerification?.id || "");
      if (!contactVerificationId) {
        throw new Error("บันทึกหลักฐาน Email OTP ไม่สำเร็จ (missing verification id)");
      }

      const ial21Submission = {
        level: "IAL2.1",
        evidence_method: proofMethod,
        evidence_reference: proofReference.trim(),
        evidence_note: proofNote.trim() || null,
        email_confirmed_at: user.email_confirmed_at,
        submitted_at: new Date().toISOString(),
        chip_read_verified: proofMethod === "thai_id_chip" ? Boolean(cardReadProof) : false,
        chip_read_at: proofMethod === "thai_id_chip" ? cardReadProof?.read_at || null : null,
        chip_reference_id:
          proofMethod === "thai_id_chip"
            ? cardReadProof?.reference_id || proofReference.trim()
            : null,
        chip_id_match:
          proofMethod === "thai_id_chip"
            ? digitsOnly(cardReadProof?.id_number || "") === digitsOnly(ocrData.id_number)
            : null,
        chip_id_last4:
          proofMethod === "thai_id_chip"
            ? digitsOnly(ocrData.id_number).slice(-4)
            : null,
        chip_name_match:
          proofMethod === "thai_id_chip"
            ? normalizeNameForCompare(cardReadProof?.name_th || "") === normalizeNameForCompare(ocrData.name_th)
            : null,
        chip_dob_match:
          proofMethod === "thai_id_chip"
            ? normalizeDateForCompare(cardReadProof?.dob || "") === normalizeDateForCompare(ocrData.dob)
            : null,
        chip_photo_present:
          proofMethod === "thai_id_chip"
            ? Boolean(cardReadProof?.chip_photo_present)
            : null,
        chip_photo_url:
          proofMethod === "thai_id_chip"
            ? chipPhotoUrl || null
            : null,
        chip_card_preview_url:
          proofMethod === "thai_id_chip"
            ? chipCardPreviewUrl || null
            : null,
        contact_channel_verified: Boolean(otpVerifiedAt),
        contact_channel_type: "email_otp",
        contact_verified_at: otpVerifiedAt,
        contact_channel_ref: user.email || null,
        contact_otp_reference: otpReference,
        contact_verification_id: contactVerificationId,
      };
      const pdpaConsent = {
        version: PDPA_NOTICE_VERSION,
        consent_given_at: consentAt,
        consent_general: true,
        consent_biometric_explicit: true,
        purposes: [
          "พิสูจน์และยืนยันตัวตนผู้ใช้ระบบ",
          "ตรวจสอบสิทธิ์การลงนามเอกสารอิเล็กทรอนิกส์",
          "เก็บหลักฐานเพื่อตรวจสอบย้อนหลังตามกฎหมาย",
        ],
        data_categories: ["ข้อมูลบัตรประชาชน (ด้านหน้า)", "ข้อมูลจากชิปบัตร", "ภาพใบหน้า (selfie)", "บันทึกการยืนยัน OTP"],
        retention_days: PDPA_RETENTION_DAYS,
        retention_policy:
          "จัดเก็บไม่เกิน 10 ปีนับจากวันยืนยันตัวตน หรือเท่าที่กฎหมายกำหนด แล้วลบ/ทำให้ไม่สามารถระบุตัวตนได้",
        recipients: ["เจ้าหน้าที่ผู้ได้รับมอบหมายในหน่วยงาน", "ผู้ประมวลผลข้อมูลที่จำเป็นต่อการให้บริการระบบ"],
        data_subject_rights: ["ขอเข้าถึงข้อมูล", "ขอแก้ไขข้อมูล", "ขอลบข้อมูล", "เพิกถอนความยินยอม", "ร้องเรียนต่อหน่วยงานกำกับ"],
      };

      const { data: inserted, error: insertError } = await supabase.from("kyc_submissions").insert({
        user_id: user.id,
        status: "pending",
        id_card_front_url: frontUrl,
        id_card_back_url: null,
        selfie_url: selfieUrl,
        ocr_data: {
          ...ocrData,
          ial21_submission: ial21Submission,
          pdpa_consent: pdpaConsent,
        },
      }).select("id").single();

      if (insertError) throw insertError;

      const submissionId = inserted?.id as string | undefined;
      if (submissionId) {
        const { error: linkContactError } = await supabase
          .from("ial21_contact_verifications")
          .update({ kyc_submission_id: submissionId })
          .eq("id", contactVerificationId)
          .eq("user_id", user.id);
        if (linkContactError) {
          throw new Error(`ผูกหลักฐาน OTP กับคำขอ KYC ไม่สำเร็จ: ${linkContactError.message}`);
        }

        try {
          await logAudit(supabase, "kyc.submit", "kyc", submissionId, {
            proof_source: proofMethod,
            proof_reference: proofReference.trim(),
            chip_read_verified: ial21Submission.chip_read_verified,
            chip_photo_present: ial21Submission.chip_photo_present,
            chip_card_preview_uploaded: Boolean(ial21Submission.chip_card_preview_url),
          });
          await logAudit(supabase, "kyc.contact_verified", "kyc", submissionId, {
            channel: "email",
            method: "supabase_email_otp",
            verification_id: contactVerificationId,
            otp_reference: otpReference,
            verified: Boolean(otpVerifiedAt),
            verified_at: otpVerifiedAt,
          });
          await logAudit(supabase, "kyc.pdpa_consent", "kyc", submissionId, {
            consent_version: PDPA_NOTICE_VERSION,
            consent_general: true,
            consent_biometric_explicit: true,
            consent_at: consentAt,
            retention_days: PDPA_RETENTION_DAYS,
          });
        } catch (auditErr) {
          console.warn("KYC submitted but audit log insert failed:", auditErr);
        }
      }

      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert("เกิดข้อผิดพลาด: " + msg);
    }
    setLoading(false);
  }

  const canNext0 = Boolean(frontFile);
  const canNext1 = Boolean(selfieData);
  const canNext2 = Boolean(
    ocrData.name_th.trim() &&
      ocrData.id_number.trim() &&
      proofMethod &&
      proofReference.trim() &&
      otpVerifiedAt &&
      (proofMethod !== "thai_id_chip" || (cardReadProof && cardReadProof.chip_photo_present))
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-10 py-3.5 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-gold to-gold-2 rounded-lg flex items-center justify-center font-extrabold text-navy text-sm">ลบส</div>
          <span className="font-bold text-sm text-navy">IAL 2.1 ยืนยันตัวตน</span>
        </div>
        <div className="ml-auto text-xs text-gray-500">ขั้นตอนที่ {Math.min(step + 1, 4)} จาก 4</div>
      </div>

      {!isEmailVerified && (
        <div className="mx-auto max-w-[760px] mt-5 px-5 py-3 rounded-lg border border-status-red bg-status-red-light text-status-red text-sm font-semibold">
          ต้องยืนยันอีเมลก่อนส่ง KYC ตามข้อกำหนด IAL 2.1
        </div>
      )}

      <div className="bg-white border-b border-gray-200 px-10">
        <div className="flex">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center">
              <div
                className={
                  "flex-1 py-3.5 flex items-center gap-2.5 border-b-[3px] pr-4 " +
                  (i < step
                    ? "border-b-status-green"
                    : i === step
                    ? "border-b-gold"
                    : "border-b-transparent")
                }
              >
                <div
                  className={
                    "w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold shrink-0 " +
                    (i < step
                      ? "bg-status-green text-white"
                      : i === step
                      ? "bg-gold text-navy"
                      : "bg-gray-200 text-gray-500")
                  }
                >
                  {i < step ? "✓" : s.num}
                </div>
                <span className={"text-xs font-medium " + (i < step ? "text-status-green" : i === step ? "text-navy font-bold" : "text-gray-400")}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={"h-0.5 w-8 mx-1 " + (i < step ? "bg-status-green" : "bg-gray-200")} />}
            </div>
          ))}
        </div>
      </div>

      <div className="p-10 max-w-[760px] mx-auto">
        {step === 0 && (
          <div className="animate-fade-up">
            <div className="bg-white rounded-[14px] p-8 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-navy mb-1.5 flex items-center gap-2.5">💳 อัปโหลดบัตรประชาชน (ด้านหน้า)</h2>
              <p className="text-[13px] text-gray-400 mb-7">อัปโหลดเฉพาะบัตรประชาชนด้านหน้า ส่วนข้อมูลตรวจสอบหลักใช้จากการอ่านชิปบัตร</p>
              <div>
                <p className="text-xs font-bold text-navy mb-2">ด้านหน้า <span className="text-status-red">*</span></p>
                <label className={"block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all " + (frontPreview ? "border-status-green bg-status-green-light" : "border-gray-200 bg-gray-50 hover:border-navy-3")}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  {frontPreview ? <img src={frontPreview} className="w-full max-h-[200px] object-cover rounded-lg mx-auto" alt="ID front" /> : <><span className="text-[40px] block mb-3">📸</span><h4 className="text-sm font-semibold text-navy mb-1">เลือกรูปด้านหน้า</h4><p className="text-xs text-gray-400">JPG, PNG ไม่เกิน 10MB</p></>}
                </label>
              </div>
              <div className="flex justify-end mt-6 pt-6 border-t border-gray-200">
                <button onClick={() => { if (canNext0) setStep(1); }} disabled={!canNext0} className="px-7 py-2.5 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold shadow-[0_4px_14px_rgba(17,34,64,0.3)] disabled:opacity-40 transition-all hover:-translate-y-0.5 border-none cursor-pointer">ถัดไป →</button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-up">
            <div className="bg-white rounded-[14px] p-8 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-navy mb-1.5 flex items-center gap-2.5">📸 ถ่ายภาพ Selfie</h2>
              <p className="text-[13px] text-gray-400 mb-7">ถ่ายภาพใบหน้าของคุณเพื่อเปรียบเทียบกับบัตรประชาชน</p>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="bg-navy rounded-[14px] aspect-[4/3] flex items-center justify-center relative overflow-hidden">
                    {!cameraOn && !selfieData && <div className="text-center text-white/50"><span className="text-[56px] block mb-3">📷</span><p className="text-[13px]">กดเปิดกล้องเพื่อถ่ายภาพ</p></div>}
                    <video ref={videoRef} autoPlay playsInline className={cameraOn && !selfieData ? "w-full h-full object-cover" : "hidden"} />
                    <canvas ref={canvasRef} className="hidden" />
                    {cameraOn && !selfieData && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[56%] w-[160px] h-[200px] border-[3px] border-gold rounded-[50%_50%_45%_45%] pointer-events-none" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />}
                    {selfieData && <img src={selfieData} className="w-full h-full object-cover" alt="Selfie" />}
                  </div>
                  <div className="flex gap-2 mt-3">
                    {!selfieData ? (
                      <>
                        {!cameraOn && <button onClick={startCamera} className="flex-1 py-2.5 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold border-none cursor-pointer">เปิดกล้อง</button>}
                        {cameraOn && <button onClick={capturePhoto} className="flex-1 py-2.5 bg-gradient-to-br from-gold to-gold-2 text-navy rounded-md text-sm font-bold border-none cursor-pointer shadow-gold">ถ่ายภาพ</button>}
                      </>
                    ) : (
                      <button onClick={retakeSelfie} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-md text-sm font-semibold border border-gray-200 cursor-pointer">ถ่ายใหม่</button>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-navy mb-3.5">คำแนะนำ</h4>
                  <div className="flex flex-col gap-2.5">
                    {["หันหน้าตรง", "แสงเพียงพอ", "ไม่สวมหมวก/แว่นกันแดด", "ถือนิ่งๆ"].map((text, i) => (
                      <div key={text} className="flex gap-2.5 text-xs"><span className="text-lg">{["😀", "💡", "🎭", "📱"][i]}</span><span className="text-gray-600 mt-0.5">{text}</span></div>
                    ))}
                  </div>
                  {selfieData && <div className="mt-4 p-3 bg-status-green-light border border-status-green rounded-lg text-[13px] font-semibold text-status-green flex items-center gap-2">✅ ถ่ายภาพสำเร็จ</div>}
                </div>
              </div>
              <div className="flex justify-between mt-6 pt-6 border-t border-gray-200">
                <button onClick={() => setStep(0)} className="px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-md text-sm font-semibold cursor-pointer hover:border-navy-3 transition-all">← ย้อนกลับ</button>
                <button onClick={() => { if (canNext1) setStep(2); }} disabled={!canNext1} className="px-7 py-2.5 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold shadow-[0_4px_14px_rgba(17,34,64,0.3)] disabled:opacity-40 transition-all hover:-translate-y-0.5 border-none cursor-pointer">ถัดไป →</button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-up">
            <div className="bg-white rounded-[14px] p-8 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-navy mb-1.5 flex items-center gap-2.5">📋 หลักฐานพิสูจน์ตัวตน IAL 2.1</h2>
              <p className="text-[13px] text-gray-400 mb-7">กรอกหลักฐานอ้างอิงการพิสูจน์ตัวตนก่อนส่งให้เจ้าหน้าที่</p>

              <div className="rounded-xl border border-gray-200 p-4 mb-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs font-bold text-navy">อ่านข้อมูลจากเครื่องอ่านบัตร {REQUIRE_CHIP_READER ? "(Required)" : "(Optional)"}</p>
                  <button onClick={readThaiIdFromLocalAgent} disabled={readingCard} className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold disabled:opacity-60 border-none cursor-pointer">
                    {readingCard ? "กำลังอ่าน..." : "อ่านจาก Card Reader"}
                  </button>
                </div>
                {cardReadError && <p className="text-xs text-status-red">{cardReadError}</p>}
                {cardReadProof && (
                  <p className="text-xs text-status-green font-semibold mt-1">
                    ✅ อ่านบัตรสำเร็จ (Ref: {cardReadProof.reference_id}, เลขท้าย {cardReadProof.id_number.slice(-4)}, chip photo: {cardReadProof.chip_photo_present ? "found" : "missing"})
                  </p>
                )}
                {chipCardPreviewLocalUrl && (
                  <div className="mt-3">
                    <p className="text-[11px] text-gray-500 font-semibold mb-1">ตัวอย่างบัตรจากข้อมูลชิป (Generated Preview)</p>
                    <div className="rounded-[10px] border border-gray-200 bg-gray-50 overflow-hidden">
                      <img src={chipCardPreviewLocalUrl} alt="Thai ID preview from chip data" className="w-full h-auto object-contain" />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4 mb-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs font-bold text-navy">ยืนยันช่องทางติดต่อด้วย Email OTP (Required)</p>
                  <button
                    onClick={sendEmailOtp}
                    disabled={otpSending || !user?.email}
                    className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold disabled:opacity-60 border-none cursor-pointer"
                  >
                    {otpSending ? "กำลังส่ง..." : "ส่ง OTP ไปอีเมล"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">ส่งไปที่: {user?.email || "-"}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="กรอกรหัส OTP"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3"
                  />
                  <button
                    onClick={verifyEmailOtp}
                    disabled={otpVerifying || !otpCode.trim()}
                    className="px-3 py-2 bg-status-green text-white rounded-md text-xs font-semibold disabled:opacity-60 border-none cursor-pointer"
                  >
                    {otpVerifying ? "กำลังยืนยัน..." : "ยืนยัน OTP"}
                  </button>
                </div>
                {otpStatus && <p className="text-xs text-status-green font-semibold mt-2">{otpStatus}</p>}
                {otpError && <p className="text-xs text-status-red font-semibold mt-2">{otpError}</p>}
                {otpVerifiedAt && (
                  <p className="text-xs text-status-green font-semibold mt-2">
                    ✅ OTP Verified ({new Date(otpVerifiedAt).toLocaleString("th-TH")}) | Ref: {otpReference || "-"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="text-[11px] text-gray-500 font-semibold block mb-1">Proof Source <span className="text-status-red">*</span></label>
                  <select value={proofMethod} onChange={(e) => setProofMethod(e.target.value as ProofMethod)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3" disabled={REQUIRE_CHIP_READER}>
                    {!REQUIRE_CHIP_READER && <option value="">-- เลือกแหล่งยืนยัน --</option>}
                    <option value="thai_id_chip">Thai ID Chip Reader</option>
                    {!REQUIRE_CHIP_READER && <option value="external_idp">External IdP / NDID</option>}
                    {!REQUIRE_CHIP_READER && <option value="manual_offline">Manual Offline Verification</option>}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-semibold block mb-1">Proof Reference <span className="text-status-red">*</span></label>
                  <input type="text" value={proofReference} onChange={(e) => setProofReference(e.target.value)} placeholder="เช่น txn-20260312-001" className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3" />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-[11px] text-gray-500 font-semibold block mb-1">หมายเหตุหลักฐาน (ถ้ามี)</label>
                <textarea value={proofNote} onChange={(e) => setProofNote(e.target.value)} className="w-full min-h-[72px] px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3 resize-none" placeholder="หมายเหตุเพิ่มเติมสำหรับเจ้าหน้าที่" />
              </div>

              <div className="bg-navy rounded-xl p-5 mb-6">
                <p className="text-xs font-bold text-gold-2 mb-3.5">ข้อมูลจากบัตร / OCR</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    ["ชื่อ-นามสกุล (ไทย)", "name_th"],
                    ["Name (English)", "name_en"],
                    ["เลขบัตรประชาชน", "id_number"],
                    ["วันเกิด", "dob"],
                    ["วันหมดอายุ", "expiry"],
                    ["ที่อยู่", "address"],
                  ] as [string, keyof OcrData][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="text-[11px] text-gold font-semibold tracking-wider block mb-1">{label}</label>
                      <input type="text" value={ocrData[key]} onChange={(e) => setOcrData({ ...ocrData, [key]: e.target.value })} className="w-full bg-white/7 border border-white/12 rounded-md px-3 py-2 text-white text-[13px] outline-none focus:border-gold" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between mt-6 pt-6 border-t border-gray-200">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-md text-sm font-semibold cursor-pointer">← ย้อนกลับ</button>
                <button onClick={() => { if (canNext2) setStep(3); }} disabled={!canNext2} className="px-7 py-2.5 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold shadow-[0_4px_14px_rgba(17,34,64,0.3)] disabled:opacity-40 transition-all hover:-translate-y-0.5 border-none cursor-pointer">ถัดไป →</button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-up">
            <div className="bg-white rounded-[14px] p-8 shadow-sm border border-gray-200 text-center">
              <h2 className="text-xl font-bold text-navy mb-1.5">🔒 ยืนยันการส่ง KYC</h2>
              <p className="text-[13px] text-gray-400 mb-7">ข้อมูลของคุณจะถูกส่งให้เจ้าหน้าที่ตรวจสอบตาม IAL 2.1</p>

              <div className="bg-status-cyan-light border border-status-cyan rounded-xl p-5 text-left mb-4">
                <p className="text-[13px] text-[#007b99] leading-relaxed">
                  <strong>Proof Source:</strong> {proofMethod || "-"}
                  <br />
                  <strong>Proof Reference:</strong> {proofReference || "-"}
                  <br />
                  <strong>Chip Read:</strong> {cardReadProof ? "Yes" : "No"}
                  <br />
                  <strong>Chip Photo:</strong> {cardReadProof?.chip_photo_present ? "Found" : "Missing"}
                  <br />
                  <strong>Chip ID Card Preview:</strong> {chipCardPreviewLocalUrl ? "Ready" : "Pending generation"}
                  <br />
                  <strong>Email OTP:</strong> {otpVerifiedAt ? "Verified" : "Not verified"}
                  <br />
                  <strong>OTP Reference:</strong> {otpReference || "-"}
                  <br />
                  <strong>Email Verified:</strong> {isEmailVerified ? "Yes" : "No"}
                  <br />
                  <strong>PDPA Consent:</strong> {consentGeneral ? "Accepted" : "Pending"}
                  <br />
                  <strong>Biometric Consent:</strong> {consentBiometric ? "Accepted" : "Pending"}
                </p>
              </div>

              <div className="border border-gray-200 rounded-xl p-5 text-left mb-6 bg-gray-50">
                <h3 className="text-sm font-bold text-navy mb-3">ประกาศความเป็นส่วนตัว (PDPA)</h3>
                <div className="text-xs text-gray-700 leading-6 space-y-1">
                  <p><strong>วัตถุประสงค์:</strong> เพื่อพิสูจน์/ยืนยันตัวตน, ตรวจสอบสิทธิ์ใช้งานและการลงนาม, และเก็บหลักฐานเพื่อการตรวจสอบย้อนหลังตามกฎหมาย</p>
                  <p><strong>ข้อมูลที่เก็บ:</strong> ภาพบัตรประชาชนด้านหน้า, ข้อมูลจากชิปบัตร, ภาพใบหน้า (selfie), และบันทึกยืนยัน OTP</p>
                  <p><strong>ระยะเวลาจัดเก็บ:</strong> ไม่เกิน {PDPA_RETENTION_DAYS} วัน (10 ปี) หรือเท่าที่กฎหมายกำหนด แล้วลบ/ทำให้ไม่สามารถระบุตัวตนได้</p>
                  <p><strong>การเปิดเผยข้อมูล:</strong> เฉพาะเจ้าหน้าที่ผู้ได้รับมอบหมายและผู้ประมวลผลข้อมูลที่จำเป็นต่อการให้บริการระบบ</p>
                  <p><strong>สิทธิของเจ้าของข้อมูล:</strong> ขอเข้าถึง/แก้ไข/ลบข้อมูล, เพิกถอนความยินยอม, และร้องเรียนต่อหน่วยงานกำกับ</p>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="flex items-start gap-2 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      checked={consentGeneral}
                      onChange={(e) => setConsentGeneral(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัว รวมถึงยินยอมให้เก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลตามวัตถุประสงค์ข้างต้น</span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-gray-800">
                    <input
                      type="checkbox"
                      checked={consentBiometric}
                      onChange={(e) => setConsentBiometric(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>ข้าพเจ้ายินยอมโดยชัดแจ้งให้ประมวลผลข้อมูลชีวมิติ (ภาพใบหน้า/selfie และภาพจากชิปบัตร) เพื่อการยืนยันตัวตน</span>
                  </label>
                </div>
                <p className="mt-3 text-[11px] text-gray-500">Consent Version: {PDPA_NOTICE_VERSION}</p>
              </div>

              <div className="flex gap-3 justify-center">
                <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-md text-sm font-semibold cursor-pointer">← ย้อนกลับ</button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !isEmailVerified || !otpVerifiedAt || !consentGeneral || !consentBiometric}
                  className="px-10 py-3 bg-gradient-to-br from-gold to-gold-2 text-navy rounded-md text-sm font-bold shadow-gold hover:-translate-y-0.5 transition-all border-none cursor-pointer disabled:opacity-60 flex items-center gap-2"
                >
                  {loading ? <span className="inline-block w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" /> : "✅ ส่ง KYC"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-fade-up">
            <div className="bg-white rounded-[14px] p-12 shadow-sm border border-gray-200 text-center">
              <div className="w-20 h-20 bg-status-green-light border-[3px] border-status-green rounded-full flex items-center justify-center text-[36px] mx-auto mb-6">✅</div>
              <h2 className="text-2xl font-bold text-navy mb-2">ส่ง KYC สำเร็จ!</h2>
              <p className="text-[13px] text-gray-400 mb-8 max-w-md mx-auto">ข้อมูลของคุณถูกส่งเรียบร้อยแล้ว เจ้าหน้าที่จะตรวจสอบภายใน 1-2 วันทำการ</p>
              <button onClick={() => router.push("/dashboard")} className="px-8 py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all border-none cursor-pointer">กลับหน้าแดชบอร์ด</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
