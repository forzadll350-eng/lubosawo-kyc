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
  full_name: string
  kyc_status: string
  kyc_method: string
  kyc_verified_at: string | null
}

export default function VerifyPage() {
  const supabase = createClient()
  const params = useParams()
  const code = params.code as string

  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<any>(null)
  const [signers, setSigners] = useState<SignerInfo[]>([])
  const [scannedSigner, setScannedSigner] = useState<string>('')
  const [docHash, setDocHash] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { verify() }, [])

  async function verify() {
    try {
      // 1. หาลายเซ็นที่ตรงกับ QR code ที่สแกน
      const { data: sig, error: sigErr } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('verification_code', code)
        .single()

      if (sigErr || !sig) {
        setError('ไม่พบข้อมูลการลงนาม หรือรหัสตรวจสอบไม่ถูกต้อง')
        return
      }

      setDocHash(sig.document_hash || '')

      // 2. ดึงข้อมูลเอกสาร
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', sig.document_id)
        .single()
      setDoc(docData)

      // 3. ★ ดึง document_signatures ทุกคน ในเอกสารเดียวกัน ★
      const { data: allSigs } = await supabase
        .from('document_signatures')
        .select('*')
        .eq('document_id', sig.document_id)
        .order('signed_at', { ascending: true })

      if (allSigs && allSigs.length > 0) {
        // ดึงชื่อผู้ลงนามทุกคน
        const signerIds = [...new Set(allSigs.map(s => s.signer_id))]

        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', signerIds)
        const nameMap = new Map(profiles?.map(p => [p.id, p.full_name]) || [])

        // ดึง KYC ของทุกคน
        const { data: kycList } = await supabase
          .from('kyc_submissions')
          .select('user_id, status, verification_method, verified_at')
          .in('user_id', signerIds)
          .order('created_at', { ascending: false })

        // เอา KYC ล่าสุดของแต่ละคน
        const kycMap = new Map<string, any>()
        kycList?.forEach(k => {
          if (!kycMap.has(k.user_id)) kycMap.set(k.user_id, k)
        })

        // จำ signer ที่ตรงกับ QR ที่สแกน
        setScannedSigner(sig.signer_id)

        const enriched: SignerInfo[] = allSigs.map(s => {
          const kyc = kycMap.get(s.signer_id)
          return {
            id: s.id,
            sign_action: s.sign_action,
            signer_position: s.signer_position || '',
            signer_department: s.signer_department || '',
            rejection_reason: s.rejection_reason,
            signed_at: s.signed_at,
            full_name: nameMap.get(s.signer_id) || '-',
            kyc_status: kyc?.status || 'unknown',
            kyc_method: kyc?.verification_method || 'บัตรประชาชน + Selfie',
            kyc_verified_at: kyc?.verified_at || null,
          }
        })

        setSigners(enriched)
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
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4">
      <div className="max-w-lg mx-auto">

        {/* ✅ HEADER */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="text-xl font-bold text-green-700">เอกสารนี้ได้รับการลงนามแล้ว</h1>
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
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                {doc?.status === 'signed' ? '✅ ลงนามครบแล้ว' : '⏳ อยู่ระหว่างลงนาม'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ผู้ลงนามทั้งหมด</span>
              <span className="font-medium">{signers.length} คน</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Document Hash</span>
              <span className="font-mono text-xs text-gray-400 max-w-[60%] truncate">{docHash}</span>
            </div>
          </div>
          <button
            onClick={viewOriginalDoc}
            className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            📥 ดูเอกสารต้นฉบับ
          </button>
        </div>

        {/* ✍️ ผู้ลงนามทุกคน */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">
            ✍️ ผู้ลงนามทั้งหมด ({signers.length} คน)
          </h2>

          <div className="space-y-3">
            {signers.map((signer, index) => {
              const isScanned = signer.full_name && scannedSigner
              return (
                <div
                  key={signer.id}
                  className={"border rounded-lg p-4 " +
                    (signer.id && scannedSigner ? '' : '') +
                    (signer.sign_action === 'rejected' ? 'border-red-200 bg-red-50' : 'border-gray-200')
                  }
                >
                  {/* ลำดับ + ชื่อ */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-sm">{signer.full_name}</p>
                        {signer.signer_position && (
                          <p className="text-xs text-gray-500">{signer.signer_position}</p>
                        )}
                        {signer.signer_department && (
                          <p className="text-xs text-gray-500">{signer.signer_department}</p>
                        )}
                      </div>
                    </div>
                    <span className={"px-2 py-0.5 rounded-full text-xs font-bold " +
                      (signer.sign_action === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : signer.sign_action === 'approved'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700')
                    }>
                      {signer.sign_action === 'rejected' ? '❌ ปฏิเสธ'
                        : signer.sign_action === 'approved' ? '✅ อนุมัติ'
                        : '✍️ ลงนาม'}
                    </span>
                  </div>

                  {/* วันที่ */}
                  <p className="text-xs text-gray-400 mb-2">
                    🕐 {new Date(signer.signed_at).toLocaleString('th-TH', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>

                  {/* KYC Info */}
                  <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">🔐 KYC IAL 2</span>
                    <span className={"px-2 py-0.5 rounded-full text-xs font-bold " +
                      (signer.kyc_status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700')
                    }>
                      {signer.kyc_status === 'approved' ? '✅ ผ่าน' : '⏳ รอตรวจ'}
                    </span>
                  </div>

                  {/* เหตุผลปฏิเสธ */}
                  {signer.rejection_reason && (
                    <p className="text-red-600 text-xs mt-2 bg-red-100 p-2 rounded">
                      เหตุผล: {signer.rejection_reason}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 🔐 อธิบาย IAL 2 */}
        <div className="bg-white rounded-xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm text-gray-800 mb-3">🔐 การยืนยันตัวตน (IAL 2)</h2>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>IAL 2 (Identity Assurance Level 2)</strong> หมายถึง ผู้ลงนามทุกคนได้ผ่านการยืนยันตัวตนขั้นสูง
              ด้วยเอกสารราชการ (บัตรประชาชน) และภาพถ่ายยืนยันตัวตน (Selfie)
              ผ่านระบบ KYC ของ อบต.ลุโบะสาวอ ซึ่งเป็นไปตามมาตรฐาน NIST SP 800-63A
            </p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-xs text-gray-400 py-4">
          <p>ระบบเอกสารดิจิทัล — องค์การบริหารส่วนตำบลลุโบะสาวอ</p>
          <p>รหัสตรวจสอบ: {code}</p>
        </div>
      </div>
    </div>
  )
}
