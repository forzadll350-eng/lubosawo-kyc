'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Log = {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details: any
  created_at: string
  user_profiles?: { full_name: string; email: string }
}

export default function AuditLogPage() {
  const supabase = createClient()
  const router = useRouter()

  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data } = await supabase
      .from('audit_logs')
      .select('*, user_profiles:user_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (data) setLogs(data)
    setLoading(false)
  }

  const actionConfig: Record<string, { icon: string; label: string; cls: string }> = {
    'document.create': { icon: '📄', label: 'สร้างเอกสาร', cls: 'bg-blue-100 text-blue-700' },
    'document.upload': { icon: '📤', label: 'อัปโหลดเอกสาร', cls: 'bg-blue-100 text-blue-700' },
    'document.send_sign': { icon: '📨', label: 'ส่งลงนาม', cls: 'bg-orange-100 text-orange-700' },
    'document.sign': { icon: '✍️', label: 'ลงนามเอกสาร', cls: 'bg-green-100 text-green-700' },
    'document.reject': { icon: '❌', label: 'ปฏิเสธเอกสาร', cls: 'bg-red-100 text-red-700' },
    'document.completed': { icon: '✅', label: 'ลงนามครบ', cls: 'bg-green-100 text-green-700' },
    'kyc.submit': { icon: '📋', label: 'ส่ง KYC', cls: 'bg-purple-100 text-purple-700' },
    'kyc.approve': { icon: '✅', label: 'อนุมัติ KYC', cls: 'bg-green-100 text-green-700' },
    'kyc.reject': { icon: '❌', label: 'ปฏิเสธ KYC', cls: 'bg-red-100 text-red-700' },
    'signature.upload': { icon: '✍️', label: 'อัปโหลดลายเซ็น', cls: 'bg-indigo-100 text-indigo-700' },
    'user.login': { icon: '🔑', label: 'เข้าสู่ระบบ', cls: 'bg-gray-100 text-gray-600' },
    'user.role_change': { icon: '🔄', label: 'เปลี่ยน Role', cls: 'bg-yellow-100 text-yellow-700' },
  }

  const entityTypes = ['all', ...new Set(logs.map(l => l.entity_type))]
  const filtered = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  function formatTime(ts: string) {
    const d = new Date(ts)
    return d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
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

        <h1 className="text-2xl font-bold mb-4">📜 บันทึกกิจกรรม (Audit Log)</h1>

        <div className="flex gap-2 mb-4 flex-wrap">
          {entityTypes.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={"px-3 py-1.5 rounded-full text-xs font-semibold transition-colors " + (filter === t ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50")}
            >
              {t === 'all' ? 'ทั้งหมด' : t === 'document' ? 'เอกสาร' : t === 'kyc' ? 'KYC' : t === 'signature' ? 'ลายเซ็น' : t === 'user' ? 'ผู้ใช้' : t}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">ยังไม่มีบันทึก</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(log => {
                const ac = actionConfig[log.action] || { icon: '📝', label: log.action, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                    <span className="text-xl w-8 text-center">{ac.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{log.user_profiles?.full_name || 'ระบบ'}</span>
                        <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold " + ac.cls}>{ac.label}</span>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {log.details.title && `เอกสาร: ${log.details.title}`}
                          {log.details.reason && ` | เหตุผล: ${log.details.reason}`}
                          {log.details.role && ` | Role: ${log.details.role}`}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatTime(log.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
