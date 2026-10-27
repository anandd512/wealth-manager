import { api } from '../lib/api'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { CashFlowImport, CashFlowTrackedAccount } from '../../../shared/types'
import { formatDateShort } from '../lib/format'
import { friendlyError } from '../lib/friendlyError'
import { useFocusTrap } from '../lib/useFocusTrap'
import { ICON_VIEW, ICON_DOWNLOAD, ICON_DELETE } from '../lib/actionIcons'
import ActionMenu from './ActionMenu'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  trackedAccounts: CashFlowTrackedAccount[]
  onClose: () => void
  onChanged: () => void
}

// The list of every statement ever imported (one row per upload), so "I imported the
// wrong file" or "let me get rid of that old statement" doesn't require hunting down
// an individual transaction from it first — deleting here removes the import record
// and every transaction it added in one action (cashFlow.ts's deleteImport).
export default function CashFlowImportsModal({ trackedAccounts, onClose, onChanged }: Props): JSX.Element {
  const [imports, setImports] = useState<CashFlowImport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CashFlowImport | null>(null)
  const [busy, setBusy] = useState(false)
  const containerRef = useFocusTrap(true)

  const load = (): void => {
    api()
      .cashFlow.listImports()
      .then(setImports)
      .catch((e) => setError(friendlyError(e)))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !pendingDelete) onClose()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [pendingDelete, onClose])

  const accountName = (syncId: string): string =>
    trackedAccounts.find((a) => a.sync_id === syncId)?.name ?? '(account closed)'

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await api().cashFlow.deleteImport(pendingDelete.id)
      setPendingDelete(null)
      load()
      onChanged()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" ref={containerRef} style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Uploaded statements</h2>
            <button type="button" className="icon-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="error-text" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}

          {imports === null ? (
            <div className="muted" style={{ marginTop: 16 }}>
              Loading…
            </div>
          ) : imports.length === 0 ? (
            <div className="help-text" style={{ marginTop: 16 }}>
              No statements uploaded yet — use "Import bank statement" to add one.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Statement</th>
                    <th>Account</th>
                    <th>Period</th>
                    <th>Transactions</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id}>
                      <td>{imp.document_original_name ?? 'Statement'}</td>
                      <td>{accountName(imp.account_sync_id)}</td>
                      <td className="muted">
                        {imp.statement_period_start && imp.statement_period_end
                          ? `${formatDateShort(imp.statement_period_start)} – ${formatDateShort(imp.statement_period_end)}`
                          : '—'}
                      </td>
                      <td>{imp.transaction_count}</td>
                      <td className="muted">{formatDateShort(imp.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <ActionMenu
                          items={[
                            ...(imp.document_path
                              ? [
                                  {
                                    icon: ICON_VIEW,
                                    label: 'View statement',
                                    onClick: () => api().cashFlow.openDocument(imp.document_path!)
                                  },
                                  {
                                    icon: ICON_DOWNLOAD,
                                    label: 'Download statement',
                                    onClick: () =>
                                      api().cashFlow.downloadDocument(imp.document_path!, imp.document_original_name)
                                  }
                                ]
                              : []),
                            {
                              icon: ICON_DELETE,
                              label: 'Delete import…',
                              danger: true,
                              onClick: () => setPendingDelete(imp)
                            }
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this statement"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.document_original_name ?? 'this statement'}" and all ${pendingDelete.transaction_count} transaction${pendingDelete.transaction_count === 1 ? '' : 's'} it added? This can't be undone.`
            : ''
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete all'}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
