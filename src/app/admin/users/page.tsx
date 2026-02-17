'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type UserProfile = {
  id: string
  email: string
  full_name: string
  department: string
  position: string
  role_id: number
  is_active: boolean
  created_at: string
  kyc_status?: string
}

const ROLES: Record<number, { label: string; color: string; desc: string }> = {
  1: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', desc: 'จัดการทุกอย่าง + จัดการ role' },
  2: { label: 'Admin', color: 'bg-blue-100 text-blue-700', desc: 'จัดการ KYC + จัดการ role' },
  3: { label: 'เจ้าหน้าที่', color: 'bg-green-100 text-green-700', desc: 'สร้างเอกสาร + ส่งลงนาม' },
  4: { label: 'ผู้ลงนาม', color: 'bg-yellow-100 text-yellow-700', desc: 'ลงนามเอกสารที่ได้รับ' },
  5: { label: 'ผู้ดู', color: 'bg-gray-100 text-gray-600', desc: 'ดูเอกสารอย่างเดียว' },
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const router = useRouter()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<number | null>(null)
  const [adminEmail, setAdminEmail] = useState('')

  // Modal
  const [editUser, setEditUser] = useState<UserProfile | null>(null)
  const [editRoleId, setEditRoleId] = useState(5)
  const [editIsActive, setEditIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAdminAndLoad() }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setAdminEmail(user.email || '')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role_id')
      .eq('id', user.id)
      .single()

    if (!profile || ![1, 2].includes(profile.role_id)) {
      router.push('/dashboard')
      return
    }

    await loadUsers()
  }

  async function loadUsers() {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (profiles) {
      const userIds = profiles.map(p => p.id)
      const { data: kycList } = await supabase
        .from('kyc_submissions')
        .select('user_id, status')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })

      const kycMap = new Map<string, string>()
      kycList?.forEach(k => {
        if (!kycMap.has(k.user_id)) kycMap.set(k.user_id, k.status)
      })

      const enriched: UserProfile[] = profiles.map(p => ({
        ...p,
        kyc_status: kycMap.get(p.id) || 'none',
      }))

      setUsers(enriched)
    }
    setLoading(false)
  }

  function openEdit(user: UserProfile) {
    setEditUser(user)
    setEditRoleId(user.role_id)
    setEditIsActive(user.is_active)
  }

  async function saveEdit() {
    if (!editUser) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role_id: editRoleId, is_active: editIsActive })
        .eq('id', editUser.id)

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'user.update_role',
        entity_type: 'user_profile',
        entity_id: editUser.id,
        details: {
          target_user: editUser.full_name,
          old_role_id: editUser.role_id,
          new_role_id: editRoleId,
          is_active: editIsActive,
        },
      })

      setMessage(`✅ อัปเดต ${editUser.full_name} สำเร็จ`)
      setEditUser(null)
      await loadUsers()
    } catch (err: any) {
      setMessage(`❌ ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.department?.toLowerCase().includes(search.toLowerCase())
    const matchRole = filterRole === null || u.role_id === filterRole
    return matchSearch && matchRole
  })

  const kycBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[11px] font-bold">✅ ผ่าน</span>
      case 'pending': return <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[11px] font-bold">⏳ รอตรวจ</span>
      case 'rejected': return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-bold">❌ ไม่ผ่าน</span>
      default: return <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px] font-bold">— ยังไม่ยืนยัน</span>
    }
  }

  const stats = {
    total: users.length,
    admin: users.filter(u => u.role_id <= 2).length,
    officer: users.filter(u => u.role_id === 3).length,
    signer: users.filter(u => u.role_id === 4).length,
    viewer: users.filter(u => u.role_id === 5).length,
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* ★ Sidebar — เหมือนหน้า /admin */}
      <div className="w-[240px] shrink-0 bg-navy flex flex-col fixed top-0 left-0 bottom-0 z-20">
        <div className="p-5 border-b border-white/8 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-2 rounded-[10px] flex items-center justify-center font-extrabold text-navy text-base shrink-0">ลบส</div>
          <div>
            <h2 className="text-white text-[13px] font-bold leading-tight">อบต.ลุโบะสาวอ</h2>
            <p className="text-gold text-[10px] opacity-80">ระบบจัดการ KYC</p>
          </div>
        </div>

        <nav className="flex-1 p-3">
          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5">เมนูแอดมิน</div>

          <button onClick={() => router.push('/admin')}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent">
            <span className="text-base w-5 text-center">📋</span>ตรวจสอบ KYC
          </button>

          <button onClick={() => router.push('/admin/users')}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-bold mb-0.5 transition-all border-none cursor-pointer bg-gold/18 text-gold-2">
            <span className="text-base w-5 text-center">👥</span>จัดการผู้ใช้
            <span className="ml-auto bg-gold text-navy text-[10px] font-bold px-1.5 py-0.5 rounded-full">{stats.total}</span>
          </button>

          <div className="text-[10px] font-bold text-white/30 tracking-widest uppercase px-2 py-1.5 mt-4">ลิงก์ลัด</div>

          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium mb-0.5 transition-all border-none cursor-pointer text-white/65 hover:bg-white/7 hover:text-white bg-transparent">
            <span className="text-base w-5 text-center">📊</span>ไป Dashboard
          </button>
        </nav>

        <div className="p-3 border-t border-white/8">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-navy-3 to-status-cyan flex items-center justify-center text-white font-bold text-[13px]">A</div>
            <div>
              <div className="text-white text-xs font-semibold">Admin</div>
              <small className="text-white/40 text-[10px]">{adminEmail}</small>
            </div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="w-full mt-2 py-2 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all border-none cursor-pointer">
            ออกจากระบบ
          </button>
        </div>
      </div>

      {/* ★ Main Content */}
      <div className="ml-[240px] flex-1">
        <div className="bg-white border-b border-gray-200 px-8 py-3.5 flex items-center sticky top-0 z-10 shadow-sm">
          <h2 className="text-base font-bold text-navy">👥 จัดการผู้ใช้งาน</h2>
          <span className="ml-3 text-xs text-gray-400">{stats.total} คน</span>
        </div>

        <div className="p-7">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { icon: '👥', num: stats.total, label: 'ทั้งหมด', cls: 'border-t-[3px] border-t-status-cyan' },
              { icon: '👑', num: stats.admin, label: 'Admin', cls: 'border-t-[3px] border-t-purple-500' },
              { icon: '💼', num: stats.officer, label: 'เจ้าหน้าที่', cls: 'border-t-[3px] border-t-status-green' },
              { icon: '✍️', num: stats.signer, label: 'ผู้ลงนาม', cls: 'border-t-[3px] border-t-status-orange' },
              { icon: '👤', num: stats.viewer, label: 'ผู้ดู', cls: 'border-t-[3px] border-t-gray-400' },
            ].map((s, i) => (
              <div key={i} className={`bg-white rounded-xl p-5 border border-gray-200 shadow-sm ${s.cls}`}>
                <span className="text-2xl block mb-2.5">{s.icon}</span>
                <div className="text-[28px] font-extrabold text-navy leading-none mb-1">{s.num}</div>
                <div className="text-xs text-gray-400 font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Message */}
          {message && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex justify-between items-center">
              <span className="text-sm">{message}</span>
              <button onClick={() => setMessage('')} className="text-gray-400 hover:text-gray-600 border-none bg-transparent cursor-pointer text-lg">×</button>
            </div>
          )}

          {/* Search + Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="🔍 ค้นหาชื่อ, อีเมล, แผนก..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm flex-1 min-w-[200px] outline-none focus:border-navy-3"
            />
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setFilterRole(null)}
                className={"px-3 py-1.5 rounded-full text-[11px] font-bold border-none cursor-pointer transition-colors " +
                  (filterRole === null ? "bg-navy text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50")}>
                ทั้งหมด
              </button>
              {Object.entries(ROLES).map(([id, role]) => (
                <button key={id} onClick={() => setFilterRole(Number(id))}
                  className={"px-3 py-1.5 rounded-full text-[11px] font-bold border-none cursor-pointer transition-colors " +
                    (filterRole === Number(id) ? "bg-navy text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50")}>
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['ผู้ใช้', 'แผนก / ตำแหน่ง', 'Role', 'KYC', 'สถานะ', 'วันที่สมัคร', 'จัดการ'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">ไม่พบผู้ใช้</td></tr>
                ) : filtered.map(u => {
                  const role = ROLES[u.role_id] || ROLES[5]
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-2 to-navy-3 flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {(u.full_name || 'U')[0]}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-navy">{u.full_name || '-'}</div>
                            <small className="text-[11px] text-gray-400">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <div className="text-xs text-gray-700">{u.department || '-'}</div>
                        {u.position && <div className="text-[11px] text-gray-400">{u.position}</div>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={"px-2 py-0.5 rounded-full text-[11px] font-bold " + role.color}>{role.label}</span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        {kycBadge(u.kyc_status || 'none')}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        {u.is_active !== false
                          ? <span className="text-green-600 text-[11px] font-bold">🟢 ใช้งาน</span>
                          : <span className="text-red-600 text-[11px] font-bold">🔴 ปิดใช้งาน</span>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : '-'}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <button onClick={() => openEdit(u)}
                          className="px-3 py-1.5 bg-navy text-white rounded-md text-xs font-semibold hover:bg-navy-3 transition-colors border-none cursor-pointer">
                          ✏️ แก้ไข
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ★ EDIT MODAL */}
      {editUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-[17px] font-bold text-navy">✏️ แก้ไขผู้ใช้</h3>
                <p className="text-xs text-gray-400">{editUser.full_name} — {editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center cursor-pointer border-none">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Role */}
              <div>
                <label className="block text-sm font-bold text-navy mb-2">กำหนด Role</label>
                <div className="space-y-2">
                  {Object.entries(ROLES).map(([id, role]) => (
                    <label key={id}
                      className={"flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all " +
                        (editRoleId === Number(id) ? "border-navy bg-blue-50" : "border-gray-200 hover:bg-gray-50")}>
                      <input type="radio" name="role" checked={editRoleId === Number(id)}
                        onChange={() => setEditRoleId(Number(id))} className="accent-blue-600" />
                      <div className="flex-1">
                        <span className={"px-2 py-0.5 rounded-full text-[11px] font-bold " + role.color}>{role.label}</span>
                        <p className="text-[11px] text-gray-400 mt-0.5">{role.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Active */}
              <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)} className="accent-green-600 w-5 h-5" />
                <div>
                  <span className="text-sm font-semibold">🟢 เปิดใช้งานบัญชี</span>
                  <p className="text-[11px] text-gray-400">ปิดจะทำให้ผู้ใช้ login ไม่ได้</p>
                </div>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex gap-2">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2.5 bg-navy text-white rounded-lg font-semibold hover:bg-navy-3 disabled:opacity-50 border-none cursor-pointer">
                {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
              </button>
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-600 rounded-lg font-semibold hover:bg-gray-300 border-none cursor-pointer">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
