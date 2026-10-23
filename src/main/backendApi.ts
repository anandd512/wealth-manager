// Set after deploying backend/infra/main.bicep — the Function App's default hostname.
// Shared by sync.ts (cloud sync) and notify.ts (reminder emails) — same backend,
// same base URL, same request shape.
export const API_BASE_URL = 'https://arthaad-func.azurewebsites.net'

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`)
  return json as T
}
