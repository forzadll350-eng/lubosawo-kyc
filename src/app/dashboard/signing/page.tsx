'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Task = {
  id: string
  document_id: string
  step_order: number
  required_action: string
  status: string
  doc_title?: string
  doc_number?: string
  doc_file_url?: string
  doc_status?: string
  owner_name?: string
}

export default function SigningPage() {
  const supabase = createClient()
  const router = useRouter()

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [signModal, setSignModal] = useState<Task | null>(null)
  const [signing, setSigning] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    // โหลดลายเซ็น
    const { data: sig } = await supabase
      .from('user_signatures')
      .select('signature_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (sig?.signature_url) setSignatureUrl(sig.signature_url)

    // โหลดงานลงนาม (ไม่ join)
    const { data: wf } = await supabase
      .from('signing_workflows')
      .select('*')
      .eq('signer_id', user.id)
      .order('created_at', { ascending: false })

    if (wf && wf.length > 0) {
      // ดึง documents แยก
      const docIds = [...new Set(wf.map(w => w.document_id).filter(Boolean))]
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title, document_number, file_url, status, user_id')
        .in('id', docIds)

      // ดึง owner profiles แยก
      const ownerIds = [...new Set(docs?.map(d => d.user_id).filter(Boolean) || [])]
      let profileMap = new Map()
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', ownerIds)
        profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || [])
      }

      const docMap = new Map(docs?.map(d => [d.id, d]) || [])

      const enriched: Task[] = wf.map(w => {
        const doc = docMap.get(w.document_id)
        return {
          id: w.id,
          document_id: w.document_id,
          step_order: w.step_order,
          required_action: w.required_action,
          status: w.status,
          doc_title: doc?.title || '-',
          doc_number: doc?.document_number || '',
          doc_file_url: doc?.file_url || '',
          doc_status: doc?.status || '',
          owner_name: doc ? (profileMap.get(doc.user_id) || '-') : '-',
        }
      })

      setTasks(enriched)
    } else {
      setTasks([])
    }

    setLoading(false)
  }

  async function handleViewFile(filePath: string) {
    const { data } = await supabase.storage.from('official-documents').createSignedUrl(filePath, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else alert('ไม่สามารถเปิดไฟล์ได้')
  }

  async function handleSign(task: Task) {
    if (!signatureUrl) {
      setMessage('❌ คุณยังไม่มีลายเซ็น กรุณาไปอัปโหลดลายเซ็นก่อน')
      return
    }
    setSignModal(task)
  }

  async function confirmSign() {
    if (!signModal) return
    setSigning(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้')

      const { data: sig } = await supabase
        .from('user_signatures')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      // ✅ เปลี่ยนจาก 'signed' → 'completed' ให้ตรง constraint
      const { error: wfError } = await supabase
        .from('signing_workflows')
        .update({
          status: 'completed',
          signature_id: sig?.id || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', signModal.id)
      if (wfError) throw wfError

      // เช็คว่าทุกคนลงนามครบหรือยัง
      const { data: remaining } = await supabase
        .from('signing_workflows')
        .select('id')
        .eq('document_id', signModal.document_id)
        .eq('status', 'pending')
        .neq('id', signModal.id)

      if (!remaining || remaining.length === 0) {
        await supabase
          .from('documents')
          .update({ status: 'signed', updated_at: new Date().toISOString() })
          .eq('id', signModal.document_id)
      }

      setMessage('✅ ลงนามสำเร็จ!')
      setSignModal(null)
      loadData()
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    } finally {
      setSigning(false)
    }
  }

  async function handleReject(task: Task) {
    const reason = prompt('ระบุเหตุผลในการปฏิเสธ:')
    if (!reason) return

    try {
      await supabase
        .from('signing_workflows')
        .update({ status: 'rejected', completed_at: new Date().toISOString() })
        .eq('id', task.id)

      await supabase
        .from('documents')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', task.document_id)

      setMessage('❌ ปฏิเสธเอกสารแล้ว')
      loadData()
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    }
  }

  // ✅ เปลี่ยน filter จาก 'signed' → 'completed'
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  const statusConfig: Record<string, { label: string; cls: string }> = {
    pending: { label: 'รอลงนาม', cls: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'ลงนามแล้ว', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-700' },
  }

  const actionLabel: Record<string, string> = {
    sign: '✍️ ลงนาม',
    approve: '✅ อนุมัติ',
    review: '🔍 ตรวจสอบ',
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline mb-4 inline-block">← กลับหน้า Dashboard</button>

        <h1 className="text-2xl font-bold mb-2">✍️ งานลงนามของฉัน</h1>

        {!signatureUrl && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-red-700">⚠️ คุณยังไม่มีลายเซ็น กรุณาอัปโหลดก่อนลงนาม</span>
            <button onClick={() => router.push('/dashboard/signature')} className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700">อัปโหลดลายเซ็น</button>
          </div>
        )}

        {message && <p className="text-center text-sm mb-4 font-medium">{message}</p>}

        <div className="flex gap-2 mb-4">
          {[
            { key: 'pending', label: 'รอลงนาม', count: tasks.filter(t => t.status === 'pending').length },
            { key: 'completed', label: 'ลงนามแล้ว', count: tasks.filter(t => t.status === 'completed').length },
            { key: 'all', label: 'ทั้งหมด', count: tasks.length },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as any)}
              className={"px-3 py-1.5 rounded-full text-xs font-semibold transition-colors " + (filter === f.key ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50")}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                {['เอกสาร', 'ผู้ส่ง', 'ประเภท', 'สถานะ', 'จัดการ'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">ไม่มีงาน</td></tr>
              ) : filtered.map(task => {
                const sc = statusConfig[task.status] || statusConfig.pending
                return (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-800">{task.doc_title}</div>
                      {task.doc_number && <small className="text-xs text-gray-400">{task.doc_number}</small>}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{task.owner_name}</td>
                    <td className="px-4 py-3 border-b border-gray-100 text-xs">{actionLabel[task.required_action] || task.required_action}</td>
                    <td className="px-4 py-3 border-b border-gray-100">
                      <span className={"px-2 py-0.5 rounded-full text-xs font-bold " + sc.cls}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-100">
                      <div className="flex gap-2">
                        {task.doc_file_url && (
                          <button onClick={() => handleViewFile(task.doc_file_url!)} className="text-blue-600 text-xs font-semibold hover:underline">ดู</button>
                        )}
                        {task.status === 'pending' && (
                          <>
                            <button onClick={() => handleSign(task)} className="text-green-600 text-xs font-semibold hover:underline">ลงนาม</button>
                            <button onClick={() => handleReject(task)} className="text-red-600 text-xs font-semibold hover:underline">ปฏิเสธ</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIGN CONFIRMATION MODAL */}
      {signModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setSignModal(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">✍️ ยืนยันการลงนาม</h3>
            <p className="text-sm text-gray-600 mb-2">เอกสาร: <strong>{signModal.doc_title}</strong></p>
            <p className="text-xs text-gray-400 mb-4">ลายเซ็นของคุณจะถูกแนบไปกับเอกสารนี้</p>

            {signatureUrl && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex justify-center mb-4">
                <img src={signatureUrl} alt="ลายเซ็น" className="max-h-24 object-contain" />
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setSignModal(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200">ยกเลิก</button>
              <button onClick={confirmSign} disabled={signing} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
                {signing ? 'กำลังลงนาม...' : '✍️ ยืนยันลงนาม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}