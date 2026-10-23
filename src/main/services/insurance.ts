import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { todayLocalDateString, daysUntilLocalDate } from '../dateUtils'
import type { InsurancePolicy, InsurancePolicyInput } from '../../shared/types'

export function listPolicies(): InsurancePolicy[] {
  return getDb()
    .prepare(
      `SELECT * FROM insurance_policies WHERE deleted = 0
       ORDER BY COALESCE(renewal_date, expiry_date) IS NULL, COALESCE(renewal_date, expiry_date) ASC`
    )
    .all() as InsurancePolicy[]
}

export function getPolicy(id: number): InsurancePolicy | undefined {
  return getDb().prepare('SELECT * FROM insurance_policies WHERE id = ?').get(id) as
    | InsurancePolicy
    | undefined
}

export function createPolicy(input: InsurancePolicyInput): InsurancePolicy {
  const now = new Date().toISOString()
  const info = getDb()
    .prepare(
      `INSERT INTO insurance_policies
        (policy_number, policy_type, insurer, insured_name, additional_insured, nominee_name, vehicle_number, sum_assured,
         premium_amount, premium_frequency, start_date, expiry_date, renewal_date, riders,
         document_path, document_original_name, notes, created_at, sync_id, updated_at)
       VALUES (@policy_number, @policy_type, @insurer, @insured_name, @additional_insured, @nominee_name, @vehicle_number, @sum_assured,
               @premium_amount, @premium_frequency, @start_date, @expiry_date, @renewal_date, @riders,
               @document_path, @document_original_name, @notes, @created_at, @sync_id, @updated_at)`
    )
    .run({ ...input, created_at: now, sync_id: randomUUID(), updated_at: now })
  return getPolicy(Number(info.lastInsertRowid))!
}

export function updatePolicy(id: number, input: Partial<InsurancePolicyInput>): InsurancePolicy {
  const existing = getPolicy(id)
  if (!existing) throw new Error('Policy not found')
  const merged = { ...existing, ...input, updated_at: new Date().toISOString() }
  getDb()
    .prepare(
      `UPDATE insurance_policies SET
        policy_number=@policy_number, policy_type=@policy_type, insurer=@insurer,
        insured_name=@insured_name, additional_insured=@additional_insured, nominee_name=@nominee_name, vehicle_number=@vehicle_number,
        sum_assured=@sum_assured, premium_amount=@premium_amount, premium_frequency=@premium_frequency,
        start_date=@start_date, expiry_date=@expiry_date, renewal_date=@renewal_date, riders=@riders,
        document_path=@document_path, document_original_name=@document_original_name, notes=@notes,
        updated_at=@updated_at
       WHERE id=@id`
    )
    .run({ ...merged, id })
  return getPolicy(id)!
}

// Soft delete — see src/main/services/accounts.ts's deleteAccount for why.
export function deletePolicy(id: number): void {
  getDb()
    .prepare('UPDATE insurance_policies SET deleted = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function markReminderSent(id: number): void {
  getDb()
    .prepare('UPDATE insurance_policies SET last_reminder_sent = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function getPoliciesNeedingReminder(daysBefore: number): InsurancePolicy[] {
  const all = listPolicies()
  const todayStr = todayLocalDateString()
  return all.filter((p) => {
    // The renewal date (when you need to act) drives reminders; fall back to the
    // expiry date if no separate renewal date was recorded.
    const referenceDate = p.renewal_date ?? p.expiry_date
    if (!referenceDate) return false
    const daysUntil = daysUntilLocalDate(referenceDate)
    if (daysUntil === null || daysUntil > daysBefore || daysUntil < -1) return false
    // Already reminded today or after? Avoid duplicate reminders on the same day.
    if (p.last_reminder_sent && p.last_reminder_sent.slice(0, 10) === todayStr) return false
    return true
  })
}
