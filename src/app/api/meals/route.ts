import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const { startDate } = await req.json()
    const start = new Date(startDate)

    // 7 days is more reliable for Claude 4.6 and better for fresh shopping
    const daysToPlan = 7

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      tools: [
        {
          name: 'save_meal_plan',
          description: 'Save a 7-day meal plan with specific exclusions.',
          input_schema: {
            type: 'object',
            properties: {
              meals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    plan_date: { type: 'string', description: 'YYYY-MM-DD' },
                    slot: { type: 'string', enum: ['lunch', 'dinner'] },
                    meal_name: { type: 'string', description: 'Include "Bulk for X days" in name for lunches' },
                    meal_tag: { type: 'string', enum: ['quick', 'hf', 'gc'] },
                    prep_time_mins: { type: 'number' },
                    source: { type: 'string', nullable: true },
                    recipe: { type: 'string' },
                    ingredients: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          item: { type: 'string' },
                          amount: { type: 'string' },
                          store: { type: 'string', enum: ['ASDA', 'ALDI', 'Either'] }
                        },
                        required: ['item', 'amount', 'store']
                      }
                    },
                    shopping_tips: { type: 'string' }
                  },
                  required: ['plan_date', 'slot', 'meal_name', 'meal_tag', 'prep_time_mins', 'recipe', 'ingredients', 'shopping_tips']
                }
              }
            },
            required: ['meals']
          }
        }
      ],
      tool_choice: { type: 'tool', name: 'save_meal_plan' },
      system: `You are a meal planning expert for a UK couple.
STRICT SCHEDULE RULES:
1. THURSDAY: Generate LUNCH. Leave DINNER blank/do not generate it.
2. SUNDAY: DO NOT generate anything for Sunday (No lunch, no dinner).
3. FRIDAY/SATURDAY: Generate both LUNCH and DINNER.
4. LUNCHES: Must be "Bulk Lunches" found online (e.g. meal prep). Include "Bulk for X days" in the meal_name.
5. DINNERS: Must be quick and easy meals.
6. STORES: For EVERY ingredient, specify if it should be bought from ASDA or ALDI.`,
      messages: [{
        role: 'user',
        content: `Create a ${daysToPlan}-day meal plan starting ${format(start, 'yyyy-MM-dd')}.
Follow the schedule rules exactly: Skip Thu Dinner and all of Sunday.
Lunches = Bulk meal prep ideas.
Dinners = Quick & Easy.
Ingredients = All from ASDA/ALDI with store assignment.`
      }],
    })

    const toolCall = response.content.find(b => b.type === 'tool_use') as any
    if (!toolCall || typeof toolCall.input !== 'object') {
      console.error('AI response content:', JSON.stringify(response.content, null, 2))
      throw new Error(`Hearth had trouble formatting. Reason: ${response.stop_reason}`)
    }

    const { meals } = toolCall.input

    if (!meals || !Array.isArray(meals)) {
      console.error('Tool call input:', JSON.stringify(toolCall.input))
      throw new Error(`Incomplete plan. Received: ${Object.keys(toolCall.input || {}).join(', ')}`)
    }

    // Upsert to Supabase
    const rows = meals.map((m: any) => ({
      ...m,
      // Store the 'store' info in the ingredient item string for the UI
      ingredients: m.ingredients.map((i: any) => ({
        item: `${i.item} (${i.store})`,
        amount: i.amount
      })),
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
