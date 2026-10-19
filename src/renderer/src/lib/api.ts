/**
 * api.ts — thin indirection layer so the tour can swap in a mock without
 * touching the contextBridge-frozen window.api.
 *
 * All pages call `api()` (or `getApi()`) instead of `window.api` directly.
 * TourMode calls setMockApi() on mount and clearMockApi() on unmount.
 */

type AppApi = typeof window.api

let _mock: AppApi | null = null

/** Returns the active API — mock during tour, real API otherwise. */
export function api(): AppApi {
  return _mock ?? window.api
}

export function setMockApi(mock: AppApi): void {
  _mock = mock
}

export function clearMockApi(): void {
  _mock = null
}
