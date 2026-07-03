// Curated catalog of cheaper alternatives for common subscriptions,
// plus a deterministic matcher. Pure functions — no I/O, no React.

import type { Alternative, Cadence, Subscription } from '../lib/types'
import { cadenceMultiplier } from './recurrence'

export interface SavingsCatalogEntry {
  /** Lowercase substrings matched against the subscription merchant (case-insensitive). */
  matchMerchants: string[]
  name: string
  /** null = price depends on usage (savings cannot be computed). */
  price: number | null
  cadence: Cadence
  qualityNote: string
  healthNote: string | null
  url: string | null
}

export const savingsCatalog: SavingsCatalogEntry[] = [
  {
    matchMerchants: ['netflix'],
    name: 'Netflix Standard with ads',
    price: 7.99,
    cadence: 'monthly',
    qualityNote:
      'Same catalog at 1080p with a few ads per hour — most viewers stop noticing within a week.',
    healthNote: null,
    url: 'https://www.netflix.com/signup/planform',
  },
  {
    matchMerchants: ['spotify'],
    name: 'Spotify Duo',
    price: 16.99,
    cadence: 'monthly',
    qualityNote: 'Two full Premium accounts on one bill — split with a partner and both save.',
    healthNote: null,
    url: 'https://www.spotify.com/us/duo/',
  },
  {
    matchMerchants: ['spotify'],
    name: 'Spotify Free',
    price: 0,
    cadence: 'monthly',
    qualityNote: 'Ad-supported with shuffle-first mobile playback; your playlists carry over.',
    healthNote: null,
    url: 'https://www.spotify.com/us/free/',
  },
  {
    matchMerchants: ['youtube'],
    name: 'YouTube Premium Lite',
    price: 7.99,
    cadence: 'monthly',
    qualityNote: 'Ad-free videos; drops background play and YouTube Music.',
    healthNote: null,
    url: 'https://www.youtube.com/premium',
  },
  {
    matchMerchants: ['applecare'],
    name: 'Self-insure instead of AppleCare+',
    price: 0,
    cadence: 'monthly',
    qualityNote:
      'Move the premium into a repair fund — careful users come out ahead over two-plus years.',
    healthNote: null,
    url: 'https://support.apple.com/applecare-plus',
  },
  {
    matchMerchants: ['tesla'],
    name: 'Pause FSD in months you are not road-tripping',
    price: 0,
    cadence: 'monthly',
    qualityNote:
      'FSD is $99/mo month-to-month — toggle it off in the app for commute-only months and re-enable before long drives.',
    healthNote: null,
    url: 'https://www.tesla.com/support/full-self-driving-subscription',
  },
  {
    matchMerchants: ['at&t', 'verizon', 't-mobile', 'tmobile'],
    name: 'Visible (Verizon-network MVNO)',
    price: 25,
    cadence: 'monthly',
    qualityNote: 'Unlimited data on the same Verizon towers; support is chat-only.',
    healthNote: null,
    url: 'https://www.visible.com',
  },
  {
    matchMerchants: ['at&t', 'verizon', 't-mobile', 'tmobile'],
    name: 'Mint Mobile (T-Mobile-network MVNO)',
    price: 15,
    cadence: 'monthly',
    qualityNote: 'Prepay a year to lock $15/mo; same T-Mobile coverage map.',
    healthNote: null,
    url: 'https://www.mintmobile.com',
  },
  {
    matchMerchants: ['at&t', 'verizon', 't-mobile', 'tmobile'],
    name: 'US Mobile (pick your network)',
    price: 17.5,
    cadence: 'monthly',
    qualityNote: 'Runs on Verizon or T-Mobile towers — keep your coverage, drop the retail price.',
    healthNote: null,
    url: 'https://www.usmobile.com',
  },
  {
    matchMerchants: ['siriusxm', 'sirius xm'],
    name: 'SiriusXM retention rate',
    price: 5,
    cadence: 'monthly',
    qualityNote:
      'Call to cancel and take the retention offer — $60/yr promotional rates are routinely granted.',
    healthNote: null,
    url: 'https://www.siriusxm.com',
  },
  {
    matchMerchants: ['audible'],
    name: 'Libby via your public library',
    price: 0,
    cadence: 'monthly',
    qualityNote: 'Free audiobooks with a library card; popular titles can have hold queues.',
    healthNote: null,
    url: 'https://libbyapp.com',
  },
  {
    matchMerchants: ['equinox', 'planet fitness', 'la fitness', '24 hour fitness', 'lifetime', 'crunch', 'gym'],
    name: 'Community rec center membership',
    price: 25,
    cadence: 'monthly',
    qualityNote: 'Pool, weights and courts for a fraction of chain pricing.',
    healthNote: 'Proximity beats amenities for workout adherence — pick the closest option.',
    url: null,
  },
  {
    matchMerchants: ['hugging face', 'huggingface'],
    name: 'Hugging Face free tier + pay-as-you-go',
    price: 0,
    cadence: 'monthly',
    qualityNote:
      'The free tier plus metered Inference Endpoints often beats flat Pro pricing for light usage.',
    healthNote: null,
    url: 'https://huggingface.co/pricing',
  },
  {
    matchMerchants: ['chatgpt', 'openai', 'claude', 'anthropic'],
    name: 'Consolidate to one AI assistant',
    price: 20,
    cadence: 'monthly',
    qualityNote:
      'Keep the assistant you reach for daily; a second $20/mo plan rarely earns its keep.',
    healthNote: null,
    url: null,
  },
  {
    matchMerchants: ['icloud', 'google one', 'dropbox'],
    name: 'Deduplicate cloud storage',
    price: 2.99,
    cadence: 'monthly',
    qualityNote:
      'Overlapping storage plans are pure waste — keep one, downgrade the rest to free tiers.',
    healthNote: null,
    url: null,
  },
  {
    matchMerchants: ['hellofresh', 'blue apron', 'home chef', 'factor', 'meal kit'],
    name: 'Grocery-list meal swap',
    price: null,
    cadence: 'weekly',
    qualityNote: 'The same recipes cost roughly 40% less bought as a grocery list.',
    healthNote: 'You control sodium, oil and portion size when you cook from raw ingredients.',
    url: null,
  },
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function annualPrice(entry: SavingsCatalogEntry): number | null {
  if (entry.price === null) return null
  if (entry.price === 0) return 0
  const mult = cadenceMultiplier(entry.cadence)
  return mult === null ? null : round2(entry.price * mult)
}

/**
 * Match a subscription against the savings catalog (case-insensitive merchant
 * substring). annualSavings is null-safe: null when either the subscription's
 * annualCost or the alternative's price is unknown. Returned alternatives use
 * id 0 (the caller assigns ids) and subscriptionId = sub.id.
 */
export function findCatalogAlternatives(sub: Subscription): Alternative[] {
  const merchant = sub.merchant.trim().toLowerCase()
  if (!merchant) return []

  const out: Alternative[] = []
  for (const entry of savingsCatalog) {
    if (!entry.matchMerchants.some((token) => merchant.includes(token))) continue
    const altAnnual = annualPrice(entry)
    const annualSavings =
      sub.annualCost === null || altAnnual === null ? null : round2(sub.annualCost - altAnnual)
    out.push({
      id: 0,
      subscriptionId: sub.id,
      merchant: sub.merchant,
      name: entry.name,
      price: entry.price,
      cadence: entry.cadence,
      annualSavings,
      qualityNote: entry.qualityNote,
      healthNote: entry.healthNote,
      url: entry.url,
      source: 'catalog',
      status: 'suggested',
    })
  }
  return out
}
