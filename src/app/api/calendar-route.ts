import { NextRequest, NextResponse } from 'next/server'

// ─── Fetch busy days from a public Google Calendar ICS feed ──────────────────
// Users share their calendar as a public ICS URL — no OAuth needed
async function fetchBusyDays(icalUrl: string, daysAhead: number = 14): Promise<string[]> {
  try {
    const res = await fetch(icalUrl, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error('Could not fetch calendar')
    const ical = await res.text()

    const busyDays = new Set<string>()
    const today = new Date()
    const cutoff = new Date()
    cutoff.setDate(today.getDate() + daysAhead)

    // Parse VEVENT blocks
    const events = ical.split('BEGIN:VEVENT')
    events.shift() // remove header

    for (const event of events) {
      // Check if it's an all-day event (DTSTART without time component)
      const allDayMatch = event.match(/DTSTART;VALUE=DATE:(\d{8})/)
      const dateTimeMatch = event.match(/DTSTART(?:;TZID=[^:]+)?:(\d{8})/)
      const summaryMatch = event.match(/SUMMARY:([^\r\n]+)/)

      // Skip events that aren't "out of house" indicators
      // Users can tag events with keywords like "away", "holiday", "out"
      const summary = summaryMatch?.[1]?.toLowerCase() || ''
      const isAbsence = summary.includes('away') ||
        summary.includes('holiday') ||
        summary.includes('out') ||
        summary.includes('travel') ||
        summary.includes('vacation') ||
        summary.includes('trip') ||
        summary.includes('off') ||
        summary.includes('leave')

      const dateStr = allDayMatch?.[1] || dateTimeMatch?.[1]
      if (!dateStr) continue

      const year = parseInt(dateStr.slice(0, 4))
      const month = parseInt(dateStr.slice(4, 6)) - 1
      const day = parseInt(dateStr.slice(6, 8))
      const eventDate = new Date(year, month, day)

      if (eventDate >= today && eventDate <= cutoff) {
        // Add the day — if tagged as absence, or if it's an all-day event with no specific work context
        if (isAbsence || allDayMatch) {
          const key = eventDate.toISOString().split('T')[0]
          busyDays.add(key)
        }
      }
    }

    return Array.from(busyDays).sort()
  } catch (err) {
    console.error('Calendar fetch error:', err)
    return []
  }
}

// ─── Given a due date and busy days, find the best day to do the chore ───────
function adjustDueDate(dueDate: string, busyDays: string[]): {
  originalDate: string
  adjustedDate: string
  wasAdjusted: boolean
  reason: string
} {
  const busySet = new Set(busyDays)

  if (!busySet.has(dueDate)) {
    return { originalDate: dueDate, adjustedDate: dueDate, wasAdjusted: false, reason: '' }
  }

  // Try the day before
  const due = new Date(dueDate)
  const dayBefore = new Date(due)
  dayBefore.setDate(due.getDate() - 1)
  const dayBeforeStr = dayBefore.toISOString().split('T')[0]

  if (!busySet.has(dayBeforeStr)) {
    return {
      originalDate: dueDate,
      adjustedDate: dayBeforeStr,
      wasAdjusted: true,
      reason: `Moved earlier — you're away on ${new Date(dueDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`,
    }
  }

  // Try 2 days before
  const twoBefore = new Date(due)
  twoBefore.setDate(due.getDate() - 2)
  const twoBeforeStr = twoBefore.toISOString().split('T')[0]

  if (!busySet.has(twoBeforeStr)) {
    return {
      originalDate: dueDate,
      adjustedDate: twoBeforeStr,
      wasAdjusted: true,
      reason: `Moved 2 days earlier — you're away on ${new Date(dueDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`,
    }
  }

  // Try day after as last resort
  const dayAfter = new Date(due)
  dayAfter.setDate(due.getDate() + 1)
  const dayAfterStr = dayAfter.toISOString().split('T')[0]

  return {
    originalDate: dueDate,
    adjustedDate: dayAfterStr,
    wasAdjusted: true,
    reason: `Moved to day after — surrounding days are also busy`,
  }
}

// ─── GET: Fetch busy days from calendar URL ───────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const calUrl = searchParams.get('url')

  if (!calUrl) {
    return NextResponse.json({ error: 'No calendar URL provided' }, { status: 400 })
  }

  try {
    const busyDays = await fetchBusyDays(calUrl, 30)
    return NextResponse.json({ busyDays })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST: Check chore due dates against calendar and suggest adjustments ─────
export async function POST(req: NextRequest) {
  try {
    const { calendarUrl, chores } = await req.json()

    if (!calendarUrl) {
      return NextResponse.json({ adjustments: [] })
    }

    const busyDays = await fetchBusyDays(calendarUrl, 30)

    const adjustments = chores
      .map((chore: any) => {
        const result = adjustDueDate(chore.dueDate, busyDays)
        return { choreId: chore.id, choreName: chore.name, ...result }
      })
      .filter((a: any) => a.wasAdjusted)

    return NextResponse.json({ busyDays, adjustments })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
