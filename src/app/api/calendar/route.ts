import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

interface CalendarEvent {
    title: string
    start: string
    end: string
    allDay: boolean
    location?: string
    description?: string
    source?: string
    isAway?: boolean
}

const AWAY_KEYWORDS = [
    'away',
    'holiday',
    'vacation',
    'travel',
    'trip',
    'out of office',
    'ooo',
    'out',
]

function looksLikeAway(summary: string, description: string, location: string, isAllDay: boolean) {
    const hay = `${summary} ${description} ${location}`.toLowerCase()
    const keyword = AWAY_KEYWORDS.some(k => hay.includes(k))
    // Back-compat: some users encode away blocks as all-day events with a location set
    return keyword || (isAllDay && !!location)
}

function dateKey(d: Date) {
    return d.toISOString().slice(0, 10)
}

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
                parseInt(str.slice(0, 4)),
                parseInt(str.slice(4, 6)) - 1,
                parseInt(str.slice(6, 8))
            )
        }
        // DateTime: 20250315T090000Z or 20250315T090000
        if (/^\d{8}T\d{6}/.test(str)) {
            return new Date(
                Date.UTC(
                    parseInt(str.slice(0, 4)),
                    parseInt(str.slice(4, 6)) - 1,
                    parseInt(str.slice(6, 8)),
                    parseInt(str.slice(9, 11)),
                    parseInt(str.slice(11, 13)),
                    parseInt(str.slice(13, 15))
                )
            )
        }
    } catch { }
    return null
}

// ─── Parse one iCal feed and return events ──────────────────────────────────
async function fetchCalendarEvents(icalUrl: string, daysAhead: number = 60, sourceName?: string): Promise<CalendarEvent[]> {
    try {
        const res = await fetch(icalUrl, { next: { revalidate: 3600 } })
        if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`)
        const ical = await res.text()

        const events: CalendarEvent[] = []
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const cutoff = new Date()
        cutoff.setDate(today.getDate() + daysAhead)

        // Split into VEVENT blocks
        const eventBlocks = ical.split('BEGIN:VEVENT')
        eventBlocks.shift()

        for (const block of eventBlocks) {
            // Extract fields
            const summary = block.match(/SUMMARY(?:;[^:]+)?:([^\r\n]+)/)?.[1]?.trim() || 'Untitled Event'
            const dtStartRaw = block.match(/DTSTART(?:;[^:]+)?:([^\r\n]+)/)?.[1]?.trim()
            const dtEndRaw = block.match(/DTEND(?:;[^:]+)?:([^\r\n]+)/)?.[1]?.trim()
            const location = block.match(/LOCATION:([^\r\n]+)/)?.[1]?.trim() || ''
            const description = block.match(/DESCRIPTION:([^\r\n]+)/)?.[1]?.trim() || ''

            if (!dtStartRaw) continue

            const isAllDay = /DTSTART;VALUE=DATE:/.test(block)
            const startDate = parseIcalDate(dtStartRaw)
            if (!startDate || startDate > cutoff) continue

            let endDate = dtEndRaw ? parseIcalDate(dtEndRaw) : null
            if (!endDate) {
                endDate = new Date(startDate)
                if (isAllDay) endDate.setDate(endDate.getDate() + 1)
                else endDate.setHours(endDate.getHours() + 1)
            }

            // Only include events that haven't ended yet or started recently
            const recentStart = new Date(today)
            recentStart.setDate(recentStart.getDate() - 7)

            if (endDate < recentStart) continue

            const isAway = looksLikeAway(summary, description, location, isAllDay)

            events.push({
                title: summary,
                start: isAllDay ? dateKey(startDate) : startDate.toISOString(),
                end: isAllDay ? dateKey(endDate) : endDate.toISOString(),
                allDay: isAllDay,
                location,
                description,
                source: sourceName,
                isAway,
            })
        }

        return events
    } catch (err) {
        console.error('Calendar parse error:', err)
        return []
    }
}

export async function GET(req: NextRequest) {
    const user = await requireAuth(req)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const url1 = searchParams.get('url1')
    const url2 = searchParams.get('url2')
    const name1 = searchParams.get('name1') || 'Person A'
    const name2 = searchParams.get('name2') || 'Person B'

    const urlsWithNames = [
        { url: url1, name: name1 },
        { url: url2, name: name2 }
    ].filter(item => item.url)

    const allEvents = await Promise.all(
        urlsWithNames.map(item => fetchCalendarEvents(item.url!, 60, item.name))
    )

    const mergedEvents = allEvents.flat().sort((a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime()
    )

    // Also include the busyDays logic for backward compatibility if needed
    const busyDays = new Set<string>()
    mergedEvents.forEach(e => {
        if (!e.isAway) return

        if (e.allDay) {
            // start/end are date-keys for all-day events; end is typically exclusive
            const startKey = e.start
            const endKey = e.end
            const start = new Date(startKey + 'T00:00:00')
            const end = new Date(endKey + 'T00:00:00')

            let d = new Date(start)
            const endAdj = new Date(end)
            endAdj.setDate(endAdj.getDate() - 1)
            while (d <= endAdj) {
                busyDays.add(dateKey(d))
                d.setDate(d.getDate() + 1)
            }
            return
        }

        const start = new Date(e.start)
        busyDays.add(dateKey(start))
    })

    return NextResponse.json({
        events: mergedEvents,
        busyDays: Array.from(busyDays).sort(),
        count: mergedEvents.length
    })
}
