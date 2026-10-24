import { File } from 'expo-file-system'
import { loadApiKey } from '../auth/secureStore'
import { getSetting } from '../db/kvSettingsRepo'

/** Ported from src/main/services/extraction.ts — same "upload a document, get
 * structured JSON back" core, but via raw fetch instead of the Anthropic/OpenAI
 * Node SDKs (no SDK access from React Native). Both providers get the same
 * JSON-schema-shaped property definitions and return an object matching them. */

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'

export function mimeTypeFor(ext: string): { mime: string; kind: 'document' | 'image' } {
  switch (ext.toLowerCase()) {
    case '.pdf':
      return { mime: 'application/pdf', kind: 'document' }
    case '.png':
      return { mime: 'image/png', kind: 'image' }
    case '.jpg':
    case '.jpeg':
      return { mime: 'image/jpeg', kind: 'image' }
    case '.webp':
      return { mime: 'image/webp', kind: 'image' }
    default:
      throw new Error(`Unsupported file type: ${ext}. Use PDF, PNG, JPG, or WEBP.`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonSchemaProperties = Record<string, any>

export interface ExtractionSpec {
  fileUri: string
  fileExt: string
  instructions: string
  schemaName: string
  properties: JsonSchemaProperties
  requiredFields: string[]
}

async function extractViaAnthropic<T>(spec: ExtractionSpec): Promise<T> {
  const apiKey = await loadApiKey('anthropicApiKey')
  if (!apiKey) throw new Error('No Anthropic API key configured. Add one in Settings first.')
  const { mime, kind } = mimeTypeFor(spec.fileExt)
  const data = await new File(spec.fileUri).base64()

  const contentBlock =
    kind === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: mime, data } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data } }

  const tool = {
    name: spec.schemaName,
    description: 'Record the extracted details of the uploaded document.',
    input_schema: { type: 'object', properties: spec.properties, required: spec.requiredFields }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: spec.schemaName },
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: spec.instructions }] }]
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Anthropic request failed (${response.status}): ${text.slice(0, 200)}`)
  }
  const json = (await response.json()) as { content?: { type: string; input?: unknown }[] }
  const toolUse = json.content?.find((b) => b.type === 'tool_use')
  if (!toolUse) throw new Error('The model did not return structured details. Try again or enter manually.')
  return toolUse.input as T
}

// Mirrors the OpenAI SDK's own `response.output_text` convenience getter — the raw
// Responses API returns an `output` array; a text reply lives in a message item's
// `output_text` content blocks, concatenated.
function extractOutputText(json: unknown): string {
  const output = (json as { output?: unknown[] }).output
  if (!Array.isArray(output)) return ''
  let text = ''
  for (const item of output) {
    const i = item as { type?: string; content?: unknown[] }
    if (i.type !== 'message' || !Array.isArray(i.content)) continue
    for (const block of i.content) {
      const b = block as { type?: string; text?: string }
      if (b.type === 'output_text' && typeof b.text === 'string') text += b.text
    }
  }
  return text
}

async function extractViaOpenAi<T>(spec: ExtractionSpec): Promise<T> {
  const apiKey = await loadApiKey('openaiApiKey')
  if (!apiKey) throw new Error('No OpenAI/Azure API key configured. Add one in Settings first.')
  const baseUrl = getSetting('openAiBaseUrl')
  if (!baseUrl) throw new Error('No OpenAI-compatible endpoint configured. Add one in Settings first.')
  const model = getSetting('openAiModel')
  if (!model) throw new Error('No model/deployment name configured. Add one in Settings first.')

  const { mime, kind } = mimeTypeFor(spec.fileExt)
  const data = await new File(spec.fileUri).base64()

  const fileContent =
    kind === 'document'
      ? { type: 'input_file', filename: 'document' + spec.fileExt, file_data: `data:${mime};base64,${data}` }
      : { type: 'input_image', image_url: `data:${mime};base64,${data}`, detail: 'auto' }

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content: [{ type: 'input_text', text: spec.instructions }, fileContent] }],
      text: {
        format: {
          type: 'json_schema',
          name: spec.schemaName,
          schema: { type: 'object', properties: spec.properties, required: spec.requiredFields, additionalProperties: false },
          strict: true
        }
      }
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${text.slice(0, 200)}`)
  }
  const json = await response.json()
  const text = extractOutputText(json)
  if (!text) throw new Error('The model did not return structured details. Try again or enter manually.')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('The model returned a response that could not be parsed as JSON. Try again or enter manually.')
  }
}

export async function extractStructured<T>(spec: ExtractionSpec): Promise<T> {
  const provider = (getSetting('extractionProvider') as 'anthropic' | 'openai' | null) ?? 'anthropic'
  return provider === 'openai' ? extractViaOpenAi<T>(spec) : extractViaAnthropic<T>(spec)
}

export async function testAnthropicConnection(): Promise<void> {
  const apiKey = await loadApiKey('anthropicApiKey')
  if (!apiKey) throw new Error('No Anthropic API key configured. Add one first.')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with "ok".' }]
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Anthropic request failed (${response.status}): ${text.slice(0, 200)}`)
  }
}

export async function testOpenAiConnection(): Promise<void> {
  const apiKey = await loadApiKey('openaiApiKey')
  if (!apiKey) throw new Error('No OpenAI/Azure API key configured. Add one first.')
  const baseUrl = getSetting('openAiBaseUrl')
  if (!baseUrl) throw new Error('No OpenAI-compatible endpoint configured. Add one first.')
  const model = getSetting('openAiModel')
  if (!model) throw new Error('No model/deployment name configured. Add one first.')

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Reply with "ok".' }] }]
    })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${text.slice(0, 200)}`)
  }
  const json = await response.json()
  const text = extractOutputText(json)
  if (!text) throw new Error('The endpoint responded but returned no text — check the model/deployment name.')
}
