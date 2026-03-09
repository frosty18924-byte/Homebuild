import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages, homeContext } = await req.json()

    const system = `You are Hearth, a warm and intelligent household AI assistant for a UK couple.

TODAY: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

LIVE HOME DATA:
${JSON.stringify(homeContext, null, 2)}

You help with:
- Chore scheduling & tracking (you know their actual learned frequencies)
- Meal planning (quick meals, HelloFresh/Green Chef style)  
- Bill renewals & finding better deals
- General household organisation

PERSONALITY: Warm, practical, concise. British tone. Use light formatting with line breaks.
Keep responses under 180 words unless the user asks for detail.
When asked about deals, name the best provider and monthly saving.
When asked about chores, be specific about what's overdue and who should do it.
When asked to plan meals, suggest 3-5 specific quick recipes by name.`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system,
      messages: messages.map((m: any) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      })),
    })

    const text = response.content.find(b => b.type === 'text')?.text || 'Sorry, I had trouble responding.'

    return NextResponse.json({ text })
  } catch (err: any) {
    console.error('AI route error:', err)
    return NextResponse.json({ text: 'Sorry, I could not connect right now.' }, { status: 500 })
  }
}
