'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as QRCode from 'qrcode'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export default function SignDocumentPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const workflowId = params.id as string

  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [workflow, setWorkflow] = useState<any>(null)
  const [docData, setDocData] = useState<any>(null)
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(1.5)

  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [signatureId, setSignatureId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)

  // ★ เก็บ bytes แยก 2 ชุด — ชุดหนึ่งให้ pdfjs ชุดหนึ่งให้ pdf-lib ★
  const pdfBytesForViewer = useRef<Uint8Array | null>(null)
  const pdfBytesForLib = useRef<Uint8Array | null>(null)

  const [pdfReady, setPdfReady] = useState(false)

  const [sigPosition, setSigPosition] = useState<{
    page: number
    x: number
    y: number
    pdfX: number
    pdfY: number
  } | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: wf } = await supabase
        .from('signing_workflows')
        .select('*')
        .eq('id', workflowId)
        .single()
      if (!wf) { setMessage('ไม่พบงานลงนาม'); setLoading(false); return }
      setWorkflow(wf)

      const { data: doc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', wf.document_id)
        .single()
      if (!doc) { setMessage('ไม่พบเอกสาร'); setLoading(false); return }
      setDocData(doc)

      const { data: prof } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(prof)

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

      const { data: fileData } = await supabase.storage
        .from('official-documents')
        .createSignedUrl(doc.file_url, 300)

      if (fileData?.signedUrl) {
        const resp = await fetch(fileData.signedUrl)
        const buffer = await resp.arrayBuffer()
        const originalBytes = new Uint8Array(buffer)

        // ★ Copy แยก 2 ชุด — pdfjs จะ transfer buffer ทำให้ใช้ซ้ำไม่ได้ ★
        pdfBytesForViewer.current = new Uint8Array(originalBytes)
        pdfBytesForLib.current = new Uint8Array(originalBytes)

        setPdfReady(true)
      }
    } catch (err: any) {
      setMessage('โหลดข้อมูลล้มเหลว: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ====== Render PDF ======
  useEffect(() => {
    if (!pdfReady) return
    renderPdf()
  }, [pdfReady, scale])

  async function renderPdf() {
    try {
      // ★ ส่ง copy ใหม่ทุกครั้ง เพราะ pdfjs อาจ transfer buffer ★
      const bytesToRender = new Uint8Array(pdfBytesForViewer.current!)

      const pdf = await pdfjsLib.getDocument({ data: bytesToRender }).promise
      const numPages = pdf.numPages
      setPageCount(numPages)

      await new Promise(r => setTimeout(r, 200))

      for (let i = 0; i < numPages; i++) {
        const page = await pdf.getPage(i + 1)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRefs.current[i]
        if (!canvas) continue

        canvas.width = viewport.width
        canvas.height = viewport.height

        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    } catch (err: any) {
      console.error('PDF render error:', err)
      setMessage('โหลด PDF ล้มเหลว: ' + err.message)
    }
  }

  // ====== คลิกวางลายเซ็น ======
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) {
    const canvas = canvasRefs.current[pageIndex]
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const pdfX = clickX / scale
    const pdfY = (canvas.height / scale) - (clickY / scale)

    setSigPosition({ page: pageIndex, x: clickX, y: clickY, pdfX, pdfY })
  }

  // ====== ยืนยันลงนาม ======
  async function confirmSign() {
    if (!sigPosition || !pdfBytesForLib.current || !signatureUrl || !signatureId || !workflow || !docData) return
    setProcessing(true)
    setMessage('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      const verificationCode = crypto.randomUUID()
      const verifyUrl = `${window.location.origin}/verify/${verificationCode}`
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 100, margin: 1 })

      // ดึงรูปลายเซ็น
      const sigResp = await fetch(signatureUrl)
      const sigBuf = await sigResp.arrayBuffer()
      const sigUint8 = new Uint8Array(sigBuf)

      // ★ ใช้ pdfBytesForLib (copy ที่ยังไม่ถูก transfer) ★
      const pdfDoc = await PDFDocument.load(pdfBytesForLib.current)
      const pages = pdfDoc.getPages()
      const targetPage = pages[sigPosition.page]

      // embed ลายเซ็น
      let sigImage
      try {
        sigImage = await pdfDoc.embedPng(sigUint8)
      } catch {
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

      // ชื่อ + ตำแหน่ง + วันที่
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const signDate = new Date().toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric'
      })

      const textY = sigPosition.pdfY - sigHeight / 2 - 15
      const textX = sigPosition.pdfX - sigWidth / 2

      targetPage.drawText(`(${profile?.full_name || ''})`, { x: textX, y: textY, size: 9, font, color: rgb(0, 0, 0) })
      targetPage.drawText(profile?.position || '', { x: textX, y: textY - 13, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
      targetPage.drawText(signDate, { x: textX, y: textY - 25, size: 8, font, color: rgb(0.3, 0.3, 0.3) })

      // QR Code
      const qrBase64 = qrDataUrl.split(',')[1]
      const qrBytes = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0))
      const qrImage = await pdfDoc.embedPng(qrBytes)
      const qrSize = 60

      targetPage.drawImage(qrImage, {
        x: sigPosition.pdfX + sigWidth / 2 + 10,
        y: sigPosition.pdfY - qrSize / 2,
        width: qrSize, height: qrSize,
      })

      targetPage.drawText('Scan to verify', {
        x: sigPosition.pdfX + sigWidth / 2 + 10,
        y: sigPosition.pdfY - qrSize / 2 - 12,
        size: 6, font, color: rgb(0.4, 0.4, 0.4),
      })

      // บันทึก PDF
      const modifiedPdfBytes = await pdfDoc.save()
      const signedFileName = `signed_${Date.now()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('signed-documents')
        .upload(signedFileName, modifiedPdfBytes, { contentType: 'application/pdf' })
      if (uploadError) throw new Error('อัปโหลด PDF ล้มเหลว: ' + uploadError.message)

      // hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', modifiedPdfBytes)
      const docHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      // insert document_signatures
      const { data: docSig, error: docSigError } = await supabase
        .from('document_signatures')
        .insert({
          document_id: docData.id,
          signer_id: user.id,
          signature_id: signatureId,
          sign_action: workflow.required_action === 'approve' ? 'approved' : 'signed',
          document_hash: docHash,
          signer_position: profile?.position || '',
          signer_department: profile?.department || '',
          verification_code: verificationCode,
          signed_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (docSigError) throw new Error('บันทึกลายเซ็นล้มเหลว: ' + docSigError.message)

      // update workflow
      await supabase
        .from('signing_workflows')
        .update({ status: 'completed', signature_id: docSig.id, completed_at: new Date().toISOString() })
        .eq('id', workflowId)

      // เช็คครบทุกคนไหม
      const { data: remaining } = await supabase
        .from('signing_workflows')
        .select('id')
        .eq('document_id', docData.id)
        .eq('status', 'pending')
        .neq('id', workflowId)

      const newStatus = (!remaining || remaining.length === 0) ? 'signed' : docData.status
      await supabase
        .from('documents')
        .update({ status: newStatus, file_url: signedFileName, updated_at: new Date().toISOString() })
        .eq('id', docData.id)

      // audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'document.sign',
        entity_type: 'document',
        entity_id: docData.id,
        details: { workflow_id: workflowId, document_signature_id: docSig.id, verification_code: verificationCode },
      })

      alert('✅ ลงนามสำเร็จ! ลายเซ็นและ QR Code ถูกแนบลงเอกสารแล้ว')
      router.push('/dashboard/signing')
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

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
      <div className="sticky top-0 z-30 bg-white shadow-sm border-b px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard/signing')} className="text-blue-600 hover:underline text-sm">← กลับ</button>
            <div>
              <h1 className="font-bold text-lg">{docData?.title || 'เอกสาร'}</h1>
              <p className="text-xs text-gray-500">{docData?.document_number}</p>
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
              disabled={!sigPosition || processing || !signatureUrl}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {processing ? '⏳ กำลังลงนาม...' : '✍️ ยืนยันลงนาม'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-4">
        {!signatureUrl ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 text-sm font-medium">⚠️ คุณยังไม่มีลายเซ็น</p>
            <button onClick={() => router.push('/dashboard/signature')} className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs">อัปโหลดลายเซ็น</button>
          </div>
        ) : !sigPosition ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-blue-700 text-sm">👆 คลิกบนเอกสารตรงตำแหน่งที่ต้องการวางลายเซ็น</p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex justify-between items-center">
            <p className="text-green-700 text-sm">✅ ลายเซ็น + QR Code จะถูกวางตรงจุดที่เลือก</p>
            <button onClick={() => setSigPosition(null)} className="text-xs text-green-600 hover:underline">เลือกใหม่</button>
          </div>
        )}

        {message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex justify-between items-center">
            <p className="text-red-700 text-sm">{message}</p>
            <button onClick={() => setMessage('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 mb-3 flex gap-2">
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50">➖</button>
        <span className="px-3 py-1 bg-white border rounded text-sm">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50">➕</button>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-20">
        {Array.from({ length: pageCount }).map((_, i) => (
          <div key={i} className="relative mb-4 inline-block">
            <div className="absolute top-2 right-2 bg-gray-800/70 text-white text-xs px-2 py-0.5 rounded z-10">
              หน้า {i + 1}/{pageCount}
            </div>
            <canvas
              ref={el => { canvasRefs.current[i] = el }}
              onClick={(e) => handleCanvasClick(e, i)}
              className="cursor-crosshair block bg-white shadow-lg"
            />
            {sigPosition && sigPosition.page === i && signatureUrl && (
              <div className="absolute pointer-events-none" style={{ left: sigPosition.x - 75, top: sigPosition.y - 30 }}>
                <div className="flex items-start gap-2">
                  <div>
                    <img src={signatureUrl} alt="sig" className="border-2 border-green-400 border-dashed rounded bg-white/80" style={{ width: 150, height: 'auto' }} />
                    <p className="text-xs mt-0.5">({profile?.full_name})</p>
                    <p className="text-gray-500" style={{ fontSize: 10 }}>{profile?.position}</p>
                  </div>
                  <div className="bg-white border border-dashed border-blue-400 rounded p-1">
                    <div className="bg-gray-200 flex items-center justify-center" style={{ width: 60, height: 60 }}>
                      <span className="text-xs text-gray-500">QR</span>
                    </div>
                    <p className="text-center" style={{ fontSize: 8 }}>Scan to verify</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {pageCount === 0 && !loading && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">📄 ไม่สามารถแสดง PDF ได้</p>
          </div>
        )}
      </div>
    </div>
  )
}
