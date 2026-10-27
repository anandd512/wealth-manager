// Live currency conversion for statement extractions whose amounts are printed in a
// foreign currency (e.g. a US-listed RSU plan) — we convert using today's rate rather
// than trust a rate the statement itself may have printed as of some earlier date.
// No API key required; a short in-memory cache avoids re-fetching on every extraction
// in the same session (an FX rate moving slightly within a few hours doesn't matter
// here — this is a portfolio-value estimate, not a settlement).

interface CachedRate {
  rate: number
  fetchedAt: number
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const cache = new Map<string, CachedRate>()

async function fetchInrRate(fromCurrency: string): Promise<number> {
  const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`)
  if (!response.ok) throw new Error(`Exchange rate lookup failed (${response.status})`)
  const json = (await response.json()) as { result?: string; rates?: Record<string, number> }
  const rate = json.rates?.INR
  if (json.result !== 'success' || !rate) {
    throw new Error(`No INR exchange rate available for ${fromCurrency}`)
  }
  return rate
}

// Converts `amount` (denominated in `fromCurrency`) to INR using a cached, periodically
// refreshed live rate. A currency already in INR is returned unchanged (rate 1), with
// no network call.
export async function convertToInr(amount: number, fromCurrency: string): Promise<{ value: number; rate: number }> {
  const currency = fromCurrency.trim().toUpperCase()
  if (currency === 'INR') return { value: amount, rate: 1 }

  const cached = cache.get(currency)
  let rate: number
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    rate = cached.rate
  } else {
    rate = await fetchInrRate(currency)
    cache.set(currency, { rate, fetchedAt: Date.now() })
  }
  return { value: amount * rate, rate }
}
