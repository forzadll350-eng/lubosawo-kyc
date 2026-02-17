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
  kyc_status?: string
}

const ROLES: Record<number, { label: string; color: string }> = {
  1: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700' },
  2: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  3: { label: 'เจ้าหน้าที่', color: 'bg-green-100 text-green-700' },
  4: { label: 'ผู้ลงนาม', color: 'bg-yellow-100 text-yellow-700' },
  5: { label: 'ผู้ดู', color: 'bg-gray-100 text-gray-600' },
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const router = useRouter()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<number | null>(null)

  // Modal
  const [editUser, setEditUser] = useState<UserProfile | null>(null)
  const [editRoleId, setEditRoleId] = useState(5)
  const [editIsActive, setEditIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAdminAndLoad() }, [])

  async function checkAdminAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

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
      // ดึง KYC status ของทุกคน
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
        .update({
          role_id: editRoleId,
          is_active: editIsActive,
        })
        .eq('id', editUser.id)

      if (error) throw error

      // audit log
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

  // Filter
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
      case 'approved': return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">✅ ผ่าน</span>
      case 'pending': return <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">⏳ รอตรวจ</span>
      case 'rejected': return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">❌ ไม่ผ่าน</span>
      default: return <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">— ยังไม่ยืนยัน</span>
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => router.push('/admin')} className="text-blue-600 hover:underline mb-4 inline-block">← กลับหน้า Admin</button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">👥 จัดการผู้ใช้งาน</h1>
            <p className="text-sm text-gray-500">ทั้งหมด {users.length} คน</p>
          </div>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex justify-between items-center">
            <span className="text-sm">{message}</span>
            <button onClick={() => setMessage('')} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="🔍 ค้นหาชื่อ, อีเมล, แผนก..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
          />
          <div className="flex gap-1">
            <button
              onClick={() => setFilterRole(null)}
              className={"px-3 py-1.5 rounded-full text-xs font-semibold " + (filterRole === null ? "bg-blue-600 text-white" : "bg-white border text-gray-500")}
            >ทั้งหมด</button>
            {Object.entries(ROLES).map(([id, role]) => (
              <button
                key={id}
                onClick={() => setFilterRole(Number(id))}
                className={"px-3 py-1.5 rounded-full text-xs font-semibold " + (filterRole === Number(id) ? "bg-blue-600 text-white" : "bg-white border text-gray-500")}
              >{role.label}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  {['ชื่อ', 'อีเมล', 'แผนก / ตำแหน่ง', 'Role', 'KYC', 'สถานะ', 'จัดการ'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 border-b">{h}</th>
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
                        <span className="text-sm font-semibold">{u.full_name || '-'}</span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">{u.email}</td>
                      <td className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
                        {u.department && <div>{u.department}</div>}
                        {u.position && <div className="text-gray-400">{u.position}</div>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className={"px-2 py-0.5 rounded-full text-xs font-bold " + role.color}>{role.label}</span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        {kycBadge(u.kyc_status || 'none')}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        {u.is_active
                          ? <span className="text-green-600 text-xs font-bold">🟢 ใช้งาน</span>
                          : <span className="text-red-600 text-xs font-bold">🔴 ปิดใช้งาน</span>
                        }
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-blue-600 text-xs font-semibold hover:underline"
                        >แก้ไข</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* สรุป Role */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {Object.entries(ROLES).map(([id, role]) => {
            const count = users.filter(u => u.role_id === Number(id)).length
            return (
              <div key={id} className="bg-white rounded-lg p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-gray-800">{count}</div>
                <div className={"text-xs font-semibold mt-1 " + role.color.split(' ')[1]}>{role.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ====== EDIT MODAL ====== */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">✏️ แก้ไขผู้ใช้</h3>
            <p className="text-sm text-gray-500 mb-4">{editUser.full_name} ({editUser.email})</p>

            <div className="space-y-4">
              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(ROLES).map(([id, role]) => (
                    <label
                      key={id}
                      className={"flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors " +
                        (editRoleId === Number(id) ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50")}
                    >
                      <input
                        type="radio"
                        name="role"
                        checked={editRoleId === Number(id)}
                        onChange={() => setEditRoleId(Number(id))}
                        className="accent-blue-600"
                      />
                      <div>
                        <span className={"px-2 py-0.5 rounded-full text-xs font-bold " + role.color}>{role.label}</span>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {Number(id) === 1 && 'จัดการทุกอย่าง + จัดการ role'}
                          {Number(id) === 2 && 'จัดการ KYC + จัดการ role'}
                          {Number(id) === 3 && 'สร้างเอกสาร + ส่งลงนาม'}
                          {Number(id) === 4 && 'ลงนามเอกสารที่ได้รับ'}
                          {Number(id) === 5 && 'ดูเอกสารอย่างเดียว'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Active */}
              <div>
                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={e => setEditIsActive(e.target.checked)}
                    className="accent-green-600 w-5 h-5"
                  />
                  <div>
                    <span className="text-sm font-semibold">เปิดใช้งานบัญชี</span>
                    <p className="text-xs text-gray-400">ปิดจะทำให้ผู้ใช้ login ไม่ได้</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
              </button>
              <button
                onClick={() => setEditUser(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200"
              >ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
