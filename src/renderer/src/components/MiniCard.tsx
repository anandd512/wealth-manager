import type { CreditCard } from '../../../shared/types'
import { cardTail } from '../lib/cardNumber'

// A scaled-down rendering of the physical card: issuer up top, chip, the
// visible tail of the number, and the network mark in the corner.

const NETWORK_CLASS: Record<string, string> = {
  Visa: 'visa',
  Mastercard: 'mastercard',
  RuPay: 'rupay',
  Amex: 'amex'
}

function NetworkMark({ network }: { network: string | null }): JSX.Element | null {
  if (!network || network === 'Other') return null
  if (network === 'Mastercard') {
    return (
      <svg className="mini-card-mc" viewBox="0 0 30 18" aria-label="Mastercard">
        <circle cx="10" cy="9" r="8" fill="#eb001b" />
        <circle cx="20" cy="9" r="8" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
    )
  }
  if (network === 'Visa') return <span className="mini-card-visa">VISA</span>
  if (network === 'Amex') return <span className="mini-card-amex">AMEX</span>
  if (network === 'RuPay') return <span className="mini-card-rupay">RuPay</span>
  return <span className="mini-card-net">{network}</span>
}

export default function MiniCard({ card }: { card: CreditCard }): JSX.Element {
  const tail = cardTail(card.card_number, card.network)
  const variant = NETWORK_CLASS[card.network ?? ''] ?? 'other'
  const expiry =
    card.expiry_month && card.expiry_year
      ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year % 100).padStart(2, '0')}`
      : null
  return (
    <div
      className={`mini-card mini-card--${variant}${card.status === 'disabled' ? ' mini-card--disabled' : ''}`}
      aria-hidden="true"
    >
      <div className="mini-card-issuer">{card.issuer || card.nickname}</div>
      <div className="mini-card-chip" />
      <div className="mini-card-bottom">
        <div className="mini-card-details">
          <span className="mini-card-number">{tail ? `•••• ${tail}` : ''}</span>
          {expiry && (
            <span className="mini-card-expiry">
              <span className="mini-card-expiry-label">VALID THRU</span> {expiry}
            </span>
          )}
        </div>
        <NetworkMark network={card.network} />
      </div>
    </div>
  )
}
