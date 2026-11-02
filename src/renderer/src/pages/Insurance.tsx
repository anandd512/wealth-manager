import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { Plus, Upload, ShieldCheck, RefreshCw, HelpCircle, ChevronDown, PenLine, AlertTriangle, X } from 'lucide-react'
import type { InsurancePolicy, PolicyExtraction } from '../../../shared/types'
import { POLICY_TYPE_LABELS } from '../../../shared/insuranceTypes'
import { getPolicyTypeIcon } from '../lib/typeIcons'
import { formatCurrency, formatDate, daysUntil } from '../lib/format'
import PolicyModal from '../components/PolicyModal'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC } from '../lib/actionIcons'
import { useDecryptedUpload } from '../lib/useDecryptedUpload'
import { useUndoToast } from '../lib/useUndoToast'
import { friendlyError } from '../lib/friendlyError'
import SummaryStrip from '../components/SummaryStrip'

export default function Insurance(): JSX.Element {
  const { ensureDecrypted, modal: passwordModal } = useDecryptedUpload()
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const { offerUndo, undoToast } = useUndoToast()
  const [editing, setEditing] = useState<InsurancePolicy | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{
    extraction: PolicyExtraction
    storedPath: string
    originalName: string
  } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showSecondary, setShowSecondary] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null)

  const load = async (): Promise<void> => {
    setPolicies(await api().insurance.list())
  }

  useEffect(() => {
    load()
  }, [])

  const remove = (id: number, label: string): void => {
    setPendingDelete({ id, label })
  }

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const { id, label } = pendingDelete
    setPendingDelete(null)
    setPolicies((prev) => prev.filter((p) => p.id !== id))
    await api().insurance.remove(id)
    load()
    offerUndo(`"${label}"`, async () => {
      await api().insurance.restore(id)
      load()
    })
  }

  const uploadAndExtract = async (): Promise<void> => {
    setExtractError(null)
    const path = await api().insurance.pickFile()
    if (!path) return
    setExtracting(true)
    try {
      const decryptedPath = await ensureDecrypted(path)
      const result = await api().insurance.extract(decryptedPath)
      setPrefill(result)
      setEditing(null)
      setShowModal(true)
    } catch (e) {
      setExtractError(friendlyError(e))
    } finally {
      setExtracting(false)
    }
  }

  const resync = async (policy: InsurancePolicy): Promise<void> => {
    setExtractError(null)
    setSyncingId(policy.id)
    try {
      const result = await api().insurance.reExtract(policy.id)
      setPrefill(result)
      setEditing(policy)
      setShowModal(true)
    } catch (e) {
      setExtractError(friendlyError(e))
    } finally {
      setSyncingId(null)
    }
  }

  // One status per policy (there used to be two that disagreed: a "Lapsed / Renews in
  // Nd / Active" line under the type on a 90-day rule, and a badge in this column on
  // 15/45-day rules). Only exceptions get a badge — "Active, 120 days" on every row
  // was noise.
  //  - Expired: past the expiry date — the cover itself has ended.
  //  - Renewal overdue: only the renewal date has passed. That alone doesn't mean
  //    lapsed — the premium may well have been paid and the date never updated.
  //  - Due in Nd: within 45 days of the next date (red within 15).
  const statusBadge = (p: InsurancePolicy): JSX.Element | null => {
    const toExpiry = daysUntil(p.expiry_date)
    if (toExpiry !== null && toExpiry < 0) return <span className="badge danger">Expired</span>
    const toRenewal = daysUntil(p.renewal_date)
    if (toRenewal !== null && toRenewal < 0) {
      return (
        <span className="badge warn" title="The renewal date has passed — if you've renewed, edit the policy to update it">
          Renewal overdue
        </span>
      )
    }
    const next = toRenewal ?? toExpiry
    if (next === null) return <span className="badge neutral">No date</span>
    if (next <= 15) return <span className="badge danger">Due in {next}d</span>
    if (next <= 45) return <span className="badge warn">Due in {next}d</span>
    return null
  }

  // Soonest renewal (or expiry) first — the order that matters when scanning the list.
  const nextDate = (p: InsurancePolicy): string => p.renewal_date ?? p.expiry_date ?? '9999-12-31'
  const sortedPolicies = [...policies].sort((a, b) => nextDate(a).localeCompare(nextDate(b)))

  // ── Summary: only policies still in force count toward cover and premium ──
  const inForce = policies.filter((p) => {
    const d = daysUntil(p.expiry_date)
    return d === null || d >= 0
  })
  const coverOf = (types: string[]): number =>
    inForce.filter((p) => types.includes(p.policy_type ?? '')).reduce((s, p) => s + (p.sum_assured ?? 0), 0)
  const lifePolicies = inForce.filter((p) => p.policy_type === 'term_life' || p.policy_type === 'life')
  const noNominee = lifePolicies.filter((p) => !p.nominee_name?.trim()).length
  // Premium per year, so monthly and yearly policies add up like for like. One-time
  // premiums aren't a recurring cost; an unknown frequency isn't guessed at.
  const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1 }
  let yearlyPremium = 0
  let premiumUnknown = 0
  for (const p of inForce) {
    if (p.premium_amount == null || p.premium_frequency === 'single') continue
    const times = p.premium_frequency ? PER_YEAR[p.premium_frequency] : undefined
    if (times === undefined) premiumUnknown++
    else yearlyPremium += p.premium_amount * times
  }
  const upcoming = sortedPolicies.find((p) => {
    const d = daysUntil(p.renewal_date ?? p.expiry_date)
    return d !== null && d >= 0
  })
  const upcomingDays = upcoming ? daysUntil(upcoming.renewal_date ?? upcoming.expiry_date) : null

  // Unknown frequency shows nothing rather than guessing "/yr" — a monthly premium
  // read as yearly understates the real cost twelvefold.
  const frequencyLabel = (freq: string | null): string => {
    if (!freq) return ''
    const map: Record<string, string> = {
      monthly: '/mo',
      quarterly: '/qtr',
      'half-yearly': '/6mo',
      yearly: '/yr',
      single: 'one-time'
    }
    return map[freq] ?? `/${freq}`
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Insurance
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {policies.length > 0 && (
            <button className="btn secondary small" onClick={() => setShowSecondary((s) => !s)}>
              {showSecondary ? 'Fewer details' : 'More details'}
            </button>
          )}
          {/* One Add button with both routes in it, like Cash Flow's. */}
          <ActionMenu
            triggerClassName="btn"
            trigger={
              <>
                <Plus size={14} /> Add <ChevronDown size={13} />
              </>
            }
            items={[
              {
                icon: Upload,
                label: extracting ? 'Reading a document…' : 'From the policy PDF',
                hint: 'AI reads the policy number, cover, premium and dates for you to check',
                onClick: () => {
                  if (!extracting) void uploadAndExtract()
                }
              },
              {
                icon: PenLine,
                label: 'Enter details yourself',
                hint: 'Type them in from the policy document',
                onClick: () => {
                  setEditing(null)
                  setPrefill(null)
                  setShowModal(true)
                }
              }
            ]}
          />
        </div>
      </div>

      {inForce.length > 0 && (
        <SummaryStrip
          stats={[
            {
              label: 'Life cover',
              value: formatCurrency(coverOf(['term_life', 'life'])),
              hint: 'Total sum assured across life and term policies still in force.',
              note:
                noNominee > 0 ? (
                  <span style={{ color: 'var(--amber)' }}>
                    {noNominee} polic{noNominee === 1 ? 'y has' : 'ies have'} no nominee
                  </span>
                ) : lifePolicies.length > 0 ? (
                  'Nominee set on every policy'
                ) : (
                  'No life policy yet'
                )
            },
            {
              label: 'Health cover',
              value: formatCurrency(coverOf(['health'])),
              hint: 'Total sum insured across health policies still in force.'
            },
            {
              label: 'Premiums per year',
              value: formatCurrency(yearlyPremium),
              hint: 'Every premium converted to a yearly amount (monthly × 12, quarterly × 4 …). One-time premiums are left out.',
              note: premiumUnknown > 0 ? `${premiumUnknown} without a payment frequency not included` : undefined
            },
            {
              label: 'Next renewal',
              value: upcomingDays === null ? '—' : upcomingDays === 0 ? 'Today' : `${upcomingDays} days`,
              tone: upcomingDays !== null && upcomingDays <= 15 ? 'warn' : undefined,
              note: upcoming
                ? `${POLICY_TYPE_LABELS[upcoming.policy_type ?? ''] ?? upcoming.policy_type ?? 'Policy'}${upcoming.insurer ? ` · ${upcoming.insurer}` : ''}`
                : undefined
            }
          ]}
        />
      )}

      {extractError && (
        <div className="notice error section" role="alert">
          <AlertTriangle />
          <div className="notice-body">{extractError}</div>
          <button className="icon-btn" onClick={() => setExtractError(null)} title="Dismiss" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* AI reading progress floats over the page instead of pushing it down. */}
      {(extracting || syncingId !== null) && (
        <div className="toast-region" aria-live="polite">
          <div className="toast">
            <RefreshCw className="spin" />
            <div className="toast-body">
              {syncingId !== null ? 'Your AI provider is re-reading the document…' : 'Your AI provider is reading the document…'}
            </div>
          </div>
        </div>
      )}

      {policies.length === 0 ? (
        <div className="card empty-state">
          <ShieldCheck size={30} />
          <div>
            No policies yet. Upload a PDF and AI reads the policy number, cover amount, premium, and dates for you to review — or add one manually.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                {showSecondary && <th>Policy No.</th>}
                <th>Insurer</th>
                <th>Insured</th>
                {showSecondary && <th>Nominee</th>}
                <th className="num">Premium</th>
                {showSecondary && (
                  // The tooltip lives on the <th> — lucide icons don't take a `title`
                  // prop, so the one passed to the icon never showed.
                  <th title="Last day your policy provides cover">
                    Expiry <HelpCircle size={11} style={{ verticalAlign: 'middle' }} aria-hidden />
                  </th>
                )}
                <th title="Your next renewal date (or the expiry date, if no renewal date is set)">
                  Next date <HelpCircle size={11} style={{ verticalAlign: 'middle' }} aria-hidden />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedPolicies.map((p) => {
                const TypeIcon = getPolicyTypeIcon(p.policy_type)
                const status = statusBadge(p)
                return (
                  <tr key={p.id} style={syncingId === p.id ? { opacity: 0.55 } : undefined}>
                    <td>
                      <span className="type-cell">
                        <span className="icon">
                          <TypeIcon />
                        </span>
                        {POLICY_TYPE_LABELS[p.policy_type ?? ''] ?? p.policy_type ?? '—'}
                        {syncingId === p.id && <RefreshCw size={12} className="spin" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                      </span>
                    </td>
                    {showSecondary && <td>{p.policy_number ?? '—'}</td>}
                    <td className="muted">{p.insurer ?? '—'}</td>
                    <td className="muted">
                      {p.insured_name ?? '—'}
                      {p.additional_insured && (
                        <div
                          style={{ fontSize: 11, color: 'var(--text-faint)' }}
                          title={p.additional_insured}
                        >
                          +{p.additional_insured.split(',').filter(Boolean).length} more
                        </div>
                      )}
                      {p.vehicle_number && (
                        <div style={{ fontSize: 12 }}>Vehicle: {p.vehicle_number}</div>
                      )}
                    </td>
                    {showSecondary && (
                      <td className="muted">{p.nominee_name ?? '—'}</td>
                    )}
                    <td className="num">
                      {p.premium_amount != null ? formatCurrency(p.premium_amount) : '—'}
                      {p.premium_amount != null && frequencyLabel(p.premium_frequency) && (
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 3 }}>
                          {frequencyLabel(p.premium_frequency)}
                        </span>
                      )}
                    </td>
                    {showSecondary && (
                      <td className="muted">{formatDate(p.expiry_date)}</td>
                    )}
                    <td>
                      {(p.renewal_date || p.expiry_date) && (
                        <span title={p.renewal_date ? 'Renewal date' : 'Expiry date (no renewal date set)'}>
                          {formatDate(p.renewal_date ?? p.expiry_date)}{' '}
                        </span>
                      )}
                      {status}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionMenu
                        items={[
                          ...(p.document_path
                            ? [
                                {
                                  icon: ICON_VIEW,
                                  label: 'View',
                                  onClick: () => api().insurance.openDocument(p.document_path!)
                                },
                                {
                                  icon: ICON_DOWNLOAD,
                                  label: 'Download',
                                  onClick: () =>
                                    api().insurance.downloadDocument(
                                      p.document_path!,
                                      p.document_original_name
                                    )
                                },
                                {
                                  icon: ICON_SYNC,
                                  label: syncingId === p.id ? 'Updating…' : 'Update from document (AI)',
                                  onClick: () => resync(p)
                                }
                              ]
                            : []),
                          {
                            icon: ICON_EDIT,
                            label: 'Edit',
                            onClick: () => {
                              setEditing(p)
                              setPrefill(null)
                              setShowModal(true)
                            }
                          },
                          { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(p.id, p.policy_number ?? p.insurer ?? 'Policy') }
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PolicyModal
          policy={editing}
          prefill={prefill}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete policy"
        message={`Delete "${pendingDelete?.label}"? You can undo this for a few seconds after.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      {undoToast}
      {passwordModal}
    </div>
  )
}
