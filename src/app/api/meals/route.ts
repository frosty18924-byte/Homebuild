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

    // 7 days is more reliable for Claude 4.6 and better for fresh shopping
    const daysToPlan = 7

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [
        {
          name: 'save_meal_plan',
          description: 'Save a 7-day meal plan (skipping Thursday dinner and Sundays) to the database.',
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
      system: `You are a meal planning expert.
EXCLUSIONS:
- DO NOT plan a dinner for any Thursday.
- DO NOT plan any meals for Sundays.
Your only job is to generate a ${daysToPlan}-day plan and call 'save_meal_plan'.`,
      messages: [{
        role: 'user',
        content: `Create a ${daysToPlan}-day meal plan for a UK couple starting ${format(start, 'yyyy-MM-dd')}. 
Include 1 lunch and 1 dinner per day, EXCEPT Thursday dinner and all of Sunday.
Mix of quick ideas and HelloFresh/Green Chef style recipes.
Ingredients from ASDA/ALDI.`
      }],
    })

    const toolCall = response.content.find(b => b.type === 'tool_use') as any
    if (!toolCall || typeof toolCall.input !== 'object') {
      console.error('AI response content:', JSON.stringify(response.content, null, 2))
      throw new Error('Hearth had trouble formatting the meals. Please try again.')
    }

    const { meals } = toolCall.input

    if (!meals || !Array.isArray(meals)) {
      console.error('Tool call input missing meals array:', toolCall.input)
      throw new Error('The AI generate a plan but it was incomplete. Let\'s try again.')
    }

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
