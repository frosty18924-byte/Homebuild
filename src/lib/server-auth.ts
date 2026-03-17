import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const householdId = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!
  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', data.user.id)
    .eq('household_id', householdId)
    .maybeSingle()

  if (!member) return null
  return data.user
}
