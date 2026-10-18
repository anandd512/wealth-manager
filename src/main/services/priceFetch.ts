import type { PriceQuote } from '../../shared/types'
import { getAccount, setAccountValue } from './accounts'

// Uses Yahoo Finance's public quote endpoint. No API key / account linking required —
// this only reads public market data for a ticker you already told the app you hold.
// Works for most global tickers (AAPL, MSFT) and NSE/BSE tickers with the .NS / .BO suffix
// (e.g. RELIANCE.NS, TCS.BO). Mutual fund ISINs / schemes generally are not covered by
// this free endpoint, so those stay manual. The same endpoint also serves currency
// pairs (e.g. "USDINR=X"), which is how non-INR holdings (US RSUs, foreign stocks) get
// converted to rupees at sync time, since every account's value is stored in INR.

async function fetchRaw(ticker: string): Promise<{ price: number | null; currency: string | null; error: string | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Artha local app)' }
    })
    if (!res.ok) {
      return { price: null, currency: null, error: `HTTP ${res.status}` }
    }
    const json = (await res.json()) as any
    const result = json?.chart?.result?.[0]
    const meta = result?.meta
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      return { price: null, currency: null, error: 'No price data found for ticker' }
    }
    return { price: meta.regularMarketPrice, currency: meta.currency ?? null, error: null }
  } catch (err) {
    return { price: null, currency: null, error: (err as Error).message }
  }
}

export async function fetchQuote(ticker: string): Promise<PriceQuote> {
  const raw = await fetchRaw(ticker)
  return {
    ticker,
    price: raw.price,
    currency: raw.currency,
    asOf: raw.price !== null ? new Date().toISOString() : null,
    error: raw.error,
    fxRate: null,
    convertedValueInr: null
  }
}

async function fetchInrRate(currency: string): Promise<number | null> {
  if (currency === 'INR') return 1
  const raw = await fetchRaw(`${currency}INR=X`)
  return raw.price
}

export async function refreshAccountPrice(accountId: number): Promise<PriceQuote> {
  const account = getAccount(accountId)
  if (!account) throw new Error('Account not found')
  if (!account.ticker) {
    return {
      ticker: '',
      price: null,
      currency: null,
      asOf: null,
      error: 'No ticker set on this account',
      fxRate: null,
      convertedValueInr: null
    }
  }
  const quote = await fetchQuote(account.ticker)
  if (quote.price === null || account.quantity === null) return quote

  const currency = quote.currency ?? 'INR'
  const fxRate = await fetchInrRate(currency)
  if (fxRate === null) {
    return {
      ...quote,
      error: `Got the price but could not fetch the ${currency}→INR exchange rate. Try again shortly.`
    }
  }

  const convertedValueInr = quote.price * fxRate * account.quantity
  setAccountValue(accountId, convertedValueInr, 'price_sync', {
    last_price: quote.price,
    ticker: account.ticker
  })

  return { ...quote, fxRate, convertedValueInr }
}
