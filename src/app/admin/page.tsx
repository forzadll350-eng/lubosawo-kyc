"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Submission = any;

interface NavItem {
  icon: string;
  label: string;
  f: string;
  badge?: number;
}

const ROLES = [
  { id: 1, name: "super_admin", label: "Super Admin" },
  { id: 2, name: "admin", label: "Admin" },
  { id: 3, name: "officer", label: "เจ้าหน้าที่" },
  { id: 4, name: "signer", label: "ผู้ลงนาม" },
  { id: 5, name: "viewer", label: "ผู้ใช้ทั่วไป" },
];

export default function AdminDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<Submission | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(5);
  const [ialChecklist, setIalChecklist] = useState({
    evidenceSourceChecked: false,
    faceMatchChecked: false,
    dataConsistencyChecked: false,
  });
  const [reviewError, setReviewError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { router.push("/"); return; }
    setUser(u);
    const { data: subs } = await supabase.from("kyc_submissions").select("*, user_profiles(full_name, email, phone, role_id)").order("created_at", { ascending: false });
    if (subs) {
      setSubmissions(subs);
      setStats({ pending: subs.filter((s: Submission) => s.status === "pending").length, approved: subs.filter((s: Submission) => s.status === "approved").length, rejected: subs.filter((s: Submission) => s.status === "rejected").length, total: subs.length });
    }
    setLoading(false);
  }

  function getIalSubmission(submission: Submission | null) {
    if (!submission?.ocr_data) return null;
    return submission.ocr_data.ial21_submission || null;
  }

  async function handleApprove(submission: Submission) {
    const ialSubmission = getIalSubmission(submission);
    if (!ialSubmission?.evidence_method || !ialSubmission?.evidence_reference) {
      setReviewError("ยังไม่มีหลักฐานอ้างอิง IAL 2.1 (Proof Source / Proof Reference)");
      return;
    }
    if (ialSubmission?.evidence_method !== "thai_id_chip") {
      setReviewError("ระบบนี้กำหนดให้ใช้หลักฐานจาก Thai ID Chip Reader เท่านั้น");
      return;
    }
    if (!ialSubmission?.chip_read_verified || !ialSubmission?.chip_id_match || !ialSubmission?.chip_name_match || !ialSubmission?.chip_dob_match) {
      setReviewError("ผลเทียบข้อมูลจากชิปบัตรยังไม่ครบถ้วนหรือไม่ผ่าน");
      return;
    }
    if (!ialSubmission?.chip_photo_present) {
      setReviewError("ไม่พบภาพใบหน้าจากชิปบัตร จึงยังอนุมัติ IAL 2.1 ไม่ได้");
      return;
    }
    if (!ialSubmission?.chip_photo_url) {
      setReviewError("ยังไม่มีไฟล์ภาพใบหน้าจากชิปบัตรในหลักฐาน KYC");
      return;
    }
    if (!ialSubmission?.contact_channel_verified || !ialSubmission?.contact_verified_at) {
      setReviewError("ยังไม่มีหลักฐานยืนยันช่องทางติดต่อ (email/otp)");
      return;
    }
    if (ialSubmission?.contact_channel_type !== "email_otp") {
      setReviewError("ต้องเป็นหลักฐานยืนยันช่องทางติดต่อแบบ Email OTP");
      return;
    }
    if (!ialSubmission?.contact_otp_reference || !ialSubmission?.contact_verification_id) {
      setReviewError("ยังไม่มี OTP reference / verification id สำหรับหลักฐานช่องทางติดต่อ");
      return;
    }

    const allChecked = ialChecklist.evidenceSourceChecked && ialChecklist.faceMatchChecked && ialChecklist.dataConsistencyChecked;
    if (!allChecked) {
      setReviewError("ต้องตรวจ checklist IAL 2.1 ให้ครบก่อนอนุมัติ");
      return;
    }

    setActionLoading(true);
    setReviewError("");
    const reviewedAt = new Date().toISOString();

    const nextOcrData = {
      ...(submission.ocr_data || {}),
      ial21_review: {
        reviewed_by: user?.id || null,
        reviewed_at: reviewedAt,
        decision: "approved",
        assigned_role_id: selectedRoleId,
        evidence_source_checked: true,
        face_match_checked: true,
        data_consistency_checked: true,
      },
    };

    const { error: kycError } = await supabase
      .from("kyc_submissions")
      .update({ status: "approved", reviewed_at: reviewedAt, ocr_data: nextOcrData })
      .eq("id", submission.id);
    if (kycError) {
      setReviewError(kycError.message);
      setActionLoading(false);
      return;
    }

    const { error: roleError } = await supabase
      .from("user_profiles")
      .update({ role_id: selectedRoleId })
      .eq("id", submission.user_id);
    if (roleError) {
      setReviewError(roleError.message);
      setActionLoading(false);
      return;
    }

    setActionLoading(false);
    setReviewModal(null);
    setSelectedRoleId(5);
    setIalChecklist({ evidenceSourceChecked: false, faceMatchChecked: false, dataConsistencyChecked: false });
    loadData();
  }

  async function handleReject(submission: Submission) {
    if (!rejectReason.trim()) { alert("กรุณาระบุเหตุผล"); return; }

    setActionLoading(true);
    setReviewError("");
    const reviewedAt = new Date().toISOString();
    const nextOcrData = {
      ...(submission.ocr_data || {}),
      ial21_review: {
        reviewed_by: user?.id || null,
        reviewed_at: reviewedAt,
        decision: "rejected",
        reject_reason: rejectReason,
      },
    };

    const { error } = await supabase
      .from("kyc_submissions")
      .update({ status: "rejected", reject_reason: rejectReason, reviewed_at: reviewedAt, ocr_data: nextOcrData })
      .eq("id", submission.id);
    if (error) {
      setReviewError(error.message);
      setActionLoading(false);
      return;
    }

    setActionLoading(false);
    setReviewModal(null);
    setRejectReason("");
    setIalChecklist({ evidenceSourceChecked: false, faceMatchChecked: false, dataConsistencyChecked: false });
    loadData();
  }

  async function handleChangeRole(userId: string, roleId: number) {
    await supabase.from("user_profiles").update({ role_id: roleId }).eq("id", userId);
    loadData();
  }

  async function handleLogout() { await supabase.auth.signOut(); router.push("/"); }

  const filtered = filter === "all" ? submissions : submissions.filter((s: Submission) => s.status === filter);
  const chipCls: Record<string, string> = { pending: "bg-status-orange-light text-status-orange", approved: "bg-status-green-light text-status-green", rejected: "bg-status-red-light text-status-red" };
  const chipLabel: Record<string, string> = { pending: "รอตรวจสอบ", approved: "อนุมัติ", rejected: "ปฏิเสธ" };

  const getRoleName = (roleId: number) => ROLES.find(r => r.id === roleId)?.label || "ไม่ทราบ";

  const navItems: NavItem[] = [
    {icon:"📋",label:"คิวตรวจสอบ",f:"pending",badge:stats.pending},
    {icon:"📊",label:"ทั้งหมด",f:"all"},
    {icon:"✅",label:"อนุมัติแล้ว",f:"approved"},
    {icon:"❌",label:"ปฏิเสธ",f:"rejected"}
  ];
  const currentIalSubmission = getIalSubmission(reviewModal);
  const hasIalEvidence = Boolean(currentIalSubmission?.evidence_method && currentIalSubmission?.evidence_reference);
  const chipMethod = currentIalSubmission?.evidence_method === "thai_id_chip";
  const chipReadVerified = Boolean(currentIalSubmission?.chip_read_verified);
  const chipIdMatch = Boolean(currentIalSubmission?.chip_id_match);
  const chipNameMatch = Boolean(currentIalSubmission?.chip_name_match);
  const chipDobMatch = Boolean(currentIalSubmission?.chip_dob_match);
  const chipPhotoPresent = Boolean(currentIalSubmission?.chip_photo_present);
  const chipPhotoUrl = typeof currentIalSubmission?.chip_photo_url === "string" ? currentIalSubmission.chip_photo_url : "";
  const chipCardPreviewUrl = typeof currentIalSubmission?.chip_card_preview_url === "string" ? currentIalSubmission.chip_card_preview_url : "";
  const contactChannelVerified = Boolean(currentIalSubmission?.contact_channel_verified);
  const contactChannelType = typeof currentIalSubmission?.contact_channel_type === "string" ? currentIalSubmission.contact_channel_type : "";
  const contactOtpReference = typeof currentIalSubmission?.contact_otp_reference === "string" ? currentIalSubmission.contact_otp_reference : "";
  const contactVerificationId = typeof currentIalSubmission?.contact_verification_id === "string" ? currentIalSubmission.contact_verification_id : "";
  const contactVerifiedAt = currentIalSubmission?.contact_verified_at ? new Date(currentIalSubmission.contact_verified_at).toLocaleString("th-TH") : "";
  const chipEvidenceOk = !chipMethod || (chipReadVerified && chipIdMatch && chipNameMatch && chipDobMatch && chipPhotoPresent && Boolean(chipPhotoUrl));
  const canApprove =
    hasIalEvidence &&
    chipEvidenceOk &&
    contactChannelVerified &&
    contactChannelType === "email_otp" &&
    Boolean(contactOtpReference) &&
    Boolean(contactVerificationId) &&
    Boolean(contactVerifiedAt) &&
    ialChecklist.evidenceSourceChecked &&
    ialChecklist.faceMatchChecked &&
    ialChecklist.dataConsistencyChecked;

  if (loading) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><span className="inline-block w-8 h-8 border-3 border-navy/20 border-t-navy rounded-full animate-spin" /></div>;

  return (
    <div className="flex min-h-screen">
      <div className="w-[240px] shrink-0 bg-navy flex flex-col fixed top-0 left-0 bottom-0 z-20">
        <div className="p-5 border-b border-white/8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-2 rounded-[10px] flex items-center justify-center font-extrabold text-navy text-base shrink-0">ลบส</div>
          <div><h2 className="text-white text-[13px] font-bold leading-tight">อบต.ลุโบะสาวอ</h2><p className="text-gold text-[10px] opacity-80">ระบบจัดการ KYC</p></div>
        </div>
        <nav className="flex-1 p-3">
          {/* ★ เมนูแอดมิน */}
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5">เมนูแอดมิน</div>

          <button onClick={()=>router.push('/admin/users')} className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent">
            <span className="text-base w-5 text-center">👥</span>จัดการผู้ใช้
          </button>

          {/* ★ ลิงก์ลัด */}
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5 mt-3">ลิงก์ลัด</div>

          <button onClick={()=>router.push('/dashboard')} className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-3 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent">
            <span className="text-base w-5 text-center">📊</span>ไป Dashboard
          </button>

          {/* ★ ตรวจสอบ KYC */}
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5">ตรวจสอบ KYC</div>
          {navItems.map((n) => (
            <button key={n.f} onClick={()=>setFilter(n.f)} className={"flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer "+(filter===n.f?"bg-gold/18 text-gold-2 font-bold":"text-white/65 hover:bg-white/7 hover:text-white bg-transparent")}>
              <span className="text-base w-5 text-center">{n.icon}</span>{n.label}
              {(n.badge ?? 0) > 0 && <span className="ml-auto bg-status-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/8">
          <div className="flex items-center gap-2.5 px-2 py-2"><div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-navy-3 to-status-cyan flex items-center justify-center text-white font-bold text-[13px]">A</div><div><div className="text-white text-xs font-semibold">Admin</div><small className="text-white/40 text-[10px]">{user?.email}</small></div></div>
          <button onClick={handleLogout} className="w-full mt-2 py-2 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all border-none cursor-pointer">ออกจากระบบ</button>
        </div>
      </div>
      <div className="ml-[240px] flex-1">
        <div className="bg-white border-b border-gray-200 px-8 py-3.5 flex items-center sticky top-0 z-10 shadow-sm"><h2 className="text-base font-bold text-navy">แดชบอร์ดเจ้าหน้าที่</h2></div>
        <div className="p-7">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[{icon:"🔄",num:stats.pending,label:"รอตรวจสอบ",cls:"border-t-[3px] border-t-status-orange"},{icon:"✅",num:stats.approved,label:"อนุมัติแล้ว",cls:"border-t-[3px] border-t-status-green"},{icon:"❌",num:stats.rejected,label:"ปฏิเสธ",cls:"border-t-[3px] border-t-status-red"},{icon:"📊",num:stats.total,label:"ทั้งหมด",cls:"border-t-[3px] border-t-status-cyan"}].map((s,i)=>(
              <div key={i} className={"bg-white rounded-xl p-5 border border-gray-200 shadow-sm "+s.cls}><span className="text-2xl block mb-2.5">{s.icon}</span><div className="text-[28px] font-extrabold text-navy leading-none mb-1">{s.num}</div><div className="text-xs text-gray-400 font-medium">{s.label}</div></div>
            ))}
          </div>
          <div className="flex items-center gap-3 mb-3.5"><h3 className="text-base font-bold text-navy">รายการ KYC</h3></div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-50">{["ผู้สมัคร","สถานะ","Role","วันที่ส่ง","จัดการ"].map((h) => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length===0?<tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">ไม่มีรายการ</td></tr>:filtered.map((s: Submission)=>(
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border-b border-gray-100"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-2 to-navy-3 flex items-center justify-center text-white font-bold text-xs shrink-0">{(s.user_profiles?.full_name||"U")[0]}</div><div><div className="text-[13px] font-semibold text-navy">{s.user_profiles?.full_name||"-"}</div><small className="text-[11px] text-gray-400">{s.user_profiles?.email||""}</small></div></div></td>
                    <td className="px-4 py-3 border-b border-gray-100"><span className={"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold "+(chipCls[s.status]||"")}>{chipLabel[s.status]||s.status}</span></td>
                    <td className="px-4 py-3 border-b border-gray-100">
                      {s.status === "approved" ? (
                        <select
                          value={s.user_profiles?.role_id || 5}
                          onChange={(e) => handleChangeRole(s.user_id, Number(e.target.value))}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-navy-3 cursor-pointer"
                        >
                          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">{getRoleName(s.user_profiles?.role_id || 5)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-3 border-b border-gray-100"><button onClick={()=>{setReviewModal(s); setSelectedRoleId(s.user_profiles?.role_id || 5); setRejectReason(""); setReviewError(""); setIalChecklist({ evidenceSourceChecked: false, faceMatchChecked: false, dataConsistencyChecked: false });}} className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold hover:bg-navy-3 transition-colors border-none cursor-pointer">ตรวจสอบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {reviewModal&&(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={()=>setReviewModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[700px] max-h-[90vh] overflow-y-auto shadow-lg animate-fade-up" onClick={(e)=>e.stopPropagation()}>
            <div className="px-7 py-5 border-b border-gray-200 flex items-center gap-3.5 sticky top-0 bg-white z-10"><h3 className="text-[17px] font-bold text-navy">ตรวจสอบ KYC (IAL 2.1)</h3><span className={"ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold "+(chipCls[reviewModal.status]||"")}>{chipLabel[reviewModal.status]}</span><button onClick={()=>setReviewModal(null)} className="ml-auto w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center cursor-pointer border-none">✕</button></div>
            <div className="p-7">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200">💳 บัตรประชาชน (ด้านหน้า)</h4>
                  <div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[3/2] flex items-center justify-center overflow-hidden">
                    {reviewModal.id_card_front_url ? <img src={reviewModal.id_card_front_url} className="w-full h-full object-cover" alt="ID Front" /> : <span className="text-[40px]">💳</span>}
                  </div>
                  {reviewModal.id_card_back_url && (
                    <>
                      <h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200 mt-4">💳 บัตรประชาชน (ด้านหลัง)</h4>
                      <div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[3/2] flex items-center justify-center overflow-hidden">
                        <img src={reviewModal.id_card_back_url} className="w-full h-full object-cover" alt="ID Back" />
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200">📸 Selfie</h4>
                  <div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[4/3] flex items-center justify-center overflow-hidden">
                    {reviewModal.selfie_url ? <img src={reviewModal.selfie_url} className="w-full h-full object-cover" alt="Selfie" /> : <span className="text-[40px]">📸</span>}
                  </div>
                  <h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200 mt-4">🧬 ภาพใบหน้าจากชิปบัตร</h4>
                  <div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[4/3] flex items-center justify-center overflow-hidden">
                    {chipPhotoUrl ? <img src={chipPhotoUrl} className="w-full h-full object-cover" alt="Chip Face" /> : <span className="text-[12px] text-gray-500">ไม่พบภาพจากชิป</span>}
                  </div>
                  <h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200 mt-4">🪪 ภาพบัตรจากชิป (Generated)</h4>
                  <div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[3/2] flex items-center justify-center overflow-hidden">
                    {chipCardPreviewUrl ? <img src={chipCardPreviewUrl} className="w-full h-full object-contain" alt="Chip Card Preview" /> : <span className="text-[12px] text-gray-500">ยังไม่มีภาพบัตรจากชิป</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">{([["ชื่อ",reviewModal.user_profiles?.full_name||"-"],["อีเมล",reviewModal.user_profiles?.email||"-"],["เบอร์โทร",reviewModal.user_profiles?.phone||"-"],["วันที่ส่ง",new Date(reviewModal.created_at).toLocaleDateString("th-TH")]] as [string, string][]).map(([k,v],i)=><div key={i} className="p-1"><label className="text-[10px] text-gray-400 font-semibold block mb-0.5">{k}</label><span className="text-[13px] text-navy font-semibold">{v}</span></div>)}</div>
              <div className={"rounded-xl p-4 mb-4 border " + (hasIalEvidence ? "border-status-green bg-status-green-light" : "border-status-red bg-status-red-light")}>
                <p className="text-xs font-bold mb-2 text-navy">หลักฐาน IAL 2.1</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Proof Source</label><span className="text-[13px] font-semibold text-navy">{currentIalSubmission?.evidence_method || "-"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Proof Reference</label><span className="text-[13px] font-semibold text-navy">{currentIalSubmission?.evidence_reference || "-"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Email Confirmed At</label><span className="text-[13px] font-semibold text-navy">{currentIalSubmission?.email_confirmed_at ? new Date(currentIalSubmission.email_confirmed_at).toLocaleString("th-TH") : "-"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">ระดับ</label><span className="text-[13px] font-semibold text-navy">{currentIalSubmission?.level || "IAL2.1"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip Read Verified</label><span className="text-[13px] font-semibold text-navy">{chipReadVerified ? "ผ่าน" : "ไม่ผ่าน"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip ID Match</label><span className="text-[13px] font-semibold text-navy">{chipIdMatch ? "ตรง" : "ไม่ตรง"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip Name Match</label><span className="text-[13px] font-semibold text-navy">{chipNameMatch ? "ตรง" : "ไม่ตรง"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip DOB Match</label><span className="text-[13px] font-semibold text-navy">{chipDobMatch ? "ตรง" : "ไม่ตรง"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip Photo</label><span className="text-[13px] font-semibold text-navy">{chipPhotoPresent ? "พบภาพจากชิป" : "ไม่พบภาพจากชิป"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Contact Verified</label><span className="text-[13px] font-semibold text-navy">{contactChannelVerified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Contact Type</label><span className="text-[13px] font-semibold text-navy">{contactChannelType || "-"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Contact Verified At</label><span className="text-[13px] font-semibold text-navy">{contactVerifiedAt || "-"}</span></div>
                  <div><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">OTP Reference</label><span className="text-[13px] font-semibold text-navy">{contactOtpReference || "-"}</span></div>
                  <div className="col-span-2"><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Contact Verification ID</label><span className="text-[12px] font-semibold text-navy break-all">{contactVerificationId || "-"}</span></div>
                  <div className="col-span-2"><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip Photo URL</label><span className="text-[12px] font-semibold text-navy break-all">{chipPhotoUrl || "-"}</span></div>
                  <div className="col-span-2"><label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Chip Card Preview URL</label><span className="text-[12px] font-semibold text-navy break-all">{chipCardPreviewUrl || "-"}</span></div>
                </div>
              </div>
              {reviewModal.ocr_data && Object.values(reviewModal.ocr_data).some((v: unknown) => v) && (
                <div className="bg-navy rounded-xl p-5 mb-4">
                  <p className="text-xs font-bold text-gold-2 mb-3">ข้อมูลจากบัตร</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["ชื่อ (ไทย)",reviewModal.ocr_data.name_th],["Name (EN)",reviewModal.ocr_data.name_en],["เลขบัตร",reviewModal.ocr_data.id_number],["วันเกิด",reviewModal.ocr_data.dob],["วันหมดอายุ",reviewModal.ocr_data.expiry],["ที่อยู่",reviewModal.ocr_data.address]] as [string, string][]).filter(([,v])=>v).map(([k,v],i)=>(
                      <div key={i}><label className="text-[10px] text-gold font-semibold block mb-0.5">{k}</label><span className="text-[13px] text-white">{v}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {reviewModal.status==="pending"&&(
              <div className="px-7 py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <label className="text-[13px] font-bold text-navy whitespace-nowrap">กำหนด Role:</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                    className="flex-1 px-3 py-2 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none focus:border-navy-3 cursor-pointer"
                  >
                    {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div className="mb-4 p-3 border border-gray-200 rounded-lg bg-white">
                  <p className="text-[12px] font-bold text-navy mb-2">Checklist ก่อนอนุมัติ (IAL 2.1)</p>
                  <label className="flex items-center gap-2 text-xs text-gray-700 mb-2">
                    <input type="checkbox" checked={ialChecklist.evidenceSourceChecked} onChange={(e)=>setIalChecklist({ ...ialChecklist, evidenceSourceChecked: e.target.checked })} />
                    ตรวจสอบ Proof Source / Proof Reference แล้ว
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 mb-2">
                    <input type="checkbox" checked={ialChecklist.faceMatchChecked} onChange={(e)=>setIalChecklist({ ...ialChecklist, faceMatchChecked: e.target.checked })} />
                    เปรียบเทียบใบหน้า Selfie กับภาพจากชิปบัตรแล้ว (Visual Comparison)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={ialChecklist.dataConsistencyChecked} onChange={(e)=>setIalChecklist({ ...ialChecklist, dataConsistencyChecked: e.target.checked })} />
                    ตรวจสอบความสอดคล้องข้อมูลทั้งหมดแล้ว
                  </label>
                  {!hasIalEvidence && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ยังไม่มีข้อมูล Proof Source/Reference ใน submission</p>}
                  {!chipMethod && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ต้องใช้ Proof Source = thai_id_chip</p>}
                  {chipMethod && !chipEvidenceOk && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: หลักฐานจากชิปบัตรยังไม่ครบ (read/id/name/dob/photo/url)</p>}
                  {!contactChannelVerified && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ยังไม่ยืนยันช่องทางติดต่อ</p>}
                  {contactChannelType !== "email_otp" && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ต้องใช้ช่องทางยืนยันแบบ email_otp</p>}
                  {!contactOtpReference && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ไม่พบ OTP reference</p>}
                  {!contactVerificationId && <p className="mt-2 text-xs text-status-red font-semibold">ไม่สามารถอนุมัติได้: ไม่พบ contact verification id</p>}
                </div>
                <div className="flex gap-2.5 items-end">
                  <textarea value={rejectReason} onChange={(e)=>setRejectReason(e.target.value)} placeholder="เหตุผลในการปฏิเสธ (ถ้ามี)" className="flex-1 px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] resize-none h-[70px] outline-none focus:border-navy-3"/>
                  <button disabled={!canApprove || actionLoading} onClick={()=>handleApprove(reviewModal)} className="px-7 py-2.5 bg-status-green text-white rounded-lg text-[13px] font-bold cursor-pointer border-none whitespace-nowrap disabled:opacity-50">{actionLoading ? "กำลังบันทึก..." : "อนุมัติ"}</button>
                  <button disabled={actionLoading} onClick={()=>handleReject(reviewModal)} className="px-6 py-2.5 bg-status-red text-white rounded-lg text-[13px] font-bold cursor-pointer border-none whitespace-nowrap disabled:opacity-50">{actionLoading ? "กำลังบันทึก..." : "ปฏิเสธ"}</button>
                </div>
                {reviewError && <div className="mt-3 text-xs font-semibold text-status-red">{reviewError}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
