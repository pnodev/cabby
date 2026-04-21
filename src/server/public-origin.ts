function firstHeaderValue(value: string | null): string | undefined {
  if (!value) return undefined
  const first = value.split(',')[0]?.trim()
  return first || undefined
}

function parseForwarded(forwarded: string): { proto?: string; host?: string } {
  // RFC 7239: Forwarded: for=...,proto=https;host=example.com
  const first = firstHeaderValue(forwarded)
  if (!first) return {}

  const parts = first.split(';').map((p) => p.trim())
  const out: { proto?: string; host?: string } = {}

  for (const part of parts) {
    const [k, ...rest] = part.split('=')
    const key = k?.trim().toLowerCase()
    const rawVal = rest.join('=').trim()
    const val = rawVal.replace(/^"|"$/g, '')
    if (key === 'proto' && val) out.proto = val
    if (key === 'host' && val) out.host = val
  }

  return out
}

export function getPublicOrigin(request: Request): string {
  const forwarded = request.headers.get('forwarded')
  const f = forwarded ? parseForwarded(forwarded) : {}

  const proto =
    f.proto ||
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ||
    new URL(request.url).protocol.replace(/:$/, '') ||
    'http'

  const host =
    f.host ||
    firstHeaderValue(request.headers.get('x-forwarded-host')) ||
    request.headers.get('host') ||
    new URL(request.url).host

  return `${proto}://${host}`
}
