"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { usePinLock } from "@/components/pin/PinProvider";

export default function UserDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const { resetPin } = usePinLock();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState("not_submitted");
  const [kycDate, setKycDate] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ★ สถิติ ★
  const [docCount, setDocCount] = useState(0);
  const [pendingSignCount, setPendingSignCount] = useState(0);
  const [completedSignCount, setCompletedSignCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/"); return; }
      setUser(u);

      const { data: p } = await supabase.from("user_profiles").select("*, roles(name)").eq("id", u.id).maybeSingle();
      if (p) setProfile(p);

      const { data: kyc } = await supabase.from("kyc_submissions").select("*").eq("user_id", u.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (kyc) {
        setKycStatus(kyc.status);
        setKycDate(kyc.created_at);
      }

      const { data: sig } = await supabase.from("user_signatures").select("signature_url").eq("user_id", u.id).eq("is_active", true).maybeSingle();
      if (sig?.signature_url) setSignatureUrl(sig.signature_url);

      const { count: dCount } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", u.id);
      setDocCount(dCount || 0);

      const { count: pCount } = await supabase.from("signing_workflows").select("id", { count: "exact", head: true }).eq("signer_id", u.id).eq("status", "pending");
      setPendingSignCount(pCount || 0);

      const { count: cCount } = await supabase.from("signing_workflows").select("id", { count: "exact", head: true }).eq("signer_id", u.id).eq("status", "completed");
      setCompletedSignCount(cCount || 0);

      setLoading(false);
    }
    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleChangePin() {
    const password = prompt('กรุณาใส่รหัสผ่านเพื่อยืนยันตัวตน:');
    if (!password) return;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: password,
      });

      if (error) {
        alert('❌ รหัสผ่านไม่ถูกต้อง');
        return;
      }

      resetPin();
    } catch {
      alert('❌ เกิดข้อผิดพลาด');
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <span className="inline-block w-8 h-8 border-3 border-navy/20 border-t-navy rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const firstName = displayName.split(" ")[0];
  const initial = displayName[0]?.toUpperCase() || "U";

  const ROLES: Record<number, { label: string; color: string }> = {
    1: { label: "Super Admin", color: "bg-purple-100 text-purple-700" },
    2: { label: "Admin", color: "bg-blue-100 text-blue-700" },
    3: { label: "เจ้าหน้าที่", color: "bg-green-100 text-green-700" },
    4: { label: "ผู้ลงนาม", color: "bg-yellow-100 text-yellow-700" },
    5: { label: "ผู้ดู", color: "bg-gray-100 text-gray-600" },
  };
  const userRole = ROLES[profile?.role_id] || ROLES[5];

  const statusConfig: Record<string, { label: string; chip: string; icon: string }> = {
    not_submitted: { label: "ยังไม่ส่ง KYC", chip: "bg-gray-100 text-gray-500", icon: "⏳" },
    pending: { label: "รอตรวจสอบ", chip: "bg-status-orange-light text-status-orange", icon: "🔄" },
    reviewing: { label: "กำลังตรวจสอบ", chip: "bg-status-cyan-light text-[#007b99]", icon: "🔍" },
    approved: { label: "อนุมัติแล้ว", chip: "bg-status-green-light text-status-green", icon: "✅" },
    rejected: { label: "ปฏิเสธ", chip: "bg-status-red-light text-status-red", icon: "❌" },
  };
  const sc = statusConfig[kycStatus] || statusConfig.not_submitted;

  const timelineSteps = [
    { label: "สมัครสมาชิก", done: true },
    { label: "ยืนยันอีเมล", done: true },
    { label: "ส่ง KYC", done: kycStatus !== "not_submitted" },
    { label: "ตรวจสอบ", done: kycStatus === "approved" || kycStatus === "reviewing", active: kycStatus === "pending" || kycStatus === "reviewing" },
    { label: "อนุมัติ", done: kycStatus === "approved" },
  ];

  const quickLinks = [
    { icon: "📄", label: "เอกสารของฉัน", desc: "สร้าง/อัปโหลดเอกสาร", path: "/dashboard/documents", color: "from-blue-500 to-blue-600" },
    { icon: "✍️", label: "งานลงนาม", desc: "เอกสารที่รอลงนาม", path: "/dashboard/signing", color: "from-orange-500 to-orange-600" },
    { icon: "📜", label: "บันทึกกิจกรรม", desc: "ประวัติการดำเนินการ", path: "/dashboard/audit-log", color: "from-purple-500 to-purple-600" },
  ];

  const stats = [
    { icon: "📄", label: "เอกสารของฉัน", value: docCount, color: "text-blue-600", bg: "bg-blue-50" },
    { icon: "⏳", label: "รอลงนาม", value: pendingSignCount, color: "text-orange-600", bg: "bg-orange-50" },
    { icon: "✅", label: "ลงนามแล้ว", value: completedSignCount, color: "text-green-600", bg: "bg-green-50" },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* TOPBAR */}
      <div className="bg-navy px-10 py-3.5 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] bg-gradient-to-br from-gold to-gold-2 rounded-[9px] flex items-center justify-center font-extrabold text-navy text-sm">ลบส</div>
          <div>
            <span className="text-white font-bold text-[15px]">อบต.ลุโบะสาวอ</span>
            <small className="block text-gold text-[11px] opacity-85">ระบบยืนยันตัวตนดิจิทัล</small>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-3 to-status-cyan flex items-center justify-center text-white font-bold text-sm">{initial}</div>
          <div className="text-white">
            <span className="text-[13px] font-semibold block">{displayName}</span>
            <div className="flex items-center gap-2">
              <small className="text-white/50 text-[11px]">{user?.email}</small>
              <span className={"px-1.5 py-0.5 rounded-full text-[10px] font-bold " + userRole.color}>{userRole.label}</span>
            </div>
          </div>
          <button onClick={handleChangePin} className="bg-white/8 border border-white/15 text-white px-3.5 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/14 transition-colors">🔐 เปลี่ยน PIN</button>
          <button onClick={handleLogout} className="bg-white/8 border border-white/15 text-white px-3.5 py-1.5 rounded-md text-xs cursor-pointer hover:bg-white/14 transition-colors">ออกจากระบบ</button>
        </div>
      </div>

      {/* BODY */}
      <div className="p-8 max-w-[1080px] mx-auto">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-navy">สวัสดี, {firstName} 👋</h2>
          <p className="text-[13px] text-gray-400">ระบบยืนยันตัวตน IAL 2 — ดูสถานะและจัดการข้อมูลของคุณ</p>
        </div>

        {/* ★ สถิติ ★ */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className={"w-12 h-12 rounded-xl flex items-center justify-center text-xl " + s.bg}>{s.icon}</div>
              <div>
                <div className={"text-2xl font-extrabold " + s.color}>{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* IAL STATUS CARD */}
        <div className="bg-white rounded-[14px] border border-gray-200 p-7 mb-6 flex items-center gap-6 shadow-sm">
          <div className={"w-20 h-20 shrink-0 rounded-full flex flex-col items-center justify-center font-extrabold border-3 " + (kycStatus === "approved" ? "bg-status-green-light border-status-green" : "bg-status-orange-light border-status-orange")}>
            <div className={"text-[28px] " + (kycStatus === "approved" ? "text-status-green" : "text-status-orange")}>2</div>
            <div className={"text-[10px] font-bold " + (kycStatus === "approved" ? "text-status-green" : "text-status-orange")}>IAL</div>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-bold text-navy mb-1">
              {kycStatus === "approved" ? "ยืนยันตัวตนสำเร็จ" : kycStatus === "not_submitted" ? "ยังไม่ได้ยืนยันตัวตน" : kycStatus === "rejected" ? "การยืนยันถูกปฏิเสธ" : "อยู่ระหว่างดำเนินการ"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-2.5">
              {kycStatus === "approved" ? "คุณผ่านการยืนยันตัวตน IAL 2 เรียบร้อยแล้ว" : kycStatus === "not_submitted" ? "กรุณาส่งข้อมูล KYC เพื่อเริ่มกระบวนการยืนยันตัวตน" : kycStatus === "rejected" ? "กรุณาตรวจสอบข้อมูลและส่ง KYC ใหม่อีกครั้ง" : "เจ้าหน้าที่กำลังตรวจสอบข้อมูลของคุณ โปรดรอ 1-2 วัน"}
            </p>

            <div className="flex gap-2 items-center flex-wrap">
              {timelineSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={"w-7 h-7 rounded-full flex items-center justify-center text-[13px] shrink-0 border-2 " + (s.done ? "bg-status-green-light border-status-green" : s.active ? "bg-status-orange-light border-status-orange" : "bg-gray-100 border-gray-200")}>
                    {s.done ? "✓" : i + 1}
                  </div>
                  <span className={"text-[11px] font-medium whitespace-nowrap " + (s.done ? "text-status-green" : s.active ? "text-status-orange" : "text-gray-400")}>{s.label}</span>
                  {i < timelineSteps.length - 1 && <div className={"h-0.5 w-6 " + (s.done ? "bg-status-green" : "bg-gray-200")} />}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 text-center">
            {(kycStatus === "not_submitted" || kycStatus === "rejected") && (
              <button onClick={() => router.push("/kyc")} className="px-6 py-2.5 bg-gradient-to-br from-gold to-gold-2 text-navy font-bold text-[13px] rounded-md shadow-gold hover:-translate-y-0.5 transition-all">
                {kycStatus === "rejected" ? "ส่ง KYC ใหม่" : "เริ่มยืนยัน KYC"}
              </button>
            )}
            {(kycStatus === "pending" || kycStatus === "reviewing") && (
              <div className="text-[12px] text-gray-400">
                <div className="text-[22px] mb-1">📄</div>
                ส่งข้อมูลแล้ว
                {kycDate && <div className="text-[10px] mt-1">{new Date(kycDate).toLocaleDateString("th-TH")}</div>}
              </div>
            )}
          </div>
        </div>

        {/* QUICK LINKS */}
        <div className="grid grid-cols-3 gap-5 mb-6">
          {quickLinks.map((link, i) => (
            <button
              key={i}
              onClick={() => router.push(link.path)}
              className="bg-white rounded-[14px] p-5 border border-gray-200 shadow-sm hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className={"w-10 h-10 rounded-lg bg-gradient-to-br " + link.color + " flex items-center justify-center text-white text-lg mb-3"}>{link.icon}</div>
              <h4 className="text-sm font-bold text-navy mb-1 group-hover:text-blue-600 transition-colors">{link.label}</h4>
              <p className="text-[12px] text-gray-400">{link.desc}</p>
            </button>
          ))}
        </div>

        {/* INFO CARDS GRID */}
        <div className="grid grid-cols-3 gap-5">
          <div className="bg-white rounded-[14px] p-6 border border-gray-200 shadow-sm">
            <h4 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">👤 ข้อมูลส่วนตัว</h4>
            <div className="space-y-0">
              {[
                ["ชื่อ-สกุล", profile?.full_name || "-"],
                ["อีเมล", user?.email || "-"],
                ["แผนก", profile?.department || "-"],
                ["ตำแหน่ง", profile?.position || "-"],
                ["Role", null],
                ["วันที่สมัคร", user?.created_at ? new Date(user.created_at).toLocaleDateString("th-TH") : "-"],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                  <span className="text-xs text-gray-400">{k}</span>
                  {v !== null ? (
                    <span className="text-[13px] text-navy font-semibold max-w-[55%] text-right truncate">{v}</span>
                  ) : (
                    <span className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold " + userRole.color}>{userRole.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[14px] p-6 border border-gray-200 shadow-sm">
            <h4 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">🔐 ข้อมูล KYC</h4>
            <div className="space-y-0">
              {[
                ["ระดับ IAL", "IAL 2 (ยืนยันตัวตนขั้นสูง)"],
                ["วิธียืนยัน", "บัตรประชาชน + Selfie"],
                ["สถานะ KYC", null],
                ["วันที่ส่ง", kycDate ? new Date(kycDate).toLocaleDateString("th-TH") : "-"],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                  <span className="text-xs text-gray-400">{k}</span>
                  {v !== null ? (
                    <span className="text-[13px] text-navy font-semibold">{v}</span>
                  ) : (
                    <span className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold " + sc.chip}>{sc.icon} {sc.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[14px] p-6 border border-gray-200 shadow-sm flex flex-col">
            <h4 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">✍️ ลายเซ็นดิจิทัล</h4>
            {signatureUrl ? (
              <div className="flex-1 flex items-center justify-center border border-gray-100 rounded-lg bg-gray-50 p-3 mb-4">
                <img src={signatureUrl} alt="ลายเซ็น" className="max-h-20 object-contain" />
              </div>
            ) : (
              <p className="text-[13px] text-gray-400 mb-4 flex-1">ยังไม่มีลายเซ็น กรุณาอัปโหลด</p>
            )}
            <div className="mt-auto">
              <button
                onClick={() => router.push("/dashboard/signature")}
                className="w-full px-4 py-2.5 bg-gradient-to-br from-navy to-navy-3 text-white font-bold text-[13px] rounded-md hover:-translate-y-0.5 transition-all"
              >
                {signatureUrl ? "เปลี่ยนลายเซ็น" : "อัปโหลดลายเซ็น"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
