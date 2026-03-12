'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignaturePage() {
  const supabase = createClient()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stampCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stampInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'upload' | 'draw'>('upload')
  const [preview, setPreview] = useState<string | null>(null)
  const [processedPreview, setProcessedPreview] = useState<string | null>(null)
  const [stampPreview, setStampPreview] = useState<string | null>(null)
  const [processedStampPreview, setProcessedStampPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [stampLoading, setStampLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [stampMessage, setStampMessage] = useState('')
  const [existingSignature, setExistingSignature] = useState<string | null>(null)
  const [existingStamp, setExistingStamp] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    loadExistingSignature()
  }, [])

  useEffect(() => {
    if (tab === 'draw') initDrawCanvas()
  }, [tab])

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'object' && err !== null) {
      const obj = err as Record<string, unknown>
      const fields = ['message', 'error', 'hint', 'details', 'code']
      const picked = fields
        .map((k) => obj[k])
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      if (picked.length > 0) return picked.join(' | ')
      try {
        return JSON.stringify(err)
      } catch {
        return String(err)
      }
    }
    return String(err)
  }

  function initDrawCanvas() {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#1a237e'
    setHasDrawn(false)
  }

  function getDrawPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = drawCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const ctx = drawCanvasRef.current?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const pos = getDrawPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = drawCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getDrawPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasDrawn(true)
  }

  function stopDraw() {
    setIsDrawing(false)
  }

  function clearDraw() {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setMessage('')
  }

  async function loadExistingSignature() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/')

    const { data } = await supabase
      .from('user_signatures')
      .select('signature_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (data?.signature_url) {
      setExistingSignature(data.signature_url)
    }

    await loadExistingStamp(user.id)
  }

  async function loadExistingStamp(userId: string) {
    const cacheKey = `lubosawo_stamp_url_${userId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) setExistingStamp(cached)

    const { data, error } = await supabase
      .from('user_signatures')
      .select('signature_url')
      .eq('user_id', userId)
      .like('signature_url', '%/stamp_%')
      .limit(20)

    if (error || !data?.length) return

    const parseStampTime = (url: string) => {
      const match = url.match(/stamp_(\d+)\.png/i)
      return match ? Number(match[1]) : 0
    }

    const latest = [...data]
      .map((row) => row.signature_url)
      .filter(Boolean)
      .sort((a, b) => parseStampTime(b) - parseStampTime(a))[0]

    if (!latest) return
    setExistingStamp(latest)
    localStorage.setItem(cacheKey, latest)
  }

  function removeBackground(file: File, targetCanvas: HTMLCanvasElement | null): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = targetCanvas
        if (!canvas) return reject('No canvas')

        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject('No context')

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        let sumR = 0
        let sumG = 0
        let sumB = 0
        let sampleCount = 0
        const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 120))
        const sampleEdge = (x: number, y: number) => {
          const i = (y * canvas.width + x) * 4
          if (data[i + 3] < 10) return
          sumR += data[i]
          sumG += data[i + 1]
          sumB += data[i + 2]
          sampleCount += 1
        }

        for (let x = 0; x < canvas.width; x += step) {
          sampleEdge(x, 0)
          sampleEdge(x, canvas.height - 1)
        }
        for (let y = 0; y < canvas.height; y += step) {
          sampleEdge(0, y)
          sampleEdge(canvas.width - 1, y)
        }

        const bgR = sampleCount > 0 ? sumR / sampleCount : 245
        const bgG = sampleCount > 0 ? sumG / sampleCount : 245
        const bgB = sampleCount > 0 ? sumB / sampleCount : 245

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          if (a === 0) continue

          const dr = r - bgR
          const dg = g - bgG
          const db = b - bgB
          const dist = Math.sqrt(dr * dr + dg * dg + db * db)
          const maxCh = Math.max(r, g, b)
          const minCh = Math.min(r, g, b)
          const saturation = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh
          const nearWhite = r > 225 && g > 225 && b > 225 && saturation < 0.12

          let alpha = a
          if (dist < 30 || nearWhite) alpha = 0
          else if (dist < 64) alpha = Math.round(a * ((dist - 30) / 34))
          if (alpha < 16) alpha = 0
          data[i + 3] = alpha
        }

        ctx.putImageData(imageData, 0, 0)

        const outCanvas = document.createElement('canvas')
        const outCtx = outCanvas.getContext('2d')
        if (!outCtx) return reject('No output context')
        const outData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

        let minX = canvas.width
        let minY = canvas.height
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const alpha = outData[(y * canvas.width + x) * 4 + 3]
            if (alpha <= 10) continue
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }

        if (maxX < 0 || maxY < 0) {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob)
            else reject('Cannot create blob')
          }, 'image/png')
          return
        }

        const pad = 10
        const trimWidth = maxX - minX + 1
        const trimHeight = maxY - minY + 1
        outCanvas.width = trimWidth + pad * 2
        outCanvas.height = trimHeight + pad * 2
        outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height)
        outCtx.drawImage(canvas, minX, minY, trimWidth, trimHeight, pad, pad, trimWidth, trimHeight)

        outCanvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject('Cannot create blob')
        }, 'image/png')
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setProcessedPreview(null)
    setMessage('กำลังตัดพื้นหลัง...')

    try {
      const processedBlob = await removeBackground(file, canvasRef.current)
      const processedUrl = URL.createObjectURL(processedBlob)
      setProcessedPreview(processedUrl)
      setMessage('ตัดพื้นหลังเสร็จแล้ว ตรวจสอบแล้วกดบันทึก')
    } catch (err) {
      setMessage('เกิดข้อผิดพลาดในการตัดพื้นหลัง')
      console.error(err)
    }
  }

  async function handleStampFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStampPreview(URL.createObjectURL(file))
    setProcessedStampPreview(null)
    setStampMessage('Processing stamp image...')

    try {
      const processedBlob = await removeBackground(file, stampCanvasRef.current)
      const processedUrl = URL.createObjectURL(processedBlob)
      setProcessedStampPreview(processedUrl)
      setStampMessage('Stamp ready. Review and save.')
    } catch (err) {
      setStampMessage('Failed to process stamp image')
      console.error(err)
    }
  }

  async function handleSave() {
    setLoading(true)
    setMessage('กำลังบันทึก...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      let blob: Blob

      if (tab === 'draw') {
        const canvas = drawCanvasRef.current
        if (!canvas) throw new Error('ไม่พบ canvas')
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => b ? resolve(b) : reject('Cannot create blob'), 'image/png')
        })
      } else {
        const canvas = canvasRef.current
        if (!canvas) throw new Error('ไม่พบ canvas')
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => b ? resolve(b) : reject('Cannot create blob'), 'image/png')
        })
      }

      const fileName = `${user.id}/signature_${Date.now()}.png`

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true,
        })

      if (uploadError) throw new Error(getErrorMessage(uploadError))

      const { data: urlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName)

      await supabase
        .from('user_signatures')
        .update({ is_active: false })
        .eq('user_id', user.id)

      const { error: dbError } = await supabase
        .from('user_signatures')
        .insert({
          user_id: user.id,
          signature_url: urlData.publicUrl,
          is_active: true,
        })

      if (dbError) throw new Error(getErrorMessage(dbError))

      setExistingSignature(urlData.publicUrl)
      setMessage('✅ บันทึกลายเซ็นสำเร็จ!')
      setPreview(null)
      setProcessedPreview(null)
      if (tab === 'draw') clearDraw()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setMessage(`❌ เกิดข้อผิดพลาด: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveStamp() {
    setStampLoading(true)
    setStampMessage('Saving stamp...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not found')

      const canvas = stampCanvasRef.current
      if (!canvas) throw new Error('Stamp canvas not found')

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject('Cannot create blob')), 'image/png')
      })

      const fileName = `${user.id}/stamp_${Date.now()}.png`

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true,
        })
      if (uploadError) throw new Error(getErrorMessage(uploadError))

      const { data: urlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName)

      const { error: dbError } = await supabase
        .from('user_signatures')
        .insert({
          user_id: user.id,
          signature_url: urlData.publicUrl,
          is_active: false,
        })
      if (dbError) throw new Error(getErrorMessage(dbError))

      setExistingStamp(urlData.publicUrl)
      localStorage.setItem(`lubosawo_stamp_url_${user.id}`, urlData.publicUrl)
      setStampPreview(null)
      setProcessedStampPreview(null)
      setStampMessage('Stamp saved')
      if (stampInputRef.current) stampInputRef.current.value = ''
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setStampMessage(`Failed to save stamp: ${msg}`)
    } finally {
      setStampLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-blue-600 hover:underline mb-4 inline-block"
        >
          ← กลับหน้า Dashboard
        </button>

        <h1 className="text-2xl font-bold mb-6">จัดการลายเซ็น</h1>

        {existingSignature && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="font-semibold mb-2">ลายเซ็นปัจจุบัน</h2>
            <div className="border rounded p-4 bg-gray-100 flex justify-center">
              <img
                src={existingSignature}
                alt="ลายเซ็นปัจจุบัน"
                className="max-h-32 object-contain"
              />
            </div>
          </div>
        )}

        {existingStamp && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="font-semibold mb-2">Current Stamp</h2>
            <div
              className="border rounded p-4 flex justify-center"
              style={{ background: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px' }}
            >
              <img src={existingStamp} alt="Current stamp" className="max-h-36 object-contain" />
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold mb-2">Upload Stamp</h2>
          <p className="text-sm text-gray-500 mb-3">
            Upload stamp image. The app removes background automatically and saves transparent PNG.
          </p>
          <input
            ref={stampInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleStampFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100"
          />

          {stampPreview && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold mb-2">Original</h3>
                <img src={stampPreview} alt="Stamp original" className="max-h-40 object-contain mx-auto" />
              </div>
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold mb-2">Processed</h3>
                {processedStampPreview ? (
                  <img
                    src={processedStampPreview}
                    alt="Stamp processed"
                    className="max-h-40 object-contain mx-auto"
                    style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 16px 16px' }}
                  />
                ) : (
                  <p className="text-gray-400 text-sm">Processing...</p>
                )}
              </div>
            </div>
          )}

          <canvas ref={stampCanvasRef} className="hidden" />

          {processedStampPreview && (
            <button
              onClick={handleSaveStamp}
              disabled={stampLoading}
              className="w-full mt-4 bg-rose-600 text-white py-3 rounded-lg font-semibold hover:bg-rose-700 disabled:opacity-50"
            >
              {stampLoading ? 'Saving stamp...' : 'Save Stamp'}
            </button>
          )}

          {stampMessage && (
            <p className="text-center text-sm mt-3 font-medium">{stampMessage}</p>
          )}
        </div>

        {/* แท็บเลือก */}
        <div className="flex mb-4 bg-white rounded-lg shadow overflow-hidden">
          <button
            onClick={() => { setTab('upload'); setMessage(''); }}
            className={"flex-1 py-3 text-sm font-semibold transition-colors " + (tab === 'upload' ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50")}
          >
            📷 อัปโหลดรูป
          </button>
          <button
            onClick={() => { setTab('draw'); setMessage(''); }}
            className={"flex-1 py-3 text-sm font-semibold transition-colors " + (tab === 'draw' ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50")}
          >
            ✍️ วาดลายเซ็น
          </button>
        </div>

        {/* แท็บอัปโหลด */}
        {tab === 'upload' && (
          <>
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="font-semibold mb-2">อัปโหลดลายเซ็นใหม่</h2>
              <p className="text-sm text-gray-500 mb-3">
                ถ่ายรูปหรือสแกนลายเซ็นบนกระดาษขาว ระบบจะตัดพื้นหลังให้อัตโนมัติ
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {preview && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold mb-2">ต้นฉบับ</h3>
                  <img src={preview} alt="ต้นฉบับ" className="max-h-40 object-contain mx-auto" />
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold mb-2">ตัดพื้นหลังแล้ว</h3>
                  {processedPreview ? (
                    <img src={processedPreview} alt="ตัดพื้นหลัง" className="max-h-40 object-contain mx-auto" style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 16px 16px' }} />
                  ) : (
                    <p className="text-gray-400 text-sm">กำลังประมวลผล...</p>
                  )}
                </div>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />

            {processedPreview && (
              <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : '💾 บันทึกลายเซ็น'}
              </button>
            )}
          </>
        )}

        {/* แท็บวาด */}
        {tab === 'draw' && (
          <>
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="font-semibold mb-2">วาดลายเซ็น</h2>
              <p className="text-sm text-gray-500 mb-3">
                ใช้เมาส์หรือนิ้ววาดลายเซ็นในกรอบด้านล่าง
              </p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden" style={{ background: 'repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 50% / 16px 16px' }}>
                <canvas
                  ref={drawCanvasRef}
                  className="w-full cursor-crosshair touch-none"
                  style={{ height: '200px' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
              </div>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={clearDraw}
                  className="flex-1 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  🗑️ ล้างใหม่
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading || !hasDrawn}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'กำลังบันทึก...' : '💾 บันทึกลายเซ็น'}
                </button>
              </div>
            </div>
          </>
        )}

        {message && (
          <p className="text-center text-sm mb-4 font-medium">{message}</p>
        )}
      </div>
    </div>
  )
}
