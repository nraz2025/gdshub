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

/**
 * Re-evaluates and syncs a person's status in the `users` table based on
 * the status of ALL their linked GDS accounts (Sabre / Amadeus / Travelport).
 *
 * Priority: Active > Suspended > Inactive
 * - If ANY linked account is Active        → users.status = 'Active'
 * - Else if ANY linked account is Suspended → users.status = 'Suspended'
 * - Else (all Inactive, or no accounts left) → users.status = 'Inactive'
 *
 * Call this after any Save (Add/Edit) or Delete on a Sabre/Amadeus/Travelport
 * user record that has a linked user_id, so the Users page always reflects
 * the most "active" status across all three GDS platforms.
 */
export async function syncUserStatus(userId: string): Promise<void> {
  if (!userId) return
  const supabase = createClient()

  const [{ data: sabreRows }, { data: amadeusRows }, { data: travelportRows }] = await Promise.all([
    supabase.from('sabre_user').select('status').eq('user_id', userId),
    supabase.from('amadeus_user').select('status').eq('user_id', userId),
    supabase.from('travelport_user').select('status').eq('user_id', userId),
  ])

  // Normalize: Sabre stores 'Active'/'Inactive'/'Suspended' (capitalized).
  // Amadeus/Travelport store lowercase ('active'/'inactive'/'suspended').
  const allStatuses = [
    ...(sabreRows ?? []).map(r => (r.status ?? '').toLowerCase()),
    ...(amadeusRows ?? []).map(r => ((r as { status?: string }).status ?? '').toLowerCase()),
    ...(travelportRows ?? []).map(r => ((r as { status?: string }).status ?? '').toLowerCase()),
  ]

  let newStatus: 'Active' | 'Suspended' | 'Inactive' = 'Inactive'
  if (allStatuses.includes('active')) {
    newStatus = 'Active'
  } else if (allStatuses.includes('suspended')) {
    newStatus = 'Suspended'
  }

  await supabase.from('users').update({ status: newStatus }).eq('id', userId)
}
