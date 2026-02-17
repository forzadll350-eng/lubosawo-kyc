'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'

type SignerInfo = {
  id: string
  sign_action: string
  signer_position: string
  signer_department: string
  rejection_reason: string | null
  signed_at: string
  document_hash: string
  full_name: string
  kyc_status: string
  kyc_method: string
  kyc_verified_at: string | null
}

type WorkflowStep = {
  id: string
  signer_id: string
  step_order: number
  required_action: string
  status: string
  completed_at: string | null
  signer_name: string
  signer_position: string
  signer_department: string
  signature?: SignerInfo | null
}

export default function VerifyPage() {
  const supabase = createClient()
  const params = useParams()
  const code = params.code as string

  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<any>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [signers, setSigners] = useState<SignerInfo[]>([])
  const [error, setError] = useState('')

  useEffect(() => { verify() }, [])

  async function verify() {
    try {
      // 1. หาลายเซ็นที่ตรงกับ QR code
      const { data: sig, error: sigErr } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('verification_code', code)
        .single()

      if (sigErr || !sig) {
        setError('ไม่พบข้อมูลการลงนาม หรือรหัสตรวจสอบไม่ถูกต้อง')
        return
      }

      // 2. ดึงข้อมูลเอกสาร
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', sig.document_id)
        .single()
      setDoc(docData)

      // 3. ★ ดึง workflow ทั้งหมด (รวมคนที่ยังไม่ลงนาม)
      const { data: allWf } = await supabase
        .from('signing_workflows')
        .select('*')
        .eq('document_id', sig.document_id)
        .order('step_order', { ascending: true })

      // 4. ★ ดึง document_signatures ทุกคน
      const { data: allSigs } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('document_id', sig.document_id)
        .order('signed_at', { ascending: true })

      // 5. ดึง profiles ทั้งหมด
      const allUserIds = [
        ...new Set([
          ...(allWf?.map(w => w.signer_id) || []),
          ...(allSigs?.map(s => s.signer_id) || []),
        ])
      ]

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, position, department')
        .in('id', allUserIds)
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

      // 6. ดึง KYC ทั้งหมด
      const { data: kycList } = await supabase
        .from('kyc_submissions')
        .select('user_id, status, verification_method, verified_at')
        .in('user_id', allUserIds)
        .order('created_at', { ascending: false })

      const kycMap = new Map<string, any>()
      kycList?.forEach(k => {
        if (!kycMap.has(k.user_id)) kycMap.set(k.user_id, k)
      })

      // 7. ★ Map signatures by signer_id
      const sigBySigner = new Map<string, any>()
      allSigs?.forEach(s => {
        sigBySigner.set(s.signer_id, s)
      })

      // 8. ★ สร้าง enriched steps (workflow + signature ถ้ามี)
      if (allWf && allWf.length > 0) {
        const enrichedSteps: WorkflowStep[] = allWf.map(w => {
          const profile = profileMap.get(w.signer_id)
          const sigData = sigBySigner.get(w.signer_id)
          const kyc = kycMap.get(w.signer_id)

          return {
            id: w.id,
            signer_id: w.signer_id,
            step_order: w.step_order,
            required_action: w.required_action,
            status: w.status,
            completed_at: w.completed_at,
            signer_name: profile?.full_name || '-',
            signer_position: profile?.position || '',
            signer_department: profile?.department || '',
            signature: sigData ? {
              id: sigData.id,
              sign_action: sigData.sign_action,
              signer_position: sigData.signer_position || '',
              signer_department: sigData.signer_department || '',
              rejection_reason: sigData.rejection_reason,
              signed_at: sigData.signed_at,
              document_hash: sigData.document_hash || '',
              full_name: profile?.full_name || '-',
              kyc_status: kyc?.status || 'unknown',
              kyc_method: kyc?.verification_method || 'บัตรประชาชน + Selfie',
              kyc_verified_at: kyc?.verified_at || null,
            } : null,
          }
        })
        setSteps(enrichedSteps)
      }

      // 9. เก็บ signers เดิมด้วย (สำหรับนับ)
      if (allSigs) {
        const enrichedSigs: SignerInfo[] = allSigs.map(s => {
          const profile = profileMap.get(s.signer_id)
          const kyc = kycMap.get(s.signer_id)
          return {
            id: s.id,
            sign_action: s.sign_action,
            signer_position: s.signer_position || '',
            signer_department: s.signer_department || '',
            rejection_reason: s.rejection_reason,
            signed_at: s.signed_at,
            document_hash: s.document_hash || '',
            full_name: profile?.full_name || '-',
            kyc_status: kyc?.status || 'unknown',
            kyc_method: kyc?.verification_method || 'บัตรประชาชน + Selfie',
            kyc_verified_at: kyc?.verified_at || null,
          }
        })
        setSigners(enrichedSigs)
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function viewOriginalDoc() {
    if (!doc?.file_url) return
    const { data: signed } = await supabase.storage
      .from('signed-documents')
      .createSignedUrl(doc.file_url, 300)
    if (signed?.signedUrl) { window.open(signed.signedUrl, '_blank'); return }
    const { data: orig } = await supabase.storage
      .from('official-documents')
      .createSignedUrl(doc.file_url, 300)
    if (orig?.signedUrl) window.open(orig.signedUrl, '_blank')
  }

  const completedCount = steps.filter(s => s.status === 'completed').length
  const rejectedCount = steps.filter(s => s.status === 'rejected').length
  const totalCount = steps.length
  const isFullySigned = completedCount === totalCount && totalCount > 0
  const isRejected = rejectedCount > 0

  const statusText = isRejected
    ? '❌ เอกสารถูกปฏิเสธ'
    : isFullySigned
    ? '✅ ลงนามครบทุกลำดับแล้ว'
    : `⏳ อยู่ระหว่างลงนาม (${completedCount}/${totalCount})`

  const statusColor = isRejected ? 'red' : isFullySigned ? 'green' : 'yellow'

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <span className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="mt-3 text-gray-500">กำลังตรวจสอบ...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-red-600 mb-2">ตรวจสอบไม่สำเร็จ</h1>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    </div>
  )

  return (
    <div className={`min-h-screen bg-gradient-to-b ${isRejected ? 'from-red-50' : isFullySigned ? 'from-green-50' : 'from-yellow-50'} to-white p-4`}>
      <div className="max-w-lg mx-auto">

        {/* ✅ HEADER */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-4 text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 ${
            isRejected ? 'bg-red-100' : isFullySigned ? 'bg-green-100' : 'bg-yellow-100'
          }`}>
            <span className="text-3xl">{isRejected ? '❌' : isFullySigned ? '✅' : '⏳'}</span>
          </div>
          <h1 className={`text-xl font-bold ${
            isRejected ? 'text-red-700' : isFullySigned ? 'text-green-700' : 'text-yellow-700'
          }`}>
            {isRejected ? 'เอกสารถูกปฏิเสธ' : isFullySigned ? 'เอกสารได้รับการลงนามครบแล้ว' : 'เอกสารอยู่ระหว่างการลงนาม'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">ระบบยืนยันตัวตนดิจิทัล IAL 2 — อบต.ลุโบะสาวอ</p>
        </div>

        {/* 📄 ข้อมูลเอกสาร */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">📄 ข้อมูลเอกสาร</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">ชื่อเอกสาร</span>
              <span className="font-medium text-right max-w-[60%]">{doc?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">เลขที่เอกสาร</span>
              <span className="font-medium">{doc?.document_number || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">สถานะ</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                isRejected ? 'bg-red-100 text-red-700' :
                isFullySigned ? 'bg-green-100 text-green-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {statusText}
              </span>
            </div>
          </div>

          {/* ★ Progress Bar */}
          {totalCount > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>ความคืบหน้าการลงนาม</span>
                <span>{completedCount}/{totalCount} คน</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    isRejected ? 'bg-red-500' : isFullySigned ? 'bg-green-500' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={viewOriginalDoc}
            className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            📥 ดูเอกสารฉบับล่าสุด
          </button>
        </div>

        {/* ★ ลำดับการลงนาม (Timeline จาก workflow) */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            📋 ลำดับการลงนาม ({completedCount}/{totalCount})
          </h2>

          <div className="space-y-0">
            {steps.map((step, i) => {
              const isDone = step.status === 'completed'
              const isRej = step.status === 'rejected'
              const isPending = step.status === 'pending'
              const isCurrent = isPending && !steps.slice(0, i).some(s => s.status === 'pending')
              const isLast = i === steps.length - 1

              const actionText = step.required_action === 'sign' ? '✍️ ลงนาม'
                : step.required_action === 'approve' ? '👍 อนุมัติ'
                : '🔍 ตรวจสอบ'

              return (
                <div key={step.id}>
                  <div className={"rounded-lg p-4 " +
                    (isDone ? "bg-green-50 border border-green-200" :
                     isRej ? "bg-red-50 border border-red-200" :
                     isCurrent ? "bg-blue-50 border border-blue-200" :
                     "bg-gray-50 border border-gray-200")
                  }>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 " +
                          (isDone ? "bg-green-100 border-green-500 text-green-700" :
                           isRej ? "bg-red-100 border-red-500 text-red-700" :
                           isCurrent ? "bg-blue-100 border-blue-500 text-blue-700" :
                           "bg-gray-100 border-gray-300 text-gray-400")}>
                          {isDone ? "✓" : isRej ? "✗" : step.step_order}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{step.signer_name}</p>
                          {step.signer_position && <p className="text-xs text-gray-500">{step.signer_position}</p>}
                          {step.signer_department && <p className="text-xs text-gray-500">{step.signer_department}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={"px-2 py-0.5 rounded-full text-xs font-bold " +
                          (isDone ? "bg-green-100 text-green-700" :
                           isRej ? "bg-red-100 text-red-700" :
                           isCurrent ? "bg-blue-100 text-blue-700" :
                           "bg-gray-100 text-gray-500")}>
                          {isDone ? "✅ เสร็จแล้ว" : isRej ? "❌ ปฏิเสธ" : isCurrent ? "⏳ กำลังรอ" : "🔒 รอคิว"}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{actionText}</p>
                      </div>
                    </div>

                    {/* ถ้าลงนามแล้ว — แสดงรายละเอียด */}
                    {step.signature && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-gray-400">
                          🕐 {new Date(step.signature.signed_at).toLocaleString('th-TH', {
                            year: 'numeric', month: 'long', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>

                        {/* Hash */}
                        {step.signature.document_hash && (
                          <div className="bg-white rounded p-2">
                            <p className="text-[10px] text-gray-400 mb-0.5">Document Hash (SHA-256)</p>
                            <p className="font-mono text-[10px] text-gray-500 break-all">{step.signature.document_hash}</p>
                          </div>
                        )}

                        {/* KYC */}
                        <div className="bg-white rounded p-2 flex items-center justify-between">
                          <span className="text-xs text-gray-500">🔐 KYC IAL 2</span>
                          <span className={"px-2 py-0.5 rounded-full text-xs font-bold " +
                            (step.signature.kyc_status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700')
                          }>
                            {step.signature.kyc_status === 'approved' ? '✅ ผ่าน' : '⏳ รอตรวจ'}
                          </span>
                        </div>

                        {/* เหตุผลปฏิเสธ */}
                        {step.signature.rejection_reason && (
                          <p className="text-red-600 text-xs bg-red-100 p-2 rounded">
                            เหตุผล: {step.signature.rejection_reason}
                          </p>
                        )}
                      </div>
                    )}

                    {/* ถ้ายังไม่ลงนาม */}
                    {!step.signature && isPending && (
                      <p className="text-xs text-gray-400 mt-1">
                        {isCurrent ? '⏳ รอผู้ลงนามดำเนินการ...' : '🔒 รอลำดับก่อนหน้าเสร็จก่อน'}
                      </p>
                    )}
                  </div>

                  {/* เส้นเชื่อม */}
                  {!isLast && (
                    <div className="flex justify-center py-1">
                      <div className={"w-0.5 h-4 " + (isDone ? "bg-green-400" : "bg-gray-200")} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 🔐 IAL 2 */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">🔐 การยืนยันตัวตน (IAL 2)</h2>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>IAL 2 (Identity Assurance Level 2)</strong> หมายถึง ผู้ลงนามทุกคนได้ผ่านการยืนยันตัวตนขั้นสูง
              ด้วยเอกสารราชการ (บัตรประชาชน) และภาพถ่ายยืนยันตัวตน (Selfie)
              ผ่านระบบ KYC ของ อบต.ลุโบะสาวอ ซึ่งเป็นไปตามมาตรฐาน NIST SP 800-63A
            </p>
          </div>
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">
              <strong>🔗 การลงนามตามลำดับ</strong> — เอกสารนี้ถูกลงนามตามลำดับที่กำหนด 
              โดยผู้ลงนามแต่ละคนจะลงนามบนไฟล์ที่มีลายเซ็นก่อนหน้าแล้ว 
              Document Hash (SHA-256) แต่ละรอบสามารถใช้ตรวจสอบความถูกต้องได้
            </p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-xs text-gray-400 py-4">
          <p>ระบบเอกสารดิจิทัล — องค์การบริหารส่วนตำบลลุโบะสาวอ</p>
          <p>รหัสตรวจสอบ: {code}</p>
          <p className="mt-1">ตรวจสอบเมื่อ: {new Date().toLocaleString('th-TH')}</p>
        </div>
      </div>
    </div>
  )
}
