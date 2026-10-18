import { useEffect, useState } from 'react'
import { Plus, Upload, IdCard, RefreshCw } from 'lucide-react'
import type { IdentityDocExtraction, IdentityDocument, IdentityDocType } from '../../../shared/types'
import { DOC_TYPES, DOC_TYPE_LABELS, DOC_TYPE_EXPIRY_LABELS } from '../../../shared/identityDocTypes'
import { getDocTypeIcon } from '../lib/typeIcons'
import { formatDate, daysUntil } from '../lib/format'
import IdentityDocModal from '../components/IdentityDocModal'
import ActionMenu from '../components/ActionMenu'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_EDIT, ICON_DELETE, ICON_SYNC } from '../lib/actionIcons'

export default function IdentityDocuments(): JSX.Element {
  const [docs, setDocs] = useState<IdentityDocument[]>([])
  const [editing, setEditing] = useState<IdentityDocument | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{
    extraction: IdentityDocExtraction
    storedPath: string
    originalName: string
  } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setDocs(await window.api.identityDocs.list())
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (id: number): Promise<void> => {
    if (!confirm('Delete this document?')) return
    await window.api.identityDocs.remove(id)
    load()
  }

  const uploadAndExtract = async (): Promise<void> => {
    setError(null)
    const path = await window.api.identityDocs.pickFile()
    if (!path) return
    setExtracting(true)
    try {
      const result = await window.api.identityDocs.extract(path)
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
      const result = await window.api.identityDocs.reExtract(doc.id)
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
    return <span className="badge ok">{d} days</span>
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
        { key: 'constituency', header: 'Assembly Constituency', render: (d) => d.constituency ?? '—' },
        { key: 'voter_serial_number', header: 'Serial Number', render: (d) => d.voter_serial_number ?? '—' }
      ]
    }
    if (docType === 'rc') {
      return [
        { key: 'vehicle_class', header: 'Vehicle Class', render: (d) => d.vehicle_class ?? '—' },
        { key: 'vehicle_model', header: 'Vehicle Model', render: (d) => d.vehicle_model ?? '—' },
        {
          key: 'insurance_valid_upto',
          header: 'Insurance Valid Upto',
          render: (d) => (d.insurance_valid_upto ? formatDate(d.insurance_valid_upto) : '—')
        }
      ]
    }
    return [
      {
        key: 'dob',
        header: 'DOB',
        render: (d) => (d.date_of_birth ? formatDate(d.date_of_birth) : '—')
      }
    ]
  }

  const grouped = docs.reduce<Record<string, IdentityDocument[]>>((acc, d) => {
    ;(acc[d.doc_type] ??= []).push(d)
    return acc
  }, {})
  const typeOrder: IdentityDocType[] = DOC_TYPES.map((t) => t.value)

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          IDs
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
            <Upload size={14} /> {extracting ? 'Reading document…' : 'Upload ID document'}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Keep Aadhaar, PAN, Passport, and other IDs in one place. Upload a document and the model
        will extract the details for you to review. Files are encrypted on disk with the same key
        as the rest of your data and only decrypted when you view or download them.
      </p>

      {(extracting || syncingId !== null) && (
        <div className="syncing-banner">
          <RefreshCw size={15} className="spin" />
          {syncingId !== null ? 'Re-reading document and updating fields…' : 'Reading document…'}
        </div>
      )}
      {error && <div className="error-text section">{error}</div>}

      {docs.length === 0 ? (
        <div className="card empty-state">
          <IdCard size={30} />
          <div>No ID documents added yet.</div>
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
                          {d.label ?? '—'}
                          {syncingId === d.id && <RefreshCw size={12} className="spin" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                        </td>
                        <td>{d.id_number ?? '—'}</td>
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
                              <span className="muted">No expiry</span>
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
                                      onClick: () => window.api.identityDocs.openDocument(d.document_path!)
                                    },
                                    {
                                      icon: ICON_DOWNLOAD,
                                      label: 'Download',
                                      onClick: () =>
                                        window.api.identityDocs.downloadDocument(
                                          d.document_path!,
                                          d.document_original_name
                                        )
                                    },
                                    {
                                      icon: ICON_SYNC,
                                      label: syncingId === d.id ? 'Syncing…' : 'Sync',
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
                              { icon: ICON_DELETE, label: 'Delete', danger: true, onClick: () => remove(d.id) }
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
