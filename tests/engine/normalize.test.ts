import { normalizeMerchant, parseAmount } from '../../src/engine'

describe('normalizeMerchant', () => {
  it('maps common sender addresses to canonical merchants', () => {
    expect(normalizeMerchant('help@walmart.com')).toBe('Walmart')
    expect(normalizeMerchant('order-update@amazon.com')).toBe('Amazon')
    expect(normalizeMerchant('no_reply@email.apple.com')).toBe('Apple')
    expect(normalizeMerchant('billing@netflix.com')).toBe('Netflix')
    expect(normalizeMerchant('noreply@huggingface.co')).toBe('Hugging Face')
    expect(normalizeMerchant('receipts@openai.com')).toBe('OpenAI')
    expect(normalizeMerchant('billing@anthropic.com')).toBe('Anthropic')
    expect(normalizeMerchant('team@netlify.com')).toBe('Netlify')
    expect(normalizeMerchant('noreply@github.com')).toBe('GitHub')
    expect(normalizeMerchant('membership@costco.com')).toBe('Costco')
    expect(normalizeMerchant('orders@target.com')).toBe('Target')
    expect(normalizeMerchant('extracare@cvs.com')).toBe('CVS')
    expect(normalizeMerchant('rx@walgreens.com')).toBe('Walgreens')
    expect(normalizeMerchant('policy@geico.com')).toBe('Geico')
    expect(normalizeMerchant('agent@statefarm.com')).toBe('State Farm')
    expect(normalizeMerchant('shopper@instacart.com')).toBe('Instacart')
    expect(normalizeMerchant('billing@att.com')).toBe('AT&T')
    expect(normalizeMerchant('bill@t-mobile.com')).toBe('T-Mobile')
    expect(normalizeMerchant('myverizon@verizon.com')).toBe('Verizon')
    expect(normalizeMerchant('service@tesla.com')).toBe('Tesla')
  })

  it('supports "Display Name <address>" senders', () => {
    expect(normalizeMerchant('T-Mobile <bill-pay@e.t-mobile-mail.com>')).toBe('T-Mobile')
    expect(normalizeMerchant('AT&T <no-reply@notices.example-mail.net>')).toBe('AT&T')
    expect(normalizeMerchant('DoorDash <orders@doordash.com>')).toBe('DoorDash')
  })

  it('prefers specific vendors over their prefixes', () => {
    expect(normalizeMerchant('receipts@ubereats.com')).toBe('Uber Eats')
    expect(normalizeMerchant('receipts@uber.com')).toBe('Uber')
  })

  it('does not match vendor tokens inside larger words', () => {
    // "chase" must not match "purchase"
    expect(normalizeMerchant('purchase-confirm@zocdoc.com')).toBe('Zocdoc')
  })

  it('handles Stripe receipt senders', () => {
    expect(normalizeMerchant('invoice+statements@stripe.com')).toBe('Stripe merchant')
    expect(normalizeMerchant('receipts+huggingface@stripe.com')).toBe('Hugging Face')
    expect(normalizeMerchant('invoice+acme@stripe.com')).toBe('Acme')
    expect(normalizeMerchant('Acme Co <invoice+statements@stripe.com>')).toBe('Acme Co')
    expect(normalizeMerchant('Stripe <receipts@stripe.com>')).toBe('Stripe merchant')
  })

  it('falls back to title-casing the email domain', () => {
    expect(normalizeMerchant('billing@zocdoc.com')).toBe('Zocdoc')
    expect(normalizeMerchant('hello@sweetgreen.co.uk')).toBe('Sweetgreen')
  })

  it('handles bare names and domains', () => {
    expect(normalizeMerchant('WALMART.COM')).toBe('Walmart')
    expect(normalizeMerchant("joe's coffee shop")).toBe("Joe's Coffee Shop")
    expect(normalizeMerchant('zocdoc.com')).toBe('Zocdoc')
  })

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeMerchant('')).toBe('')
    expect(normalizeMerchant('   ')).toBe('')
  })
})

describe('parseAmount', () => {
  it('parses plain dollar amounts', () => {
    expect(parseAmount('$99.00')).toBe(99)
    expect(parseAmount('Your receipt: $12.34')).toBe(12.34)
    expect(parseAmount('$1,234.56 charged to your card')).toBe(1234.56)
  })

  it('parses USD-prefixed and USD-suffixed amounts', () => {
    expect(parseAmount('USD 12.34')).toBe(12.34)
    expect(parseAmount('You paid 45.67 USD today')).toBe(45.67)
  })

  it('prefers labeled totals over other amounts', () => {
    expect(parseAmount('Shipping $5.99, item $24.00, Total: $29.99')).toBe(29.99)
    expect(parseAmount('Total: $1,234.56 (was $1,500.00)')).toBe(1234.56)
  })

  it('prefers charged/amount labels over larger unlabeled numbers', () => {
    expect(parseAmount('Amount charged: $49.99 (limit $500.00)')).toBe(49.99)
  })

  it('handles amounts without cents', () => {
    expect(parseAmount('You were charged $99 for FSD')).toBe(99)
  })

  it('returns null when no amount is present', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('no numbers here')).toBeNull()
    expect(parseAmount('Order #12345 has shipped')).toBeNull()
  })

  it('parses zero amounts', () => {
    expect(parseAmount('Total: $0.00')).toBe(0)
  })
})
