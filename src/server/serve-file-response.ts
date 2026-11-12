import { withCorsHeaders } from '#/server/cors'
import {
  buildFileCacheControl,
  buildFileETag,
  createStoredFileWebStream,
  getSourceRevision,
  matchesIfNoneMatch,
  readStoredFile,
  statStoredFile,
} from '#/server/file-server'
import {
  parseByteRange,
  shouldHonorRange,
  sliceBufferForRange,
} from '#/server/http-range'

export type ServeFileRequestOptions = {
  request: Request
  filePath: string
  sizeParam?: string
  formatParam?: string
  sourceRevisionInUrl?: string
  /** When true, image transforms are applied (caller already validated isImage). */
  wantsTransform: boolean
  /** Override Cache-Control (e.g. private signed-URL responses). */
  cacheControl?: string
}

/** Shared 200/206 response headers for file bodies (CORS + Accept-Ranges). */
function baseFileHeaders(
  request: Request,
  options: {
    contentType: string
    cacheControl: string
    etag: string
    contentLength?: number
  },
): Headers {
  const headers: Record<string, string> = {
    'Content-Type': options.contentType,
    'Cache-Control': options.cacheControl,
    ETag: options.etag,
    'Accept-Ranges': 'bytes',
  }
  if (options.contentLength !== undefined) {
    headers['Content-Length'] = String(options.contentLength)
  }
  return withCorsHeaders(request, headers)
}

/**
 * Build a GET response for `/files/$`, including byte-range support.
 * Non-transform responses stream from disk and never buffer the whole file.
 */
export async function serveFileResponse(
  options: ServeFileRequestOptions,
): Promise<Response> {
  const {
    request,
    filePath,
    sizeParam,
    formatParam,
    sourceRevisionInUrl,
    wantsTransform,
  } = options

  const cacheControl =
    options.cacheControl ?? buildFileCacheControl(sourceRevisionInUrl)
  const ifNoneMatch = request.headers.get('If-None-Match')

  // Cheap 304 path: only skip the body when the revision is stable.
  const revisionHint = await getSourceRevision(filePath)
  const etagHint = buildFileETag(filePath, sizeParam, formatParam, revisionHint)
  if (matchesIfNoneMatch(etagHint, ifNoneMatch)) {
    const revisionNow = await getSourceRevision(filePath)
    if (revisionNow === revisionHint) {
      return new Response(null, {
        status: 304,
        headers: withCorsHeaders(request, {
          ETag: etagHint,
          'Cache-Control': cacheControl,
          'Accept-Ranges': 'bytes',
        }),
      })
    }
  }

  if (wantsTransform) {
    return serveTransformedFileResponse({
      request,
      filePath,
      sizeParam,
      formatParam,
      cacheControl,
    })
  }

  return serveStreamingFileResponse({
    request,
    filePath,
    sizeParam,
    formatParam,
    cacheControl,
  })
}

/**
 * Serve an image transform from `readStoredFile`, applying Range to the final bytes.
 */
async function serveTransformedFileResponse(options: {
  request: Request
  filePath: string
  sizeParam?: string
  formatParam?: string
  cacheControl: string
}): Promise<Response> {
  const { request, filePath, sizeParam, formatParam, cacheControl } = options

  const { buffer, contentType, revision } = await readStoredFile({
    filePath,
    sizeParam,
    formatParam,
  })
  const etag = buildFileETag(filePath, sizeParam, formatParam, revision)
  const size = buffer.byteLength

  const rangeHeader = request.headers.get('Range')
  const honorRange = shouldHonorRange(
    request.headers.get('If-Range'),
    etag,
    matchesIfNoneMatch,
  )
  const parsed = honorRange
    ? parseByteRange(rangeHeader, size)
    : ({ kind: 'none' } as const)

  if (parsed.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: withCorsHeaders(request, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        ETag: etag,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${size}`,
      }),
    })
  }

  if (parsed.kind === 'satisfiable') {
    const slice = sliceBufferForRange(buffer, parsed)
    const headers = baseFileHeaders(request, {
      contentType,
      cacheControl,
      etag,
      contentLength: slice.byteLength,
    })
    headers.set(
      'Content-Range',
      `bytes ${parsed.start}-${parsed.end}/${size}`,
    )
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers,
    })
  }

  const headers = baseFileHeaders(request, {
    contentType,
    cacheControl,
    etag,
    contentLength: size,
  })
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers,
  })
}

/**
 * Stream a stored file from disk with optional byte-range (no full-file buffer).
 */
async function serveStreamingFileResponse(options: {
  request: Request
  filePath: string
  sizeParam?: string
  formatParam?: string
  cacheControl: string
}): Promise<Response> {
  const { request, filePath, sizeParam, formatParam, cacheControl } = options

  const { fullPath, contentType, revision, size } =
    await statStoredFile(filePath)
  const etag = buildFileETag(filePath, sizeParam, formatParam, revision)

  const rangeHeader = request.headers.get('Range')
  const honorRange = shouldHonorRange(
    request.headers.get('If-Range'),
    etag,
    matchesIfNoneMatch,
  )
  const parsed = honorRange
    ? parseByteRange(rangeHeader, size)
    : ({ kind: 'none' } as const)

  if (parsed.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: withCorsHeaders(request, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        ETag: etag,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${size}`,
      }),
    })
  }

  if (parsed.kind === 'satisfiable') {
    const length = parsed.end - parsed.start + 1
    const headers = baseFileHeaders(request, {
      contentType,
      cacheControl,
      etag,
      contentLength: length,
    })
    headers.set(
      'Content-Range',
      `bytes ${parsed.start}-${parsed.end}/${size}`,
    )
    const body = await createStoredFileWebStream(fullPath, {
      start: parsed.start,
      end: parsed.end,
    })
    return new Response(body, {
      status: 206,
      headers,
    })
  }

  const headers = baseFileHeaders(request, {
    contentType,
    cacheControl,
    etag,
    contentLength: size,
  })
  const body = await createStoredFileWebStream(fullPath)
  return new Response(body, {
    status: 200,
    headers,
  })
}
