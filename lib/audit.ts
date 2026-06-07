import { createClient } from '@/lib/supabase/client'

/**
 * Returns audit fields to merge into any update/insert payload.
 * modified_at = now, modified_by = logged-in user's email
 */
export async function getAuditFields(): Promise<{ modified_at: string; modified_by: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return {
    modified_at: new Date().toISOString(),
    modified_by: user?.email ?? 'unknown',
  }
}
