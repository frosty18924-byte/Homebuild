import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEAL_PROMPTS: Record<string, string> = {
  mortgage: 'UK mortgage deals fixed rate 2 and 5 year best rates today',
  energy: 'UK energy suppliers cheapest tariffs gas electric comparison today',
  broadband: 'UK broadband deals cheapest fastest fibre comparison today',
  car_insurance: 'UK car insurance cheapest comprehensive deals comparison today',
  home_insurance: 'UK home insurance buildings contents cheapest deals today',
}

export async function POST(req: NextRequest) {
  try {
    const { billId, billType, provider, monthlyAmountPence } = await req.json()

    const searchQuery = DEAL_PROMPTS[billType] || `UK ${billType} best deals today`
    const currentMonthly = (monthlyAmountPence / 100).toFixed(2)

    // Use Claude with web search to find real deals
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{
        role: 'user',
        content: `Search for: "${searchQuery}"

Current situation: The household pays £${currentMonthly}/month with ${provider}.

Find the top 3 alternative deals available RIGHT NOW in the UK for ${billType}.
Return ONLY a JSON array (no markdown, no extra text) with exactly this shape:
[
  {
    "provider": "Provider Name",
    "monthly_amount_pence": 12000,
    "saving_pence": 1500,
    "detail": "Brief deal description e.g. 2yr fixed, 500Mb, no exit fee",
    "url": "https://provider-website.co.uk/deals"
  }
]

Rules:
- monthly_amount_pence must be LESS than ${monthlyAmountPence} (otherwise no saving)
- saving_pence = ${monthlyAmountPence} - monthly_amount_pence
- url should be the direct page for that deal or the provider's main site
- detail max 60 characters
- Sort by saving_pence descending`
      }],
    })

    // Extract text from response (may include tool use blocks)
    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    // Parse JSON from response
    const jsonMatch = textContent.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const rawDeals = JSON.parse(jsonMatch[0])

    // Validate & sanitize
    const deals = rawDeals
      .filter((d: any) => d.provider && d.monthly_amount_pence < monthlyAmountPence)
      .slice(0, 3)
      .map((d: any) => ({
        provider: String(d.provider),
        monthly_amount_pence: Number(d.monthly_amount_pence),
        saving_pence: Number(d.saving_pence),
        detail: String(d.detail || ''),
        url: String(d.url || ''),
      }))

    // Save to Supabase
    await supabase.from('bill_deals').delete().eq('bill_id', billId)
    if (deals.length > 0) {
      await supabase.from('bill_deals').insert(deals.map((d: any) => ({ ...d, bill_id: billId })))
    }

    // Log notification
    await supabase.from('notifications').insert({
      household_id: process.env.NEXT_PUBLIC_HOUSEHOLD_ID,
      type: 'deal_found',
      title: `${deals.length} deals found`,
      body: `Best saving: £${(deals[0]?.saving_pence / 100).toFixed(0)}/mo with ${deals[0]?.provider}`,
      icon: '💡',
      metadata: { bill_id: billId, deals_count: deals.length },
    })

    return NextResponse.json({ deals })
  } catch (err: any) {
    console.error('Deals search error:', err)
    // Return fallback deals so the UI doesn't break
    return NextResponse.json({
      deals: [],
      error: 'Could not fetch live deals — try comparison sites directly',
      fallback: true,
    })
  }
}
