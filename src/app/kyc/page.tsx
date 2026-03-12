"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

type OcrData = {
  name_th: string;
  name_en: string;
  id_number: string;
  dob: string;
  expiry: string;
  address: string;
};

type ProofMethod = "thai_id_chip" | "external_idp" | "manual_offline";

type CardReadProof = {
  id_number: string;
  name_th: string;
  name_en: string;
  read_at: string;
  reference_id: string;
  source: string;
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

export default function KYCPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");

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

  const [proofMethod, setProofMethod] = useState<ProofMethod | "">("");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [readingCard, setReadingCard] = useState(false);
  const [cardReadError, setCardReadError] = useState("");
  const [cardReadProof, setCardReadProof] = useState<CardReadProof | null>(null);

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

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>, side: "front" | "back") {
    const file = e.target.files?.[0];
    if (!file) return;

    if (side === "front") {
      setFrontFile(file);
      setFrontPreview(URL.createObjectURL(file));
      return;
    }

    setBackFile(file);
    setBackPreview(URL.createObjectURL(file));
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

  async function readThaiIdFromLocalAgent() {
    setCardReadError("");
    setReadingCard(true);

    try {
      const endpoints = [
        "http://127.0.0.1:18080/read-thai-id",
        "http://localhost:18080/read-thai-id",
      ];
      let payload: Record<string, string> | null = null;
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
      const refId = String(payload.reference_id || payload.tx_id || "chip-read-local");

      setOcrData((prev) => ({
        ...prev,
        name_th: (payload.name_th as string) || prev.name_th,
        name_en: (payload.name_en as string) || prev.name_en,
        id_number: cardId || prev.id_number,
        dob: (payload.dob as string) || prev.dob,
        expiry: (payload.expiry as string) || prev.expiry,
        address: (payload.address as string) || prev.address,
      }));

      setCardReadProof({
        id_number: cardId,
        name_th: String(payload.name_th || ""),
        name_en: String(payload.name_en || ""),
        read_at: readAt,
        reference_id: refId,
        source: String(payload.source || "thai_id_chip"),
      });
      setProofMethod("thai_id_chip");
      if (!proofReference) {
        setProofReference(refId);
      }
    } catch (err: unknown) {
      setCardReadProof(null);
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

    if (!isEmailVerified) {
      alert("ต้องยืนยันอีเมลก่อนส่ง KYC ตามมาตรฐาน IAL2.1");
      return;
    }
    if (!proofMethod || !proofReference.trim()) {
      alert("กรุณาระบุแหล่งอ้างอิงการพิสูจน์ตัวตน (Proof Source + Reference)");
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
      if (digitsOnly(cardReadProof?.id_number || "") !== formId) {
        alert("เลขบัตรจากเครื่องอ่านไม่ตรงกับข้อมูลที่กรอก จึงยังส่ง KYC ไม่ได้");
        setStep(2);
        return;
      }
    }

    setLoading(true);
    try {
      let frontUrl = "";
      let backUrl = "";
      let selfieUrl = "";

      if (frontFile) {
        const ext = frontFile.name.split(".").pop() || "jpg";
        frontUrl = await uploadKycFile(user.id + "/id_front." + ext, frontFile);
      }

      if (backFile) {
        const ext = backFile.name.split(".").pop() || "jpg";
        backUrl = await uploadKycFile(user.id + "/id_back." + ext, backFile);
      }

      if (selfieData) {
        const blob = await (await fetch(selfieData)).blob();
        selfieUrl = await uploadKycFile(user.id + "/selfie.jpg", blob, "image/jpeg");
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
      };

      const { error: insertError } = await supabase.from("kyc_submissions").insert({
        user_id: user.id,
        status: "pending",
        id_card_front_url: frontUrl,
        id_card_back_url: backUrl,
        selfie_url: selfieUrl,
        ocr_data: {
          ...ocrData,
          ial21_submission: ial21Submission,
        },
      });

      if (insertError) throw insertError;
      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert("เกิดข้อผิดพลาด: " + msg);
    }
    setLoading(false);
  }

  const canNext0 = Boolean(frontFile && backFile);
  const canNext1 = Boolean(selfieData);
  const canNext2 = Boolean(
    ocrData.name_th.trim() &&
      ocrData.id_number.trim() &&
      proofMethod &&
      proofReference.trim() &&
      (proofMethod !== "thai_id_chip" || cardReadProof)
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
              <h2 className="text-xl font-bold text-navy mb-1.5 flex items-center gap-2.5">💳 อัปโหลดบัตรประชาชน</h2>
              <p className="text-[13px] text-gray-400 mb-7">ถ่ายภาพหรืออัปโหลดบัตรประชาชนด้านหน้าและด้านหลัง</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-navy mb-2">ด้านหน้า <span className="text-status-red">*</span></p>
                  <label className={"block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all " + (frontPreview ? "border-status-green bg-status-green-light" : "border-gray-200 bg-gray-50 hover:border-navy-3")}>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "front")} />
                    {frontPreview ? <img src={frontPreview} className="w-full max-h-[160px] object-cover rounded-lg mx-auto" alt="ID front" /> : <><span className="text-[40px] block mb-3">📸</span><h4 className="text-sm font-semibold text-navy mb-1">เลือกรูปด้านหน้า</h4><p className="text-xs text-gray-400">JPG, PNG ไม่เกิน 10MB</p></>}
                  </label>
                </div>
                <div>
                  <p className="text-xs font-bold text-navy mb-2">ด้านหลัง <span className="text-status-red">*</span></p>
                  <label className={"block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all " + (backPreview ? "border-status-green bg-status-green-light" : "border-gray-200 bg-gray-50 hover:border-navy-3")}>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, "back")} />
                    {backPreview ? <img src={backPreview} className="w-full max-h-[160px] object-cover rounded-lg mx-auto" alt="ID back" /> : <><span className="text-[40px] block mb-3">📸</span><h4 className="text-sm font-semibold text-navy mb-1">เลือกรูปด้านหลัง</h4><p className="text-xs text-gray-400">JPG, PNG ไม่เกิน 10MB</p></>}
                  </label>
                </div>
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
                  <p className="text-xs font-bold text-navy">อ่านข้อมูลจากเครื่องอ่านบัตร (Optional)</p>
                  <button onClick={readThaiIdFromLocalAgent} disabled={readingCard} className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold disabled:opacity-60 border-none cursor-pointer">
                    {readingCard ? "กำลังอ่าน..." : "อ่านจาก Card Reader"}
                  </button>
                </div>
                {cardReadError && <p className="text-xs text-status-red">{cardReadError}</p>}
                {cardReadProof && (
                  <p className="text-xs text-status-green font-semibold mt-1">
                    ✅ อ่านบัตรสำเร็จ (Ref: {cardReadProof.reference_id}, เลขท้าย {cardReadProof.id_number.slice(-4)})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="text-[11px] text-gray-500 font-semibold block mb-1">Proof Source <span className="text-status-red">*</span></label>
                  <select value={proofMethod} onChange={(e) => setProofMethod(e.target.value as ProofMethod)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3">
                    <option value="">-- เลือกแหล่งยืนยัน --</option>
                    <option value="thai_id_chip">Thai ID Chip Reader</option>
                    <option value="external_idp">External IdP / NDID</option>
                    <option value="manual_offline">Manual Offline Verification</option>
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
                  <strong>Email Verified:</strong> {isEmailVerified ? "Yes" : "No"}
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-md text-sm font-semibold cursor-pointer">← ย้อนกลับ</button>
                <button onClick={handleSubmit} disabled={loading || !isEmailVerified} className="px-10 py-3 bg-gradient-to-br from-gold to-gold-2 text-navy rounded-md text-sm font-bold shadow-gold hover:-translate-y-0.5 transition-all border-none cursor-pointer disabled:opacity-60 flex items-center gap-2">
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
