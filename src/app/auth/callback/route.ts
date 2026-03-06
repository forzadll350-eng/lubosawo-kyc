import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const supabase = await createClient()

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    if (type === 'recovery') {
      return NextResponse.redirect(${origin}/auth/update-password)
    }
    return NextResponse.redirect(${origin})
  }

  if (token_hash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: 'recovery',
    })
    if (!error) {
      return NextResponse.redirect(${origin}/auth/update-password)
    }
  }

  return NextResponse.redirect(${origin})
}
