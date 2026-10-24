import type { TableConfig } from './tableStore'

/** One TableConfig per synced table — the single place each table's indexed-column
 * list is declared, so db.ts (schema creation) and each table's repo module (CRUD)
 * both read from here without depending on each other. */

export const ACCOUNTS_CONFIG: TableConfig = {
  table: 'accounts',
  columns: [
    { name: 'name', type: 'text', notNull: true },
    { name: 'category', type: 'text', notNull: true },
    { name: 'subtype', type: 'text', notNull: true },
    { name: 'institution', type: 'text' },
    { name: 'currency', type: 'text', notNull: true, default: "'INR'" },
    { name: 'is_liability', type: 'bool', notNull: true, default: '0' },
    { name: 'current_value', type: 'real', notNull: true, default: '0' },
    { name: 'ownership_pct', type: 'real' },
    { name: 'notes', type: 'text' }
  ],
  orderBy: 'category, name'
}

export const VAULT_CONFIG: TableConfig = {
  table: 'credential_vault',
  columns: [
    { name: 'entry_type', type: 'text', notNull: true, default: "'login'" },
    { name: 'service_name', type: 'text', notNull: true },
    { name: 'category', type: 'text' },
    { name: 'url', type: 'text' },
    { name: 'username', type: 'text' },
    { name: 'password', type: 'text' },
    { name: 'password_changed_at', type: 'text' },
    { name: 'notes', type: 'text' }
  ],
  orderBy: 'category IS NULL, category, service_name',
  wireUpdatedAtKey: 'updated_at'
}

export const CREDIT_CARDS_CONFIG: TableConfig = {
  table: 'credit_cards',
  columns: [
    { name: 'nickname', type: 'text', notNull: true },
    { name: 'network', type: 'text' },
    { name: 'issuer', type: 'text' },
    { name: 'card_number', type: 'text' },
    { name: 'name_on_card', type: 'text' },
    { name: 'expiry_month', type: 'int' },
    { name: 'expiry_year', type: 'int' },
    { name: 'credit_limit', type: 'real' },
    { name: 'statement_day', type: 'int' },
    { name: 'status', type: 'text', notNull: true, default: "'active'" },
    { name: 'notes', type: 'text' }
  ],
  orderBy: 'nickname',
  wireUpdatedAtKey: 'updated_at'
}

export const INSURANCE_CONFIG: TableConfig = {
  table: 'insurance_policies',
  columns: [
    { name: 'policy_number', type: 'text' },
    { name: 'policy_type', type: 'text' },
    { name: 'insurer', type: 'text' },
    { name: 'insured_name', type: 'text' },
    { name: 'additional_insured', type: 'text' },
    { name: 'nominee_name', type: 'text' },
    { name: 'vehicle_number', type: 'text' },
    { name: 'sum_assured', type: 'real' },
    { name: 'premium_amount', type: 'real' },
    { name: 'premium_frequency', type: 'text' },
    { name: 'start_date', type: 'text' },
    { name: 'expiry_date', type: 'text' },
    { name: 'renewal_date', type: 'text' },
    { name: 'riders', type: 'text' },
    { name: 'document_path', type: 'text' },
    { name: 'document_original_name', type: 'text' },
    { name: 'notes', type: 'text' }
  ],
  orderBy: 'COALESCE(renewal_date, expiry_date) IS NULL, COALESCE(renewal_date, expiry_date)',
  wireUpdatedAtKey: 'updated_at'
}

export const IDENTITY_DOCS_CONFIG: TableConfig = {
  table: 'identity_documents',
  columns: [
    { name: 'doc_type', type: 'text', notNull: true },
    { name: 'label', type: 'text' },
    { name: 'id_number', type: 'text' },
    { name: 'full_name', type: 'text' },
    { name: 'date_of_birth', type: 'text' },
    { name: 'issued_date', type: 'text' },
    { name: 'expiry_date', type: 'text' },
    { name: 'additional_info', type: 'text' },
    { name: 'vehicle_class', type: 'text' },
    { name: 'vehicle_model', type: 'text' },
    { name: 'insurance_valid_upto', type: 'text' },
    { name: 'constituency', type: 'text' },
    { name: 'voter_serial_number', type: 'text' },
    { name: 'document_path', type: 'text' },
    { name: 'document_original_name', type: 'text' },
    { name: 'notes', type: 'text' }
  ],
  orderBy: 'expiry_date IS NULL, expiry_date',
  wireUpdatedAtKey: 'updated_at'
}
