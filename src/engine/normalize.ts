// Merchant-name and amount normalization.
// Pure string functions — no I/O, no React, no Date.now().

interface VendorRule {
  /**
   * Lowercase match tokens. Tokens containing a space or hyphen match as a
   * substring; single-word tokens match whole "words" only (split on
   * non-alphanumerics, keeping & and +), so "chase" never matches "purchase".
   */
  tokens: string[]
  canonical: string
}

// Ordered: more specific rules (e.g. "uber eats", "applecare") come before
// their more general prefixes ("uber", "apple").
const VENDORS: VendorRule[] = [
  { tokens: ['walmart'], canonical: 'Walmart' },
  { tokens: ['amazon', 'amzn'], canonical: 'Amazon' },
  { tokens: ['uber eats', 'ubereats'], canonical: 'Uber Eats' },
  { tokens: ['uber'], canonical: 'Uber' },
  { tokens: ['applecare'], canonical: 'AppleCare' },
  { tokens: ['apple', 'itunes', 'icloud'], canonical: 'Apple' },
  { tokens: ['tesla'], canonical: 'Tesla' },
  { tokens: ['netflix'], canonical: 'Netflix' },
  { tokens: ['spotify'], canonical: 'Spotify' },
  { tokens: ['youtube'], canonical: 'YouTube' },
  { tokens: ['google one'], canonical: 'Google One' },
  { tokens: ['google'], canonical: 'Google' },
  { tokens: ['lyft'], canonical: 'Lyft' },
  { tokens: ['doordash'], canonical: 'DoorDash' },
  { tokens: ['grubhub'], canonical: 'Grubhub' },
  { tokens: ['instacart'], canonical: 'Instacart' },
  { tokens: ['at&t', 'att'], canonical: 'AT&T' },
  { tokens: ['t-mobile', 'tmobile'], canonical: 'T-Mobile' },
  { tokens: ['verizon'], canonical: 'Verizon' },
  { tokens: ['xfinity', 'comcast'], canonical: 'Xfinity' },
  { tokens: ['chase'], canonical: 'Chase' },
  { tokens: ['american express', 'americanexpress', 'amex', 'aexp'], canonical: 'American Express' },
  { tokens: ['hugging face', 'huggingface'], canonical: 'Hugging Face' },
  { tokens: ['openai', 'chatgpt'], canonical: 'OpenAI' },
  { tokens: ['anthropic', 'claude'], canonical: 'Anthropic' },
  { tokens: ['netlify'], canonical: 'Netlify' },
  { tokens: ['github'], canonical: 'GitHub' },
  { tokens: ['microsoft'], canonical: 'Microsoft' },
  { tokens: ['costco'], canonical: 'Costco' },
  { tokens: ['target'], canonical: 'Target' },
  { tokens: ['cvs'], canonical: 'CVS' },
  { tokens: ['walgreens', 'walgreen'], canonical: 'Walgreens' },
  { tokens: ['geico'], canonical: 'Geico' },
  { tokens: ['state farm', 'statefarm'], canonical: 'State Farm' },
  { tokens: ['progressive'], canonical: 'Progressive' },
  { tokens: ['siriusxm', 'sirius xm'], canonical: 'SiriusXM' },
  { tokens: ['audible'], canonical: 'Audible' },
  { tokens: ['starbucks'], canonical: 'Starbucks' },
  { tokens: ['chipotle'], canonical: 'Chipotle' },
  { tokens: ['home depot', 'homedepot'], canonical: 'Home Depot' },
  { tokens: ['best buy', 'bestbuy'], canonical: 'Best Buy' },
  { tokens: ['planet fitness', 'planetfitness'], canonical: 'Planet Fitness' },
  { tokens: ['hellofresh', 'hello fresh'], canonical: 'HelloFresh' },
  { tokens: ['paypal'], canonical: 'PayPal' },
  { tokens: ['venmo'], canonical: 'Venmo' },
  { tokens: ['new york times', 'nytimes', 'nyt'], canonical: 'The New York Times' },
]

/** Local-part tokens that carry no merchant information. */
const GENERIC_LOCAL = new Set([
  'invoice', 'invoices', 'statements', 'statement', 'receipt', 'receipts',
  'billing', 'payments', 'payment', 'noreply', 'no', 'not', 'do', 'donot',
  'reply', 'notify', 'notification', 'notifications', 'support', 'info',
  'hello', 'help', 'admin', 'mail', 'email', 'contact', 'stripe', 'auto',
  'service', 'team', 'order', 'orders', 'update', 'updates', 'account',
  'alert', 'alerts', 'customer', 'care',
])

