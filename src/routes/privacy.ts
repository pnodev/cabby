import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const MAX_PATHS_PER_REQUEST = 500

export const Route = createFileRoute('/privacy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { requireWriteToken } = await import('#/server/request-auth')
          const unauthorized = requireWriteToken(request)
          if (unauthorized) return unauthorized

          const body = (await request.json()) as {
            private?: unknown
            path?: unknown
            paths?: unknown
          }

          if (typeof body.private !== 'boolean') {
            return json(
              {
                success: false,
                error: 'Field "private" must be a boolean',
              },
              { status: 400 },
            )
          }

          const paths: string[] = []
          if (typeof body.path === 'string' && body.path.trim() !== '') {
            paths.push(body.path.trim())
          }
          if (Array.isArray(body.paths)) {
            for (const entry of body.paths) {
              if (typeof entry === 'string' && entry.trim() !== '') {
                paths.push(entry.trim())
              }
            }
          }

          if (paths.length === 0) {
            return json(
              {
                success: false,
                error: 'Provide "path" or a non-empty "paths" array',
              },
              { status: 400 },
            )
          }

          if (paths.length > MAX_PATHS_PER_REQUEST) {
            return json(
              {
                success: false,
                error: `At most ${MAX_PATHS_PER_REQUEST} paths per request`,
              },
              { status: 400 },
            )
          }

          const { setFilesPrivacy } = await import('#/server/file-server')
          const result = await setFilesPrivacy(paths, body.private)

          return json({
            success: true,
            private: body.private,
            ...result,
          })
        } catch (error) {
          console.error('Error in privacy handler:', error)
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
