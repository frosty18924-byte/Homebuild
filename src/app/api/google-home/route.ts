import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { choreStatus, daysUntilDue, effectiveFreq, nextDueDate } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!

// ─── Fetch live home data ─────────────────────────────────────────────────────
async function getHomeData() {
  const [choreRes, billRes, mealRes] = await Promise.all([
    supabase
      .from('chores')
      .select('*, chore_completions(completed_at)')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('is_active', true),
    supabase
      .from('bills')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('is_active', true),
    supabase
      .from('meal_plans')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('plan_date', new Date().toISOString().split('T')[0]),
  ])

  const chores = (choreRes.data || []).map((c: any) => ({
    ...c,
    last_completed: c.chore_completions?.length
      ? c.chore_completions.sort((a: any, b: any) =>
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      )[0].completed_at
      : null,
    completions_count: c.chore_completions?.length || 0,
  }))

  return {
    chores,
    bills: billRes.data || [],
    todayMeals: mealRes.data || [],
  }
}

// ─── Mark a chore done by name match ─────────────────────────────────────────
async function markChoreDoneByName(choreName: string) {
  const { data: chores } = await supabase
    .from('chores')
    .select('id, name')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('is_active', true)

  if (!chores) return null

  // Fuzzy match — find closest chore name
  const match = chores.find((c: any) =>
    c.name.toLowerCase().includes(choreName.toLowerCase()) ||
    choreName.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
  )

  if (!match) return null

  await supabase
    .from('chore_completions')
    .insert({ chore_id: match.id, completed_by: 'Voice' })

  return match.name
}

