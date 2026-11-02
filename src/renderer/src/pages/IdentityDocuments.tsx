import { api } from '../lib/api'
import { useEffect, useRef, useState } from 'react'
import { Plus, Upload, IdCard, RefreshCw, Copy, Check, Eye, EyeOff, Search, ChevronDown, AlertTriangle, X } from 'lucide-react'
import type { IdentityDocExtraction, IdentityDocument, IdentityDocType } from '../../../shared/types'
import { DOC_TYPES, DOC_TYPE_LABELS, DOC_TYPE_EXPIRY_LABELS } from '../../../shared/identityDocTypes'
import { getDocTypeIcon } from '../lib/typeIcons'
import { formatDateShort, daysUntil } from '../lib/format'
import IdentityDocModal from '../components/IdentityDocModal'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC } from '../lib/actionIcons'
import { useDecryptedUpload } from '../lib/useDecryptedUpload'
import { useUndoToast } from '../lib/useUndoToast'
import { friendlyError } from '../lib/friendlyError'
import Tip from '../components/Tip'

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

// Stored documents are encrypted (and usually a relative path), so the image is
// fetched decrypted from the main process as a data: URL — a file:// src pointing at
// the stored file never rendered. Renders nothing until (and unless) it loads.
function DocThumbnail({ storedPath, onOpen }: { storedPath: string; onOpen: (src: string) => void }): JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api()
      .identityDocs.preview(storedPath)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [storedPath])
  if (!src) return null
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      title="View full size"
      aria-label="View document image full size"
      style={{ padding: 0, border: 'none', background: 'none', flexShrink: 0, lineHeight: 0 }}
    >
      <img
        src={src}
        alt=""
        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }}
      />
    </button>
  )
}

