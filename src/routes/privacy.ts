import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const MAX_PATHS_PER_REQUEST = 500

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

export const Route = createFileRoute('/privacy')({
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
            private?: unknown
            path?: unknown
            paths?: unknown
          }

          if (typeof record.private !== 'boolean') {
            return json(
              {
                success: false,
                error: 'Field "private" must be a boolean',
              },
              { status: 400 },
            )
          }

          const paths: string[] = []
          const invalidEntries: string[] = []

          if (record.path !== undefined) {
            if (typeof record.path === 'string' && record.path.trim() !== '') {
              paths.push(record.path.trim())
            } else {
              invalidEntries.push(String(record.path))
            }
          }

          if (record.paths !== undefined) {
            if (!Array.isArray(record.paths)) {
              return json(
                {
                  success: false,
                  error: 'Field "paths" must be an array when provided',
                },
                { status: 400 },
              )
            }
            for (const entry of record.paths) {
              if (typeof entry === 'string' && entry.trim() !== '') {
                paths.push(entry.trim())
              } else {
                invalidEntries.push(
                  entry === undefined ? 'undefined' : String(entry),
                )
              }
            }
          }

          if (paths.length === 0 && invalidEntries.length === 0) {
            return json(
              {
                success: false,
                error: 'Provide "path" or a non-empty "paths" array',
              },
              { status: 400 },
            )
          }

          if (paths.length + invalidEntries.length > MAX_PATHS_PER_REQUEST) {
            return json(
              {
                success: false,
                error: `At most ${MAX_PATHS_PER_REQUEST} paths per request`,
              },
              { status: 400 },
            )
          }

          if (invalidEntries.length > 0 && paths.length === 0) {
            return json(
              {
                success: false,
                error: 'All submitted paths were invalid',
                invalid: invalidEntries,
              },
              { status: 400 },
            )
          }

          const { setFilesPrivacy } = await import('#/server/file-server')
          const result = await setFilesPrivacy(paths, record.private)
          const invalid = [...invalidEntries, ...result.invalid]

          if (invalidEntries.length > 0) {
            return json(
              {
                success: false,
                error: 'One or more paths entries were invalid',
                private: record.private,
                updated: result.updated,
                unchanged: result.unchanged,
                missing: result.missing,
                invalid,
              },
              { status: 400 },
            )
          }

          return json({
            success: true,
            private: record.private,
            updated: result.updated,
            unchanged: result.unchanged,
            missing: result.missing,
            invalid: result.invalid,
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
