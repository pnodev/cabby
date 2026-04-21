export function getAuthTokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  if (!header) return undefined

  const trimmed = header.trim()
  const match = trimmed.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  return trimmed
}

export function requireWriteToken(request: Request): Response | undefined {
  const expected =
    process.env.WRITE_AUTH_TOKEN || process.env.UPLOAD_AUTH_SECRET
  if (!expected || expected.trim() === '') {
    return new Response(
      'WRITE_AUTH_TOKEN environment variable is not set (or legacy UPLOAD_AUTH_SECRET)',
      {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
      },
    )
  }

  const provided = getAuthTokenFromRequest(request)
  if (!provided || provided !== expected) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return undefined
}
