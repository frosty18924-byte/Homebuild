import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { startDate } = await req.json()
    const start = new Date(startDate)

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Create a 14-day meal plan for a UK couple. Mix of quick weeknight meals and slightly longer weekend meals.
        
Inspired by HelloFresh and Green Chef but also original quick ideas.
Prioritise meals under 30 minutes on weekdays.
The user shops at ASDA and ALDI, so ensure ingredients are easily available there.
Focus on "quick, easy, and healthy" recipes.
Include tips for bulk buying/bulk cooking to keep it cheap.

Return ONLY a JSON array (no markdown) with 28 entries (14 lunches + 14 dinners):
[
  {
    "plan_date": "YYYY-MM-DD",
    "slot": "lunch",
    "meal_name": "Meal Name",
    "meal_tag": "quick",
    "prep_time_mins": 15,
    "source": "hf",
    "recipe": "Step 1: ... Step 2: ...",
    "ingredients": [
      { "item": "Soy Sauce", "amount": "2 tbsp" }
    ],
    "shopping_tips": "Buy the large pack of chicken at Aldi for best price. Bulk cook this for 2 days."
  }
]

meal_tag options: "quick" (under 25 mins), "hf" (HelloFresh style), "gc" (Green Chef style)
source options: "hf", "gc", or null
plan_date starts: ${format(start, 'yyyy-MM-dd')} through ${format(addDays(start, 13), 'yyyy-MM-dd')}
Each date must have exactly one lunch and one dinner.
Variety is key — no meal repeated in the same week.`
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const meals = JSON.parse(jsonMatch[0])

    // Upsert to Supabase
    const rows = meals.map((m: any) => ({
      ...m,
      household_id: process.env.NEXT_PUBLIC_HOUSEHOLD_ID,
    }))

    const { data, error } = await supabase
      .from('meal_plans')
      .upsert(rows, { onConflict: 'household_id,plan_date,slot' })
      .select()

    if (error) throw error

    return NextResponse.json({ meals: data, count: data?.length || 0 })
  } catch (err: any) {
    console.error('Meal plan error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
