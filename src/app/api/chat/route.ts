import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

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

    const chat = model.startChat({
      history: messages.slice(0, -1).map((m: any) => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      systemInstruction: system,
    })

    const userMsg = messages[messages.length - 1].text
    const result = await chat.sendMessage(userMsg)
    const text = result.response.text() || 'Sorry, I had trouble responding.'

    return NextResponse.json({ text })
  } catch (err: any) {
    console.error('AI route error:', err)
    return NextResponse.json({ text: 'Sorry, I could not connect right now.' }, { status: 500 })
  }
}
