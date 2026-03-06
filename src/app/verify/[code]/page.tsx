'use client'

import { useState, useEffect, useRef } from 'react'
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

// คำนวณ SHA-256 จากไฟล์ (ฝั่ง client)
async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
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

  // Hash verification state
  const [hashChecking, setHashChecking] = useState(false)
  const [hashResult, setHashResult] = useState<null | {
    match: boolean
    uploadedHash: string
    matchedStep?: number
    matchedName?: string
    matchType?: string
  }>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    verify()
  }, [])

  async function verify() {
    try {
      // 1) หาข้อมูล signature จาก verification_code
      const { data: sig, error: sigErr } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('verification_code', code)
        .single()

      if (sigErr || !sig) {
        setError('ไม่พบข้อมูลการลงนาม หรือรหัสตรวจสอบไม่ถูกต้อง')
        return
      }

      // 2) ดึงข้อมูลเอกสาร
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', sig.document_id)
        .single()
      setDoc(docData)

      // 3) workflow ทั้งหมดของเอกสารนี้
      const { data: allWf } = await supabase
        .from('signing_workflows')
        .select('*')
        .eq('document_id', sig.document_id)
        .order('step_order', { ascending: true })

      // 4) signatures ทั้งหมดของเอกสารนี้
      const { data: allSigs } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('document_id', sig.document_id)
        .order('signed_at', { ascending: true })

      // 5) รวม user_id ทั้งหมดที่เกี่ยวข้อง แล้วกรองของเสียออก
      const allUserIds = [
        ...new Set([
          ...(allWf?.map(w => w.signer_id) || []),
          ...(allSigs?.map(s => s.signer_id) || []),
        ]),
      ].filter(Boolean) as string[]

      // 6) ดึง profile ของผู้ลงนาม (ถ้ามี userIds ให้ดึงเท่านั้น)
      let profiles: any[] = []
      if (allUserIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('user_profiles')
          .select('id, full_name, position, department')
          .in('id', allUserIds)
        profiles = profileRows || []
      }
      const profileMap = new Map(profiles.map(p => [p.id, p]))

      // 7) ดึง KYC ของผู้ลงนาม (เฉพาะ user ที่มีใน allUserIds)
      let kycList: any[] = []
      if (allUserIds.length > 0) {
        const { data: kycRows } = await supabase
          .from('kyc_submissions')
          .select('user_id, status, verification_method, verified_at')
          .in('user_id', allUserIds)
          .order('created_at', { ascending: false })
        kycList = kycRows || []
      }

      // ให้ความสำคัญกับ status = approved เป็นอันดับแรก
      const kycMap = new Map<string, any>()
      kycList.forEach(k => {
        if (
          !kycMap.has(k.user_id) ||
          (kycMap.get(k.user_id).status !== 'approved' && k.status === 'approved')
        ) {
          kycMap.set(k.user_id, k)
        }
      })

      // map signer_id -> signature ล่าสุด
      const sigBySigner = new Map<string, any>()
      allSigs?.forEach(s => {
        sigBySigner.set(s.signer_id, s)
      })

      // 8) สร้าง steps พร้อมข้อมูล profile + kyc
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
            signature: sigData
              ? {
                  id: sigData.id,
                  sign_action: sigData.sign_action,
                  signer_position: sigData.signer_position || '',
                  signer_department: sigData.signer_department || '',
                  rejection_reason: sigData.rejection_reason,
                  signed_at: sigData.signed_at,
                  document_hash: sigData.document_hash || '',
                  full_name: profile?.full_name || '-',
                  kyc_status: kyc?.status || 'unknown',
                  kyc_method:
                    kyc?.verification_method || 'บัตรประชาชน + Selfie',
                  kyc_verified_at: kyc?.verified_at || null,
                }
              : null,
          }
        })
        setSteps(enrichedSteps)
      }

      // 9) รายการ signatures แยก (ถ้าต้องใช้ต่อ)
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
            kyc_method:
              kyc?.verification_method || 'บัตรประชาชน + Selfie',
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
    if (signed?.signedUrl) {
      window.open(signed.signedUrl, '_blank')
      return
    }
    const { data: orig } = await supabase.storage
      .from('official-documents')
      .createSignedUrl(doc.file_url, 300)
    if (orig?.signedUrl) window.open(orig.signedUrl, '_blank')
  }

  // ตรวจสอบ Hash
  async function handleHashCheck(file: File) {
    setHashChecking(true)
    setHashResult(null)

    // delay เล็กน้อยให้เห็น animation
    await new Promise(r => setTimeout(r, 1500))

    try {
      const uploadedHash = await computeFileHash(file)

      const allHashes: {
        hash: string
        step: number
        name: string
        type: string
      }[] = []

      if (doc?.file_hash) {
        allHashes.push({
          hash: doc.file_hash,
          step: 0,
          name: 'ต้นฉบับ',
          type: 'ไฟล์ต้นฉบับ (ก่อนลงนาม)',
        })
      }

      steps.forEach(s => {
        if (s.signature?.document_hash) {
          allHashes.push({
            hash: s.signature.document_hash,
            step: s.step_order,
            name: s.signer_name,
            type: `หลังลงนามลำดับที่ ${s.step_order} (${s.signer_name})`,
          })
        }
      })

      const matched = allHashes.find(h => h.hash === uploadedHash)

      if (matched) {
        setHashResult({
          match: true,
          uploadedHash,
          matchedStep: matched.step,
          matchedName: matched.name,
          matchType: matched.type,
        })
      } else {
        setHashResult({
          match: false,
          uploadedHash,
        })
      }
    } catch {
      setHashResult({ match: false, uploadedHash: 'เกิดข้อผิดพลาด' })
    } finally {
      setHashChecking(false)
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleHashCheck(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleHashCheck(file)
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

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <span className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="mt-3 text-gray-500">กำลังตรวจสอบ...</p>
        </div>
      </div>
    )

  if (error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-red-600 mb-2">
            ตรวจสอบไม่สำเร็จ
          </h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    )

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${
        isRejected
          ? 'from-red-50'
          : isFullySigned
          ? 'from-green-50'
          : 'from-yellow-50'
      } to-white p-4`}
    >
      <div className="max-w-lg mx-auto">
        {/* HEADER */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-4 text-center">
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 ${
              isRejected
                ? 'bg-red-100'
                : isFullySigned
                ? 'bg-green-100'
                : 'bg-yellow-100'
            }`}
          >
            <span className="text-3xl">
              {isRejected ? '❌' : isFullySigned ? '✅' : '⏳'}
            </span>
          </div>
          <h1
            className={`text-xl font-bold ${
              isRejected
                ? 'text-red-700'
                : isFullySigned
                ? 'text-green-700'
                : 'text-yellow-700'
            }`}
          >
            {isRejected
              ? 'เอกสารถูกปฏิเสธ'
              : isFullySigned
              ? 'เอกสารได้รับการลงนามครบแล้ว'
              : 'เอกสารอยู่ระหว่างการลงนาม'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            ระบบยืนยันตัวตนดิจิทัล IAL 2 — อบต.ลุโบะสาวอ
          </p>
        </div>

        {/* ข้อมูลเอกสาร */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            📄 ข้อมูลเอกสาร
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">ชื่อเอกสาร</span>
              <span className="font-medium text-right max-w-[60%]">
                {doc?.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">เลขที่เอกสาร</span>
              <span className="font-medium">
                {doc?.document_number || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">สถานะ</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isRejected
                    ? 'bg-red-100 text-red-700'
                    : isFullySigned
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {statusText}
              </span>
            </div>
          </div>

          {totalCount > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>ความคืบหน้าการลงนาม</span>
                <span>
                  {completedCount}/{totalCount} คน
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    isRejected
                      ? 'bg-red-500'
                      : isFullySigned
                      ? 'bg-green-500'
                      : 'bg-yellow-500'
                  }`}
                  style={{
                    width: `${(completedCount / totalCount) * 100}%`,
                  }}
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

        {/* ลำดับการลงนาม */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            📋 ลำดับการลงนาม ({completedCount}/{totalCount})
          </h2>

          <div className="space-y-0">
            {steps.map((step, i) => {
              const isDone = step.status === 'completed'
              const isRej = step.status === 'rejected'
              const isPending = step.status === 'pending'
              const isCurrent =
                isPending &&
                !steps.slice(0, i).some(s => s.status === 'pending')
              const isLast = i === steps.length - 1

              const actionText =
                step.required_action === 'sign'
                  ? '✍️ ลงนาม'
                  : step.required_action === 'approve'
                  ? '👍 อนุมัติ'
                  : '🔍 ตรวจสอบ'

              return (
                <div key={step.id}>
                  <div
                    className={
                      'rounded-lg p-4 ' +
                      (isDone
                        ? 'bg-green-50 border border-green-200'
                        : isRej
                        ? 'bg-red-50 border border-red-200'
                        : isCurrent
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 border border-gray-200')
                    }
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={
                            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ' +
                            (isDone
                              ? 'bg-green-100 border-green-500 text-green-700'
                              : isRej
                              ? 'bg-red-100 border-red-500 text-red-700'
                              : isCurrent
                              ? 'bg-blue-100 border-blue-500 text-blue-700'
                              : 'bg-gray-100 border-gray-300 text-gray-400')
                          }
                        >
                          {isDone ? '✓' : isRej ? '✗' : step.step_order}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {step.signer_name}
                          </p>
                          {step.signer_position && (
                            <p className="text-xs text-gray-500">
                              {step.signer_position}
                            </p>
                          )}
                          {step.signer_department && (
                            <p className="text-xs text-gray-500">
                              {step.signer_department}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={
                            'px-2 py-0.5 rounded-full text-xs font-bold ' +
                            (isDone
                              ? 'bg-green-100 text-green-700'
                              : isRej
                              ? 'bg-red-100 text-red-700'
                              : isCurrent
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-500')
                          }
                        >
                          {isDone
                            ? '✅ เสร็จแล้ว'
                            : isRej
                            ? '❌ ปฏิเสธ'
                            : isCurrent
                            ? '⏳ กำลังรอ'
                            : '🔒 รอคิว'}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {actionText}
                        </p>
                      </div>
                    </div>

                    {step.signature && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-gray-400">
                          🕐{' '}
                          {new Date(
                            step.signature.signed_at,
                          ).toLocaleString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>

                        {step.signature.document_hash && (
                          <div className="bg-white rounded p-2">
                            <p className="text-[10px] text-gray-400 mb-0.5">
                              Document Hash (SHA-256)
                            </p>
                            <p className="font-mono text-[10px] text-gray-500 break-all">
                              {step.signature.document_hash}
                            </p>
                          </div>
                        )}

                        <div className="bg-white rounded p-2 flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            🔐 KYC IAL 2
                          </span>
                          <span
                            className={
                              'px-2 py-0.5 rounded-full text-xs font-bold ' +
                              (step.signature.kyc_status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700')
                            }
                          >
                            {step.signature.kyc_status === 'approved'
                              ? '✅ ผ่าน'
                              : '⏳ รอตรวจ'}
                          </span>
                        </div>

                        {step.signature.rejection_reason && (
                          <p className="text-red-600 text-xs bg-red-100 p-2 rounded">
                            เหตุผล: {step.signature.rejection_reason}
                          </p>
                        )}
                      </div>
                    )}

                    {!step.signature && step.status === 'pending' && (
                      <p className="text-xs text-gray-400 mt-1">
                        {isCurrent
                          ? '⏳ รอผู้ลงนามดำเนินการ...'
                          : '🔒 รอลำดับก่อนหน้าเสร็จก่อน'}
                      </p>
                    )}
                  </div>

                  {!isLast && (
                    <div className="flex justify-center py-1">
                      <div
                        className={
                          'w-0.5 h-4 ' +
                          (isDone ? 'bg-green-400' : 'bg-gray-200')
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ตรวจสอบความถูกต้องของเอกสาร */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-2">
            🔍 ตรวจสอบความถูกต้องของเอกสาร
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            อัปโหลดไฟล์เอกสารที่คุณมี เพื่อตรวจสอบว่าตรงกับต้นฉบับในระบบหรือไม่
          </p>

          {hashChecking && (
            <div className="text-center py-8">
              <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
                <span className="absolute w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-2xl">📄</span>
              </div>
              <p className="text-sm font-semibold text-blue-700">
                กำลังตรวจสอบความถูกต้อง...
              </p>
              <p className="text-xs text-gray-400 mt-1">
                คำนวณ SHA-256 Hash และเปรียบเทียบกับระบบ
              </p>
            </div>
          )}

          {hashResult && !hashChecking && (
            <div className="mb-4">
              {hashResult.match ? (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                    <span className="text-3xl">✅</span>
                  </div>
                  <h3 className="text-lg font-bold text-green-700 mb-1">
                    เอกสารถูกต้อง!
                  </h3>
                  <p className="text-sm text-green-600 mb-3">
                    ไฟล์ที่อัปโหลดตรงกับเอกสารในระบบ ไม่มีการแก้ไข
                  </p>
                  <div className="bg-white rounded-lg p-3 text-left">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">ตรงกับ</span>
                      <span className="font-semibold text-green-700">
                        {hashResult.matchType}
                      </span>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">
                        Hash ที่คำนวณได้
                      </p>
                      <p className="font-mono text-[10px] text-green-600 break-all">
                        {hashResult.uploadedHash}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-3">
                    <span className="text-3xl">❌</span>
                  </div>
                  <h3 className="text-lg font-bold text-red-700 mb-1">
                    เอกสารไม่ตรง!
                  </h3>
                  <p className="text-sm text-red-600 mb-3">
                    ไฟล์ที่อัปโหลดไม่ตรงกับเอกสารในระบบ อาจถูกแก้ไขหรือเป็นคนละไฟล์
                  </p>
                  <div className="bg-white rounded-lg p-3 text-left">
                    <div className="mt-1">
                      <p className="text-[10px] text-gray-400 mb-0.5">
                        Hash ที่คำนวณจากไฟล์ที่อัปโหลด
                      </p>
                      <p className="font-mono text-[10px] text-red-600 break-all">
                        {hashResult.uploadedHash}
                      </p>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">
                        Hash ที่บันทึกไว้ในระบบ (ล่าสุด)
                      </p>
                      <p className="font-mono text-[10px] text-gray-500 break-all">
                        {steps
                          .filter(s => s.signature?.document_hash)
                          .pop()?.signature?.document_hash || doc?.file_hash || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setHashResult(null)
                  if (fileInputRef.current)
                    fileInputRef.current.value = ''
                }}
                className="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                🔄 ตรวจสอบไฟล์อื่น
              </button>
            </div>
          )}

          {!hashChecking && !hashResult && (
            <div
              onDragOver={e => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <div className="text-4xl mb-2">
                {dragOver ? '📥' : '📄'}
              </div>
              <p className="text-sm font-semibold text-gray-700">
                {dragOver ? 'ปล่อยไฟล์ตรงนี้' : 'ลากไฟล์มาวาง หรือกดเพื่อเลือก'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                รองรับ PDF, DOC, DOCX, JPG, PNG
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.png"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500">
              <strong>🔒 ปลอดภัย:</strong>{' '}
              ไฟล์จะถูกประมวลผลบนเครื่องของคุณเท่านั้น (Client-side)
              ไม่มีการอัปโหลดไฟล์ไปยังเซิร์ฟเวอร์ ระบบจะคำนวณ SHA-256 Hash
              แล้วเปรียบเทียบกับค่าที่บันทึกไว้ในระบบ
            </p>
          </div>
        </div>

        {/* IAL 2 */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            🔐 การยืนยันตัวตน (IAL 2)
          </h2>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>IAL 2 (Identity Assurance Level 2)</strong>{' '}
              หมายถึง ผู้ลงนามทุกคนได้ผ่านการยืนยันตัวตนขั้นสูง
              ด้วยเอกสารราชการ (บัตรประชาชน) และภาพถ่ายยืนยันตัวตน (Selfie)
              ผ่านระบบ KYC ของ อบต.ลุโบะสาวอ ซึ่งเป็นไปตามมาตรฐาน
              NIST SP 800-63A
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
          <p className="mt-1">
            ตรวจสอบเมื่อ: {new Date().toLocaleString('th-TH')}
          </p>
        </div>
      </div>
    </div>
  )
}
