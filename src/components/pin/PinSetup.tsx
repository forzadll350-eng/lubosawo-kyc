'use client'

import { useState, useRef } from 'react'

export default function PinSetup({ onComplete }: { onComplete: (pin: string) => void }) {
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [firstPin, setFirstPin] = useState('')
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return

    const newPin = [...pin]
    newPin[index] = value.slice(-1)
    setPin(newPin)
    setError('')

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // ครบ 4 ตัว
    const full = newPin.join('')
    if (full.length === 4 && newPin.every(d => d !== '')) {
      if (step === 'create') {
        setFirstPin(full)
        setPin(['', '', '', ''])
        setStep('confirm')
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
      } else {
        if (full === firstPin) {
          onComplete(full)
        } else {
          setError('PIN ไม่ตรงกัน กรุณาลองใหม่')
          setPin(['', '', '', ''])
          setStep('create')
          setFirstPin('')
          setTimeout(() => inputRefs.current[0]?.focus(), 100)
        }
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🔐</span>
        </div>

        <h2 className="text-xl font-bold text-gray-800 mb-1">
          {step === 'create' ? 'ตั้ง PIN 4 หลัก' : 'ยืนยัน PIN อีกครั้ง'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {step === 'create' ? 'สร้าง PIN เพื่อความปลอดภัยในการใช้งาน' : 'กรอก PIN เดิมอีกครั้งเพื่อยืนยัน'}
        </p>

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
              autoFocus={i === 0}
              className="w-14 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex items-center gap-2 justify-center">
          {[0, 1].map(i => (
            <div key={i} className={"w-2 h-2 rounded-full " + (step === 'confirm' || i === 0 ? "bg-blue-500" : "bg-gray-300")} />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">PIN จะใช้ปลดล็อกทุกครั้งที่เข้าใช้งาน</p>
      </div>
    </div>
  )
}
