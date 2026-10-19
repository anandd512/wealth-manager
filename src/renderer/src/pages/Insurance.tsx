import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Upload, ShieldCheck, RefreshCw } from 'lucide-react'
import type { InsurancePolicy, PolicyExtraction } from '../../../shared/types'
import { POLICY_TYPE_LABELS } from '../../../shared/insuranceTypes'
import { getPolicyTypeIcon } from '../lib/typeIcons'
import { formatCurrency, formatDate, daysUntil } from '../lib/format'
import PolicyModal from '../components/PolicyModal'
import ActionMenu from '../components/ActionMenu'
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
  const [undoPending, setUndoPending] = useState<{ id: number; label: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (): Promise<void> => {
    setPolicies(await api().insurance.list())
  }

  useEffect(() => {
    load()
  }, [])

  const remove = (id: number, label: string): void => {
    setPolicies((prev) => prev.filter((p) => p.id !== id))
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending({ id, label })
    undoTimerRef.current = setTimeout(async () => {
      setUndoPending(null)
      await api().insurance.remove(id)
      load()
    }, 5000)
  }

  const undoDelete = (): void => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoPending(null)
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
    if (d === null) return <span className="badge neutral">No date</span>
    if (d < 0) return <span className="badge danger">Expired</span>
    if (d <= 15) return <span className="badge danger">{d} days</span>
    if (d <= 45) return <span className="badge warn">{d} days</span>
    return <span className="badge ok">{d} days</span>
  }

  return (
    <div>
      {undoPending && (
        <div className="undo-toast">
          <span>"{undoPending.label}" deleted</span>
          <button className="btn secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Insurance
        </h1>
        <div>
          <button
            className="btn secondary"
            style={{ marginRight: 8 }}
            onClick={() => {
              setEditing(null)
              setPrefill(null)
              setShowModal(true)
            }}
          >
            <Plus size={14} /> Add manually
          </button>
          <button className="btn" onClick={uploadAndExtract} disabled={extracting}>
            <Upload size={14} /> {extracting ? 'Reading document…' : 'Upload policy document'}
          </button>
        </div>
      </div>

      {(extracting || syncingId !== null) && (
        <div className="syncing-banner">
          <RefreshCw size={15} className="spin" />
          {syncingId !== null ? 'Re-reading document and updating fields…' : 'Reading document…'}
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
                <th>Policy number</th>
                <th>Insurer</th>
                <th>Insured</th>
                <th>Nominee</th>
                <th>Premium</th>
                <th>Expiry</th>
                <th>Renewal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const TypeIcon = getPolicyTypeIcon(p.policy_type)
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
                    <td>{p.policy_number ?? '—'}</td>
                    <td className="muted">{p.insurer ?? '—'}</td>
                    <td className="muted">
                      {p.insured_name ?? '—'}
                      {p.vehicle_number && (
                        <div style={{ fontSize: 12 }}>Vehicle: {p.vehicle_number}</div>
                      )}
                    </td>
                    <td className="muted">
                      {p.nominee_name ?? '—'}
                    </td>
                    <td>
                      {p.premium_amount != null ? formatCurrency(p.premium_amount) : '—'}
                      {p.premium_frequency ? <span className="muted"> /{p.premium_frequency}</span> : ''}
                    </td>
                    <td className="muted">{formatDate(p.expiry_date)}</td>
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
                                  label: syncingId === p.id ? 'Syncing…' : 'Sync',
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
    </div>
  )
}
