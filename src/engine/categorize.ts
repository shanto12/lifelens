// Deterministic merchant -> spend-category mapping.
// Pure functions — no I/O, no React.

import type { SpendCategory } from '../lib/types'

interface MerchantRule {
  /**
   * Lowercase token. Tokens containing a space or hyphen match as a substring;
   * single-word tokens match whole "words" only (split on non-alphanumerics,
   * keeping & and +).
   */
  token: string
  category: SpendCategory
}

// Ordered: specific rules ("uber eats", "apple tv") before general prefixes.
const MERCHANT_RULES: MerchantRule[] = [
  // dining / delivery
  { token: 'uber eats', category: 'dining' },
  { token: 'ubereats', category: 'dining' },
  { token: 'doordash', category: 'dining' },
  { token: 'grubhub', category: 'dining' },
  { token: 'starbucks', category: 'dining' },
  { token: 'chipotle', category: 'dining' },
  { token: 'mcdonald', category: 'dining' },
  // streaming
  { token: 'apple tv', category: 'streaming' },
  { token: 'apple music', category: 'streaming' },
  { token: 'netflix', category: 'streaming' },
  { token: 'spotify', category: 'streaming' },
  { token: 'youtube', category: 'streaming' },
  { token: 'hulu', category: 'streaming' },
  { token: 'disney', category: 'streaming' },
  { token: 'hbo', category: 'streaming' },
  { token: 'peacock', category: 'streaming' },
  { token: 'paramount', category: 'streaming' },
  // ai tools
  { token: 'openai', category: 'ai_tools' },
  { token: 'chatgpt', category: 'ai_tools' },
  { token: 'anthropic', category: 'ai_tools' },
  { token: 'claude', category: 'ai_tools' },
  { token: 'hugging face', category: 'ai_tools' },
  { token: 'huggingface', category: 'ai_tools' },
  { token: 'midjourney', category: 'ai_tools' },
  { token: 'perplexity', category: 'ai_tools' },
  // cloud
  { token: 'google one', category: 'cloud' },
  { token: 'netlify', category: 'cloud' },
  { token: 'vercel', category: 'cloud' },
  { token: 'aws', category: 'cloud' },
  { token: 'icloud', category: 'cloud' },
  { token: 'dropbox', category: 'cloud' },
  { token: 'digitalocean', category: 'cloud' },
  // insurance (before "apple")
  { token: 'applecare', category: 'insurance' },
  { token: 'geico', category: 'insurance' },
  { token: 'state farm', category: 'insurance' },
  { token: 'statefarm', category: 'insurance' },
  { token: 'progressive', category: 'insurance' },
  { token: 'allstate', category: 'insurance' },
  { token: 'lemonade', category: 'insurance' },
  // software
  { token: 'github', category: 'software' },
  { token: 'adobe', category: 'software' },
  { token: 'notion', category: 'software' },
  { token: 'figma', category: 'software' },
  { token: '1password', category: 'software' },
  { token: 'microsoft', category: 'software' },
  { token: 'apple', category: 'software' },
  // groceries
  { token: 'whole foods', category: 'groceries' },
  { token: 'trader joe', category: 'groceries' },
  { token: 'walmart', category: 'groceries' },
  { token: 'costco', category: 'groceries' },
  { token: 'instacart', category: 'groceries' },
  { token: 'kroger', category: 'groceries' },
  { token: 'aldi', category: 'groceries' },
  { token: 'safeway', category: 'groceries' },
  // transport
  { token: 'uber', category: 'transport' },
  { token: 'lyft', category: 'transport' },
  { token: 'amtrak', category: 'transport' },
  { token: 'delta', category: 'transport' },
  { token: 'southwest', category: 'transport' },
  { token: 'shell', category: 'transport' },
  { token: 'chevron', category: 'transport' },
  { token: 'exxon', category: 'transport' },
  // shopping
  { token: 'amazon', category: 'shopping' },
  { token: 'target', category: 'shopping' },
  { token: 'ebay', category: 'shopping' },
  { token: 'etsy', category: 'shopping' },
  { token: 'nordstrom', category: 'shopping' },
  // electronics
  { token: 'best buy', category: 'electronics' },
  { token: 'bestbuy', category: 'electronics' },
  { token: 'newegg', category: 'electronics' },
  // health
  { token: 'rite aid', category: 'health' },
  { token: 'vitamin shoppe', category: 'health' },
  { token: 'cvs', category: 'health' },
  { token: 'walgreens', category: 'health' },
  { token: 'gnc', category: 'health' },
  // auto
  { token: 'jiffy lube', category: 'auto' },
  { token: 'tesla', category: 'auto' },
  { token: 'autozone', category: 'auto' },
  { token: 'carmax', category: 'auto' },
  // home
  { token: 'home depot', category: 'home' },
  { token: 'homedepot', category: 'home' },
  { token: 'lowes', category: 'home' },
  { token: 'ikea', category: 'home' },
  { token: 'wayfair', category: 'home' },
  // telecom
  { token: 'at&t', category: 'telecom' },
  { token: 'att', category: 'telecom' },
  { token: 't-mobile', category: 'telecom' },
  { token: 'tmobile', category: 'telecom' },
  { token: 'verizon', category: 'telecom' },
  { token: 'xfinity', category: 'telecom' },
  { token: 'comcast', category: 'telecom' },
  { token: 'mint mobile', category: 'telecom' },
  // fitness
  { token: 'planet fitness', category: 'fitness' },
  { token: 'planetfitness', category: 'fitness' },
  { token: 'la fitness', category: 'fitness' },
  { token: 'equinox', category: 'fitness' },
  { token: 'peloton', category: 'fitness' },
  { token: 'crossfit', category: 'fitness' },
  { token: 'strava', category: 'fitness' },
  // entertainment
  { token: 'siriusxm', category: 'entertainment' },
  { token: 'audible', category: 'entertainment' },
  { token: 'ticketmaster', category: 'entertainment' },
  { token: 'nintendo', category: 'entertainment' },
  { token: 'playstation', category: 'entertainment' },
  { token: 'steam', category: 'entertainment' },
  // news
  { token: 'new york times', category: 'news' },
  { token: 'nytimes', category: 'news' },
  { token: 'nyt', category: 'news' },
  { token: 'washington post', category: 'news' },
  { token: 'wsj', category: 'news' },
  { token: 'economist', category: 'news' },
  { token: 'substack', category: 'news' },
]

