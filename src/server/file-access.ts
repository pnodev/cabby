import { isPrivateFile } from '#/server/file-metadata'
import {
  buildPrivateFileCacheControl,
  verifySignedUrlAccess,
} from '#/server/signed-url'

/** Reject paths that target Cabby-internal storage trees. */
export function isDeniedInternalStoragePath(normalizedPath: string): boolean {
  const segments = normalizedPath.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.length === 0) return false
  return segments[0] === '.cache' || segments[0] === '.cabby'
}

/**
 * True when the raw client path contains a `..` segment before normalization
 * strips it (which would otherwise remap the path).
 */
export function hasTraversalSegment(filePath: string): boolean {
  const trimmed = filePath.trim()
  if (!trimmed) return false
  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    // Keep raw input when it is not valid URI encoding.
  }
  return decoded
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment === '..')
}

export type FileReadAccessResult =
  | { allowed: true; cacheControl?: string }
  | { allowed: false; status: number; message: string }

/**
 * Shared gate for reading a stored file: deny internal paths, then require a
 * valid signed URL when the file is private.
 */
export async function evaluateFileReadAccess(options: {
  storagePath: string
  normalizedPath: string
  searchParams: URLSearchParams
}): Promise<FileReadAccessResult> {
  const { storagePath, normalizedPath, searchParams } = options

  if (isDeniedInternalStoragePath(normalizedPath)) {
    return { allowed: false, status: 404, message: 'File not found' }
  }

  const fileIsPrivate = await isPrivateFile(storagePath, normalizedPath)
  if (!fileIsPrivate) {
    return { allowed: true }
  }

  const verification = verifySignedUrlAccess({
    filePath: normalizedPath,
    searchParams,
  })
  if (!verification.valid) {
    const status = verification.reason === 'missing_secret' ? 500 : 403
    const message =
      verification.reason === 'missing_secret'
        ? 'SIGNED_URL_SECRET (or WRITE_AUTH_TOKEN / UPLOAD_AUTH_SECRET) is not configured'
        : verification.reason === 'expired'
          ? 'Signed URL has expired'
          : 'Forbidden'
    return { allowed: false, status, message }
  }

  return { allowed: true, cacheControl: buildPrivateFileCacheControl() }
}