/** Second-level labels that indicate a country-style registry (amazon.co.uk). */
const GENERIC_SLD = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu'])

function matchVendor(text: string): string | null {
  const lower = text.toLowerCase()
  const words = lower.split(/[^a-z0-9&+]+/).filter(Boolean)
  for (const vendor of VENDORS) {
    for (const token of vendor.tokens) {
      if (token.includes(' ') || token.includes('-')) {
        if (lower.includes(token)) return vendor.canonical
      } else if (words.includes(token)) {
        return vendor.canonical
      }
    }
  }
  return null
}

function titleWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s\-./&(])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

/** "mail.walmart.com" -> "walmart"; "amazon.co.uk" -> "amazon"; "huggingface.co" -> "huggingface". */
function domainCore(domain: string): string {
  const labels = domain.split('.').filter(Boolean)
  if (labels.length === 0) return domain
  if (labels.length === 1) return labels[0]
  let core = labels[labels.length - 2]
  if (GENERIC_SLD.has(core) && labels.length >= 3) core = labels[labels.length - 3]
  return core
}

/** If the raw text is a bare domain ("walmart.com"), reduce it to its core label. */
function stripBareDomain(text: string): string {
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) return domainCore(text.toLowerCase())
  return text
}

function stripeMerchant(display: string | null, localPart: string | null): string {
  // Stripe receipt senders sometimes carry the underlying merchant either in
  // the display name ("Acme Co <invoice+statements@stripe.com>") or as a
  // plus-token in the local part ("receipts+acme@stripe.com").
  if (display && !display.toLowerCase().includes('stripe')) {
    return matchVendor(display) ?? titleWords(display)
  }
  if (localPart) {
    const parts = localPart
      .split(/[+._-]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !GENERIC_LOCAL.has(p))
    if (parts.length > 0) {
      const candidate = parts.join(' ')
      return matchVendor(candidate) ?? titleWords(candidate)
    }
  }
  return 'Stripe merchant'
}

/**
 * Map a sender name / email address to a canonical merchant name.
 * Examples: "help@walmart.com" -> "Walmart", "order-update@amazon.com" -> "Amazon",
 * "invoice+statements@stripe.com" -> "Stripe merchant".
 * Fallback: strip the email domain and title-case it.
 */
export function normalizeMerchant(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  // "Display Name <addr@domain>" support.
  let display: string | null = null
  let address = trimmed
  const angled = /^(.*?)<([^<>]+)>/.exec(trimmed)
  if (angled) {
    display = angled[1].replace(/["']/g, '').trim() || null
    address = angled[2].trim()
  }

  const at = address.lastIndexOf('@')
  const domain = at >= 0 ? address.slice(at + 1).toLowerCase().trim() : null
  const localPart = at >= 0 ? address.slice(0, at).toLowerCase() : null

  if (domain !== null && (domain === 'stripe.com' || domain.endsWith('.stripe.com'))) {
    return stripeMerchant(display, localPart)
  }

  if (display) {
    const v = matchVendor(display)
    if (v) return v
  }
  if (domain) {
    const v = matchVendor(domain)
    if (v) return v
  }
  const v = matchVendor(trimmed)
  if (v) return v

  if (display) return titleWords(display)
  if (domain) return titleWords(domainCore(domain))
  return titleWords(stripBareDomain(trimmed))
}

/**
 * Extract the most plausible USD charge amount from an email subject/snippet.
 * Prefers amounts labeled total/charged/amount; returns null when no amount
 * is present. Handles "$99.00", "USD 12.34", "12.34 USD", "Total: $1,234.56".
 */
export function parseAmount(text: string): number | null {
  if (!text) return null
  const re = /(?:\$|\busd\b)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*\.[0-9]{2})\s*(?=\busd\b)/gi
  const candidates: { value: number; priority: number }[] = []
  let prevEnd = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const numText = m[1] ?? m[2]
    if (!numText) continue
    const value = Number.parseFloat(numText.replace(/,/g, ''))
    if (!Number.isFinite(value) || value < 0) continue
    // Label window: text since the previous match (capped at 28 chars back),
    // so one match's label never bleeds into the next candidate.
    const windowStart = Math.max(prevEnd, m.index - 28)
    const before = text.slice(windowStart, m.index).toLowerCase()
    prevEnd = m.index + m[0].length
    let priority = 1
    if (/(charge|amount|bill|payment|paid|due|debit)/.test(before)) priority = 2
    if (/total/.test(before)) priority = 3
    candidates.push({ value, priority })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.priority - a.priority || b.value - a.value)
  return candidates[0].value
}