// ─── Build spoken response via Claude ────────────────────────────────────────
async function buildVoiceResponse(intent: string, query: string, homeData: any): Promise<string> {
  const { chores, bills, todayMeals } = homeData

  const overdueChores = chores.filter((c: any) => choreStatus(c) === 'overdue')
  const soonChores = chores.filter((c: any) => choreStatus(c) === 'due-soon')
  const urgentBills = bills.filter((b: any) =>
    b.renewal_date && Math.round((new Date(b.renewal_date).getTime() - Date.now()) / 86400000) <= 60
  )

  const context = `
OVERDUE CHORES (${overdueChores.length}): ${overdueChores.map((c: any) => `${c.name} (${Math.abs(daysUntilDue(c))} days late, assigned to ${c.assigned})`).join(', ') || 'none'}
DUE SOON (${soonChores.length}): ${soonChores.map((c: any) => `${c.name} (${daysUntilDue(c)} days)`).join(', ') || 'none'}
ALL CHORES: ${chores.map((c: any) => `${c.name}: due ${new Date(nextDueDate(c)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`).join('; ')}
BILLS RENEWING SOON: ${urgentBills.map((b: any) => `${b.name} in ${Math.round((new Date(b.renewal_date).getTime() - Date.now()) / 86400000)} days with ${b.provider}`).join(', ') || 'none'}
TODAY'S MEALS: ${todayMeals.map((m: any) => `${m.slot}: ${m.meal_name} (${m.prep_time_mins} mins)`).join(', ') || 'not planned yet'}
  `.trim()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: `You are Hearth, a household AI assistant being accessed via Google Home voice.
    
CRITICAL RULES FOR VOICE:
- Respond in PLAIN SPOKEN English only — no bullet points, no markdown, no lists
- Keep responses SHORT — maximum 3 sentences for simple queries, 5 for complex
- Use natural speech patterns — "Your washing is 2 days overdue" not "washing: 2 days"
- Never say "I" — say "Hearth" if you need to refer to yourself
- End with one short actionable suggestion if relevant
- Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}

HOME DATA:
${context}`,
    messages: [{ role: 'user', content: query }],
  })

  return response.content.find(b => b.type === 'text')?.text || "Sorry, I couldn't get that information right now."
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Google Actions sends handler/intent info here
    const handler = body?.handler?.name || ''
    const intent = body?.intent?.name || ''
    const query = body?.scene?.slots?.query?.value ||
      body?.intent?.params?.query?.resolved ||
      body?.session?.params?.query ||
      ''

    // Extract spoken text from various Google Actions formats
    const spokenText = body?.intent?.query || query || handler

    let responseText = ''

    // ── Intent: Mark chore done ──────────────────────────────────────────────
    if (
      handler === 'mark_done' ||
      intent === 'mark_chore_done' ||
      spokenText.toLowerCase().includes('is done') ||
      spokenText.toLowerCase().includes('have done') ||
      spokenText.toLowerCase().includes('ive done') ||
      spokenText.toLowerCase().includes("i've done") ||
      spokenText.toLowerCase().includes('mark') ||
      spokenText.toLowerCase().includes('finished')
    ) {
      const homeData = await getHomeData()
      const choreName = spokenText
        .toLowerCase()
        .replace(/mark|the|is done|have done|ive done|i've done|finished|as done|complete/g, '')
        .trim()

      const matched = await markChoreDoneByName(choreName)

      if (matched) {
        responseText = `Done! Hearth has marked ${matched} as complete and updated your schedule.`
      } else {
        // Ask Claude to figure out which chore they mean
        const allChores = homeData.chores.map((c: any) => c.name).join(', ')
        responseText = `Hearth couldn't find a chore matching that. Your current chores are: ${allChores}. Try saying the chore name more clearly.`
      }
    }

    // ── Intent: What's due / overdue ────────────────────────────────────────
    else if (
      handler === 'whats_due' ||
      spokenText.toLowerCase().includes('due') ||
      spokenText.toLowerCase().includes('overdue') ||
      spokenText.toLowerCase().includes('need to do') ||
      spokenText.toLowerCase().includes('chores')
    ) {
      const homeData = await getHomeData()
      responseText = await buildVoiceResponse('whats_due', spokenText || "What chores are due or overdue right now?", homeData)
    }

    // ── Intent: Dinner / meals ───────────────────────────────────────────────
    else if (
      handler === 'whats_for_dinner' ||
      spokenText.toLowerCase().includes('dinner') ||
      spokenText.toLowerCase().includes('lunch') ||
      spokenText.toLowerCase().includes('eat') ||
      spokenText.toLowerCase().includes('meal')
    ) {
      const homeData = await getHomeData()
      responseText = await buildVoiceResponse('meals', spokenText || "What are we having for lunch and dinner today?", homeData)
    }

    // ── Intent: Bills / renewals ─────────────────────────────────────────────
    else if (
      handler === 'bills' ||
      spokenText.toLowerCase().includes('bill') ||
      spokenText.toLowerCase().includes('mortgage') ||
      spokenText.toLowerCase().includes('broadband') ||
      spokenText.toLowerCase().includes('energy') ||
      spokenText.toLowerCase().includes('insurance') ||
      spokenText.toLowerCase().includes('renew')
    ) {
      const homeData = await getHomeData()
      responseText = await buildVoiceResponse('bills', spokenText || "What bills are coming up for renewal?", homeData)
    }

    // ── Default: Pass everything to Claude with full context ─────────────────
    else {
      const homeData = await getHomeData()
      responseText = await buildVoiceResponse('general', spokenText || "Give me a quick home summary", homeData)
    }

    // ── Google Actions response format ───────────────────────────────────────
    return NextResponse.json({
      scene: { name: 'actions.scene.END_CONVERSATION' },
      prompt: {
        override: true,
        firstSimple: {
          speech: responseText,
          text: responseText,
        },
      },
      session: {
        id: body?.session?.id || '',
        params: {},
        languageCode: '',
      },
    })
  } catch (err: any) {
    console.error('Google Actions webhook error:', err)
    return NextResponse.json({
      prompt: {
        override: true,
        firstSimple: {
          speech: "Sorry, Hearth is having trouble connecting right now. Please try again in a moment.",
          text: "Sorry, Hearth is having trouble connecting right now.",
        },
      },
    })
  }
}

// Health check for Google Actions verification
export async function GET() {
  return NextResponse.json({ status: 'Hearth Google Actions webhook active' })
}
