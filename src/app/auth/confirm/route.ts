import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })

    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(origin + '/auth/update-password')
      }
      return NextResponse.redirect(origin)
    }
  }

  return NextResponse.redirect(origin + '/?error=invalid_link')
}
