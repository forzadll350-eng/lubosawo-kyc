'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import PinSetup from './PinSetup'
import PinLock from './PinLock'
import { createClient } from '@/lib/supabase/client'

type PinState = 'loading' | 'no-session' | 'setup' | 'locked' | 'unlocked'

type PinContextType = {
  lockNow: () => void
  resetPin: () => void
}

const PinContext = createContext<PinContextType>({ lockNow: () => {}, resetPin: () => {} })
export const usePinLock = () => useContext(PinContext)

const IDLE_TIMEOUT = 2 * 60 * 1000 // 2 นาที
const MAX_ATTEMPTS = 5
const STORAGE_KEY = 'pin_hash'
const LOCK_KEY = 'pin_locked'
const ATTEMPTS_KEY = 'pin_attempts'
const UNLOCK_TS_KEY = 'pin_unlock_ts' // ★ เก็บเวลาที่ปลดล็อก

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + '_lubosawo_salt_2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PinProvider({ children, hasSession }: { children: ReactNode; hasSession: boolean }) {
  const [state, setState] = useState<PinState>('loading')
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hiddenAtRef = useRef<number | null>(null)

  // ★ เช็คสถานะตอนโหลด
  useEffect(() => {
    if (!hasSession) {
      setState('no-session')
      return
    }

    const pinHash = localStorage.getItem(STORAGE_KEY)
    if (!pinHash) {
      setState('setup')
      return
    }

    // ★ เช็คว่าเคยปลดล็อกไว้ และยังไม่เกิน idle timeout
    const unlockTs = localStorage.getItem(UNLOCK_TS_KEY)
    const lockFlag = localStorage.getItem(LOCK_KEY)

    if (lockFlag === 'false' && unlockTs) {
      const elapsed = Date.now() - parseInt(unlockTs)
      if (elapsed < IDLE_TIMEOUT) {
        // ยังอยู่ใน session → ไม่ต้องล็อก
        setState('unlocked')
        return
      }
    }

    // เปิดใหม่ / หมดเวลา = ล็อก
    localStorage.setItem(LOCK_KEY, 'true')
    setState('locked')
  }, [hasSession])

  // ★ จับ idle timeout
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

    // อัพเดทเวลาล่าสุดที่มี activity
    localStorage.setItem(UNLOCK_TS_KEY, Date.now().toString())

    idleTimerRef.current = setTimeout(() => {
      localStorage.setItem(LOCK_KEY, 'true')
      setState('locked')
    }, IDLE_TIMEOUT)
  }, [])

  useEffect(() => {
    if (state !== 'unlocked') return

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']
    const handler = () => resetIdleTimer()

    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()

    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [state, resetIdleTimer])

  // ★ สลับแท็บ / ปิดจอ — แต่ไม่ล็อกทันที ใช้ delay เช็ค
  useEffect(() => {
    if (state !== 'unlocked') return

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // ★ จำเวลาที่ซ่อน
        hiddenAtRef.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        // ★ กลับมา — เช็คว่าซ่อนไปนานไหม
        if (hiddenAtRef.current) {
          const hiddenDuration = Date.now() - hiddenAtRef.current
          // ถ้าซ่อนเกิน 30 วินาที = ล็อก (สลับแท็บจริง / ปิดจอ)
          if (hiddenDuration > 30 * 1000) {
            localStorage.setItem(LOCK_KEY, 'true')
            setState('locked')
          }
        }
        hiddenAtRef.current = null
      }
    }

    const handleBeforeUnload = () => {
      // ★ ปิดเบราว์เซอร์จริง = ล็อก
      localStorage.setItem(LOCK_KEY, 'true')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [state])

  // ★ ตั้ง PIN ครั้งแรก
  async function handleSetupPin(pin: string) {
    const hash = await hashPin(pin)
    localStorage.setItem(STORAGE_KEY, hash)
    localStorage.setItem(LOCK_KEY, 'false')
    localStorage.setItem(ATTEMPTS_KEY, '0')
    localStorage.setItem(UNLOCK_TS_KEY, Date.now().toString())
    setState('unlocked')
  }

  // ★ ปลดล็อก
  async function handleUnlock(pin: string): Promise<boolean> {
    const storedHash = localStorage.getItem(STORAGE_KEY)
    const inputHash = await hashPin(pin)

    if (inputHash === storedHash) {
      localStorage.setItem(LOCK_KEY, 'false')
      localStorage.setItem(ATTEMPTS_KEY, '0')
      localStorage.setItem(UNLOCK_TS_KEY, Date.now().toString())
      setState('unlocked')
      return true
    }

    const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') + 1
    localStorage.setItem(ATTEMPTS_KEY, attempts.toString())

    if (attempts >= MAX_ATTEMPTS) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LOCK_KEY)
      localStorage.removeItem(ATTEMPTS_KEY)
      localStorage.removeItem(UNLOCK_TS_KEY)
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/'
    }

    return false
  }

  // ล็อกจากภายนอก
  function lockNow() {
    localStorage.setItem(LOCK_KEY, 'true')
    setState('locked')
  }

  // เปลี่ยน PIN
  function resetPin() {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LOCK_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
    localStorage.removeItem(UNLOCK_TS_KEY)
    setState('setup')
  }

  if (state === 'loading') return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  if (state === 'no-session') return <>{children}</>

  if (state === 'setup') return <PinSetup onComplete={handleSetupPin} />

  if (state === 'locked') {
    const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0')
    return <PinLock onUnlock={handleUnlock} attempts={attempts} maxAttempts={MAX_ATTEMPTS} />
  }

  return (
    <PinContext.Provider value={{ lockNow, resetPin }}>
      {children}
    </PinContext.Provider>
  )
}
