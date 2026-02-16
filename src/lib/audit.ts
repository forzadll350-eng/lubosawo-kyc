import { SupabaseClient } from '@supabase/supabase-js'

export async function logAudit(
  supabase: SupabaseClient,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, any>
) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('audit_logs').insert({
    user_id: user?.id || null,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: details || {},
  })
}
