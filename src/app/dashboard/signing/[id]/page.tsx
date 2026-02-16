'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { PDFDocument, rgb } from 'pdf-lib'
import * as QRCode from 'qrcode'

export default function SignDocumentPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const workflowId = params.id as string

  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [workflow, setWorkflow] = useState<any>(null)
  const [document, setDocument] = useState<any>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(1.5)

  // ลายเซ็น
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [signatureId, setSignatureId] = useState<string | null>(null)

  // ตำแหน่งวางลายเซ็น
  const [sigPosition, setSigPosition] = useState<{
    page: number
    x: number
    y: number
    pdfX: number
    pdfY: number
    pageWidth: number
    pageHeight: number
  } | null>(null)

  const [profile, setProfile] = useState<any>(null)
  const [kycInfo, setKycInfo] = useState<any>(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      // 1. ดึง workflow
      const { data: wf } = await supabase
        .from('signing_workflows')
        .select('*')
        .eq('id', workflowId)
        .single()
      if (!wf) { setMessage('ไม่พบงานลงนาม'); return }
      setWorkflow(wf)

      // 2. ดึง document
      const { data: doc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', wf.document_id)
        .single()
      if (!doc) { setMessage('ไม่พบเอกสาร'); return }
      setDocument(doc)

      // 3. ดึง profile
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(prof)

      // 4. ดึง KYC info
      const { data: kyc } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setKycInfo(kyc)

      // 5. ดึงลายเซ็น
      const { data: sig } = await supabase
        .from('user_signatures')
        .select('id, signature_url')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (sig) {
        setSignatureUrl(sig.signature_url)
        setSignatureId(sig.id)
      }

      // 6. ดึง PDF จาก Storage
      const { data: fileData } = await supabase.storage
        .from('official-documents')
        .createSignedUrl(doc.file_url, 300)

      if (fileData?.signedUrl) {
        const resp = await fetch(fileData.signedUrl)
        const buffer = await resp.arrayBuffer()
        setPdfBytes(new Uint8Array(buffer))
      }

    } catch (err: any) {
      setMessage('โหลดข้อมูลล้มเหลว: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ====== Render PDF ด้วย pdfjs-dist ======
  useEffect(() => {
    if (!pdfBytes) return
    renderPdf()
  }, [pdfBytes, scale])

  async function renderPdf() {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

    const pdf = await pdfjsLib.getDocument({ data: pdfBytes! }).promise
    setPageCount(pdf.numPages)

    canvasRefs.current = new Array(pdf.numPages).fill(null)

    // รอให้ DOM อัปเดต
    setTimeout(async () => {
      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRefs.current[i]
        if (!canvas) continue

        canvas.width = viewport.width
        canvas.height = viewport.height

        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    }, 100)
  }

  // ====== คลิกบน PDF เพื่อวางลายเซ็น ======
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) {
    const canvas = canvasRefs.current[pageIndex]
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // แปลงพิกัดจาก canvas → PDF coordinates
    const pdfX = (clickX / scale)
    const pdfY = (canvas.height / scale) - (clickY / scale) // PDF y จากล่างขึ้นบน

    setSigPosition({
      page: pageIndex,
      x: clickX,
      y: clickY,
      pdfX,
      pdfY,
      pageWidth: canvas.width / scale,
      pageHeight: canvas.height / scale,
    })
  }

  // ====== ยืนยันลงนาม — แนบลายเซ็น + QR ลง PDF จริง ======
  async function confirmSign() {
    if (!sigPosition || !pdfBytes || !signatureUrl || !signatureId || !workflow || !document) return
    setProcessing(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      // 1. สร้าง verification code
      const verificationCode = crypto.randomUUID()
      const siteUrl = window.location.origin
      const verifyUrl = `${siteUrl}/verify/${verificationCode}`

      // 2. สร้าง QR Code เป็น PNG data URL
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 100,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      })

      // 3. ดึงรูปลายเซ็น
      const sigResp = await fetch(signatureUrl)
      const sigArrayBuffer = await sigResp.arrayBuffer()
      const sigUint8 = new Uint8Array(sigArrayBuffer)

      // 4. โหลด PDF ด้วย pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const pages = pdfDoc.getPages()
      const targetPage = pages[sigPosition.page]

      // 5. แนบลายเซ็นลง PDF
      let sigImage
      if (signatureUrl.toLowerCase().includes('.png')) {
        sigImage = await pdfDoc.embedPng(sigUint8)
      } else {
        sigImage = await pdfDoc.embedJpg(sigUint8)
      }

      const sigWidth = 150
      const sigHeight = (sigImage.height / sigImage.width) * sigWidth

      targetPage.drawImage(sigImage, {
        x: sigPosition.pdfX - sigWidth / 2,
        y: sigPosition.pdfY - sigHeight / 2,
        width: sigWidth,
        height: sigHeight,
      })

      // 6. เพิ่มชื่อ + ตำแหน่ง + วันที่ ใต้ลายเซ็น
      const font = await pdfDoc.embedFont('Helvetica' as any)
      const signDate = new Date().toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric'
      })

      const textY = sigPosition.pdfY - sigHeight / 2 - 15
      const textX = sigPosition.pdfX - sigWidth / 2

      targetPage.drawText(`(${profile?.full_name || ''})`, {
        x: textX,
        y: textY,
        size: 9,
        font,
        color: rgb(0, 0, 0),
      })
      targetPage.drawText(`${profile?.position || ''}`, {
        x: textX,
        y: textY - 13,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })
      targetPage.drawText(signDate, {
        x: textX,
        y: textY - 25,
        size: 8,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })

      // 7. แนบ QR Code ข้างลายเซ็น
      const qrBase64 = qrDataUrl.split(',')[1]
      const qrBytes = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0))
      const qrImage = await pdfDoc.embedPng(qrBytes)
      const qrSize = 60

      targetPage.drawImage(qrImage, {
        x: sigPosition.pdfX + sigWidth / 2 + 10,
        y: sigPosition.pdfY - qrSize / 2,
        width: qrSize,
        height: qrSize,
      })

      // ข้อความใต้ QR
      targetPage.drawText('Scan to verify', {
        x: sigPosition.pdfX + sigWidth / 2 + 10,
        y: sigPosition.pdfY - qrSize / 2 - 12,
        size: 6,
        font,
        color: rgb(0.4, 0.4, 0.4),
      })

      // 8. บันทึก PDF ที่แก้ไขแล้ว
      const modifiedPdfBytes = await pdfDoc.save()
      const signedFileName = `signed_${Date.now()}_${document.file_name || 'document.pdf'}`

      const { error: uploadError } = await supabase.storage
        .from('signed-documents')
        .upload(signedFileName, modifiedPdfBytes, {
          contentType: 'application/pdf',
          upsert: false,
        })
      if (uploadError) throw new Error('อัปโหลด PDF ล้มเหลว: ' + uploadError.message)

      // 9. สร้าง document hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', modifiedPdfBytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const docHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // 10. Insert document_signatures
      const { data: docSig, error: docSigError } = await supabase
        .from('document_signatures')
        .insert({
          document_id: document.id,
          signer_id: user.id,
          signature_id: signatureId,
          sign_action: workflow.required_action === 'approve' ? 'approved' : 'signed',
          document_hash: docHash,
          signer_position: profile?.position || '',
          signer_department: profile?.department || '',
          verification_code: verificationCode,
          qr_url: verifyUrl,
          signed_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (docSigError) throw new Error('บันทึกลายเซ็นล้มเหลว: ' + docSigError.message)

      // 11. Update signing_workflows
      const { error: wfError } = await supabase
        .from('signing_workflows')
        .update({
          status: 'completed',
          signature_id: docSig.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', workflowId)
      if (wfError) throw wfError

      // 12. เช็คว่าครบทุกคนหรือยัง → update document
      const { data: remaining } = await supabase
        .from('signing_workflows')
        .select('id')
        .eq('document_id', document.id)
        .eq('status', 'pending')
        .neq('id', workflowId)

      const newDocStatus = (!remaining || remaining.length === 0) ? 'signed' : document.status

      await supabase
        .from('documents')
        .update({
          status: newDocStatus,
          file_url: signedFileName, // อัปเดตเป็นไฟล์ที่ลงนามแล้ว
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id)

      // 13. Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'document.sign',
        entity_type: 'document',
        entity_id: document.id,
        details: {
          workflow_id: workflowId,
          document_signature_id: docSig.id,
          verification_code: verificationCode,
          signed_file: signedFileName,
          position: sigPosition,
        },
      })

      alert('✅ ลงนามสำเร็จ! ลายเซ็นและ QR Code ถูกแนบลงเอกสารแล้ว')
      router.push('/dashboard/signing')

    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // ====== RENDER ======
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <span className="inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="mt-3 text-gray-500 text-sm">กำลังโหลดเอกสาร...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ====== HEADER BAR ====== */}
      <div className="sticky top-0 z-30 bg-white shadow-sm border-b px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard/signing')} className="text-blue-600 hover:underline text-sm">
              ← กลับ
            </button>
            <div>
              <h1 className="font-bold text-lg">{document?.title || 'เอกสาร'}</h1>
              <p className="text-xs text-gray-500">{document?.document_number}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {sigPosition && (
              <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                ✅ เลือกตำแหน่งแล้ว (หน้า {sigPosition.page + 1})
              </span>
            )}
            <button
              onClick={confirmSign}
              disabled={!sigPosition || processing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {processing ? '⏳ กำลังลงนาม...' : '✍️ ยืนยันลงนาม'}
            </button>
          </div>
        </div>
      </div>

      {/* ====== INSTRUCTIONS ====== */}
      <div className="max-w-6xl mx-auto px-4 mt-4">
        {!signatureUrl ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 text-sm font-medium">⚠️ คุณยังไม่มีลายเซ็น</p>
            <button onClick={() => router.push('/dashboard/signature')} className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs">
              อัปโหลดลายเซ็น
            </button>
          </div>
        ) : !sigPosition ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-blue-700 text-sm">👆 คลิกบนเอกสารตรงตำแหน่งที่ต้องการวางลายเซ็น</p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex justify-between items-center">
            <p className="text-green-700 text-sm">✅ เลือกตำแหน่งแล้ว — ลายเซ็น + QR Code จะถูกวางตรงจุดที่เลือก</p>
            <button onClick={() => setSigPosition(null)} className="text-xs text-green-600 hover:underline">เลือกใหม่</button>
          </div>
        )}

        {message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-700 text-sm">{message}</p>
          </div>
        )}
      </div>

      {/* ====== ZOOM CONTROLS ====== */}
      <div className="max-w-6xl mx-auto px-4 mb-3 flex gap-2">
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50">➖</button>
        <span className="px-3 py-1 bg-white border rounded text-sm">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50">➕</button>
      </div>

      {/* ====== PDF VIEWER ====== */}
      <div ref={containerRef} className="max-w-6xl mx-auto px-4 pb-20">
        {Array.from({ length: pageCount }).map((_, i) => (
          <div key={i} className="relative mb-4 bg-white shadow-lg inline-block">
            {/* หมายเลขหน้า */}
            <div className="absolute top-2 right-2 bg-gray-800/70 text-white text-xs px-2 py-0.5 rounded z-10">
              หน้า {i + 1}/{pageCount}
            </div>

            {/* Canvas สำหรับ render PDF */}
            <canvas
              ref={el => { canvasRefs.current[i] = el }}
              onClick={(e) => handleCanvasClick(e, i)}
              className="cursor-crosshair block"
            />

            {/* แสดง preview ลายเซ็นตรงตำแหน่งที่คลิก */}
            {sigPosition && sigPosition.page === i && signatureUrl && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: sigPosition.x - 75 * scale,
                  top: sigPosition.y - 25 * scale,
                }}
              >
                {/* ลายเซ็น */}
                <div className="flex items-start gap-2">
                  <div>
                    <img
                      src={signatureUrl}
                      alt="ลายเซ็น"
                      className="border-2 border-green-400 border-dashed rounded bg-white/80"
                      style={{ width: 150 * scale, height: 'auto' }}
                    />
                    <p className="text-xs mt-0.5" style={{ fontSize: 9 * scale }}>
                      ({profile?.full_name})
                    </p>
                    <p className="text-gray-500" style={{ fontSize: 8 * scale }}>
                      {profile?.position}
                    </p>
                  </div>
                  {/* QR Code preview */}
                  <div className="bg-white border border-dashed border-blue-400 rounded p-1">
                    <div className="bg-gray-200 flex items-center justify-center" style={{ width: 60 * scale, height: 60 * scale }}>
                      <span style={{ fontSize: 8 * scale }} className="text-gray-500">QR Code</span>
                    </div>
                    <p className="text-center" style={{ fontSize: 6 * scale }}>Scan to verify</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
