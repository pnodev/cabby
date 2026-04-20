import { createMiddleware, createStart } from '@tanstack/react-start'

/** Web UI and server-handled routes only when set to 1, true, or yes (case-insensitive). */
function isWebUiEnabled(): boolean {
  const raw = process.env.ENABLE_WEB_UI
  if (raw == null || raw === '') return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

const webUiGuardMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    if (!isWebUiEnabled()) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [webUiGuardMiddleware],
}))
