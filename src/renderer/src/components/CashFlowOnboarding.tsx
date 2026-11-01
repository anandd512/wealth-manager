import { ChevronRight, PenLine, Receipt, Sparkles, Upload } from 'lucide-react'

interface Props {
  onImport: () => void
  onAddManually: () => void
  onTrySample: () => void
  sampleBusy: boolean
}

// Replaces the whole page when there's no cash flow data at all — three clear ways
// to start instead of empty tables, empty charts and an explainer paragraph.
export default function CashFlowOnboarding({ onImport, onAddManually, onTrySample, sampleBusy }: Props): JSX.Element {
  return (
    <div className="setup-checklist">
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Receipt size={36} style={{ color: 'var(--accent)', margin: '0 auto var(--space-3)' }} />
        <h2 style={{ margin: '0 0 var(--space-2)', fontSize: 20 }}>See where your money goes</h2>
        <p className="muted" style={{ margin: 0 }}>
          Track money coming in (salary, interest) and going out (rent, groceries, bills), and see how much you
          keep each month.
        </p>
      </div>
      <div className="setup-checklist-grid">
        <button
          type="button"
          className="setup-checklist-item"
          onClick={onImport}
          style={{ outline: '2px solid var(--accent)', outlineOffset: -2 }}
        >
          <Upload size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>
              Import a bank statement <span className="chip accent" style={{ marginLeft: 'var(--space-1)' }}>Fastest</span>
            </div>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              PDF, CSV or a photo — AI reads every transaction and sorts it for you to review
            </div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
        </button>
        <button type="button" className="setup-checklist-item" onClick={onAddManually}>
          <PenLine size={20} style={{ color: 'var(--green)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>Add a transaction yourself</div>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Good for cash spends, or if you prefer not to upload statements</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
        </button>
        <button type="button" className="setup-checklist-item" onClick={onTrySample} disabled={sampleBusy}>
          <Sparkles size={20} style={{ color: 'var(--amber)' }} />
          <div>
            <div style={{ fontWeight: 600 }}>{sampleBusy ? 'Loading sample data…' : 'Explore with sample data'}</div>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>See how it looks with a few months of made-up transactions — remove it any time</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
        </button>
      </div>
    </div>
  )
}
