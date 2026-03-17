import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'
import { requireAuth } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const user = await requireAuth(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startDate } = await req.json()
    const start = new Date(startDate)
    const householdId = process.env.NEXT_PUBLIC_HOUSEHOLD_ID!

    // 7 days is more reliable for Claude 4.6 and better for fresh shopping
    const daysToPlan = 7

    const { data: cupboardItems } = await supabase
      .from('cupboard_items')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })

    const { data: favoriteMeals } = await supabase
      .from('meal_favorites')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })

    const cupboardList = (cupboardItems || []).length
      ? (cupboardItems || []).map((c: any) =>
        `- ${c.item}${c.quantity ? ` — ${c.quantity}` : ''}${c.expires_on ? ` (expires ${c.expires_on})` : ''}${c.notes ? ` (${c.notes})` : ''}`
      ).join('\n')
      : 'None'

    const favoritesList = (favoriteMeals || []).length
      ? (favoriteMeals || []).map((f: any) =>
        `- ${f.meal_name} (${f.meal_tag}, ${f.prep_time_mins} mins)`
      ).join('\n')
      : 'None'

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
                          store: { type: 'string', enum: ['ASDA', 'ALDI', 'Either', 'CUPBOARD'] }
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
6. STORES: For EVERY ingredient, specify if it should be bought from ASDA or ALDI.
7. CUPBOARD: Prefer using cupboard items first. If an ingredient is from the cupboard, set store = "CUPBOARD".
8. CUPBOARD EXPIRY: Prioritize cupboard items that expire soon.
9. FAVORITES: Reuse 1-2 favorite meals if they fit, but keep variety.`,
      messages: [{
        role: 'user',
        content: `Create a ${daysToPlan}-day meal plan starting ${format(start, 'yyyy-MM-dd')}.
