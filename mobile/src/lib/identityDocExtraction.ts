import { extractStructured } from './extraction'
import { DOC_TYPES } from './identityDocCategories'
import type { IdentityDocExtraction } from '../db/identityDocsRepo'

// Ported verbatim from src/main/services/identityDocParser.ts.
const DOC_TYPE_VALUES = DOC_TYPES.map((t) => t.value)

const EXTRACTION_INSTRUCTIONS = `This is a government or official identity document. Read it carefully and fill in every field that applies — use null only for fields that genuinely don't apply to this document type or aren't printed on it. Dates must be YYYY-MM-DD. For doc_type, pick the closest match from the allowed list.

Field-specific rules — follow these exactly, they are not optional:
- vehicle_class: REQUIRED whenever a vehicle class/category is printed on a Driving License or RC (e.g. "LMV, MCWG", "Motor Car"). If you can see a vehicle class anywhere on the document, you MUST put it in this field — never leave it null while only mentioning it in additional_info.
- vehicle_model (RC only): the vehicle's make and model, e.g. "Maruti Suzuki Swift".
- insurance_valid_upto (RC only): the insurance validity date shown on the RC, if present.
- expiry_date (RC only): this is the Fitness Certificate date (sometimes labeled "Fit Up To" or "FC Valid Upto"), NOT the registration date. Only leave it null if no fitness date is printed anywhere on the document.
- constituency (Voter ID only): the Assembly Constituency name/number.
- voter_serial_number (Voter ID only): the elector's serial number — this is different from the EPIC/ID number, which goes in id_number.
- additional_info: only for details that have no dedicated field above — e.g. issuing RTO, chassis/engine number, owner name, nationality, place of issue, place of birth, parents' names, address. Never repeat a value here that you already placed in vehicle_class, vehicle_model, insurance_valid_upto, constituency, or voter_serial_number — each fact belongs in exactly one field.

Leave vehicle_class, vehicle_model, insurance_valid_upto, constituency, and voter_serial_number as null for document types they don't apply to.`

const EXTRACTION_PROPERTIES = {
  doc_type: {
    type: ['string', 'null'],
    enum: [...DOC_TYPE_VALUES, null],
    description: 'The document category, one of the allowed values'
  },
  label: { type: ['string', 'null'], description: "Short label, e.g. 'My passport'" },
  id_number: { type: ['string', 'null'], description: 'The document/ID number' },
  full_name: { type: ['string', 'null'], description: "The document holder's full name" },
  date_of_birth: { type: ['string', 'null'], description: 'Date of birth in YYYY-MM-DD' },
  issued_date: { type: ['string', 'null'], description: 'Issue date in YYYY-MM-DD' },
  expiry_date: {
    type: ['string', 'null'],
    description:
      'Expiry date in YYYY-MM-DD. For an RC this is the Fitness Certificate validity date. ' +
      'Null for documents that do not expire (e.g. Aadhaar, PAN).'
  },
  additional_info: {
    type: ['string', 'null'],
    description:
      'Other relevant details that have no dedicated field, as short labeled lines. ' +
      'Do not duplicate anything already captured in vehicle_class, vehicle_model, ' +
      'insurance_valid_upto, constituency, or voter_serial_number.'
  },
  vehicle_class: {
    type: ['string', 'null'],
    description: 'Vehicle class/category, e.g. "LMV, MCWG" — required if printed on a driving license or RC, else null'
  },
  vehicle_model: { type: ['string', 'null'], description: 'Vehicle make and model — RC only, else null' },
  insurance_valid_upto: {
    type: ['string', 'null'],
    description: 'Insurance validity date in YYYY-MM-DD, as printed on an RC, else null'
  },
  constituency: { type: ['string', 'null'], description: 'Assembly constituency name/number — voter ID only, else null' },
  voter_serial_number: {
    type: ['string', 'null'],
    description: "Elector's serial number, distinct from the EPIC number — voter ID only, else null"
  },
  confidence_notes: { type: ['string', 'null'], description: 'Brief note on any fields you were unsure about or could not find' }
}

const EXTRACTION_FIELD_NAMES = Object.keys(EXTRACTION_PROPERTIES)

export async function extractIdentityDocDetails(fileUri: string, fileExt: string): Promise<IdentityDocExtraction> {
  return extractStructured<IdentityDocExtraction>({
    fileUri,
    fileExt,
    instructions: EXTRACTION_INSTRUCTIONS,
    schemaName: 'extract_identity_document',
    properties: EXTRACTION_PROPERTIES,
    requiredFields: EXTRACTION_FIELD_NAMES
  })
}
