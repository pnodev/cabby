import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/sign')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireWriteToken } = await import('#/server/request-auth')
          const unauthorized = requireWriteToken(request)
          if (unauthorized) return unauthorized

          const body = (await request.json()) as {
            path?: string
            expiresInSeconds?: number
            size?: string
            format?: string
          }

          if (!body.path || body.path.trim() === '') {
            return json(
              { success: false, error: 'No path provided' },
              { status: 400 },
            )
          }

          const pathMod = await import('node:path')
          const {
            getStoragePath,
            normalizeRelativeStoragePath,
          } = await import('#/server/file-server')
          const { isPrivateFile } = await import('#/server/file-metadata')
          const {
            appendSignedUrlParams,
            createSignedUrlParams,
            encodeStoragePathSegments,
            getDefaultSignedUrlTtlSeconds,
          } = await import('#/server/signed-url')
          const { getPublicOrigin } = await import('#/server/public-origin')

          const normalizedPath = normalizeRelativeStoragePath(
            body.path.trim(),
            pathMod,
          )
          if (!normalizedPath) {
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

          const ttlSeconds =
            body.expiresInSeconds ?? getDefaultSignedUrlTtlSeconds()
          const signed = createSignedUrlParams({
            filePath: normalizedPath,
            sizeParam: body.size,
            formatParam: body.format,
            ttlSeconds,
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
            expiresInSeconds: ttlSeconds,
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
