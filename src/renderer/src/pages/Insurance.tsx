import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Upload, ShieldCheck, RefreshCw, HelpCircle } from 'lucide-react'
import type { InsurancePolicy, PolicyExtraction } from '../../../shared/types'
import { POLICY_TYPE_LABELS } from '../../../shared/insuranceTypes'
import { getPolicyTypeIcon } from '../lib/typeIcons'
import { formatCurrency, formatDate, daysUntil } from '../lib/format'
import PolicyModal from '../components/PolicyModal'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC } from '../lib/actionIcons'

export default function Insurance(): JSX.Element {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
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
    const { id } = pendingDelete
    setPendingDelete(null)
    setPolicies((prev) => prev.filter((p) => p.id !== id))
    await api().insurance.remove(id)
    load()
  }

  const uploadAndExtract = async (): Promise<void> => {
    setExtractError(null)
    const path = await api().insurance.pickFile()
    if (!path) return
    setExtracting(true)
    try {
      const result = await api().insurance.extract(path)
      setPrefill(result)
      setEditing(null)
      setShowModal(true)
    } catch (e) {
      setExtractError((e as Error).message)
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
      setExtractError((e as Error).message)
    } finally {
      setSyncingId(null)
    }
  }

  const badgeFor = (date: string | null): JSX.Element => {
    const d = daysUntil(date)
    if (d === null) return <span className="badge neutral">Not set</span>
    if (d < 0) return <span className="badge danger">Expired</span>
    if (d <= 15) return <span className="badge danger">{d} days</span>
    if (d <= 45) return <span className="badge warn">{d} days</span>
    return <span className="badge ok">{d} days</span>
  }

  const getStatus = (policy: InsurancePolicy): { label: string; color: string } | null => {
    if (!policy.renewal_date) return null
    const days = Math.floor((new Date(policy.renewal_date).getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: 'Lapsed', color: 'var(--red)' }
    if (days <= 90) return { label: `Renews in ${days}d`, color: '#e8b14f' }
    return { label: 'Active', color: 'var(--green)' }
  }

  const frequencyLabel = (freq: string | null): string => {
    if (!freq) return '/yr' // TODO: add premium_frequency to policy if missing
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
            <button
              className="btn secondary"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setShowSecondary((s) => !s)}
            >
              {showSecondary ? 'Fewer columns' : 'More columns'}
            </button>
          )}
          <button
            className="btn secondary"
            onClick={() => {
              setEditing(null)
              setPrefill(null)
              setShowModal(true)
            }}
          >
            <Plus size={14} /> Add manually
          </button>
          <button
            className="btn"
            onClick={uploadAndExtract}
            disabled={extracting}
            title="Upload a PDF and AI fills the details automatically. Your chosen AI provider reads the document, and the details are saved privately on your device."
          >
            <Upload size={14} /> {extracting ? 'Reading document…' : 'Add via PDF (AI)'}
          </button>
        </div>
      </div>

      {(extracting || syncingId !== null) && (
        <div className="syncing-banner">
          <RefreshCw size={15} className="spin" />
          {syncingId !== null ? 'Your AI provider is re-reading the document…' : 'Your AI provider is reading the document…'}
        </div>
      )}
      {extractError && <div className="error-text section">{extractError}</div>}

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
                <th>Premium</th>
                {showSecondary && (
                  <th title="Last day your policy provides cover">
                    Expiry{' '}
                    <HelpCircle
                      size={11}
                      style={{ verticalAlign: 'middle' }}
                      title="Last day your policy provides cover"
                    />
                  </th>
                )}
                <th title="Date your premium is due for renewal">
                  Renewal{' '}
                  <HelpCircle
                    size={11}
                    style={{ verticalAlign: 'middle' }}
                    title="Date your premium is due for renewal"
                  />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const TypeIcon = getPolicyTypeIcon(p.policy_type)
                const status = getStatus(p)
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
                      {status && (
                        <div style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>
                          {status.label}
                        </div>
                      )}
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
                    <td>
                      {p.premium_amount != null ? formatCurrency(p.premium_amount) : '—'}
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 3 }}>
                        {frequencyLabel(p.premium_frequency)}
                      </span>
                    </td>
                    {showSecondary && (
                      <td className="muted">{formatDate(p.expiry_date)}</td>
                    )}
                    <td>
                      {p.renewal_date ? (
                        <>
                          {formatDate(p.renewal_date)} {badgeFor(p.renewal_date)}
                        </>
                      ) : (
                        badgeFor(p.expiry_date)
                      )}
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
        message={`Delete "${pendingDelete?.label}"? This can't be undone.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
