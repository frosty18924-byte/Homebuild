import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/server-auth'

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const user = await requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!
  const supabase = supabaseAdmin()

  const { data: me } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: members, error } = await supabase
    .from('household_members')
    .select('user_id, role, created_at')
    .eq('household_id', householdId)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (members || []).map(m => m.user_id)
  const { data: users } = ids.length
    ? await supabase.schema('auth').from('users').select('id, email').in('id', ids)
    : { data: [] as { id: string; email: string | null }[] }

  const emailMap = new Map((users || []).map(u => [u.id, u.email]))
  const result = (members || []).map(m => ({
    user_id: m.user_id,
    email: emailMap.get(m.user_id) || null,
    role: m.role,
    created_at: m.created_at,
  }))

  return NextResponse.json({ members: result })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!
  const supabase = supabaseAdmin()

  const { data: me } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (me.role !== 'owner') return NextResponse.json({ error: 'Only owners can add members' }, { status: 403 })

  const { email, role } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const { data: target } = await supabase
    .schema('auth')
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { error } = await supabase
    .from('household_members')
    .upsert({
      household_id: householdId,
      user_id: target.id,
      role: role || 'member',
    }, { onConflict: 'household_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!
  const supabase = supabaseAdmin()

  const { data: me } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (me.role !== 'owner') return NextResponse.json({ error: 'Only owners can reset passwords' }, { status: 403 })

  const { user_id } = await req.json()
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data: member } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('user_id', user_id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'User not in household' }, { status: 404 })

  const tempPassword = generateTempPassword()
  const { error } = await supabase.auth.admin.updateUserById(user_id, { password: tempPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tempPassword })
}

function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*'
  let out = ''
  for (let i = 0; i < 14; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
