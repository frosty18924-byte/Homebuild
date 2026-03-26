import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/server-auth'

function escapeTelegramHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function sendTelegram(botToken: string, chatId: string, message: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (err: any) {
    return { ok: false, status: 0, text: err?.message || 'Network error' }
  }
}

// Called by Vercel Cron (daily at 8am)
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!

    // Get household telegram settings
    const { data: household } = await supabase
      .from('households')
      .select('id, telegram_bot_token, telegram_chat_id')
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
      .in('type', ['bill_renewal'])
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    // Build message
    const lines = [
      `🏡 <b>Hearth Daily Update</b>`,
      `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      '',
    ]

    if (!notifs || notifs.length === 0) {
      lines.push('💰 <b>Bills & Renewals</b>')
      lines.push('  ✅ No bills renewing soon')
      lines.push('')
    } else {
      lines.push('💰 <b>Bills & Renewals</b>')
      notifs.forEach(n => lines.push(`  ${n.icon} ${escapeTelegramHtml(String(n.title || ''))}`))
      lines.push('')
    }

    const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL || ''
    try {
      const url = new URL(appUrlRaw)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        lines.push(`<a href="${escapeTelegramHtml(url.toString())}">Open Hearth →</a>`)
      }
    } catch {
      // omit link if APP_URL is missing/invalid to avoid Telegram HTML parse errors
    }

    const message = lines.join('\n')
    const botToken = String(household.telegram_bot_token || '').trim()
    const chatId = String(household.telegram_chat_id || '').trim()
    const sent = await sendTelegram(botToken, chatId, message)

    if (!sent.ok) {
      return NextResponse.json(
        { sent: false, status: sent.status, error: 'Telegram send failed', detail: sent.text?.slice(0, 500) },
        { status: 502 }
      )
    }

    // Mark as read
    const ids = (notifs || []).map(n => n.id)
    if (ids.length > 0) {
      await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    }

    return NextResponse.json({ sent: true, count: (notifs || []).length })
  } catch (err: any) {
    console.error('Telegram cron error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Manual send from settings UI
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const user = await requireAuth(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { botToken, chatId, message } = await req.json()
    const token = String(botToken || '').trim()
    const chat = String(chatId || '').trim()
    if (!token || !chat || !message) {
      return NextResponse.json({ error: 'Missing botToken/chatId/message' }, { status: 400 })
    }

    const result = await sendTelegram(token, chat, String(message))
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, status: result.status, error: 'Telegram send failed', detail: result.text?.slice(0, 500) },
        { status: 502 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
