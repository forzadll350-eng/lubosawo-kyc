'use client'

import { useState, useRef } from 'react'

type Props = {
  onUnlock: (pin: string) => Promise<boolean>
  attempts: number
  maxAttempts: number
}

export default function PinLock({ onUnlock, attempts, maxAttempts }: Props) {
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  async function handleInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return

    const newPin = [...pin]
    newPin[index] = value.slice(-1)
    setPin(newPin)
    setError('')

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    const full = newPin.join('')
    if (full.length === 4 && newPin.every(d => d !== '')) {
      setChecking(true)
      const ok = await onUnlock(full)
      if (!ok) {
        setError(`PIN ไม่ถูกต้อง (เหลือ ${maxAttempts - attempts - 1} ครั้ง)`)
        setPin(['', '', '', ''])
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
      }
      setChecking(false)
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleForceLogout() {
    if (confirm('ต้องการออกจากระบบ? จะต้อง Login ใหม่')) {
      localStorage.removeItem('pin_hash')
      localStorage.removeItem('pin_locked')
      localStorage.removeItem('pin_attempts')
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔒</span>
        </div>

        <h2 className="text-xl font-bold text-gray-800 mb-1">ใส่ PIN เพื่อปลดล็อก</h2>
        <p className="text-sm text-gray-500 mb-6">อบต.ลุโบะสาวอ — ระบบยืนยันตัวตนดิจิทัล</p>

        <div className="flex justify-center gap-3 mb-6">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={checking}
              autoFocus={i === 0}
              className={"w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none transition-all " +
                (error ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200")}
            />
          ))}
        </div>

        {checking && <p className="text-blue-500 text-sm mb-4">กำลังตรวจสอบ...</p>}
        {error && <p className="text-red-500 text-sm mb-4 animate-pulse">{error}</p>}

        {attempts > 0 && (
          <div className="flex justify-center gap-1 mb-4">
            {Array.from({ length: maxAttempts }).map((_, i) => (
              <div key={i} className={"w-2 h-2 rounded-full " + (i < attempts ? "bg-red-400" : "bg-gray-200")} />
            ))}
          </div>
        )}

        <button
          onClick={handleForceLogout}
          className="text-xs text-gray-400 hover:text-red-500 mt-4 transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
