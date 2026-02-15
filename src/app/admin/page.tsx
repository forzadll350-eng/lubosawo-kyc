"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { router.push("/"); return; }
    setUser(u);
    const { data: subs } = await supabase.from("kyc_submissions").select("*, user_profiles(full_name, email, phone)").order("created_at", { ascending: false });
    if (subs) {
      setSubmissions(subs);
      setStats({ pending: subs.filter(s => s.status === "pending").length, approved: subs.filter(s => s.status === "approved").length, rejected: subs.filter(s => s.status === "rejected").length, total: subs.length });
    }
    setLoading(false);
  }

  async function handleApprove(id) {
    await supabase.from("kyc_submissions").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", id);
    setReviewModal(null); loadData();
  }

  async function handleReject(id) {
    if (!rejectReason.trim()) { alert("กรุณาระบุเหตุผล"); return; }
    await supabase.from("kyc_submissions").update({ status: "rejected", reject_reason: rejectReason, reviewed_at: new Date().toISOString() }).eq("id", id);
    setReviewModal(null); setRejectReason(""); loadData();
  }

  async function handleLogout() { await supabase.auth.signOut(); router.push("/"); }

  const filtered = filter === "all" ? submissions : submissions.filter(s => s.status === filter);
  const chipCls = { pending: "bg-status-orange-light text-status-orange", approved: "bg-status-green-light text-status-green", rejected: "bg-status-red-light text-status-red" };
  const chipLabel = { pending: "รอตรวจสอบ", approved: "อนุมัติ", rejected: "ปฏิเสธ" };

  if (loading) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><span className="inline-block w-8 h-8 border-3 border-navy/20 border-t-navy rounded-full animate-spin" /></div>;

  return (
    <div className="flex min-h-screen">
      <div className="w-[240px] shrink-0 bg-navy flex flex-col fixed top-0 left-0 bottom-0 z-20">
        <div className="p-5 border-b border-white/8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-2 rounded-[10px] flex items-center justify-center font-extrabold text-navy text-base shrink-0">ลบส</div>
          <div><h2 className="text-white text-[13px] font-bold leading-tight">อบต.ลุโบะสาวอ</h2><p className="text-gold text-[10px] opacity-80">ระบบจัดการ KYC</p></div>
        </div>
        <nav className="flex-1 p-3">
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5">เมนูหลัก</div>
          {[{icon:"📋",label:"คิวตรวจสอบ",f:"pending",badge:stats.pending},{icon:"📊",label:"ทั้งหมด",f:"all"},{icon:"✅",label:"อนุมัติแล้ว",f:"approved"},{icon:"❌",label:"ปฏิเสธ",f:"rejected"}].map(n=>(
            <button key={n.f} onClick={()=>setFilter(n.f)} className={"flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer "+(filter===n.f?"bg-gold/18 text-gold-2 font-bold":"text-white/65 hover:bg-white/7 hover:text-white bg-transparent")}>
              <span className="text-base w-5 text-center">{n.icon}</span>{n.label}
              {n.badge>0&&<span className="ml-auto bg-status-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span>}
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
              <thead><tr className="bg-gray-50">{["ผู้สมัคร","สถานะ","วันที่ส่ง","จัดการ"].map(h=><th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length===0?<tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">ไม่มีรายการ</td></tr>:filtered.map(s=>(
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border-b border-gray-100"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-2 to-navy-3 flex items-center justify-center text-white font-bold text-xs shrink-0">{(s.user_profiles?.full_name||"U")[0]}</div><div><div className="text-[13px] font-semibold text-navy">{s.user_profiles?.full_name||"-"}</div><small className="text-[11px] text-gray-400">{s.user_profiles?.email||""}</small></div></div></td>
                    <td className="px-4 py-3 border-b border-gray-100"><span className={"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold "+(chipCls[s.status]||"")}>{chipLabel[s.status]||s.status}</span></td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString("th-TH")}</td>
                    <td className="px-4 py-3 border-b border-gray-100"><button onClick={()=>setReviewModal(s)} className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold hover:bg-navy-3 transition-colors border-none cursor-pointer">ตรวจสอบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {reviewModal&&(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={()=>setReviewModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[700px] max-h-[90vh] overflow-y-auto shadow-lg animate-fade-up" onClick={e=>e.stopPropagation()}>
            <div className="px-7 py-5 border-b border-gray-200 flex items-center gap-3.5 sticky top-0 bg-white z-10"><h3 className="text-[17px] font-bold text-navy">ตรวจสอบ KYC</h3><span className={"ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold "+(chipCls[reviewModal.status]||"")}>{chipLabel[reviewModal.status]}</span><button onClick={()=>setReviewModal(null)} className="ml-auto w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center cursor-pointer border-none">✕</button></div>
            <div className="p-7">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div><h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200">💳 บัตรประชาชน</h4><div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[3/2] flex items-center justify-center text-[40px]">💳</div></div>
                <div><h4 className="text-[13px] font-bold text-navy mb-3 pb-2 border-b border-gray-200">📸 Selfie</h4><div className="rounded-[10px] border-2 border-gray-200 bg-gray-100 aspect-[4/3] flex items-center justify-center text-[40px]">📸</div></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">{[["ชื่อ",reviewModal.user_profiles?.full_name||"-"],["อีเมล",reviewModal.user_profiles?.email||"-"],["เบอร์โทร",reviewModal.user_profiles?.phone||"-"],["วันที่ส่ง",new Date(reviewModal.created_at).toLocaleDateString("th-TH")]].map(([k,v],i)=><div key={i} className="p-1"><label className="text-[10px] text-gray-400 font-semibold block mb-0.5">{k}</label><span className="text-[13px] text-navy font-semibold">{v}</span></div>)}</div>
            </div>
            {reviewModal.status==="pending"&&(
              <div className="flex gap-2.5 px-7 py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl items-end">
                <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="เหตุผลในการปฏิเสธ (ถ้ามี)" className="flex-1 px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] resize-none h-[70px] outline-none focus:border-navy-3"/>
                <button onClick={()=>handleApprove(reviewModal.id)} className="px-7 py-2.5 bg-status-green text-white rounded-lg text-[13px] font-bold cursor-pointer border-none whitespace-nowrap">อนุมัติ</button>
                <button onClick={()=>handleReject(reviewModal.id)} className="px-6 py-2.5 bg-status-red text-white rounded-lg text-[13px] font-bold cursor-pointer border-none whitespace-nowrap">ปฏิเสธ</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
