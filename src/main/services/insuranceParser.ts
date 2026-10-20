import { extractStructured } from './extraction'
import { POLICY_TYPES } from '../../shared/insuranceTypes'
import type { PolicyExtraction } from '../../shared/types'

const POLICY_TYPE_VALUES = POLICY_TYPES.map((t) => t.value)

const EXTRACTION_INSTRUCTIONS =
  'This is an insurance policy document. Extract the policy details. ' +
  'If a field is not present in the document, use null rather than guessing. Dates must be YYYY-MM-DD. ' +
  "For policy_type, pick the closest match from the allowed list — use 'vehicle_2w' for motorcycle/scooter/" +
  "two-wheeler policies and 'vehicle_4w' for car/four-wheeler policies."

const EXTRACTION_PROPERTIES = {
  policy_number: { type: ['string', 'null'] },
  policy_type: {
    type: ['string', 'null'],
    enum: [...POLICY_TYPE_VALUES, null],
    description: 'The policy category, one of the allowed values'
  },
  insurer: { type: ['string', 'null'], description: 'Name of the insurance company' },
  insured_name: { type: ['string', 'null'], description: 'Name of the primary insured person' },
  additional_insured: {
    type: ['string', 'null'],
    description: 'Comma-separated names of additional insured members (spouse, children, etc.) beyond the primary insured, or null if only one person is insured'
  },
  vehicle_number: {
    type: ['string', 'null'],
    description: 'Registration/license plate number, only for vehicle policies'
  },
  sum_assured: { type: ['number', 'null'], description: 'Sum assured / cover amount, numeric only' },
  premium_amount: { type: ['number', 'null'], description: 'Premium amount, numeric only' },
  premium_frequency: {
    type: ['string', 'null'],
    description: "e.g. 'monthly', 'quarterly', 'half-yearly', 'yearly', 'single'"
  },
  start_date: { type: ['string', 'null'], description: 'Policy start/issue date in YYYY-MM-DD' },
  expiry_date: {
    type: ['string', 'null'],
    description: 'Date coverage actually lapses, in YYYY-MM-DD (not the renewal reminder date)'
  },
  renewal_date: {
    type: ['string', 'null'],
    description:
      'Renewal due date in YYYY-MM-DD, if the document states one separately from the expiry date; otherwise null'
  },
  confidence_notes: {
    type: ['string', 'null'],
    description: 'Brief note on any fields you were unsure about or could not find'
  }
}

const EXTRACTION_FIELD_NAMES = Object.keys(EXTRACTION_PROPERTIES)

export async function extractPolicyDetails(filePath: string): Promise<PolicyExtraction> {
  return extractStructured<PolicyExtraction>({
    filePath,
    instructions: EXTRACTION_INSTRUCTIONS,
    schemaName: 'extract_policy_details',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: EXTRACTION_FIELD_NAMES
  })
}
