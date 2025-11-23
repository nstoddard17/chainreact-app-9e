import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

interface DaySummary {
  date: string
  dateFormatted: string
  dayOfWeek: string
  isWeekend: boolean
  totalEvents: number
  busyHours: number
  freeHours: number
  busySlots: Array<{
    start: string
    end: string
    startFormatted: string
    endFormatted: string
    duration: string
    durationMinutes: number
  }>
  freeSlots: Array<{
    start: string
    end: string
    startFormatted: string
    endFormatted: string
    duration: string
    durationMinutes: number
  }>
  isFreeDay: boolean
  availabilityPercent: number
}

interface SuggestedSlot {
  date: string
  dateFormatted: string
  dayOfWeek: string
  start: string
  end: string
  startFormatted: string
  endFormatted: string
  duration: string
  durationMinutes: number
}

/**
 * Google Calendar get free/busy information handler
 * Enhanced with daily summaries, free day detection, and meeting slot suggestions
 */
export async function getGoogleCalendarFreeBusy(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve config values if they contain template variables
    const needsResolution = typeof config === 'object' &&
      Object.values(config).some(v =>
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )

    const resolvedConfig = needsResolution ? resolveValue(config, input) : config

    const {
      calendarId,
      timeMin,
      timeMax,
      timeZone = 'UTC',
      workHoursStart = '09:00',
      workHoursEnd = '17:00',
      meetingDuration = '30',
      includeWeekends = false,
      multiCalendarMode = 'all_free'
    } = resolvedConfig

    if (!calendarId || (Array.isArray(calendarId) && calendarId.length === 0)) {
      throw new Error('At least one calendar ID is required')
    }

    if (!timeMin) {
      throw new Error('Start time (timeMin) is required')
    }

    if (!timeMax) {
      throw new Error('End time (timeMax) is required')
    }

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Parse date strings - handles datetime-local format (YYYY-MM-DDTHH:mm) and ISO strings
    const parseDate = (dateStr: string): string => {
      if (!dateStr) {
        throw new Error('Date/time value is required')
      }

      // Handle relative dates (legacy support)
      if (dateStr === 'today') {
        return new Date().toISOString()
      } else if (dateStr === 'tomorrow') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        return tomorrow.toISOString()
      } else if (dateStr === 'next_week') {
        const nextWeek = new Date()
        nextWeek.setDate(nextWeek.getDate() + 7)
        return nextWeek.toISOString()
      }

      // Try to parse as ISO string or datetime-local format
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date format: ${dateStr}`)
        }
        return date.toISOString()
      } catch (error) {
        throw new Error(`Invalid date format: ${dateStr}`)
      }
    }

    // Process calendar IDs
    const calendarIdList = typeof calendarId === 'string'
      ? calendarId.split(',').map((id: string) => id.trim())
      : Array.isArray(calendarId)
        ? calendarId
        : [calendarId]

    const items = calendarIdList.map(id => ({ id }))

    // Query free/busy information
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: parseDate(timeMin),
        timeMax: parseDate(timeMax),
        timeZone: timeZone,
        items: items
      }
    })

    const freeBusyData = response.data

    // Helper to format date/time in a readable way
    const formatDateTime = (isoString: string): string => {
      try {
        const date = new Date(isoString)
        return date.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timeZone
        })
      } catch {
        return isoString
      }
    }

    // Helper to format time only
    const formatTime = (isoString: string): string => {
      try {
        const date = new Date(isoString)
        return date.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timeZone
        })
      } catch {
        return isoString
      }
    }

    // Helper to format date only
    const formatDate = (isoString: string): string => {
      try {
        const date = new Date(isoString)
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: timeZone
        })
      } catch {
        return isoString
      }
    }

    // Helper to get day of week
    const getDayOfWeek = (isoString: string): string => {
      try {
        const date = new Date(isoString)
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: timeZone
        })
      } catch {
        return 'Unknown'
      }
    }

    // Helper to check if weekend
    const isWeekend = (isoString: string): boolean => {
      try {
        const date = new Date(isoString)
        const day = date.getDay()
        return day === 0 || day === 6
      } catch {
        return false
      }
    }

    // Helper to format duration
    const formatDuration = (minutes: number): string => {
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
      }
      return `${minutes}m`
    }

    // Parse work hours
    const [workStartHour, workStartMin] = workHoursStart.split(':').map(Number)
    const [workEndHour, workEndMin] = workHoursEnd.split(':').map(Number)
    const meetingDurationMinutes = parseInt(meetingDuration, 10)

    // Process the results to make them more user-friendly
    const calendars: Record<string, any> = {}
    const busyCalendars: string[] = []
    const freeCalendars: string[] = []
    const allBusySlots: Array<{ calendar: string; start: string; end: string; startFormatted: string; endFormatted: string; duration: string }> = []
    let totalBusySlots = 0

    // Collect all busy slots across all calendars
    const combinedBusySlots: Array<{ start: Date; end: Date }> = []

    for (const [calId, calendarData] of Object.entries(freeBusyData.calendars || {})) {
      const data = calendarData as any
      const busySlots = data.busy || []
      const isBusy = busySlots.length > 0

      // Track busy vs free calendars
      if (isBusy) {
        busyCalendars.push(calId)
      } else {
        freeCalendars.push(calId)
      }

      // Process each busy slot with formatted times
      const formattedBusySlots = busySlots.map((slot: any) => {
        const startDate = new Date(slot.start)
        const endDate = new Date(slot.end)
        const durationMs = endDate.getTime() - startDate.getTime()
        const durationMins = Math.round(durationMs / 60000)
        const durationStr = formatDuration(durationMins)

        // Add to combined busy slots for multi-calendar calculation
        combinedBusySlots.push({ start: startDate, end: endDate })

        const formattedSlot = {
          start: slot.start,
          end: slot.end,
          startFormatted: formatDateTime(slot.start),
          endFormatted: formatDateTime(slot.end),
          duration: durationStr
        }

        // Add to all busy slots list
        allBusySlots.push({
          calendar: calId,
          ...formattedSlot
        })

        return formattedSlot
      })

      totalBusySlots += busySlots.length

      calendars[calId] = {
        isBusy,
        busySlotCount: busySlots.length,
        status: isBusy ? 'Busy' : 'Free',
        busySlots: formattedBusySlots,
        errors: data.errors || []
      }
    }

    // Sort all busy slots by start time
    allBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    // Merge overlapping busy slots for daily calculations
    const mergedBusySlots = mergeBusySlots(combinedBusySlots)

    // Generate daily summaries
    const queryStartDate = new Date(parseDate(timeMin))
    const queryEndDate = new Date(parseDate(timeMax))
    const dailySummaries: DaySummary[] = []
    const freeDays: string[] = []
    const busyDays: string[] = []
    const suggestedSlots: SuggestedSlot[] = []
    let totalFreeHours = 0
    let totalBusyHours = 0

    // Iterate through each day in the range
    const currentDate = new Date(queryStartDate)
    currentDate.setHours(0, 0, 0, 0)

    while (currentDate < queryEndDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayOfWeek = getDayOfWeek(currentDate.toISOString())
      const isWeekendDay = isWeekend(currentDate.toISOString())

      // Skip weekends if not included
      if (!includeWeekends && isWeekendDay) {
        currentDate.setDate(currentDate.getDate() + 1)
        continue
      }

      // Calculate work hours for this day
      const dayWorkStart = new Date(currentDate)
      dayWorkStart.setHours(workStartHour, workStartMin, 0, 0)

      const dayWorkEnd = new Date(currentDate)
      dayWorkEnd.setHours(workEndHour, workEndMin, 0, 0)

      // Get busy slots for this day within work hours
      const dayBusySlots = mergedBusySlots.filter(slot => {
        const slotStart = slot.start
        const slotEnd = slot.end
        return slotStart < dayWorkEnd && slotEnd > dayWorkStart
      }).map(slot => {
        // Clip to work hours
        const clippedStart = new Date(Math.max(slot.start.getTime(), dayWorkStart.getTime()))
        const clippedEnd = new Date(Math.min(slot.end.getTime(), dayWorkEnd.getTime()))
        return { start: clippedStart, end: clippedEnd }
      })

      // Calculate free slots within work hours
      const freeSlots: Array<{ start: Date; end: Date }> = []
      let lastEnd = dayWorkStart

      for (const busySlot of dayBusySlots) {
        if (busySlot.start > lastEnd) {
          freeSlots.push({ start: new Date(lastEnd), end: new Date(busySlot.start) })
        }
        lastEnd = new Date(Math.max(lastEnd.getTime(), busySlot.end.getTime()))
      }

      // Add final free slot if there's time remaining
      if (lastEnd < dayWorkEnd) {
        freeSlots.push({ start: new Date(lastEnd), end: new Date(dayWorkEnd) })
      }

      // Calculate hours
      const workHoursTotal = (dayWorkEnd.getTime() - dayWorkStart.getTime()) / (1000 * 60 * 60)
      let dayBusyHours = 0
      for (const slot of dayBusySlots) {
        dayBusyHours += (slot.end.getTime() - slot.start.getTime()) / (1000 * 60 * 60)
      }
      const dayFreeHours = workHoursTotal - dayBusyHours

      totalFreeHours += dayFreeHours
      totalBusyHours += dayBusyHours

      // Format busy slots
      const formattedBusySlots = dayBusySlots.map(slot => {
        const durationMins = Math.round((slot.end.getTime() - slot.start.getTime()) / 60000)
        return {
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          startFormatted: formatTime(slot.start.toISOString()),
          endFormatted: formatTime(slot.end.toISOString()),
          duration: formatDuration(durationMins),
          durationMinutes: durationMins
        }
      })

      // Format free slots and find meeting slots
      const formattedFreeSlots = freeSlots.map(slot => {
        const durationMins = Math.round((slot.end.getTime() - slot.start.getTime()) / 60000)

        // Add as suggested meeting slot if it fits the duration
        if (durationMins >= meetingDurationMinutes) {
          // Add multiple slots if the free slot is longer than meeting duration
          let slotStart = new Date(slot.start)
          while (slotStart.getTime() + meetingDurationMinutes * 60000 <= slot.end.getTime()) {
            const slotEnd = new Date(slotStart.getTime() + meetingDurationMinutes * 60000)
            suggestedSlots.push({
              date: dateStr,
              dateFormatted: formatDate(currentDate.toISOString()),
              dayOfWeek,
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              startFormatted: formatTime(slotStart.toISOString()),
              endFormatted: formatTime(slotEnd.toISOString()),
              duration: formatDuration(meetingDurationMinutes),
              durationMinutes: meetingDurationMinutes
            })
            // Move to next slot (with 30 min increments for variety)
            slotStart = new Date(slotStart.getTime() + 30 * 60000)
          }
        }

        return {
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          startFormatted: formatTime(slot.start.toISOString()),
          endFormatted: formatTime(slot.end.toISOString()),
          duration: formatDuration(durationMins),
          durationMinutes: durationMins
        }
      })

      const isFreeDay = dayBusySlots.length === 0
      if (isFreeDay) {
        freeDays.push(dateStr)
      } else {
        busyDays.push(dateStr)
      }

      dailySummaries.push({
        date: dateStr,
        dateFormatted: formatDate(currentDate.toISOString()),
        dayOfWeek,
        isWeekend: isWeekendDay,
        totalEvents: dayBusySlots.length,
        busyHours: Math.round(dayBusyHours * 10) / 10,
        freeHours: Math.round(dayFreeHours * 10) / 10,
        busySlots: formattedBusySlots,
        freeSlots: formattedFreeSlots,
        isFreeDay,
        availabilityPercent: Math.round((dayFreeHours / workHoursTotal) * 100)
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Sort best days for meetings (most free hours first)
    const bestDaysForMeetings = [...dailySummaries]
      .sort((a, b) => b.freeHours - a.freeHours)
      .map(day => ({
        date: day.date,
        dateFormatted: day.dateFormatted,
        dayOfWeek: day.dayOfWeek,
        freeHours: day.freeHours,
        availabilityPercent: day.availabilityPercent,
        freeSlotCount: day.freeSlots.length
      }))

    // Generate a human-readable summary
    const generateSummary = (): string => {
      const total = calendarIdList.length
      const busyCount = busyCalendars.length
      const freeCount = freeCalendars.length

      if (freeCount === total) {
        return `All ${total} calendar${total > 1 ? 's are' : ' is'} free during this time period.`
      } else if (busyCount === total) {
        return `All ${total} calendar${total > 1 ? 's have' : ' has'} busy time slots (${totalBusySlots} total).`
      } else {
        return `${freeCount} of ${total} calendar${freeCount > 1 ? 's are' : ' is'} free. ${busyCount} calendar${busyCount > 1 ? 's have' : ' has'} ${totalBusySlots} busy slot${totalBusySlots > 1 ? 's' : ''}.`
      }
    }

    // Generate availability summary
    const generateAvailabilitySummary = (): string => {
      const totalDays = dailySummaries.length
      const freeDayCount = freeDays.length
      const lines: string[] = []

      lines.push(`📅 Availability Summary (${totalDays} day${totalDays > 1 ? 's' : ''})`)
      lines.push('')

      if (freeDayCount === totalDays) {
        lines.push(`✅ All ${totalDays} days are completely free during work hours!`)
      } else if (freeDayCount === 0) {
        lines.push(`📌 All ${totalDays} days have scheduled events.`)
      } else {
        lines.push(`✅ ${freeDayCount} free day${freeDayCount > 1 ? 's' : ''}: ${freeDays.join(', ')}`)
        lines.push(`📌 ${busyDays.length} day${busyDays.length > 1 ? 's' : ''} with events`)
      }

      lines.push('')
      lines.push(`⏰ Total: ${Math.round(totalFreeHours * 10) / 10}h free, ${Math.round(totalBusyHours * 10) / 10}h busy`)
      lines.push(`📊 ${suggestedSlots.length} available ${meetingDurationMinutes}-minute meeting slots found`)

      return lines.join('\n')
    }

    logger.info('✅ [Google Calendar] Retrieved free/busy information with daily summaries', {
      calendarCount: calendarIdList.length,
      timeMin: parseDate(timeMin),
      timeMax: parseDate(timeMax),
      daysAnalyzed: dailySummaries.length,
      freeDays: freeDays.length,
      suggestedSlots: suggestedSlots.length
    })

    return {
      success: true,
      output: {
        // User-friendly summary fields
        summary: generateSummary(),
        totalCalendars: calendarIdList.length,
        freeCalendarCount: freeCalendars.length,
        busyCalendarCount: busyCalendars.length,
        totalBusySlots,
        allFree: freeCalendars.length === calendarIdList.length,
        allBusy: busyCalendars.length === calendarIdList.length,

        // Lists of calendar IDs by status
        freeCalendars,
        busyCalendars,

        // All busy time slots sorted by start time
        busyTimeSlots: allBusySlots,

        // Query info
        queryStart: formatDateTime(freeBusyData.timeMin || parseDate(timeMin)),
        queryEnd: formatDateTime(freeBusyData.timeMax || parseDate(timeMax)),
        timeZone,

        // Raw data for advanced use
        rawData: {
          calendars,
          timeMin: freeBusyData.timeMin,
          timeMax: freeBusyData.timeMax,
          queriedCalendars: calendarIdList
        },

        // NEW: Daily summary fields
        dailySummary: dailySummaries,
        freeDays,
        freeDayCount: freeDays.length,
        busyDays,
        busyDayCount: busyDays.length,
        availabilitySummary: generateAvailabilitySummary(),
        bestDaysForMeetings,
        suggestedSlots,
        suggestedSlotCount: suggestedSlots.length,
        totalFreeHours: Math.round(totalFreeHours * 10) / 10,
        totalBusyHours: Math.round(totalBusyHours * 10) / 10,
        workHoursConfig: {
          start: workHoursStart,
          end: workHoursEnd,
          meetingDuration: meetingDurationMinutes,
          includeWeekends,
          multiCalendarMode
        }
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error retrieving free/busy:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    throw error
  }
}

/**
 * Merge overlapping busy slots into contiguous blocks
 */
function mergeBusySlots(slots: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (slots.length === 0) return []

  // Sort by start time
  const sorted = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime())

  const merged: Array<{ start: Date; end: Date }> = []
  let current = { start: new Date(sorted[0].start), end: new Date(sorted[0].end) }

  for (let i = 1; i < sorted.length; i++) {
    const slot = sorted[i]
    if (slot.start <= current.end) {
      // Overlapping or adjacent - extend current
      current.end = new Date(Math.max(current.end.getTime(), slot.end.getTime()))
    } else {
      // Non-overlapping - save current and start new
      merged.push(current)
      current = { start: new Date(slot.start), end: new Date(slot.end) }
    }
  }

  merged.push(current)
  return merged
}
