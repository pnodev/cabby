import { createFileRoute } from '@tanstack/react-router'
import { getCorsPreflightHeaders, withCorsHeaders } from '#/server/cors'

export const Route = createFileRoute('/files/$')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const headers = getCorsPreflightHeaders(request)
        if (!headers['Access-Control-Allow-Origin']) {
          return new Response(null, { status: 403 })
        }

        return new Response(null, { status: 204, headers })
      },
      GET: async ({ request }) => {
        try {
          // Dynamic import to ensure this only runs server-side
          const {
            getFile,
            isImageFile,
            buildFileETag,
            buildFileCacheControl,
            getSourceRevision,
            matchesIfNoneMatch,
          } = await import('#/server/file-server')

          // Parse the URL to get the file path
          const url = new URL(request.url)
          // Remove /files/ prefix and get the rest as the file path
          const pathMatch = url.pathname.match(/^\/files\/(.+)$/)
          if (!pathMatch) {
            return new Response('Invalid path', {
              status: 400,
              headers: { 'Content-Type': 'text/plain' },
            })
          }

          const path = pathMatch[1]

          // Parse query parameters
          const sizeParam = url.searchParams.get('size') || undefined
          const formatParam = url.searchParams.get('format') || undefined
          const sourceRevisionInUrl = url.searchParams.get('v') || undefined

          // Check if FILE_STORAGE_PATH is set
          const storagePath = process.env.FILE_STORAGE_PATH
          if (!storagePath) {
            return new Response(
              'FILE_STORAGE_PATH environment variable is not set',
              {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
              },
            )
          }

          const isImage = await isImageFile({ data: { filePath: path } })

          // Check if transformation parameters are only used for images
          if ((sizeParam || formatParam) && !isImage) {
            return new Response(
              'Size and format parameters are only available for image files',
              {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
              },
            )
          }

          const cacheControl = buildFileCacheControl(sourceRevisionInUrl)
          const ifNoneMatch = request.headers.get('If-None-Match')

          // Cheap 304 path: only skip the body when the revision is stable.
          const revisionHint = await getSourceRevision(path)
          const etagHint = buildFileETag(
            path,
            sizeParam,
            formatParam,
            revisionHint,
          )
          if (matchesIfNoneMatch(etagHint, ifNoneMatch)) {
            const revisionNow = await getSourceRevision(path)
            if (revisionNow === revisionHint) {
              return new Response(null, {
                status: 304,
                headers: withCorsHeaders(request, {
                  ETag: etagHint,
                  'Cache-Control': cacheControl,
                }),
              })
            }
          }

          // ETag must describe the same source snapshot as the returned bytes.
          const { buffer, contentType, revision } = await getFile({
            data: { filePath: path, sizeParam, formatParam },
          })
          const etag = buildFileETag(path, sizeParam, formatParam, revision)

          // Long-lived cache; immutable only when the URL is versioned with `v`.
          const headers = withCorsHeaders(request, {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            ETag: etag,
          })

          return new Response(new Uint8Array(buffer), {
            status: 200,
            headers,
          })
        } catch (error) {
          console.error('Error serving file:', error)

          if (error instanceof Error) {
            if (error.message === 'File not found') {
              return new Response('File not found', {
                status: 404,
                headers: {
                  'Content-Type': 'text/plain',
                },
              })
            }

            if (error.message.includes('Unsupported image format')) {
              return new Response(error.message, {
                status: 400,
                headers: {
                  'Content-Type': 'text/plain',
                },
              })
            }
          }

          return new Response('Internal server error', {
            status: 500,
            headers: {
              'Content-Type': 'text/plain',
            },
          })
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { requireWriteToken } = await import('#/server/request-auth')
          const unauthorized = requireWriteToken(request)
          if (unauthorized) return unauthorized

          const { deleteFile } = await import('#/server/file-server')

          const url = new URL(request.url)
          const pathMatch = url.pathname.match(/^\/files\/(.+)$/)
          if (!pathMatch) {
            return new Response('Invalid path', {
              status: 400,
              headers: { 'Content-Type': 'text/plain' },
            })
          }

          const path = pathMatch[1]
          const result = await deleteFile(path)

          if (!result.success) {
            if (result.error === 'File not found') {
              return new Response('File not found', {
                status: 404,
                headers: { 'Content-Type': 'text/plain' },
              })
            }
            if (result.error === 'Invalid file path') {
              return new Response('Invalid path', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
              })
            }
            return new Response(result.error || 'Delete failed', {
              status: 500,
              headers: { 'Content-Type': 'text/plain' },
            })
          }

          return new Response(
            JSON.stringify({
              success: true,
              path: result.path,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error('Error deleting file:', error)
          return new Response('Internal server error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          })
        }
      },
    },
  },
})
