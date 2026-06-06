import { createClient } from '@/lib/supabase/client'

/**
 * Ensures a user exists in the users table.
 * - If email already exists → returns existing user_id (no duplicate)
 * - If email not found → creates new user and returns new id
 */
export async function syncUserToTable(params: {
  email: string
  firstName: string
  lastName: string
}): Promise<string | null> {
  const { email, firstName, lastName } = params
  if (!email.trim()) return null

  const supabase = createClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email_address', normalizedEmail)
    .maybeSingle()

  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      first_name:    firstName.trim() || 'Unknown',
      last_name:     lastName.trim()  || '',
      email_address: normalizedEmail,
      ota_client:    false,
      status:        'Active',
    })
    .select('id')
    .single()

  if (error || !created) return null
  return created.id as string
}

// syncUserToOTAClient removed — ota_client_users table dropped.
// GDS login → client relationship is tracked via ota_client_id on each GDS user table.
export async function syncUserToOTAClient(_params: { userId: string; otaClientId: number }): Promise<void> {
  // no-op — kept for compatibility, junction table no longer used
}
