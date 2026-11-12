import * as React from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { requireWebUiEnabled } from '#/server/web-ui'
import { getCachedVersions, getFileDetailView } from '#/server/file-server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Lock } from 'lucide-react'

const WRITE_TOKEN_STORAGE_KEY = 'cabby_write_auth_token'
const UI_SIGNED_URL_TTL = 900

type SignedVersion = {
  fileName: string
  size?: string
  format: string
  url: string
}

export const Route = createFileRoute('/file/$')({
  loader: async ({ params }) => {
    await requireWebUiEnabled()
    const path = decodeURIComponent(params._splat || '')
    try {
      return await getFileDetailView({ data: { filePath: path } })
    } catch (error) {
      if (
        error instanceof Response &&
        (error.status === 401 || error.status === 500)
      ) {
        throw notFound()
      }
      throw error
    }
  },
  component: FileDetail,
})

async function signFileUrl(options: {
  path: string
  token: string
  size?: string
  format?: string
}): Promise<string> {
  const response = await fetch('/sign', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: options.path,
      expiresInSeconds: UI_SIGNED_URL_TTL,
      size: options.size,
      format: options.format,
    }),
  })
  const data = (await response.json()) as {
    success?: boolean
    url?: string
    error?: string
  }
  if (!response.ok || !data.success || !data.url) {
    throw new Error(data.error || 'Failed to sign URL')
  }
  return data.url
}

function FileDetail() {
  const loaderData = Route.useLoaderData()
  const {
    path,
    isImage,
    isPrivate,
    needsWriteToken,
    fileUrl: initialFileUrl,
    versions: initialVersions,
  } = loaderData

  const [fileUrl, setFileUrl] = React.useState(initialFileUrl)
  const [versions, setVersions] = React.useState<SignedVersion[]>(initialVersions)
  const [token, setToken] = React.useState('')
  const [authError, setAuthError] = React.useState<string | null>(null)
  const [signing, setSigning] = React.useState(false)
  const [unlocked, setUnlocked] = React.useState(!needsWriteToken)

  React.useEffect(() => {
    if (!needsWriteToken || typeof window === 'undefined') return
    const stored = sessionStorage.getItem(WRITE_TOKEN_STORAGE_KEY)
    if (stored) setToken(stored)
  }, [needsWriteToken])

  const unlockWithToken = async (writeToken: string) => {
    setSigning(true)
    setAuthError(null)
    try {
      const signedOriginal = await signFileUrl({ path, token: writeToken })
      let signedVersions: SignedVersion[] = []
      if (isImage) {
        const rawVersions = await getCachedVersions({
          data: { imagePath: path },
        })
        signedVersions = await Promise.all(
          rawVersions.map(async (version) => {
            const versionUrl = new URL(version.url, 'http://local')
            const url = await signFileUrl({
              path,
              token: writeToken,
              size: versionUrl.searchParams.get('size') || undefined,
              format: versionUrl.searchParams.get('format') || undefined,
            })
            return {
              fileName: version.fileName,
              size: version.size,
              format: version.format,
              url,
            }
          }),
        )
      }
      sessionStorage.setItem(WRITE_TOKEN_STORAGE_KEY, writeToken)
      setFileUrl(signedOriginal)
      setVersions(signedVersions)
      setUnlocked(true)
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Could not unlock private file',
      )
      setUnlocked(false)
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="page-wrap px-4 pb-8 pt-14">
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← Back to files
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{path}</h1>
          {isPrivate && (
            <Badge variant="secondary">
              <Lock className="h-3 w-3 mr-1" />
              Private
            </Badge>
          )}
        </div>
        {isPrivate && unlocked && (
          <p className="text-sm text-muted-foreground">
            This file requires a signed URL to access. Links below include a
            short-lived signature for preview (15 minutes).
          </p>
        )}
      </div>

      {needsWriteToken && !unlocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Write token required</CardTitle>
            <CardDescription>
              Private file previews are signed with your Cabby write token
              (`WRITE_AUTH_TOKEN`). The token stays in this browser tab
              (sessionStorage) and is sent only to Cabby&apos;s{' '}
              <code className="text-xs">POST /sign</code> endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void unlockWithToken(token.trim())
              }}
            >
              <div className="space-y-2">
                <label htmlFor="write-token" className="text-sm font-medium">
                  WRITE_AUTH_TOKEN
                </label>
                <input
                  id="write-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  disabled={signing}
                />
              </div>
              {authError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {authError}
                </p>
              )}
              <Button type="submit" disabled={signing || !token.trim()}>
                {signing ? 'Signing…' : 'Unlock preview'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Original File</CardTitle>
              <CardDescription>
                {isImage
                  ? 'Original file without transformations'
                  : 'Original file'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isImage ? (
                  <img
                    src={fileUrl}
                    alt={path}
                    className="max-w-full h-auto rounded-lg border"
                  />
                ) : (
                  <div className="p-8 border rounded-lg bg-muted text-center">
                    <p className="text-muted-foreground">
                      Preview not available for this file type
                    </p>
                  </div>
                )}
                <div>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Open original in new tab →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {isImage && (
            <Card>
              <CardHeader>
                <CardTitle>Cached Versions</CardTitle>
                <CardDescription>
                  {versions.length > 0
                    ? `${versions.length} cached version${versions.length !== 1 ? 's' : ''} available`
                    : 'No cached versions available'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No cached versions found. Request the image with size or
                    format parameters to generate cached versions.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {versions.map((version) => (
                      <Card key={version.fileName}>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">
                            {version.fileName}
                          </CardTitle>
                          <CardDescription>
                            <div className="flex items-center gap-2 mt-2">
                              {version.size && (
                                <Badge variant="outline" className="text-xs">
                                  {version.size}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {version.format}
                              </Badge>
                            </div>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <img
                            src={version.url}
                            alt={`${path} - ${version.size || 'original'} - ${version.format}`}
                            className="w-full h-auto rounded border"
                          />
                          <a
                            href={version.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline block"
                          >
                            Open in new tab →
                          </a>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
