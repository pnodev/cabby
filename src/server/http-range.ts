/**
 * HTTP byte-range helpers (RFC 9110 / RFC 7233).
 * Only single `bytes=` ranges are honored (what browsers use for media seek).
 */

export type ParsedByteRange =
  | { kind: 'none' }
  | { kind: 'satisfiable'; start: number; end: number }
  | { kind: 'unsatisfiable' }

/**
 * Parse a `Range` request header against a known entity size.
 * Invalid / unsupported units are ignored (`none`) so the server returns 200.
 */
export function parseByteRange(
  rangeHeader: string | null,
  size: number,
): ParsedByteRange {
  if (!rangeHeader) return { kind: 'none' }

  const trimmed = rangeHeader.trim()
  if (!trimmed.toLowerCase().startsWith('bytes=')) {
    return { kind: 'none' }
  }

  // Multipart ranges are uncommon for media; honor only the first spec.
  const first = trimmed.slice(6).split(',')[0]?.trim()
  if (!first) return { kind: 'none' }

  if (first.startsWith('-')) {
    const suffixLength = Number(first.slice(1))
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { kind: 'none' }
    }
    if (size === 0) return { kind: 'unsatisfiable' }
    const start = Math.max(0, size - suffixLength)
    return { kind: 'satisfiable', start, end: size - 1 }
  }

  const dash = first.indexOf('-')
  if (dash <= 0) return { kind: 'none' }

  const start = Number(first.slice(0, dash))
  const endPart = first.slice(dash + 1)

  if (!Number.isInteger(start) || start < 0) return { kind: 'none' }
  if (start >= size) return { kind: 'unsatisfiable' }

  if (endPart === '') {
    return { kind: 'satisfiable', start, end: size - 1 }
  }

  const end = Number(endPart)
  if (!Number.isInteger(end) || end < 0 || start > end) {
    return { kind: 'none' }
  }

  return { kind: 'satisfiable', start, end: Math.min(end, size - 1) }
}

/**
 * Whether the request's `If-Range` allows applying `Range`.
 * ETag form: honor only when it matches. Date form: honor (we do not emit Last-Modified).
 */
export function shouldHonorRange(
  ifRange: string | null,
  etag: string,
  matchesETag: (etag: string, header: string | null) => boolean,
): boolean {
  if (!ifRange) return true

  const value = ifRange.trim()
  if (!value) return true

  // ETag (strong or weak)
  if (value.startsWith('"') || value.startsWith("W/") || value.startsWith('w/')) {
    return matchesETag(etag, value)
  }

  // HTTP-date If-Range: no Last-Modified to compare; still honor Range.
  return true
}

/** Slice an in-memory body for transform responses that already hold a Buffer. */
export function sliceBufferForRange(
  buffer: Buffer,
  range: Extract<ParsedByteRange, { kind: 'satisfiable' }>,
): Buffer {
  return buffer.subarray(range.start, range.end + 1)
}
