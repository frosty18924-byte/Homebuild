import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendTelegram(botToken: string, chatId: string, message: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  })
  return res.ok
}

// Called by Vercel Cron (daily at 8am)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!

    // Get household telegram settings
    const { data: household } = await supabase
      .from('households')
      .select('*')
      .eq('id', HOUSEHOLD_ID)
      .single()

    if (!household?.telegram_bot_token || !household?.telegram_chat_id) {
      return NextResponse.json({ message: 'Telegram not configured' })
    }

    // Generate notifications
    await supabase.rpc('generate_notifications', { p_household_id: HOUSEHOLD_ID })

    // Get unread notifications from last 24h
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('is_read', false)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    if (!notifs || notifs.length === 0) {
      return NextResponse.json({ message: 'No notifications to send' })
    }

    // Build message
    const lines = [
      `🏡 <b>Hearth Daily Update</b>`,
      `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      '',
    ]

    const choreNotifs = notifs.filter(n => n.type.startsWith('chore'))
    const billNotifs = notifs.filter(n => n.type.startsWith('bill') || n.type === 'deal_found')

    if (choreNotifs.length > 0) {
      lines.push('🧹 <b>Chores</b>')
      choreNotifs.forEach(n => lines.push(`  ${n.icon} ${n.title}`))
      lines.push('')
    }

    if (billNotifs.length > 0) {
      lines.push('💰 <b>Bills & Renewals</b>')
      billNotifs.forEach(n => lines.push(`  ${n.icon} ${n.title}`))
      lines.push('')
    }

    lines.push(`<a href="${process.env.NEXT_PUBLIC_APP_URL}">Open Hearth →</a>`)

    const message = lines.join('\n')
    const sent = await sendTelegram(
      household.telegram_bot_token,
      household.telegram_chat_id,
      message
    )

    // Mark as read
    const ids = notifs.map(n => n.id)
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)

    return NextResponse.json({ sent, count: notifs.length })
  } catch (err: any) {
    console.error('Telegram cron error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Manual send from settings UI
export async function POST(req: NextRequest) {
  try {
    const { botToken, chatId, message } = await req.json()
    const ok = await sendTelegram(botToken, chatId, message)
    return NextResponse.json({ ok })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
