import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { extname } from 'path'
import { getSecret } from '../secrets'
import { getExtractionProvider, getOpenAiBaseUrl, getOpenAiModel } from './settings'

// Shared document-reading core for every "upload a file and have the model extract
// structured fields" feature (insurance policies, ID documents, and anything added
// later). Both providers get the same JSON-schema-shaped property definitions and
// return an object matching them — callers just supply the schema and instructions.

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'

export function mimeTypeFor(filePath: string): { mime: string; kind: 'document' | 'image' } {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
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

interface ExtractionSpec {
  filePath: string
  instructions: string
  schemaName: string
  properties: JsonSchemaProperties
  requiredFields: string[]
}

async function extractViaAnthropic<T>(spec: ExtractionSpec): Promise<T> {
  const apiKey = getSecret('anthropicApiKey')
  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Add one in Settings first.')
  }
  const { mime, kind } = mimeTypeFor(spec.filePath)
  const data = readFileSync(spec.filePath).toString('base64')
  const client = new Anthropic({ apiKey })

  const contentBlock =
    kind === 'document'
      ? ({ type: 'document', source: { type: 'base64', media_type: mime, data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: mime, data } } as const)

  const tool: Anthropic.Tool = {
    name: spec.schemaName,
    description: 'Record the extracted details of the uploaded document.',
    input_schema: {
      type: 'object',
      properties: spec.properties,
      required: spec.requiredFields
    }
  }

  const response = await client.messages.create({
    model: DEFAULT_ANTHROPIC_MODEL,
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: 'tool', name: spec.schemaName },
    messages: [
      {
        role: 'user',
        content: [contentBlock as Anthropic.ContentBlockParam, { type: 'text', text: spec.instructions }]
      }
    ]
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  )
  if (!toolUse) {
    throw new Error('The model did not return structured details. Try again or enter manually.')
  }
  return toolUse.input as T
}

async function extractViaOpenAi<T>(spec: ExtractionSpec): Promise<T> {
  const apiKey = getSecret('openaiApiKey')
  if (!apiKey) {
    throw new Error('No OpenAI/Azure API key configured. Add one in Settings first.')
  }
  const baseUrl = getOpenAiBaseUrl()
  if (!baseUrl) {
    throw new Error('No OpenAI-compatible endpoint configured. Add one in Settings first.')
  }
  const model = getOpenAiModel()
  if (!model) {
    throw new Error('No model/deployment name configured. Add one in Settings first.')
  }

  const { mime, kind } = mimeTypeFor(spec.filePath)
  const data = readFileSync(spec.filePath).toString('base64')
  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  const fileContent =
    kind === 'document'
      ? ({
          type: 'input_file' as const,
          filename: 'document' + extname(spec.filePath),
          file_data: `data:${mime};base64,${data}`
        })
      : ({ type: 'input_image' as const, image_url: `data:${mime};base64,${data}`, detail: 'auto' as const })

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: spec.instructions }, fileContent]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: spec.schemaName,
        schema: {
          type: 'object',
          properties: spec.properties,
          required: spec.requiredFields,
          additionalProperties: false
        },
        strict: true
      }
    }
  })

  const text = response.output_text
  if (!text) {
    throw new Error('The model did not return structured details. Try again or enter manually.')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('The model returned a response that could not be parsed as JSON. Try again or enter manually.')
  }
}

export async function extractStructured<T>(spec: ExtractionSpec): Promise<T> {
  const provider = getExtractionProvider()
  return provider === 'openai' ? extractViaOpenAi<T>(spec) : extractViaAnthropic<T>(spec)
}
