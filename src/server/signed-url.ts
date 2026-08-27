import { createHmac, timingSafeEqual } from 'node:crypto'

export const SIGNED_URL_EXPIRY_PARAM = 'se'
export const SIGNED_URL_SIGNATURE_PARAM = 'sig'

const DEFAULT_TTL_SECONDS = 3600

export function getSignedUrlSecret(): string | undefined {
  const secret =
    process.env.SIGNED_URL_SECRET ||
    process.env.WRITE_AUTH_TOKEN ||
    process.env.UPLOAD_AUTH_SECRET
  if (!secret || secret.trim() === '') return undefined
  return secret
}

export function getDefaultSignedUrlTtlSeconds(): number {
  const raw = process.env.SIGNED_URL_DEFAULT_TTL
  if (!raw || raw.trim() === '') return DEFAULT_TTL_SECONDS
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS
  return parsed
}

export type SignedUrlParams = {
  sizeParam?: string
  formatParam?: string
  expiresAt: number
  signature: string
}

export function buildSignaturePayload(options: {
  filePath: string
  expiresAt: number
  sizeParam?: string
  formatParam?: string
}): string {
  const { filePath, expiresAt, sizeParam, formatParam } = options
  return ['GET', filePath, String(expiresAt), sizeParam ?? '', formatParam ?? ''].join(
    '\n',
  )
}

export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSignedUrlParams(options: {
  filePath: string
  sizeParam?: string
  formatParam?: string
  ttlSeconds?: number
  secret?: string
}): SignedUrlParams {
  const secret = options.secret ?? getSignedUrlSecret()
  if (!secret) {
    throw new Error(
      'SIGNED_URL_SECRET (or WRITE_AUTH_TOKEN) is not configured',
    )
  }

  const ttl = options.ttlSeconds ?? getDefaultSignedUrlTtlSeconds()
  const expiresAt = Math.floor(Date.now() / 1000) + ttl
  const payload = buildSignaturePayload({
    filePath: options.filePath,
    expiresAt,
    sizeParam: options.sizeParam,
    formatParam: options.formatParam,
  })

  return {
    expiresAt,
    signature: signPayload(payload, secret),
    sizeParam: options.sizeParam,
    formatParam: options.formatParam,
  }
}

export function appendSignedUrlParams(
  url: URL,
  params: SignedUrlParams,
): URL {
  const next = new URL(url.href)
  if (params.sizeParam) next.searchParams.set('size', params.sizeParam)
  if (params.formatParam) next.searchParams.set('format', params.formatParam)
  next.searchParams.set(SIGNED_URL_EXPIRY_PARAM, String(params.expiresAt))
  next.searchParams.set(SIGNED_URL_SIGNATURE_PARAM, params.signature)
  return next
}

export function buildSignedFileUrl(options: {
  origin: string
  filePath: string
  sizeParam?: string
  formatParam?: string
  sourceRevision?: string
  ttlSeconds?: number
}): string {
  const relative = buildSignedFileRelativeUrl(options)
  return new URL(relative, options.origin).href
}

export function encodeStoragePathSegments(filePath: string): string {
  return filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function buildSignedFileRelativeUrl(options: {
  filePath: string
  sizeParam?: string
  formatParam?: string
  sourceRevision?: string
  ttlSeconds?: number
}): string {
  const encodedPath = encodeStoragePathSegments(options.filePath)
  const url = new URL(`/files/${encodedPath}`, 'http://local')

  if (options.sourceRevision) {
    url.searchParams.set('v', options.sourceRevision)
  }

  const signed = createSignedUrlParams({
    filePath: options.filePath,
    sizeParam: options.sizeParam,
    formatParam: options.formatParam,
    ttlSeconds: options.ttlSeconds,
  })

  const signedUrl = appendSignedUrlParams(url, signed)
  return signedUrl.pathname + signedUrl.search
}

export type VerifySignedUrlResult =
  | { valid: true }
  | { valid: false; reason: 'missing_secret' | 'missing_params' | 'expired' | 'invalid_signature' }

export function verifySignedUrlAccess(options: {
  filePath: string
  searchParams: URLSearchParams
  secret?: string
}): VerifySignedUrlResult {
  const secret = options.secret ?? getSignedUrlSecret()
  if (!secret) {
    return { valid: false, reason: 'missing_secret' }
  }

  const expiresRaw = options.searchParams.get(SIGNED_URL_EXPIRY_PARAM)
  const signature = options.searchParams.get(SIGNED_URL_SIGNATURE_PARAM)
  if (!expiresRaw || !signature) {
    return { valid: false, reason: 'missing_params' }
  }

  const expiresAt = parseInt(expiresRaw, 10)
  if (!Number.isFinite(expiresAt)) {
    return { valid: false, reason: 'missing_params' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (expiresAt < now) {
    return { valid: false, reason: 'expired' }
  }

  const sizeParam = options.searchParams.get('size') || undefined
  const formatParam = options.searchParams.get('format') || undefined
  const payload = buildSignaturePayload({
    filePath: options.filePath,
    expiresAt,
    sizeParam,
    formatParam,
  })
  const expected = signPayload(payload, secret)

  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'invalid_signature' }
    }
  } catch {
    return { valid: false, reason: 'invalid_signature' }
  }

  return { valid: true }
}

/** Cache-Control for private (signed-URL-only) file responses. */
export function buildPrivateFileCacheControl(): string {
  return 'private, no-store'
}
