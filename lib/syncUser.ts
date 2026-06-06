import { createClient } from '@/lib/supabase/client'

/**
 * Ensures a user exists in the users table.
 * - If email already exists → returns existing user_id (no duplicate)
 * - If email not found → creates new user and returns new id
 * - If no email → returns null
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

  // Check if user already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email_address', normalizedEmail)
    .maybeSingle()

  if (existing) return existing.id as string

  // Not found — create new user
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

/**
 * When a GDS user is saved with an ota_client_id,
 * automatically link that user to the OTA client in ota_client_users.
 * Uses upsert logic — safe to call multiple times.
 */
export async function syncUserToOTAClient(params: {
  userId: string
  otaClientId: number
}): Promise<void> {
  const { userId, otaClientId } = params
  if (!userId || !otaClientId) return

  const supabase = createClient()

  // Check if already linked
  const { data: existing } = await supabase
    .from('ota_client_users')
    .select('user_id')
    .eq('ota_client_id', otaClientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return // already linked — do nothing

  // Link user to OTA client
  await supabase.from('ota_client_users').insert({
    ota_client_id: otaClientId,
    user_id:       userId,
  })
}
