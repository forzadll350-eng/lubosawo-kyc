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
  user_profiles?: { full_name: string; email: string } | null
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

    // à¸”à¸¶à¸‡ logs à¸˜à¸£à¸£à¸¡à¸”à¸² (à¹„à¸¡à¹ˆ join)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (data && data.length > 0) {
      // à¸”à¸¶à¸‡ user profiles à¹à¸¢à¸
      const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))]

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', userIds)

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

        // à¹à¸›à¸° profile à¹€à¸‚à¹‰à¸² log
        const enriched = data.map(l => ({
          ...l,
          user_profiles: profileMap.get(l.user_id) || null,
        }))

        setLogs(enriched)
      } else {
        setLogs(data)
      }
    } else {
      setLogs([])
    }

    setLoading(false)
  }

  const actionConfig: Record<string, { icon: string; label: string; cls: string }> = {
    'document.create': { icon: 'ðŸ“„', label: 'à¸ªà¸£à¹‰à¸²à¸‡à¹€à¸­à¸à¸ªà¸²à¸£', cls: 'bg-blue-100 text-blue-700' },
    'document.upload': { icon: 'ðŸ“¤', label: 'à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¹€à¸­à¸à¸ªà¸²à¸£', cls: 'bg-blue-100 text-blue-700' },
    'document.send_sign': { icon: 'ðŸ“¨', label: 'à¸ªà¹ˆà¸‡à¸¥à¸‡à¸™à¸²à¸¡', cls: 'bg-orange-100 text-orange-700' },
    'document.sign': { icon: 'âœï¸', label: 'à¸¥à¸‡à¸™à¸²à¸¡à¹€à¸­à¸à¸ªà¸²à¸£', cls: 'bg-green-100 text-green-700' },
    'document.reject': { icon: 'âŒ', label: 'à¸›à¸à¸´à¹€à¸ªà¸˜à¹€à¸­à¸à¸ªà¸²à¸£', cls: 'bg-red-100 text-red-700' },
    'document.completed': { icon: 'âœ…', label: 'à¸¥à¸‡à¸™à¸²à¸¡à¸„à¸£à¸š', cls: 'bg-green-100 text-green-700' },
    'kyc.submit': { icon: 'ðŸ“‹', label: 'à¸ªà¹ˆà¸‡ KYC', cls: 'bg-purple-100 text-purple-700' },
    'kyc.contact_verified': { icon: '📧', label: 'KYC Contact Verified', cls: 'bg-cyan-100 text-cyan-700' },
    'kyc.approve': { icon: 'âœ…', label: 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´ KYC', cls: 'bg-green-100 text-green-700' },
    'kyc.reject': { icon: 'âŒ', label: 'à¸›à¸à¸´à¹€à¸ªà¸˜ KYC', cls: 'bg-red-100 text-red-700' },
    'signature.upload': { icon: 'âœï¸', label: 'à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™', cls: 'bg-indigo-100 text-indigo-700' },
    'user.login': { icon: 'ðŸ”‘', label: 'à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸š', cls: 'bg-gray-100 text-gray-600' },
    'user.role_change': { icon: 'ðŸ”„', label: 'à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ Role', cls: 'bg-yellow-100 text-yellow-700' },
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
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline mb-4 inline-block">â† à¸à¸¥à¸±à¸šà¸«à¸™à¹‰à¸² Dashboard</button>

        <h1 className="text-2xl font-bold mb-4">ðŸ“œ à¸šà¸±à¸™à¸—à¸¶à¸à¸à¸´à¸ˆà¸à¸£à¸£à¸¡ (Audit Log)</h1>

        <div className="flex gap-2 mb-4 flex-wrap">
          {entityTypes.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={"px-3 py-1.5 rounded-full text-xs font-semibold transition-colors " + (filter === t ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50")}
            >
              {t === 'all' ? 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”' : t === 'document' ? 'à¹€à¸­à¸à¸ªà¸²à¸£' : t === 'kyc' ? 'KYC' : t === 'signature' ? 'à¸¥à¸²à¸¢à¹€à¸‹à¹‡à¸™' : t === 'user' ? 'à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰' : t}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸šà¸±à¸™à¸—à¸¶à¸</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(log => {
                const ac = actionConfig[log.action] || { icon: 'ðŸ“', label: log.action, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                    <span className="text-xl w-8 text-center">{ac.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{log.user_profiles?.full_name || 'à¸£à¸°à¸šà¸š'}</span>
                        <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold " + ac.cls}>{ac.label}</span>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {log.details.title && `à¹€à¸­à¸à¸ªà¸²à¸£: ${log.details.title}`}
                          {log.details.reason && ` | à¹€à¸«à¸•à¸¸à¸œà¸¥: ${log.details.reason}`}
                          {log.details.role && ` | Role: ${log.details.role}`}
                          {log.details.channel && ` | Channel: ${log.details.channel}`}
                          {log.details.verified_at && ` | Verified: ${new Date(log.details.verified_at).toLocaleString('th-TH')}`}
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

