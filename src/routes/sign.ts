import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

/** Hard ceiling for signed URL TTL (7 days). */
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60

function isJsonParseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const name = error.name
  const message = error.message.toLowerCase()
  return (
    name === 'SyntaxError' ||
    message.includes('json') ||
    message.includes('unexpected end') ||
    message.includes('unexpected token')
  )
}

export const Route = createFileRoute('/sign')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireWriteToken } = await import('#/server/request-auth')
          const unauthorized = requireWriteToken(request)
          if (unauthorized) return unauthorized

          let body: unknown
          try {
            body = await request.json()
          } catch (error) {
            if (isJsonParseError(error)) {
              return json(
                { success: false, error: 'Malformed JSON body' },
                { status: 400 },
              )
            }
            throw error
          }

          if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            return json(
              { success: false, error: 'Request body must be a JSON object' },
              { status: 400 },
            )
          }

          const record = body as {
            path?: unknown
            expiresInSeconds?: unknown
            size?: unknown
            format?: unknown
          }

          if (typeof record.path !== 'string' || record.path.trim() === '') {
            return json(
              { success: false, error: 'No path provided' },
              { status: 400 },
            )
          }

          let ttlSeconds: number | undefined
          if (record.expiresInSeconds !== undefined) {
            if (
              typeof record.expiresInSeconds !== 'number' ||
              !Number.isFinite(record.expiresInSeconds) ||
              record.expiresInSeconds <= 0 ||
              record.expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS
            ) {
              return json(
                {
                  success: false,
                  error: `expiresInSeconds must be a positive number ≤ ${MAX_SIGNED_URL_TTL_SECONDS}`,
                },
                { status: 400 },
              )
            }
            ttlSeconds = record.expiresInSeconds
          }

          if (
            record.size !== undefined &&
            typeof record.size !== 'string'
          ) {
            return json(
              { success: false, error: 'size must be a string when provided' },
              { status: 400 },
            )
          }
          if (
            record.format !== undefined &&
            typeof record.format !== 'string'
          ) {
            return json(
              {
                success: false,
                error: 'format must be a string when provided',
              },
              { status: 400 },
            )
          }

          const pathMod = await import('node:path')
          const {
            getStoragePath,
            normalizeRelativeStoragePath,
          } = await import('#/server/file-server')
          const { hasTraversalSegment } = await import('#/server/file-access')
          const { isPrivateFile } = await import('#/server/file-metadata')
          const {
            appendSignedUrlParams,
            createSignedUrlParams,
            encodeStoragePathSegments,
            getDefaultSignedUrlTtlSeconds,
          } = await import('#/server/signed-url')
          const { getPublicOrigin } = await import('#/server/public-origin')

          if (hasTraversalSegment(record.path)) {
            return json(
              { success: false, error: 'Invalid path' },
              { status: 400 },
            )
          }

          const normalizedPath = normalizeRelativeStoragePath(
            record.path.trim(),
            pathMod,
          )
          if (!normalizedPath || normalizedPath === '.' || normalizedPath === '..') {
            return json(
              { success: false, error: 'Invalid path' },
              { status: 400 },
            )
          }

          const storagePath = getStoragePath()
          const fileIsPrivate = await isPrivateFile(storagePath, normalizedPath)
          if (!fileIsPrivate) {
            return json(
              {
                success: false,
                error: 'File is not private; use the public URL instead',
              },
              { status: 400 },
            )
          }

          const effectiveTtl = ttlSeconds ?? getDefaultSignedUrlTtlSeconds()
          const signed = createSignedUrlParams({
            filePath: normalizedPath,
            sizeParam: record.size,
            formatParam: record.format,
            ttlSeconds: effectiveTtl,
          })

          const origin = getPublicOrigin(request)
          const encodedPath = encodeStoragePathSegments(normalizedPath)
          const url = appendSignedUrlParams(
            new URL(`/files/${encodedPath}`, origin),
            signed,
          ).href

          return json({
            success: true,
            path: normalizedPath,
            url,
            expiresAt: signed.expiresAt,
            expiresInSeconds: effectiveTtl,
          })
        } catch (error) {
          console.error('Error in sign handler:', error)
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
