// Deterministic health-signal rules over a Snapshot.
// Every rule reads only snapshot data — nothing is hardcoded to a persona.
// Pure functions — no I/O, no React, no Date.now().

import type { HealthSignalFlag, Snapshot } from '../lib/types'
import { computeSpendAnalytics } from './analytics'

const FRESH_PATTERN = /fresh|produce|vegetab|veggie|fruit|salad|greens|berr|organic/i
const SUPPLEMENT_PATTERN = /vitamin|supplement|protein|omega|magnesium|creatine|electrolyte/i
const LATE_NIGHT_PATTERN = /late[- ]?night|midnight/i

/** Share of tracked spend on dining/delivery above which we raise a watch flag. */
const DINING_SHARE_WATCH_PCT = 25
/** More active streaming subscriptions than this raises a time/health watch flag. */
const STREAMING_WATCH_COUNT = 3

/**
 * Compute deterministic health flags from a snapshot:
 * - dining/delivery share of spend > 25 % -> watch (healthier-swap suggestion)
 * - groceries with fresh-item evidence -> positive
 * - health-category purchases (supplements/pharmacy) -> noted
 * - fitness events on the calendar -> positive (absence -> suggestion)
 * - >3 active streaming subscriptions -> watch
 * - late-night food orders (timestamped dates or subject evidence) -> watch
 */
export function computeHealthFlags(snapshot: Snapshot): HealthSignalFlag[] {
  const flags: HealthSignalFlag[] = []
  const analytics = computeSpendAnalytics(snapshot)

  // 1. Dining & delivery share of tracked spend.
  const dining = analytics.byCategory.find((c) => c.category === 'dining')
  if (dining && analytics.totalTracked > 0 && dining.pctOfTotal > DINING_SHARE_WATCH_PCT) {
    flags.push({
      kind: 'watch',
      title: 'Dining & delivery running hot',
      detail:
        `Restaurants and delivery make up ${Math.round(dining.pctOfTotal)}% of tracked spend ` +
        `(guideline: ${DINING_SHARE_WATCH_PCT}%). Swapping two delivery orders a week for a `
        + 'grocery-list meal plan trims cost and sodium at the same time.',
    })
  }

  // 2. Groceries with fresh-item evidence.
  const groceryTx = snapshot.transactions.filter(
    (t) => t.category === 'groceries' && t.kind !== 'refund',
  )
  const freshEvidence =
    snapshot.profile.summary.foodPreferences.frequentItems.some((item) => FRESH_PATTERN.test(item)) ||
    groceryTx.some((t) => t.subject !== null && FRESH_PATTERN.test(t.subject))
  if (groceryTx.length > 0 && freshEvidence) {
    flags.push({
      kind: 'positive',
      title: 'Fresh groceries in the mix',
      detail:
        `${groceryTx.length} grocery purchases with fresh-item signals (produce, fruit, greens) ` +
        '— a solid base for home cooking.',
    })
  }

  // 3. Health-category purchases (supplements / pharmacy).
  const healthTx = snapshot.transactions.filter(
    (t) => t.category === 'health' && t.kind !== 'refund',
  )
  if (healthTx.length > 0) {
    const hasSupplements = healthTx.some(
      (t) =>
        (t.subject !== null && SUPPLEMENT_PATTERN.test(t.subject)) ||
        SUPPLEMENT_PATTERN.test(t.merchant),
    )
    flags.push(
      hasSupplements
        ? {
            kind: 'positive',
            title: 'Investing in supplements & wellness',
            detail:
              `${healthTx.length} health purchases including supplements — worth a periodic ` +
              'review that each one still earns its spot.',
          }
        : {
            kind: 'suggestion',
            title: 'Pharmacy spending detected',
            detail:
              `${healthTx.length} pharmacy/health purchases. Ask about 90-day generic fills — ` +
              'they usually cut per-dose cost sharply.',
          },
    )
  }

  // 4. Fitness events on the calendar (absence-based suggestion when the
  //    calendar has data but no movement).
  const fitnessEvents = snapshot.events.filter((e) => e.kind === 'fitness')
  if (fitnessEvents.length > 0) {
    const recurringCount = fitnessEvents.filter((e) => e.recurring).length
    flags.push({
      kind: 'positive',
      title: 'Movement is on the calendar',
      detail:
        `${fitnessEvents.length} fitness events found` +
        `${recurringCount > 0 ? `, ${recurringCount} recurring` : ''}` +
        ' — scheduled workouts are the ones that happen.',
    })
  } else if (snapshot.events.length > 0) {
    flags.push({
      kind: 'suggestion',
      title: 'No workouts on the calendar',
      detail:
        `${snapshot.events.length} calendar events scanned, none fitness-related. ` +
        'A recurring 30-minute block beats waiting for free time.',
    })
  }

  // 5. Streaming stack depth (time/health watch).
  const streaming = snapshot.subscriptions.filter(
    (s) => s.category === 'streaming' && s.status !== 'cancelled',
  )
  if (streaming.length > STREAMING_WATCH_COUNT) {
    flags.push({
      kind: 'watch',
      title: 'Streaming stack is deep',
      detail:
        `${streaming.length} active streaming subscriptions — beyond the cost, that is a lot of ` +
        'screen time competing with sleep. Rotate: keep two, pause the rest.',
    })
  }

  // 6. Late-night food orders (timestamped transaction dates or subject evidence).
  const lateNight = snapshot.transactions.filter((t) => {
    if (t.category !== 'dining' || t.kind === 'refund') return false
    const timeMatch = /T(\d{2})/.exec(t.date)
    if (timeMatch) {
      const hour = Number(timeMatch[1])
      if (hour >= 22 || hour < 5) return true
    }
    return t.subject !== null && LATE_NIGHT_PATTERN.test(t.subject)
  })
  if (lateNight.length > 0) {
    flags.push({
      kind: 'watch',
      title: 'Late-night food orders',
      detail:
        `${lateNight.length} orders landed late at night. Eating close to bedtime works against ` +
        'sleep quality — earlier dinners are an easy win.',
    })
  }

  return flags
}
