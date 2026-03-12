"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type RequestType =
  | "access"
  | "rectification"
  | "erasure"
  | "withdraw_consent"
  | "portability"
  | "objection"
  | "restriction";

type RequestStatus = "submitted" | "in_review" | "completed" | "rejected" | "cancelled";

type PdpaRequest = {
  id: string;
  request_type: RequestType;
  subject: string;
  details: string | null;
  status: RequestStatus;
  response_note: string | null;
  requested_at: string;
  responded_at: string | null;
  created_at: string;
};

const REQUEST_TYPE_OPTIONS: Array<{
  value: RequestType;
  label: string;
  defaultSubject: string;
}> = [
  { value: "access", label: "ขอเข้าถึงข้อมูลส่วนบุคคล", defaultSubject: "คำขอเข้าถึงข้อมูลส่วนบุคคล" },
  { value: "rectification", label: "ขอแก้ไขข้อมูล", defaultSubject: "คำขอแก้ไขข้อมูลส่วนบุคคล" },
  { value: "erasure", label: "ขอลบข้อมูล", defaultSubject: "คำขอลบข้อมูลส่วนบุคคล" },
  { value: "withdraw_consent", label: "เพิกถอนความยินยอม", defaultSubject: "คำขอเพิกถอนความยินยอม" },
  { value: "portability", label: "ขอโอนย้ายข้อมูล", defaultSubject: "คำขอโอนย้ายข้อมูลส่วนบุคคล" },
  { value: "objection", label: "คัดค้านการประมวลผล", defaultSubject: "คำขอคัดค้านการประมวลผลข้อมูล" },
  { value: "restriction", label: "ขอจำกัดการใช้ข้อมูล", defaultSubject: "คำขอจำกัดการประมวลผลข้อมูล" },
];

const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "ส่งคำขอแล้ว",
  in_review: "กำลังพิจารณา",
  completed: "ดำเนินการแล้ว",
  rejected: "ปฏิเสธคำขอ",
  cancelled: "ยกเลิกคำขอ",
};

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

export default function PrivacyRightsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [requests, setRequests] = useState<PdpaRequest[]>([]);
  const [requestType, setRequestType] = useState<RequestType>("access");
  const [subject, setSubject] = useState(REQUEST_TYPE_OPTIONS[0].defaultSubject);
  const [details, setDetails] = useState("");

  async function loadRequests(uid?: string) {
    const targetUserId = uid || userId;
    if (!targetUserId) return;

    const { data, error: reqError } = await supabase
      .from("pdpa_data_requests")
      .select("id,request_type,subject,details,status,response_note,requested_at,responded_at,created_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (reqError) {
      setError(normalizeDbError(reqError.message));
      return;
    }
    setRequests((data || []) as PdpaRequest[]);
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }
      setUserId(user.id);
      await loadRequests(user.id);
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitRequest() {
    setError("");
    setMessage("");
    if (!subject.trim()) {
      setError("กรุณาระบุหัวข้อคำขอ");
      return;
    }
    if (!userId) {
      setError("ไม่พบผู้ใช้ที่เข้าสู่ระบบ");
      return;
    }

    setSaving(true);
    const payload = {
      user_id: userId,
      request_type: requestType,
      subject: subject.trim(),
      details: details.trim() || null,
      status: "submitted",
    };

    const { data, error: insertError } = await supabase
      .from("pdpa_data_requests")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      setError(normalizeDbError(insertError.message));
      setSaving(false);
      return;
    }

    const requestId = String(data?.id || "");
    if (requestId) {
      await logAudit(supabase, "pdpa.request.create", "pdpa_data_request", requestId, {
        request_type: requestType,
        subject: subject.trim(),
      });
    }

    setDetails("");
    setMessage("ส่งคำขอเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการตามขั้นตอน");
    await loadRequests();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-3 border-navy/20 border-t-navy rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">สิทธิของเจ้าของข้อมูล (PDPA)</h1>
          <p className="text-xs text-gray-500">ส่งคำขอเกี่ยวกับข้อมูลส่วนบุคคลและติดตามสถานะ</p>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 bg-white border border-gray-200 rounded-md text-sm font-semibold text-gray-700 hover:border-navy-3"
        >
          กลับหน้า Dashboard
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-navy mb-3">ยื่นคำขอใหม่</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold block mb-1">ประเภทคำขอ</label>
              <select
                value={requestType}
                onChange={(e) => {
                  const next = e.target.value as RequestType;
                  const found = REQUEST_TYPE_OPTIONS.find((o) => o.value === next);
                  setRequestType(next);
                  setSubject(found?.defaultSubject || "");
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3"
              >
                {REQUEST_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold block mb-1">หัวข้อคำขอ</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold block mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="ระบุข้อมูลเพิ่มเติม เช่น รายการข้อมูลที่ต้องการ, เหตุผล หรือช่วงเวลาที่เกี่ยวข้อง"
              className="w-full min-h-[100px] px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-navy-3 resize-none"
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={submitRequest}
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-br from-navy-2 to-navy-3 text-white rounded-md text-sm font-bold disabled:opacity-60"
            >
              {saving ? "กำลังส่ง..." : "ส่งคำขอ"}
            </button>
            <span className="text-[11px] text-gray-500">ช่องทางนี้รองรับสิทธิ: เข้าถึง/แก้ไข/ลบ/เพิกถอนความยินยอม/โอนย้าย/คัดค้าน/จำกัดการใช้ข้อมูล</span>
          </div>
          {message && <p className="mt-3 text-xs font-semibold text-green-700">{message}</p>}
          {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-navy mb-3">ประวัติคำขอของฉัน</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-gray-500">ยังไม่มีคำขอ</p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-navy">{request.subject}</p>
                      <p className="text-xs text-gray-500">
                        ประเภท: {REQUEST_TYPE_OPTIONS.find((option) => option.value === request.request_type)?.label || request.request_type}
                      </p>
                    </div>
                    <span className={"px-2 py-0.5 rounded-full text-[11px] font-bold " + STATUS_CHIP[request.status]}>
                      {STATUS_LABEL[request.status]}
                    </span>
                  </div>
                  {request.details && <p className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">{request.details}</p>}
                  {request.response_note && (
                    <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
                      <strong>ผลการพิจารณา:</strong> {request.response_note}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-gray-500">
                    วันที่ยื่น: {new Date(request.requested_at || request.created_at).toLocaleString("th-TH")}
                    {request.responded_at ? ` | วันที่ตอบกลับ: ${new Date(request.responded_at).toLocaleString("th-TH")}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

