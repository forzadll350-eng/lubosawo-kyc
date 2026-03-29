"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, ensureEmbedSessionReady, reportKycEmbedRoute, resolveEmbedAuthState } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { goWithEmbed } from "@/lib/embed";

type RequestStatus = "submitted" | "in_review" | "completed" | "rejected" | "cancelled";

type PdpaRequest = {
  id: string;
  user_id: string;
  request_type: string;
  subject: string;
  details: string | null;
  status: RequestStatus;
  response_note: string | null;
  requested_at: string;
  responded_at: string | null;
  created_at: string;
  requester?: {
    full_name?: string | null;
    email?: string | null;
    department?: string | null;
    position?: string | null;
  } | null;
  responder?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

const STATUS_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: "submitted", label: "ส่งคำขอแล้ว" },
  { value: "in_review", label: "กำลังพิจารณา" },
  { value: "completed", label: "ดำเนินการแล้ว" },
  { value: "rejected", label: "ปฏิเสธคำขอ" },
  { value: "cancelled", label: "ยกเลิกคำขอ" },
];

const STATUS_CHIP: Record<RequestStatus, string> = {
  submitted: "bg-blue-100 text-blue-700",
  in_review: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

function normalizeDbError(message: string) {
  const m = (message || "").toLowerCase();
  if (m.includes("relation") && m.includes("pdpa_data_requests") && m.includes("does not exist")) {
    return "ยังไม่พบตาราง pdpa_data_requests กรุณารันไฟล์ SQL: supabase/sql/2026-03-12_pdpa_data_subject_rights.sql";
  }
  return message || "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล";
}

export default function AdminPrivacyRequestsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminUserId, setAdminUserId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [requests, setRequests] = useState<PdpaRequest[]>([]);
  const [selected, setSelected] = useState<PdpaRequest | null>(null);
  const [nextStatus, setNextStatus] = useState<RequestStatus>("in_review");
  const [responseNote, setResponseNote] = useState("");

  async function loadRequests() {
    const { data, error: reqError } = await supabase
      .from("pdpa_data_requests")
      .select(
        "*, requester:user_profiles!pdpa_data_requests_user_id_fkey(full_name,email,department,position), responder:user_profiles!pdpa_data_requests_responder_user_id_fkey(full_name,email)"
      )
      .order("created_at", { ascending: false });

    if (reqError) {
      setError(normalizeDbError(reqError.message));
      return;
    }
    setRequests((data || []) as PdpaRequest[]);
  }

  useEffect(() => {
    async function init() {
      const authState = await resolveEmbedAuthState(supabase);
      if (authState.status === "signed-out") {
        console.info("[KYC-EMBED] route fallback /");
        goWithEmbed(router, "/");
        return;
      }
      if (!authState.user) {
        console.info("[KYC-EMBED] auth bootstrap pending /admin/privacy-requests");
        window.setTimeout(init, 300);
        return;
      }
      const user = authState.user;
      console.info("[KYC-EMBED] route boot ok /admin/privacy-requests");
      reportKycEmbedRoute('/admin/privacy-requests');
      setAdminUserId(user.id);
      setAdminEmail(user.email || "");

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile || ![1, 2].includes(profile.role_id)) {
        goWithEmbed(router, "/dashboard");
        return;
      }

      await loadRequests();
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return filter === "all" ? requests : requests.filter((request) => request.status === filter);
  }, [filter, requests]);

  function openReview(request: PdpaRequest) {
    setSelected(request);
    if (request.status === "submitted") {
      setNextStatus("in_review");
    } else {
      setNextStatus(request.status);
    }
    setResponseNote(request.response_note || "");
    setMessage("");
    setError("");
  }

  async function submitReview() {
    if (!selected) return;
    setSaving(true);
    setError("");
    setMessage("");
    const nowIso = new Date().toISOString();

    const payload: Record<string, unknown> = {
      status: nextStatus,
      response_note: responseNote.trim() || null,
      responder_user_id: adminUserId,
    };
    if (nextStatus === "completed" || nextStatus === "rejected" || nextStatus === "cancelled") {
      payload.responded_at = nowIso;
    }

    const { error: updateError } = await supabase
      .from("pdpa_data_requests")
      .update(payload)
      .eq("id", selected.id);

    if (updateError) {
      setError(normalizeDbError(updateError.message));
      setSaving(false);
      return;
    }

    await logAudit(supabase, "pdpa.request.review", "pdpa_data_request", selected.id, {
      previous_status: selected.status,
      next_status: nextStatus,
      has_response_note: Boolean(responseNote.trim()),
    });

    setSaving(false);
    setSelected(null);
    setMessage("บันทึกผลการพิจารณาเรียบร้อยแล้ว");
    await loadRequests();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-3 border-navy/20 border-t-navy rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="w-[240px] shrink-0 bg-navy flex flex-col fixed top-0 left-0 bottom-0 z-20">
        <div className="p-5 border-b border-white/8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-2 rounded-[10px] flex items-center justify-center font-extrabold text-navy text-base shrink-0">
            ลบส
          </div>
          <div>
            <h2 className="text-white text-[13px] font-bold leading-tight">อบต.ลุโบะสาวอ</h2>
            <p className="text-gold text-[10px] opacity-80">ระบบจัดการ KYC</p>
          </div>
        </div>

        <nav className="flex-1 p-3">
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5">เมนูแอดมิน</div>
          <button
            onClick={() => goWithEmbed(router, "/admin")}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent"
          >
            <span className="text-base w-5 text-center">📋</span>ตรวจสอบ KYC
          </button>
          <button
            onClick={() => goWithEmbed(router, "/admin/users")}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent"
          >
            <span className="text-base w-5 text-center">👥</span>จัดการผู้ใช้
          </button>
          <button
            onClick={() => goWithEmbed(router, "/admin/privacy-requests")}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-bold mb-0.5 transition-all border-none cursor-pointer bg-gold/18 text-gold-2"
          >
            <span className="text-base w-5 text-center">🛡️</span>คำขอสิทธิ PDPA
            <span className="ml-auto bg-gold text-navy text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {requests.filter((request) => request.status === "submitted" || request.status === "in_review").length}
            </span>
          </button>
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5 mt-4">ลิงก์ลัด</div>
          <button
            onClick={() => goWithEmbed(router, "/dashboard")}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent"
          >
            <span className="text-base w-5 text-center">📊</span>ไป Dashboard
          </button>
        </nav>

        <div className="p-3 border-t border-white/8">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-navy-3 to-status-cyan flex items-center justify-center text-white font-bold text-[13px]">
              A
            </div>
            <div>
              <div className="text-white text-xs font-semibold">Admin</div>
              <small className="text-white/40 text-[10px]">{adminEmail}</small>
            </div>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              goWithEmbed(router, "/", true);
            }}
            className="w-full mt-2 py-2 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all border-none cursor-pointer"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="ml-[240px] flex-1">
        <div className="bg-white border-b border-gray-200 px-8 py-3.5 flex items-center sticky top-0 z-10 shadow-sm">
          <h2 className="text-base font-bold text-navy">🛡️ คำขอสิทธิของเจ้าของข้อมูล (PDPA)</h2>
        </div>

        <div className="p-7">
          <div className="grid grid-cols-5 gap-4 mb-5">
            {([
              { key: "all", label: "ทั้งหมด", icon: "📋", count: requests.length, cls: "border-t-status-cyan" },
              {
                key: "submitted",
                label: "รอรับเรื่อง",
                icon: "📨",
                count: requests.filter((request) => request.status === "submitted").length,
                cls: "border-t-blue-500",
              },
              {
                key: "in_review",
                label: "กำลังพิจารณา",
                icon: "🔍",
                count: requests.filter((request) => request.status === "in_review").length,
                cls: "border-t-orange-500",
              },
              {
                key: "completed",
                label: "ดำเนินการแล้ว",
                icon: "✅",
                count: requests.filter((request) => request.status === "completed").length,
                cls: "border-t-status-green",
              },
              {
                key: "rejected",
                label: "ปฏิเสธ",
                icon: "❌",
                count: requests.filter((request) => request.status === "rejected").length,
                cls: "border-t-status-red",
              },
            ] as Array<{ key: "all" | RequestStatus; label: string; icon: string; count: number; cls: string }>).map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={
                  "bg-white rounded-xl p-4 border border-gray-200 border-t-[3px] " +
                  item.cls +
                  " text-left shadow-sm hover:-translate-y-0.5 transition-all " +
                  (filter === item.key ? "ring-2 ring-navy/15" : "")
                }
              >
                <span className="text-xl block mb-1">{item.icon}</span>
                <div className="text-2xl font-extrabold text-navy leading-none mb-1">{item.count}</div>
                <div className="text-xs text-gray-500 font-medium">{item.label}</div>
              </button>
            ))}
          </div>

          {message && <div className="mb-4 text-xs font-semibold text-green-700">{message}</div>}
          {error && <div className="mb-4 text-xs font-semibold text-red-600">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {["ผู้ยื่นคำขอ", "ประเภทคำขอ", "หัวข้อ", "สถานะ", "วันที่ยื่น", "จัดการ"].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                      ไม่มีรายการ
                    </td>
                  </tr>
                ) : (
                  filtered.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="text-[13px] font-semibold text-navy">{request.requester?.full_name || "-"}</div>
                        <small className="text-[11px] text-gray-500">{request.requester?.email || request.user_id}</small>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-700">{request.request_type}</td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="text-[13px] font-semibold text-navy">{request.subject}</div>
                        {request.details && <small className="text-[11px] text-gray-500 line-clamp-2">{request.details}</small>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={"px-2 py-0.5 rounded-full text-[11px] font-bold " + STATUS_CHIP[request.status]}>
                          {STATUS_OPTIONS.find((option) => option.value === request.status)?.label || request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
                        {new Date(request.requested_at || request.created_at).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <button
                          onClick={() => openReview(request)}
                          className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold hover:bg-navy-3 transition-colors border-none cursor-pointer"
                        >
                          พิจารณา
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-bold text-navy">พิจารณาคำขอสิทธิ PDPA</h3>
                <p className="text-[11px] text-gray-500">{selected.requester?.full_name || selected.user_id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center cursor-pointer border-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-500 font-semibold block mb-1">ประเภทคำขอ</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-md text-sm">{selected.request_type}</div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-semibold block mb-1">วันที่ยื่น</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-md text-sm">
                    {new Date(selected.requested_at || selected.created_at).toLocaleString("th-TH")}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 font-semibold block mb-1">หัวข้อ</label>
                <div className="px-3 py-2 border border-gray-200 rounded-md text-sm">{selected.subject}</div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 font-semibold block mb-1">รายละเอียด</label>
                <div className="px-3 py-2 border border-gray-200 rounded-md text-sm whitespace-pre-wrap">
                  {selected.details || "-"}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 font-semibold block mb-1">อัปเดตสถานะ</label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as RequestStatus)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 font-semibold block mb-1">บันทึกผลการพิจารณา</label>
                <textarea
                  value={responseNote}
                  onChange={(e) => setResponseNote(e.target.value)}
                  placeholder="ระบุผลการพิจารณา เงื่อนไข หรือข้อมูลที่แจ้งกลับผู้ยื่นคำขอ"
                  className="w-full min-h-[100px] px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex gap-2">
              <button
                onClick={submitReview}
                disabled={saving}
                className="flex-1 py-2.5 bg-navy text-white rounded-lg font-semibold hover:bg-navy-3 disabled:opacity-60"
              >
                {saving ? "???????????..." : "????????"}
              </button>
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




