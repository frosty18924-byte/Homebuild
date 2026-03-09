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
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      tools: [
        {
          name: 'save_meal_plan',
          description: 'Save a 14-day meal plan (28 entries) to the database.',
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
                    meal_name: { type: 'string' },
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
                          amount: { type: 'string' }
                        },
                        required: ['item', 'amount']
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
      system: "You are a meal planning expert. Your only job is to generate a 14-day meal plan and call the 'save_meal_plan' tool with the full data. Do not provide any conversational text before or after the tool call.",
      messages: [{
        role: 'user',
        content: `Create a 14-day meal plan for a UK couple starting ${format(start, 'yyyy-MM-dd')}. 
Include exactly 28 entries (1 lunch and 1 dinner per day). 
Mix of quick weeknight meals and slightly longer weekend meals inspired by HelloFresh/Green Chef. 
Ingredients must be available at ASDA/ALDI.`
      }],
    })

    const toolCall = response.content.find(b => b.type === 'tool_use')
    if (!toolCall || toolCall.type !== 'tool_use') {
      throw new Error('AI failed to call the save_meal_plan tool')
    }

    const { meals } = toolCall.input as { meals: any[] }

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
