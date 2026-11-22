import { useEffect, useState } from 'react'
import { MonitorSmartphone, Check, X, ShieldAlert } from 'lucide-react'
import type { PendingDevice } from '../../../shared/types'

const POLL_MS = 4000

/** Existing-device side of "approve from another device". Polls while visible; the
 * code shown is computed on THIS device from the requester's public key, so it only
 * matches the new device's screen if nobody swapped the key in transit. */
export default function DeviceApprovals(): JSX.Element {
  const [devices, setDevices] = useState<PendingDevice[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvedName, setApprovedName] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const result = await window.api.cloud.pendingDevices()
      if (!alive) return
      if (result.ok) setDevices(result.devices)
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const answer = async (device: PendingDevice, approve: boolean): Promise<void> => {
    setError(null)
    setBusyId(device.id)
    const result = approve
      ? await window.api.cloud.approveDevice(device.id, device.publicKey)
      : await window.api.cloud.denyDevice(device.id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDevices((list) => list.filter((d) => d.id !== device.id))
    if (approve) setApprovedName(device.deviceName)
  }

  return (
    <div className="card section">
      <div className="section-header">
        <h2>
          <MonitorSmartphone size={14} /> Approve a new device
        </h2>
      </div>
      {devices.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          To add your phone or another computer, sign in to Artha on it and choose "Approve from another device".
          The request appears here.
          {approvedName && <span className="success-text" style={{ display: 'block', marginTop: 8 }}>Approved {approvedName}.</span>}
        </p>
      ) : (
        <>
          <div className="approve-warning">
            <ShieldAlert size={14} />
            Only approve a device you're setting up right now, and only if its code matches exactly. Approving gives it
            full access to your data.
          </div>
          {devices.map((d) => (
            <div key={d.id} className="approve-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.deviceName}</div>
                <div className="help-text" style={{ margin: 0 }}>
                  Requested {new Date(d.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <div className="approve-code">{d.code}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" onClick={() => answer(d, true)} disabled={busyId !== null}>
                  <Check size={14} /> Approve
                </button>
                <button className="btn secondary" onClick={() => answer(d, false)} disabled={busyId !== null}>
                  <X size={14} /> Deny
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}
