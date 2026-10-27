import { extractStructured } from './extraction'
import { convertToInr } from './exchangeRate'
import type { RsuStatementExtraction } from '../../shared/types'

// Reads an RSU/stock-plan statement (e.g. Morgan Stanley StockConnect) and reports the
// numbers an RSU account needs: vested portfolio value + cash balance (converted to
// INR) and vested/unvested share counts. RSU plans for India-based employees of US
// companies are almost always denominated in USD — rather than trust a currency-
// converted figure the statement itself may print (computed from a rate as of some
// earlier date), we have the model report the native-currency amounts and convert
// them ourselves with a live rate (see exchangeRate.ts), so the value reflects
// today's rate regardless of when the statement was generated. Only vested shares
// count toward net worth — unvested is reported separately and never included in
// total_value, since it isn't actually the holder's yet.

const INSTRUCTIONS =
  'This is an RSU / stock plan account statement (e.g. from Morgan Stanley or a similar stock plan ' +
  "administrator). From the Summary of Stock/Shares Holdings table (or equivalent), find: vested_value_native " +
  "— the total current value of VESTED shares only, in whichever currency is actually printed (do NOT use a " +
  'value the statement has already converted to another currency via its own printed exchange rate — we ' +
  'convert separately, ourselves, using a current rate) — vested_shares and unvested_shares as separate share ' +
  'counts (if the statement only shows one combined total with no vested/unvested split, put the whole count ' +
  'in vested_shares and use 0 for unvested_shares) — cash_balance_native: any "cash awaiting investment" or ' +
  'uninvested cash balance shown on the plan (0 if none) — currency: the ISO code all of the above are ' +
  "denominated in (e.g. 'USD', 'INR') — if amounts are prefixed with '$' or 'USD' it is USD; only use 'INR' " +
  "if amounts are explicitly in Rs/INR/₹. Also report the statement's period end / as-of date (YYYY-MM-DD). " +
  'If a field is not present in the document, use null rather than guessing (except unvested_shares/' +
  'cash_balance_native, which should be 0 rather than null when the statement simply has none).'

const EXTRACTION_PROPERTIES = {
  vested_value_native: {
    type: ['number', 'null'],
    description: "Vested shares' total value in the statement's own native/printed currency, per the instructions"
  },
  currency: {
    type: ['string', 'null'],
    description: "ISO code of the currency the amounts are denominated in, e.g. 'USD'"
  },
  vested_shares: { type: ['number', 'null'], description: 'Vested share count' },
  unvested_shares: { type: ['number', 'null'], description: 'Unvested share count, 0 if none' },
  cash_balance_native: { type: ['number', 'null'], description: "Plan's own cash balance, 0 if none" },
  as_of_date: { type: ['string', 'null'], description: "Statement's period end / as-of date, YYYY-MM-DD" },
  confidence_notes: {
    type: ['string', 'null'],
    description: 'Brief note on any fields you were unsure about or could not find'
  }
}

const EXTRACTION_FIELD_NAMES = Object.keys(EXTRACTION_PROPERTIES)

interface ModelExtraction {
  vested_value_native: number | null
  currency: string | null
  vested_shares: number | null
  unvested_shares: number | null
  cash_balance_native: number | null
  as_of_date: string | null
  confidence_notes: string | null
}

export async function extractRsuStatement(filePath: string): Promise<RsuStatementExtraction> {
  const modelExtraction = await extractStructured<ModelExtraction>({
    filePath,
    instructions: INSTRUCTIONS,
    schemaName: 'extract_rsu_statement',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: EXTRACTION_FIELD_NAMES
  })

  let total_value: number | null = null
  let exchange_rate_used: number | null = null
  let confidence_notes = modelExtraction.confidence_notes
  const nativeTotal = (modelExtraction.vested_value_native ?? 0) + (modelExtraction.cash_balance_native ?? 0)
  if (modelExtraction.vested_value_native != null && modelExtraction.currency) {
    try {
      const { value, rate } = await convertToInr(nativeTotal, modelExtraction.currency)
      total_value = Math.round(value * 100) / 100
      exchange_rate_used = rate
    } catch (err) {
      const note = `Could not fetch a live exchange rate (${(err as Error).message}) — value left blank, enter it manually.`
      confidence_notes = confidence_notes ? `${confidence_notes} ${note}` : note
    }
  }

  return {
    total_value,
    total_value_native: modelExtraction.vested_value_native,
    currency: modelExtraction.currency,
    exchange_rate_used,
    vested_shares: modelExtraction.vested_shares,
    unvested_shares: modelExtraction.unvested_shares,
    cash_balance_native: modelExtraction.cash_balance_native,
    as_of_date: modelExtraction.as_of_date,
    confidence_notes
  }
}
