'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Category = { id: number; code: string; name: string; description: string; department: string }
type Document = { id: string; title: string; document_number: string; description: string; file_url: string; file_name: string; file_size: number; status: string; created_at: string; category_id: number; document_categories?: Category }

export default function DocumentsPage() {
  const supabase = createClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [documents, setDocuments] = useState<Document[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    title: '',
    document_number: '',
    description: '',
    category_id: 0,
  })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: cats } = await supabase.from('document_categories').select('*').eq('is_active', true).order('id')
    if (cats) {
      setCategories(cats)
      if (cats.length > 0 && form.category_id === 0) setForm(f => ({ ...f, category_id: cats[0].id }))
    }

    const { data: docs } = await supabase
      .from('documents')
      .select('*, document_categories(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (docs) setDocuments(docs)
    setLoading(false)
  }

  async function handleUpload() {
    if (!form.title.trim()) { setMessage('❌ กรุณากรอกชื่อเอกสาร'); return }
    if (!file) { setMessage('❌ กรุณาเลือกไฟล์'); return }

    setUploading(true)
    setMessage('กำลังอัปโหลด...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      const fileName = `${user.id}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('official-documents')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        category_id: form.category_id,
        document_number: form.document_number || null,
        title: form.title,
        description: form.description || null,
        file_url: fileName,
        file_name: file.name,
        file_size: file.size,
        status: 'draft',
      })

      if (dbError) throw dbError

      setMessage('✅ สร้างเอกสารสำเร็จ!')
      setForm({ title: '', document_number: '', description: '', category_id: categories[0]?.id || 0 })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowCreate(false)
      loadData()
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleViewFile(filePath: string) {
    const { data, error } = await supabase.storage
      .from('official-documents')
      .createSignedUrl(filePath, 300)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      alert('ไม่สามารถเปิดไฟล์ได้: ' + (error?.message || ''))
    }
  }

  const statusConfig: Record<string, { label: string; cls: string }> = {
    draft: { label: 'ฉบับร่าง', cls: 'bg-gray-100 text-gray-600' },
    pending_sign: { label: 'รอลงนาม', cls: 'bg-yellow-100 text-yellow-700' },
    signed: { label: 'ลงนามแล้ว', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-700' },
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline mb-4 inline-block">
          ← กลับหน้า Dashboard
        </button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">📄 เอกสารของฉัน</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            {showCreate ? '✕ ปิด' : '+ สร้างเอกสาร'}
          </button>
        </div>

        {message && <p className="text-center text-sm mb-4 font-medium">{message}</p>}

        {showCreate && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="font-semibold mb-4">สร้างเอกสารใหม่</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">ชื่อเอกสาร *</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                  placeholder="เช่น บันทึกข้อความขออนุมัติ..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">เลขที่เอกสาร</label>
                <input
                  value={form.document_number}
                  onChange={e => setForm({ ...form, document_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                  placeholder="เช่น ลบส 001/2569"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">หมวดหมู่</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm({ ...form, category_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">ไฟล์เอกสาร *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.png"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 font-semibold block mb-1">รายละเอียด</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 resize-none h-20"
                placeholder="รายละเอียดเพิ่มเติม..."
              />
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {uploading ? 'กำลังอัปโหลด...' : '📤 อัปโหลดเอกสาร'}
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                {['ชื่อเอกสาร', 'หมวดหมู่', 'สถานะ', 'ขนาด', 'วันที่สร้าง', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">ยังไม่มีเอกสาร</td></tr>
              ) : documents.map(doc => {
                const sc = statusConfig[doc.status] || statusConfig.draft
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-800">{doc.title}</div>
                      {doc.document_number && <small className="text-xs text-gray-400">{doc.document_number}</small>}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{doc.document_categories?.name || '-'}</td>
                    <td className="px-4 py-3 border-b border-gray-100">
                      <span className={"px-2 py-0.5 rounded-full text-xs font-bold " + sc.cls}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString('th-TH')}</td>
                    <td className="px-4 py-3 border-b border-gray-100">
                      <button onClick={() => handleViewFile(doc.file_url)} className="text-blue-600 text-xs font-semibold hover:underline">ดู</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