Follow the schedule rules exactly: Skip Thu Dinner and all of Sunday.
Lunches = Bulk meal prep ideas.
Dinners = Quick & Easy.
Ingredients = All from ASDA/ALDI with store assignment.`
          + `\n\nCUPBOARD ITEMS:\n${cupboardList}`
          + `\n\nFAVORITE MEALS:\n${favoritesList}`
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
      household_id: householdId,
    }))

    const { data, error } = await supabase
      .from('meal_plans')
      .upsert(rows, { onConflict: 'household_id,plan_date,slot' })
      .select()

    if (error) throw error

    if (data && data.length) {
      const parseAmount = (value: string | null | undefined) => {
        if (!value) return null
        const fractionMap: Record<string, string> = {
          '¼': '0.25',
          '½': '0.5',
          '¾': '0.75',
          '⅓': '0.3333',
          '⅔': '0.6667',
          '⅛': '0.125',
          '⅜': '0.375',
          '⅝': '0.625',
          '⅞': '0.875',
        }
        let v = value.trim().toLowerCase()
        v = v.replace(/(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_, d, f) => String(Number(d) + Number(fractionMap[f])))
        v = v.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, m => fractionMap[m])
        const rangeMatch = v.match(/^([\d.,]+)\s*-\s*([\d.,]+)\s*([a-z]+)?/)
        if (rangeMatch) {
          const hi = parseFloat(rangeMatch[2].replace(',', '.'))
          if (!Number.isNaN(hi)) {
            return parseAmount(`${hi}${rangeMatch[3] ? ` ${rangeMatch[3]}` : ''}`)
          }
        }
        const multMatch = v.match(/^(\d+)\s*x\s*([\d.,]+)\s*([a-z]+)?/)
        if (multMatch) {
          const count = parseInt(multMatch[1], 10)
          const amt = parseFloat(multMatch[2].replace(',', '.'))
          if (!Number.isNaN(count) && !Number.isNaN(amt)) {
            return parseAmount(`${count * amt}${multMatch[3] ? ` ${multMatch[3]}` : ''}`)
          }
        }
        const fracMatch = v.match(/^(\d+)\s*\/\s*(\d+)\s*([a-z]+)?/)
        let num: number | null = null
        let unit = ''
        if (fracMatch) {
          num = parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10)
          unit = fracMatch[3] || ''
        } else {
          const match = v.match(/^([\d.,]+)\s*([a-z]+)?/)
          if (match) {
            num = parseFloat(match[1].replace(',', '.'))
            unit = match[2] || ''
          }
        }
        if (!num || Number.isNaN(num)) return null
        const unitMap: Record<string, string> = {
          ml: 'ml', l: 'l', litre: 'l', liter: 'l', liters: 'l', litres: 'l',
          g: 'g', kg: 'kg',
          oz: 'oz', ounce: 'oz', ounces: 'oz',
          lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
          tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin',
          bottle: 'bottle', bottles: 'bottle',
          pack: 'pack', packs: 'pack',
          clove: 'clove', cloves: 'clove',
          slice: 'slice', slices: 'slice',
          piece: 'piece', pieces: 'piece',
          tbsp: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
          tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
          cup: 'cup', cups: 'cup',
        }
        const normUnit = unitMap[unit] || unit
        const type = normUnit === 'ml' || normUnit === 'l' ? 'vol'
          : normUnit === 'g' || normUnit === 'kg' || normUnit === 'oz' || normUnit === 'lb' ? 'wt'
            : normUnit ? 'count' : 'count'
        return { value: num, unit: normUnit || 'count', type }
      }

      const toBase = (amt: { value: number; unit: string; type: string }) => {
        if (amt.type === 'vol') return { value: amt.unit === 'l' ? amt.value * 1000 : amt.value, unit: 'ml', type: 'vol' }
        if (amt.type === 'wt') {
          if (amt.unit === 'kg') return { value: amt.value * 1000, unit: 'g', type: 'wt' }
          if (amt.unit === 'lb') return { value: amt.value * 453.592, unit: 'g', type: 'wt' }
          if (amt.unit === 'oz') return { value: amt.value * 28.3495, unit: 'g', type: 'wt' }
          return { value: amt.value, unit: 'g', type: 'wt' }
        }
        return amt
      }

      const formatAmount = (value: number, unit: string, type: string) => {
        if (type === 'vol') return `${Math.max(0, Math.round(value))}ml`
        if (type === 'wt') return `${Math.max(0, Math.round(value))}g`
        const rounded = Math.max(0, Math.round(value * 100) / 100)
        return `${rounded} ${unit}`.trim()
      }

      const cupboardByItem = (cupboardItems || []).reduce<Record<string, any[]>>((acc, c: any) => {
        const key = (c.item || '').toLowerCase()
        acc[key] = acc[key] || []
        acc[key].push(c)
        return acc
      }, {})
      for (const key of Object.keys(cupboardByItem)) {
        cupboardByItem[key].sort((a, b) => (a.expires_on || '').localeCompare(b.expires_on || ''))
      }

      for (const row of data as any[]) {
        for (const ing of row.ingredients || []) {
          const match = typeof ing.item === 'string' ? ing.item.match(/^(.*)\s+\(CUPBOARD\)$/i) : null
          if (!match || !match[1]) continue
          const itemName = match[1].trim().toLowerCase()
          const candidates = cupboardByItem[itemName]
          if (!candidates || !candidates.length) continue
          const ingredientAmt = parseAmount(ing.amount)

          if (!ingredientAmt) {
            const c = candidates.shift()
            if (c) await supabase.from('cupboard_items').delete().eq('id', c.id)
            continue
          }

          let remaining = toBase(ingredientAmt)
          while (candidates.length && remaining.value > 0) {
            const c = candidates[0]
            const cupAmt = parseAmount(c.quantity || '')
            if (!cupAmt) {
              await supabase.from('cupboard_items').delete().eq('id', c.id)
              candidates.shift()
              continue
            }
            const cupBase = toBase(cupAmt)
            if (cupBase.type !== remaining.type || (cupBase.type === 'count' && cupBase.unit !== remaining.unit)) {
              await supabase.from('cupboard_items').delete().eq('id', c.id)
              candidates.shift()
              continue
            }
            const newValue = cupBase.value - remaining.value
            if (newValue > 0) {
              await supabase.from('cupboard_items').update({ quantity: formatAmount(newValue, cupBase.unit, cupBase.type) }).eq('id', c.id)
              remaining = { ...remaining, value: 0 }
            } else {
              await supabase.from('cupboard_items').delete().eq('id', c.id)
              candidates.shift()
              remaining = { ...remaining, value: Math.abs(newValue) }
            }
          }
        }
      }
    }

    return NextResponse.json({ meals: data, count: data?.length || 0 })
  } catch (err: any) {
    console.error('Meal plan error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
