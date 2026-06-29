const CORS_METHODS = 'GET, HEAD, OPTIONS'

function parseAllowedOrigins(): string[] | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim()
  if (!raw) return null

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) return true
  return allowedOrigins.includes(origin)
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowedOrigins = parseAllowedOrigins()

  if (allowedOrigins) {
    if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
      return {}
    }

    if (allowedOrigins.includes('*')) {
      return { 'Access-Control-Allow-Origin': '*' }
    }

    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    }
  }

  // Public file server default: allow cross-origin use (e.g. webfonts in @font-face).
  if (origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    }
  }

  return { 'Access-Control-Allow-Origin': '*' }
}

export function getCorsPreflightHeaders(request: Request): Record<string, string> {
  const corsHeaders = getCorsHeaders(request)
  if (!corsHeaders['Access-Control-Allow-Origin']) {
    return {}
  }

  return {
    ...corsHeaders,
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Max-Age': '86400',
  }
}

export function withCorsHeaders(
  request: Request,
  headers: HeadersInit,
): Headers {
  const merged = new Headers(headers)
  for (const [key, value] of Object.entries(getCorsHeaders(request))) {
    merged.set(key, value)
  }
  return merged
}
