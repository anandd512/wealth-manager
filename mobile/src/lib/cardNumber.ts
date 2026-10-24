// Ported verbatim from src/renderer/src/lib/cardNumber.ts — pure presentation
// logic, no platform dependency, so it travels unchanged. Card number display
// helpers: numbers are stored as bare digits; grouping is a presentation concern
// and depends on the card type (Amex prints as 4-6-5, everything else in blocks of 4).

const MAX_DIGITS = 19

export function cardDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(0, MAX_DIGITS)
}

// Identifies the network from the card's leading digits (IIN ranges). Returns
// null until enough digits are typed to be sure, so a lone "5" or "6" doesn't
// guess wrong.
export function detectNetwork(value: string | null | undefined): string | null {
  const d = cardDigits(value)
  if (/^4/.test(d)) return 'Visa'
  if (/^3[47]/.test(d)) return 'Amex'
  if (/^5[1-5]/.test(d)) return 'Mastercard'
  if (d.length >= 4) {
    const first4 = Number(d.slice(0, 4))
    if (first4 >= 2221 && first4 <= 2720) return 'Mastercard'
  }
  if (/^(60|65|81|82|508|353|356)/.test(d)) return 'RuPay'
  return null
}

function isAmex(digits: string, network: string | null | undefined): boolean {
  return network === 'Amex' || /^3[47]/.test(digits)
}

function groupSizes(digits: string, network: string | null | undefined): number[] {
  if (isAmex(digits, network)) return [4, 6, 5]
  return [4, 4, 4, 4, 3]
}

function group(chars: string, sizes: number[]): string {
  const parts: string[] = []
  let i = 0
  for (const size of sizes) {
    if (i >= chars.length) break
    parts.push(chars.slice(i, i + size))
    i += size
  }
  return parts.join(' ')
}

export function maxCardDigits(network: string | null | undefined, digits = ''): number {
  return isAmex(digits, network) ? 15 : MAX_DIGITS
}

export function formatCardNumber(value: string | null | undefined, network: string | null | undefined): string {
  const digits = cardDigits(value)
  return group(digits.slice(0, maxCardDigits(network, digits)), groupSizes(digits, network))
}

// Masks everything except the trailing digits while keeping the same grouping,
// so toggling reveal doesn't shift the layout. Amex keeps its whole final group
// of 5 visible; other cards keep the last 4.
function visibleCount(digits: string, network: string | null | undefined): number {
  return isAmex(digits, network) ? 5 : 4
}

export function cardTail(value: string | null | undefined, network: string | null | undefined): string {
  const digits = cardDigits(value)
  return digits.slice(-visibleCount(digits, network))
}

export function maskCardNumber(value: string | null | undefined, network: string | null | undefined): string {
  const all = cardDigits(value)
  const digits = all.slice(0, maxCardDigits(network, all))
  const visible = visibleCount(digits, network)
  if (digits.length <= visible) return digits
  const masked = '•'.repeat(digits.length - visible) + digits.slice(-visible)
  return group(masked, groupSizes(digits, network))
}
