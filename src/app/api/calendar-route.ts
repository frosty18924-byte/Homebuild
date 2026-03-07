import { NextRequest, NextResponse } from 'next/server'

// ─── Parse duration from DURATION field e.g. PT6H30M ─────────────────────────
function parseDurationHours(duration: string): number {
  const hours = duration.match(/(\d+)H/)?.[1] || '0'
  const mins = duration.match(/(\d+)M/)?.[1] || '0'
  return parseInt(hours) + parseInt(mins) / 60
}

// ─── Parse iCal datetime to Date ─────────────────────────────────────────────
function parseIcalDate(str: string): Date | null {
  try {
    // All-day: 20250315
    if (/^\d{8}$/.test(str)) {
      return new Date(
        parseInt(str.slice(0,4)),
        parseInt(str.slice(4,6)) - 1,
        parseInt(str.slice(6,8))
      )
    }
    // DateTime: 20250315T090000Z or 20250315T090000
    if (/^\d{8}T\d{6}/.test(str)) {
      return new Date(
        parseInt(str.slice(0,4)),
        parseInt(str.slice(4,6)) - 1,
        parseInt(str.slice(6,8)),
        parseInt(str.slice(9,11)),
        parseInt(str.slice(11,13))
      )
    }
  } catch {}
  return null
}

// ─── Parse one iCal feed and return busy days ─────────────────────────────────
async function fetchBusyDays(icalUrl: string, daysAhead: number = 30): Promise<string[]> {
  try {
    const res = await fetch(icalUrl, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`)
    const ical = await res.text()

    const busyDays = new Set<string>()
    const today = new Date()
    today.setHours(0,0,0,0)
    const cutoff = new Date()
    cutoff.setDate(today.getDate() + daysAhead)

    // Split into VEVENT blocks
    const eventBlocks = ical.split('BEGIN:VEVENT')
    eventBlocks.shift()

    for (const block of eventBlocks) {
      // Extract fields
      const dtStartRaw = block.match(/DTSTART(?:;[^:]+)?:([^\r\n]+)/)?.[1]?.trim()
      const dtEndRaw   = block.match(/DTEND(?:;[^:]+)?:([^\r\n]+)/)?.[1]?.trim()
      const durationRaw = block.match(/DURATION:([^\r\n]+)/)?.[1]?.trim()
      const location   = block.match(/LOCATION:([^\r\n]+)/)?.[1]?.trim() || ''

      if (!dtStartRaw) continue

      const isAllDay = /DTSTART;VALUE=DATE:/.test(block)

      // All-day events with a location = away day
      if (isAllDay && location) {
        const startDate = parseIcalDate(dtStartRaw)
        const endDate = dtEndRaw ? parseIcalDate(dtEndRaw) : null
        if (!startDate) continue

        // All-day events have DTEND = day AFTER last day
        const endDateAdj = endDate ? new Date(endDate) : new Date(startDate)
        endDateAdj.setDate(endDateAdj.getDate() - (endDate ? 1 : 0))

        let d = new Date(startDate)
        while (d <= endDateAdj) {
          if (d >= today && d <= cutoff) {
            busyDays.add(d.toISOString().split('T')[0])
          }
          d.setDate(d.getDate() + 1)
        }
        continue
      }

      // Timed events — check duration >= 6 hours AND has location
      if (!location) continue

      const startDate = parseIcalDate(dtStartRaw)
      if (!startDate || startDate < today || startDate > cutoff) continue

      let durationHours = 0

      if (durationRaw) {
        durationHours = parseDurationHours(durationRaw)
      } else if (dtEndRaw) {
        const endDate = parseIcalDate(dtEndRaw)
        if (endDate) {
          durationHours = (endDate.getTime() - startDate.getTime()) / 3600000
        }
      }

      if (durationHours >= 6) {
        busyDays.add(startDate.toISOString().split('T')[0])
      }
    }

    return Array.from(busyDays).sort()
  } catch (err) {
    console.error('Calendar parse error:', err)
    return []
  }
}

// ─── Merge busy days from multiple calendars ──────────────────────────────────
async function fetchAllBusyDays(urls: string[]): Promise<string[]> {
  const results = await Promise.all(urls.map(url => fetchBusyDays(url)))
  const merged = new Set<string>()
  results.forEach(days => days.forEach(d => merged.add(d)))
  return Array.from(merged).sort()
}

// ─── Adjust a chore due date around busy days ────────────────────────────────
function adjustDueDate(dueDate: string, busyDays: Set<string>): {
  adjustedDate: string
  wasAdjusted: boolean
  reason: string
} {
  if (!busyDays.has(dueDate)) {
    return { adjustedDate: dueDate, wasAdjusted: false, reason: '' }
  }

  const due = new Date(dueDate)
  const dayLabel = due.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

  // Try 1 day before, 2 days before, then 1 day after
  for (const offset of [-1, -2, -3, 1]) {
    const candidate = new Date(due)
    candidate.setDate(due.getDate() + offset)
    const candidateStr = candidate.toISOString().split('T')[0]
    if (!busyDays.has(candidateStr)) {
      const direction = offset < 0 ? `${Math.abs(offset)} day${Math.abs(offset)>1?'s':''} earlier` : '1 day later'
      return {
        adjustedDate: candidateStr,
        wasAdjusted: true,
        reason: `Moved ${direction} — someone's out on ${dayLabel}`,
      }
    }
  }

  return { adjustedDate: dueDate, wasAdjusted: false, reason: 'Could not find a free day nearby' }
}

// ─── GET: Fetch busy days from one or two calendar URLs ───────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url1 = searchParams.get('url1') || searchParams.get('url')
  const url2 = searchParams.get('url2')

  if (!url1) {
    return NextResponse.json({ error: 'No calendar URL provided' }, { status: 400 })
  }

  const urls = [url1, url2].filter(Boolean) as string[]
  const busyDays = await fetchAllBusyDays(urls)

  return NextResponse.json({ busyDays, count: busyDays.length })
}

// ─── POST: Check chore due dates and return adjustments ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const { calendarUrl1, calendarUrl2, chores } = await req.json()

    const urls = [calendarUrl1, calendarUrl2].filter(Boolean) as string[]
    if (urls.length === 0) return NextResponse.json({ adjustments: [], busyDays: [] })

    const busyDays = await fetchAllBusyDays(urls)
    const busySet = new Set(busyDays)

    const adjustments = chores
      .map((chore: any) => {
        const result = adjustDueDate(chore.dueDate, busySet)
        return { choreId: chore.id, choreName: chore.name, originalDate: chore.dueDate, ...result }
      })
      .filter((a: any) => a.wasAdjusted)

    return NextResponse.json({ busyDays, adjustments })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
