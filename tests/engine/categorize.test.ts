import { categorizeMerchant } from '../../src/engine'

describe('categorizeMerchant', () => {
  it('maps known merchants deterministically', () => {
    expect(categorizeMerchant('Netflix')).toBe('streaming')
    expect(categorizeMerchant('Spotify')).toBe('streaming')
    expect(categorizeMerchant('OpenAI')).toBe('ai_tools')
    expect(categorizeMerchant('Anthropic')).toBe('ai_tools')
    expect(categorizeMerchant('Hugging Face')).toBe('ai_tools')
    expect(categorizeMerchant('Netlify')).toBe('cloud')
    expect(categorizeMerchant('GitHub')).toBe('software')
    expect(categorizeMerchant('Walmart')).toBe('groceries')
    expect(categorizeMerchant('Costco')).toBe('groceries')
    expect(categorizeMerchant('Instacart')).toBe('groceries')
    expect(categorizeMerchant('DoorDash')).toBe('dining')
    expect(categorizeMerchant('Starbucks')).toBe('dining')
    expect(categorizeMerchant('Lyft')).toBe('transport')
    expect(categorizeMerchant('Amazon')).toBe('shopping')
    expect(categorizeMerchant('Target')).toBe('shopping')
    expect(categorizeMerchant('Best Buy')).toBe('electronics')
    expect(categorizeMerchant('CVS')).toBe('health')
    expect(categorizeMerchant('Walgreens')).toBe('health')
    expect(categorizeMerchant('Tesla')).toBe('auto')
    expect(categorizeMerchant('Home Depot')).toBe('home')
    expect(categorizeMerchant('AT&T')).toBe('telecom')
    expect(categorizeMerchant('T-Mobile')).toBe('telecom')
    expect(categorizeMerchant('Verizon')).toBe('telecom')
    expect(categorizeMerchant('Geico')).toBe('insurance')
    expect(categorizeMerchant('State Farm')).toBe('insurance')
    expect(categorizeMerchant('Planet Fitness')).toBe('fitness')
    expect(categorizeMerchant('SiriusXM')).toBe('entertainment')
    expect(categorizeMerchant('Audible')).toBe('entertainment')
    expect(categorizeMerchant('The New York Times')).toBe('news')
  })

  it('is case-insensitive', () => {
    expect(categorizeMerchant('NETFLIX')).toBe('streaming')
    expect(categorizeMerchant('netflix')).toBe('streaming')
  })

  it('applies specific rules before general prefixes', () => {
    expect(categorizeMerchant('Uber Eats')).toBe('dining')
    expect(categorizeMerchant('Uber')).toBe('transport')
    expect(categorizeMerchant('Apple TV')).toBe('streaming')
    expect(categorizeMerchant('Apple')).toBe('software')
    expect(categorizeMerchant('AppleCare')).toBe('insurance')
  })

  it('falls back to keyword rules for unknown merchants', () => {
    expect(categorizeMerchant('Sunrise Pharmacy')).toBe('health')
    expect(categorizeMerchant("Tony's Pizza")).toBe('dining')
    expect(categorizeMerchant('Central Market')).toBe('groceries')
    expect(categorizeMerchant('Iron Works Gym')).toBe('fitness')
    expect(categorizeMerchant('Lakeside Insurance Group')).toBe('insurance')
    expect(categorizeMerchant('Metro Wireless')).toBe('telecom')
  })

  it('returns other for unrecognized merchants and empty input', () => {
    expect(categorizeMerchant('Acme Widgets')).toBe('other')
    expect(categorizeMerchant('')).toBe('other')
    expect(categorizeMerchant('   ')).toBe('other')
  })
})
