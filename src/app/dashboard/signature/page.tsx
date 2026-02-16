'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

import { useRouter } from 'next/navigation'

export default function SignaturePage() {
  const supabase = createClient()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [processedPreview, setProcessedPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [existingSignature, setExistingSignature] = useState<string | null>(null)

  useEffect(() => {
    loadExistingSignature()
  }, [])

  async function loadExistingSignature() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push('/')

    const { data } = await supabase
      .from('user_signatures')
      .select('signature_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (data?.signature_url) {
      setExistingSignature(data.signature_url)
    }
  }

    function removeBackground(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return reject('No canvas')

        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject('No context')

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          // เก็บเฉพาะสีน้ำเงิน: B สูงกว่า R และ G อย่างชัดเจน
          const isBlue = b > 80 && b > r * 1.3 && b > g * 1.2

          if (isBlue) {
            // เก็บไว้ — ทำให้เข้มขึ้น
            data[i] = Math.max(0, r - 30)
            data[i + 1] = Math.max(0, g - 30)
            data[i + 2] = Math.min(255, b + 20)
            data[i + 3] = 255
          } else {
            // ลบทิ้ง → โปร่งใส
            data[i + 3] = 0
          }
        }

        ctx.putImageData(imageData, 0, 0)

        canvas.toBlob((blob) => {
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
      const processedBlob = await removeBackground(file)
      const processedUrl = URL.createObjectURL(processedBlob)
      setProcessedPreview(processedUrl)
      setMessage('ตัดพื้นหลังเสร็จแล้ว ตรวจสอบแล้วกดบันทึก')
    } catch (err) {
      setMessage('เกิดข้อผิดพลาดในการตัดพื้นหลัง')
      console.error(err)
    }
  }

  async function handleSave() {
    setLoading(true)
    setMessage('กำลังบันทึก...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      const canvas = canvasRef.current
      if (!canvas) throw new Error('ไม่พบ canvas')

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject('Cannot create blob'), 'image/png')
      })

      const fileName = `${user.id}/signature_${Date.now()}.png`

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true,
        })

      if (uploadError) throw uploadError

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

      if (dbError) throw dbError

      setExistingSignature(urlData.publicUrl)
      setMessage('✅ บันทึกลายเซ็นสำเร็จ!')
      setPreview(null)
      setProcessedPreview(null)
    } catch (err: any) {
      setMessage(`❌ เกิดข้อผิดพลาด: ${err.message}`)
    } finally {
      setLoading(false)
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

        {message && (
          <p className="text-center text-sm mb-4 font-medium">{message}</p>
        )}

        {processedPreview && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : '💾 บันทึกลายเซ็น'}
          </button>
        )}
      </div>
    </div>
  )
}
