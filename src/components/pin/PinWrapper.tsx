'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'
import PinProvider from './PinProvider'

// หน้าที่ไม่ต้องใส่ PIN (หน้า public)
const PUBLIC_PATHS = ['/', '/verify', '/register']

export default function PinWrapper({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  const isPublicPage = PUBLIC_PATHS.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setHasSession(!!session)

      // ถ้า logout → ลบ PIN ทิ้ง
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('pin_hash')
        localStorage.removeItem('pin_locked')
        localStorage.removeItem('pin_attempts')
        localStorage.removeItem('pin_hidden_at')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ยังโหลดอยู่
  if (hasSession === null) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  // หน้า public หรือไม่มี session → ไม่ต้องล็อก
  if (isPublicPage || !hasSession) {
    return <>{children}</>
  }

  // หน้า private + มี session → ครอบ PinProvider
  return (
    <PinProvider hasSession={hasSession}>
      {children}
    </PinProvider>
  )
}
