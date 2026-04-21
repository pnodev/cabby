import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/files/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Dynamic import to ensure this only runs server-side
          const { getFile, isImageFile } = await import('#/server/file-server')

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

          // Get the file (with optional transformations)
          const { buffer, contentType } = await getFile({
            data: { filePath: path, sizeParam, formatParam },
          })

          // Set long-running cache headers (1 year)
          const headers = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: `"${Buffer.from(path).toString('base64')}"`,
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