// Keyword fallback for merchants not in the table. Tested against the
// lowercase merchant name in order; first hit wins.
const KEYWORD_RULES: { pattern: RegExp; category: SpendCategory }[] = [
  { pattern: /pharmac|clinic|dental|vitamin|supplement|wellness/, category: 'health' },
  { pattern: /grocer|market|foods|produce/, category: 'groceries' },
  { pattern: /coffee|cafe|restaurant|grill|kitchen|pizza|taco|sushi|burger|bbq|deli|bakery|diner/, category: 'dining' },
  { pattern: /gym\b|fitness|yoga|pilates/, category: 'fitness' },
  { pattern: /insurance|assurance/, category: 'insurance' },
  { pattern: /wireless|mobile|telecom|broadband|cellular/, category: 'telecom' },
  { pattern: /hosting|cloud/, category: 'cloud' },
  { pattern: /\bai\b/, category: 'ai_tools' },
  { pattern: /motors?\b|automotive|tires?\b|auto\b/, category: 'auto' },
  { pattern: /news|times\b|journal|tribune|gazette/, category: 'news' },
  { pattern: /stream|\btv\b/, category: 'streaming' },
  { pattern: /airline|airways|hotel|transit|taxi|parking|rail\b/, category: 'transport' },
  { pattern: /software|saas|\bapp\b/, category: 'software' },
  { pattern: /cinema|theater|theatre|arcade|games?\b/, category: 'entertainment' },
  { pattern: /furnitur|hardware|garden|decor/, category: 'home' },
]

/** Deterministic merchant -> SpendCategory mapping with a keyword fallback ('other'). */
export function categorizeMerchant(merchant: string): SpendCategory {
  const lower = merchant.trim().toLowerCase()
  if (!lower) return 'other'
  const words = lower.split(/[^a-z0-9&+]+/).filter(Boolean)
  for (const rule of MERCHANT_RULES) {
    const multi = rule.token.includes(' ') || rule.token.includes('-')
    if (multi ? lower.includes(rule.token) : words.includes(rule.token)) return rule.category
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(lower)) return rule.category
  }
  return 'other'
}
