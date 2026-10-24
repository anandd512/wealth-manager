import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Upload, IdCard, RefreshCw, Copy, Check, Eye, EyeOff, Search } from 'lucide-react'
import type { IdentityDocExtraction, IdentityDocument, IdentityDocType } from '../../../shared/types'
import { DOC_TYPES, DOC_TYPE_LABELS, DOC_TYPE_EXPIRY_LABELS } from '../../../shared/identityDocTypes'
import { getDocTypeIcon } from '../lib/typeIcons'
import { formatDate, daysUntil } from '../lib/format'
import IdentityDocModal from '../components/IdentityDocModal'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC } from '../lib/actionIcons'

// Item 32 — inline lightbox for document images
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <img
        src={src}
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: 18 }}
      >
        ×
      </button>
    </div>
  )
}

export default function IdentityDocuments(): JSX.Element {
  const [docs, setDocs] = useState<IdentityDocument[]>([])
  const [editing, setEditing] = useState<IdentityDocument | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{
    extraction: IdentityDocExtraction
    storedPath: string
    originalName: string
  } | null>(null)
  // Item 29 — pre-selected doc type when opening add modal from a type pill
  const [quickAddType, setQuickAddType] = useState<IdentityDocType | undefined>(undefined)
  const [extracting, setExtracting] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdNum, setCopiedIdNum] = useState<number | null>(null)
  const [maskedIds, setMaskedIds] = useState<Set<number>>(new Set())
  // Item 30 — search
  const [search, setSearch] = useState('')
  // Item 32 — lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null)

  const load = async (): Promise<void> => {
    setDocs(await api().identityDocs.list())
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
    setDocs((prev) => prev.filter((d) => d.id !== id))
    await api().identityDocs.remove(id)
    load()
  }

  const displayIdNumber = (d: IdentityDocument): string => {
    if (!d.id_number) return '—'
    if (d.doc_type === 'aadhaar' && !maskedIds.has(d.id)) {
      const digits = d.id_number.replace(/\s/g, '')
      return `XXXX XXXX ${digits.slice(-4)}`
    }
    return d.id_number
  }

  const copyIdNumber = async (doc: IdentityDocument): Promise<void> => {
    if (!doc.id_number) return
    await navigator.clipboard.writeText(doc.id_number)
    setCopiedIdNum(doc.id)
    setTimeout(() => setCopiedIdNum((id) => (id === doc.id ? null : id)), 1500)
  }

  const uploadAndExtract = async (): Promise<void> => {
    setError(null)
    const path = await api().identityDocs.pickFile()
    if (!path) return
    setExtracting(true)
    try {
      const result = await api().identityDocs.extract(path)
      setPrefill(result)
      setEditing(null)
      setShowModal(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const resync = async (doc: IdentityDocument): Promise<void> => {
    setError(null)
    setSyncingId(doc.id)
    try {
      const result = await api().identityDocs.reExtract(doc.id)
      setPrefill(result)
      setEditing(doc)
      setShowModal(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncingId(null)
    }
  }

  const badgeFor = (expiry: string | null): JSX.Element | null => {
    const d = daysUntil(expiry)
    if (d === null) return null
    if (d < 0) return <span className="badge danger">Expired</span>
    if (d <= 15) return <span className="badge danger">{d} days</span>
    if (d <= 45) return <span className="badge warn">{d} days</span>
    // Item 31 — surface documents expiring within 90 days with an amber badge
    if (d <= 90) return <span className="badge" style={{ background: 'rgba(232,177,79,0.15)', color: 'var(--amber, #e8b14f)', border: '1px solid var(--amber, #e8b14f)' }}>Expiring in {d}d</span>
    return null
  }

  // The generic "DOB" column isn't useful for document types where something more
  // specific to that type is available instead — each type gets its own set of
  // middle columns rather than one column meant to fit every type.
  const getMiddleColumns = (
    docType: IdentityDocType
  ): { key: string; header: string; render: (d: IdentityDocument) => JSX.Element | string }[] => {
    if (docType === 'driving_license') {
      return [{ key: 'vehicle_class', header: 'Vehicle Class', render: (d) => d.vehicle_class ?? '—' }]
    }
    if (docType === 'voter_id') {
      return [
        { key: 'constituency', header: 'Constituency', render: (d) => d.constituency ?? '—' },
        { key: 'voter_serial_number', header: 'Serial Number', render: (d) => d.voter_serial_number ?? '—' }
      ]
    }
    if (docType === 'rc') {
      return [
        { key: 'vehicle_class', header: 'Vehicle Class', render: (d) => d.vehicle_class ?? '—' },
        { key: 'vehicle_model', header: 'Vehicle Model', render: (d) => d.vehicle_model ?? '—' },
        {
          key: 'insurance_valid_upto',
          header: 'Insurance expires',
          render: (d) => (d.insurance_valid_upto ? formatDate(d.insurance_valid_upto) : '—')
        }
      ]
    }
    return [
      {
        key: 'dob',
        header: 'Date of birth',
        render: (d) => (d.date_of_birth ? formatDate(d.date_of_birth) : '—')
      }
    ]
  }

  // Item 30 — filter documents by search query
  const searchQuery = search.trim().toLowerCase()
  const filteredDocs = searchQuery
    ? docs.filter(
        (d) =>
          (d.label ?? '').toLowerCase().includes(searchQuery) ||
          (d.id_number ?? '').toLowerCase().includes(searchQuery) ||
          d.doc_type.toLowerCase().includes(searchQuery) ||
          (DOC_TYPE_LABELS[d.doc_type] ?? '').toLowerCase().includes(searchQuery) ||
          (d.full_name ?? '').toLowerCase().includes(searchQuery)
      )
    : docs

  const grouped = filteredDocs.reduce<Record<string, IdentityDocument[]>>((acc, d) => {
    ;(acc[d.doc_type] ??= []).push(d)
    return acc
  }, {})
  const typeOrder: IdentityDocType[] = DOC_TYPES.map((t) => t.value)

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Identity
        </h1>
        <div>
          {/* Item 29 — primary "Add document" button */}
          <button
            className="btn secondary"
            style={{ marginRight: 8 }}
            onClick={() => {
              setEditing(null)
              setPrefill(null)
              setQuickAddType(undefined)
              setShowModal(true)
            }}
          >
            <Plus size={14} /> Add document
          </button>
          {/* Item 33 — tooltip updated to match tour description */}
          <button
            className="btn"
            onClick={uploadAndExtract}
            disabled={extracting}
            title="Upload a photo or scan — AI reads the document number, name and expiry automatically. Your chosen AI provider reads the document, and the details are saved privately on your device."
          >
            <Upload size={14} /> {extracting ? 'Reading document…' : 'Add via photo/scan (AI)'}
          </button>
        </div>
      </div>

      {/* Item 29 — quick-add type pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: 4 }}>
        {([
          { type: 'aadhaar', label: 'Aadhaar' },
          { type: 'pan', label: 'PAN' },
          { type: 'passport', label: 'Passport' },
          { type: 'driving_license', label: 'Driving Licence' },
          { type: 'voter_id', label: 'Voter ID' },
          { type: 'other', label: 'Other' }
        ] as { type: IdentityDocType; label: string }[]).map(({ type, label }) => (
          <button
            key={type}
            className="btn secondary"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => {
              setEditing(null)
              setPrefill(null)
              setQuickAddType(type)
              setShowModal(true)
            }}
          >
            + {label}
          </button>
        ))}
      </div>

      {/* Item 30 — search bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            style={{ paddingLeft: 30, width: 220 }}
          />
        </div>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Keep Aadhaar, PAN, Passport, and other IDs in one place. Upload a photo or scan and AI reads the number, name, and expiry automatically, then fills in the details for you to review. Files are encrypted on disk with the same key as the rest of your data and only decrypted when you view or download them.
      </p>

      {(extracting || syncingId !== null) && (
        <div className="syncing-banner">
          <RefreshCw size={15} className="spin" />
          {syncingId !== null ? 'Your AI provider is re-reading the document…' : 'Your AI provider is reading the document…'}
        </div>
      )}
      {error && <div className="error-text section">{error}</div>}

      {docs.length === 0 ? (
        <div className="card empty-state">
          <IdCard size={30} />
          <div>Your IDs, all in one secure place. Add your first one to get started.</div>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="card empty-state">
          <Search size={24} />
          <div>No documents match "{search}".</div>
        </div>
      ) : (
        typeOrder.map((docType) => {
          const rows = grouped[docType]
          if (!rows || rows.length === 0) return null
          const TypeIcon = getDocTypeIcon(docType)
          const expiryLabel = DOC_TYPE_EXPIRY_LABELS[docType]
          const middleColumns = getMiddleColumns(docType)
          return (
            <div key={docType} className="section">
              <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ margin: 0 }}>
                    <TypeIcon size={13} /> {DOC_TYPE_LABELS[docType] ?? docType}
                  </h2>
                  <span className="section-count-badge">{rows.length}</span>
                </div>
              </div>
              <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>ID number</th>
                      <th>Name</th>
                      {middleColumns.map((c) => (
                        <th key={c.key}>{c.header}</th>
                      ))}
                      {expiryLabel && <th>{expiryLabel}</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} style={syncingId === d.id ? { opacity: 0.55 } : undefined}>
                        <td className="muted">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Item 32 — image thumbnail, clickable to open lightbox */}
                            {d.document_path && /\.(png|jpe?g|gif|webp|bmp)$/i.test(d.document_original_name ?? d.document_path) && (
                              <img
                                src={`file://${d.document_path}`}
                                alt="Document thumbnail"
                                title="Click to view full size"
                                style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                                onClick={() => setLightboxSrc(`file://${d.document_path}`)}
                              />
                            )}
                            <span>
                              {d.label ?? '—'}
                              {syncingId === d.id && <RefreshCw size={12} className="spin" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                            </span>
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {displayIdNumber(d)}
                          {d.doc_type === 'aadhaar' && d.id_number && (
                            <button
                              className="icon-btn"
                              style={{ marginLeft: 4 }}
                              title={maskedIds.has(d.id) ? 'Hide full number' : 'Reveal full number'}
                              onClick={() => setMaskedIds(prev => {
                                const next = new Set(prev)
                                if (next.has(d.id)) next.delete(d.id)
                                else next.add(d.id)
                                return next
                              })}
                            >
                              {maskedIds.has(d.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                          {d.id_number && (
                            <button
                              className="icon-btn"
                              style={{ marginLeft: 6 }}
                              title={copiedIdNum === d.id ? 'Copied!' : 'Copy ID number'}
                              onClick={() => copyIdNumber(d)}
                            >
                              {copiedIdNum === d.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </td>
                        <td className="muted">{d.full_name ?? '—'}</td>
                        {middleColumns.map((c) => (
                          <td key={c.key} className="muted">
                            {c.render(d)}
                          </td>
                        ))}
                        {expiryLabel && (
                          <td>
                            {d.expiry_date ? (
                              <>
                                {formatDate(d.expiry_date)} {badgeFor(d.expiry_date)}
                              </>
                            ) : (
                              <span className="badge" style={{ background: 'var(--bg-inset)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>No expiry</span>
                            )}
                          </td>
                        )}
                        <td style={{ textAlign: 'right' }}>
                          <ActionMenu
                            items={[
                              ...(d.document_path
                                ? [
                                    {
                                      icon: ICON_VIEW,
                                      label: 'View',
                                      onClick: () => api().identityDocs.openDocument(d.document_path!)
                                    },
                                    {
                                      icon: ICON_DOWNLOAD,
                                      label: 'Download',
                                      onClick: () =>
                                        api().identityDocs.downloadDocument(
                                          d.document_path!,
                                          d.document_original_name
                                        )
                                    },
                                    {
                                      icon: ICON_SYNC,
                                      label: syncingId === d.id ? 'Updating…' : 'Update from document (AI)',
                                      onClick: () => resync(d)
                                    }
                                  ]
                                : []),
                              {
                                icon: ICON_EDIT,
                                label: 'Edit',
                                onClick: () => {
                                  setEditing(d)
                                  setPrefill(null)
                                  setShowModal(true)
                                }
                              },
                              { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(d.id, d.label ?? DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type) }
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {showModal && (
        <IdentityDocModal
          doc={editing}
          prefill={prefill}
          initialDocType={quickAddType}
          onClose={() => { setShowModal(false); setQuickAddType(undefined) }}
          onSaved={() => {
            setShowModal(false)
            setQuickAddType(undefined)
            load()
          }}
        />
      )}

      {/* Item 32 — image lightbox */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document"
        message={`Delete "${pendingDelete?.label}"? This can't be undone.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
