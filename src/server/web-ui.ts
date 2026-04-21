import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

/**
 * Whether the management UI (/, /upload, /file/*) is enabled.
 * Defaults to true when unset so existing deployments keep the UI.
 */
export function isWebUiEnabled(): boolean {
  const v = process.env.ENABLE_WEB_UI
  if (v === undefined || v.trim() === '') return true
  const normalized = v.trim().toLowerCase()
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return true
}

export const getWebUiEnabled = createServerFn({ method: 'GET' }).handler(
  async () => isWebUiEnabled(),
)

export async function requireWebUiEnabled(): Promise<void> {
  const enabled = await getWebUiEnabled()
  if (!enabled) throw notFound()
}