export default function IdentityDocuments(): JSX.Element {
  const { ensureDecrypted, modal: passwordModal } = useDecryptedUpload()
  const [docs, setDocs] = useState<IdentityDocument[]>([])
  const { offerUndo, undoToast } = useUndoToast()
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
  // IDs whose full number is showing (the old `maskedIds` actually held the revealed ones).
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())
  const revealTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = revealTimers.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])
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
    const { id, label } = pendingDelete
    setPendingDelete(null)
    setDocs((prev) => prev.filter((d) => d.id !== id))
    await api().identityDocs.remove(id)
    load()
    offerUndo(`"${label}"`, async () => {
      await api().identityDocs.restore(id)
      load()
    })
  }

  // Every ID number is masked to its last 4 characters until revealed (only Aadhaar
  // was before — PAN and passport numbers sat in plain view), and a reveal hides
  // itself again after 15s, the same as card numbers and Vault passwords.
  const displayIdNumber = (d: IdentityDocument): string => {
    if (!d.id_number) return '—'
    if (revealedIds.has(d.id)) return d.id_number
    const compact = d.id_number.replace(/\s/g, '')
    return compact.length <= 4 ? compact : `${'•'.repeat(Math.min(8, compact.length - 4))} ${compact.slice(-4)}`
  }

  const toggleReveal = (id: number): void => {
    const existing = revealTimers.current.get(id)
    if (existing) clearTimeout(existing)
    revealTimers.current.delete(id)
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        revealTimers.current.set(
          id,
          setTimeout(() => {
            revealTimers.current.delete(id)
            setRevealedIds((p) => {
              const n = new Set(p)
              n.delete(id)
              return n
            })
          }, 15_000)
        )
      }
      return next
    })
  }

  const copyIdNumber = async (doc: IdentityDocument): Promise<void> => {
    if (!doc.id_number) return
    // Same treatment as card numbers and passwords: cleared after 30s if unchanged.
    await api().clipboard.writeSecret(doc.id_number, 30_000)
    setCopiedIdNum(doc.id)
    setTimeout(() => setCopiedIdNum((id) => (id === doc.id ? null : id)), 1500)
  }

  const uploadAndExtract = async (): Promise<void> => {
    setError(null)
    const path = await api().identityDocs.pickFile()
    if (!path) return
    setExtracting(true)
    try {
      const decryptedPath = await ensureDecrypted(path)
      const result = await api().identityDocs.extract(decryptedPath)
      setPrefill(result)
      setEditing(null)
      setShowModal(true)
    } catch (e) {
      setError(friendlyError(e))
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
      setError(friendlyError(e))
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
    // Item 31 — surface documents expiring within 90 days (standard warn badge;
    // this used to be a fourth, inline-styled badge variant)
    if (d <= 90) return <span className="badge warn">Expires in {d}d</span>
    return null
  }

  // The details that matter for each type, as short labelled phrases for the row's
  // second line. (These used to be type-specific table columns, which is why every
  // type needed its own table.) Empty fields are left out rather than shown as "—".
  const typeDetails = (d: IdentityDocument): string[] => {
    const parts: (string | null)[] =
      d.doc_type === 'driving_license'
        ? [d.vehicle_class && `Class ${d.vehicle_class}`]
        : d.doc_type === 'voter_id'
          ? [d.constituency, d.voter_serial_number && `Serial ${d.voter_serial_number}`]
          : d.doc_type === 'rc'
            ? [
                d.vehicle_model,
                d.vehicle_class && `Class ${d.vehicle_class}`,
                d.insurance_valid_upto && `Insurance to ${formatDateShort(d.insurance_valid_upto)}`
              ]
            : [d.date_of_birth && `Born ${formatDateShort(d.date_of_birth)}`]
    return parts.filter((p): p is string => Boolean(p))
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

  // One list, ordered by document type (Aadhaar, PAN, passport …) then label — most
  // people have 5–8 documents, which used to be spread over as many tiny tables.
  const typeOrder: IdentityDocType[] = DOC_TYPES.map((t) => t.value)
  const sortedDocs = [...filteredDocs].sort(
    (a, b) =>
      typeOrder.indexOf(a.doc_type) - typeOrder.indexOf(b.doc_type) || (a.label ?? '').localeCompare(b.label ?? '')
  )

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          ID documents
        </h1>
        {/* One Add button (scan with AI, or pick the type to type it in) — replaces
            two header buttons plus a row of six "+ Aadhaar"-style pills. */}
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
              label: extracting ? 'Reading a document…' : 'Scan a photo or PDF',
              hint: 'AI reads the number, name and expiry for you to check',
              onClick: () => {
                if (!extracting) void uploadAndExtract()
              }
            },
            ...([
              { type: 'aadhaar', label: 'Aadhaar' },
              { type: 'pan', label: 'PAN card' },
              { type: 'passport', label: 'Passport' },
              { type: 'driving_license', label: 'Driving licence' },
              { type: 'voter_id', label: 'Voter ID' },
              { type: 'other', label: 'Other document' }
            ] as { type: IdentityDocType; label: string }[]).map(({ type, label }) => ({
              icon: getDocTypeIcon(type),
              label: `Type in a ${label}`,
              onClick: () => {
                setEditing(null)
                setPrefill(null)
                setQuickAddType(type)
                setShowModal(true)
              }
            }))
          ]}
        />
      </div>

      <Tip storageKey="artha_tip_ids">
        Keep Aadhaar, PAN, passport and other IDs in one place. Files are encrypted on this device and only decrypted
        when you open them.
      </Tip>

      {docs.length > 0 && (
        <div className="cf-search" style={{ marginBottom: 'var(--space-4)', maxWidth: 280 }}>
          <Search aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" aria-label="Search documents" />
        </div>
      )}

      {error && (
        <div className="notice error section" role="alert">
          <AlertTriangle />
          <div className="notice-body">{error}</div>
          <button className="icon-btn" onClick={() => setError(null)} title="Dismiss" aria-label="Dismiss">
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
        <div className="card cf-list">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>ID number</th>
                <th>Expires</th>
                <th style={{ width: 44 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDocs.map((d) => {
                const TypeIcon = getDocTypeIcon(d.doc_type)
                const typeLabel = DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type
                const meta = [d.label ? typeLabel : null, d.full_name, ...typeDetails(d)].filter(Boolean)
                return (
                      <tr key={d.id} style={syncingId === d.id ? { opacity: 0.55 } : undefined}>
                        <td className="cf-row-main">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            {/* Item 32 — image thumbnail, clickable to open lightbox */}
                            {d.document_path && /\.(png|jpe?g|gif|webp|bmp)$/i.test(d.document_original_name ?? d.document_path) ? (
                              <DocThumbnail storedPath={d.document_path} onOpen={setLightboxSrc} />
                            ) : (
                              <span className="type-cell">
                                <span className="icon">
                                  <TypeIcon />
                                </span>
                              </span>
                            )}
                            <span style={{ minWidth: 0 }}>
                              <span className="cf-row-title" style={{ display: 'block' }}>
                                {d.label || typeLabel}
                                {syncingId === d.id && <RefreshCw size={12} className="spin" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                              </span>
                              {meta.length > 0 && <span className="cf-row-meta" style={{ display: 'block' }}>{meta.join(' · ')}</span>}
                            </span>
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{displayIdNumber(d)}</span>
                          {d.id_number && (
                            <button
                              className="icon-btn"
                              style={{ marginLeft: 4 }}
                              title={revealedIds.has(d.id) ? 'Hide number' : 'Show full number'}
                              aria-label={revealedIds.has(d.id) ? 'Hide number' : 'Show full number'}
                              onClick={() => toggleReveal(d.id)}
                            >
                              {revealedIds.has(d.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                          {d.id_number && (
                            <button
                              className="icon-btn"
                              style={{ marginLeft: 6 }}
                              title={copiedIdNum === d.id ? 'Copied!' : 'Copy ID number'}
                              aria-label="Copy ID number"
                              onClick={() => copyIdNumber(d)}
                            >
                              {copiedIdNum === d.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {d.expiry_date ? (
                            <span title={DOC_TYPE_EXPIRY_LABELS[d.doc_type] ?? 'Expiry date'}>
                              {formatDateShort(d.expiry_date)} {badgeFor(d.expiry_date)}
                            </span>
                          ) : (
                            <span className="muted">{DOC_TYPE_EXPIRY_LABELS[d.doc_type] ? 'Not set' : "Doesn't expire"}</span>
                          )}
                        </td>
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
                )
              })}
            </tbody>
          </table>
        </div>
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
        message={`Delete "${pendingDelete?.label}"? You can undo this for a few seconds after.`}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />

      {undoToast}
      {passwordModal}
    </div>
  )
}
