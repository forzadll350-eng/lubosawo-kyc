"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function VerifyPage() {
  const supabase = createClient();
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);

  async function handleVerify() {
    if (!searchId.trim()) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);

    const { data } = await supabase
      .from("kyc_submissions")
      .select("*, user_profiles(full_name, email)")
      .or("id.eq." + searchId.trim() + ",user_id.eq." + searchId.trim())
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();

    if (data) {
      setResult(data);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-12 max-w-[520px] w-full shadow-lg text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-navy-2 to-navy-3 rounded-full flex items-center justify-center text-[28px] mx-auto mb-6 shadow-[0_8px_24px_rgba(17,34,64,0.25)]">🔍</div>
        <h2 className="text-[22px] font-bold text-navy mb-2">ตรวจสอบใบรับรอง</h2>
        <p className="text-[13px] text-gray-400 mb-7">กรอกรหัสอ้างอิงหรือ User ID เพื่อตรวจสอบสถานะการยืนยันตัวตน</p>

        <div className="flex gap-2.5 mb-5">
          <input
            type="text"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
            placeholder="กรอกรหัสอ้างอิง หรือ User ID"
            className="flex-1 px-4 py-3 border-[1.5px] border-gray-200 rounded-lg text-sm outline-none focus:border-navy-3 transition-colors"
          />
          <button
            onClick={handleVerify}
            disabled={loading || !searchId.trim()}
            className="px-6 py-3 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-lg text-sm font-bold border-none cursor-pointer shadow-[0_4px_14px_rgba(17,34,64,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "ตรวจสอบ"}
          </button>
        </div>

        {result && (
          <div className="mt-5 rounded-xl p-5 bg-status-green-light border-[1.5px] border-status-green text-left animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-status-green rounded-full flex items-center justify-center text-white text-xl">✓</div>
              <div>
                <h3 className="text-base font-bold text-status-green">ยืนยันตัวตนสำเร็จ</h3>
                <p className="text-xs text-status-green/70">IAL Level 2 — ผ่านการตรวจสอบแล้ว</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] text-status-green/60 font-semibold block mb-0.5">ชื่อ-นามสกุล</label>
                <span className="text-[13px] text-navy font-semibold">{result.user_profiles?.full_name || "-"}</span>
              </div>
              <div>
                <label className="text-[10px] text-status-green/60 font-semibold block mb-0.5">ระดับ IAL</label>
                <span className="text-[13px] text-navy font-semibold">IAL 2</span>
              </div>
              <div>
                <label className="text-[10px] text-status-green/60 font-semibold block mb-0.5">วันที่อนุมัติ</label>
                <span className="text-[13px] text-navy font-semibold">{result.reviewed_at ? new Date(result.reviewed_at).toLocaleDateString("th-TH") : "-"}</span>
              </div>
              <div>
                <label className="text-[10px] text-status-green/60 font-semibold block mb-0.5">สถานะ</label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-status-green text-white">✓ อนุมัติแล้ว</span>
              </div>
            </div>
            <div className="bg-white/60 rounded-lg p-3 font-mono text-[11px] text-status-green/80 break-all">
              <label className="text-[10px] text-status-green/50 block mb-1 font-sans font-semibold">Reference ID</label>
              {result.id}
            </div>
          </div>
        )}

        {notFound && (
          <div className="mt-5 rounded-xl p-5 bg-status-red-light border-[1.5px] border-status-red text-left animate-fade-up">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-status-red rounded-full flex items-center justify-center text-white text-xl">✕</div>
              <div>
                <h3 className="text-base font-bold text-status-red">ไม่พบข้อมูล</h3>
                <p className="text-xs text-status-red/70">ไม่พบใบรับรองที่ตรงกับรหัสนี้ หรือยังไม่ได้รับการอนุมัติ</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-gray-100">
          <a href="/" className="text-[13px] text-navy-3 font-semibold hover:underline cursor-pointer">← กลับหน้าหลัก</a>
        </div>

        <p className="text-[11px] text-gray-300 mt-6">© 2569 องค์การบริหารส่วนตำบลลุโบะสาวอ · Product by Alif Doloh</p>
      </div>
    </div>
  );
}
