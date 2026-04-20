import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Switch } from "#/components/ui/switch"
import { Field, FieldContent, FieldLabel } from '#/components/ui/field'
import { setFileVisibilityServerFn } from '#/server/file-state'
import { getFileDetails } from '#/server/file-server'
import { useState } from 'react'

export const Route = createFileRoute('/file/$')({
  loader: async ({ params }) => {
    try {
      const path = decodeURIComponent(params._splat || '')
      // Call server function - always runs server-side
      return await getFileDetails({ data: { filePath: path } })
    } catch (error) {
      console.error('Error loading file details:', error)
      const path = decodeURIComponent(params._splat || '')
      return {
        path,
        isImage: false,
        versions: [],
        isPublic: true,
        secret: undefined
      }
    }
  },
  component: FileDetail,
})

// Helper to build file URL with secret
export const getFileUrl = (filePath: string, params?: { size?: string; format?: string }, secret?: string) => {
  const searchParams = new URLSearchParams()
  if (secret) {
    searchParams.set('secret', secret)
  }
  if (params?.size) {
    searchParams.set('size', params.size)
  }
  if (params?.format) {
    searchParams.set('format', params.format)
  }
  const queryString = searchParams.toString()
  return `/files/${filePath}${queryString ? `?${queryString}` : ''}`
}

function FileDetail() {
  const { path, isImage, versions, isPublic, secret } = Route.useLoaderData()
  const router = useRouter()

  const [isPublicState, setIsPublicState] = useState(isPublic)

  const handleVisibleChange = async (checked: boolean) => {
    try {
      await setFileVisibilityServerFn({
        data: { filePath: path, isPublic: checked },
      })
      setIsPublicState(checked)
      // Invalidate the route to reload data
      await router.invalidate()
    } catch (error) {
      console.error('Error updating file visibility:', error)
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
        <h1 className="text-3xl font-bold mb-2">{path}</h1>
      </div>

      <div className="space-y-6">
        {/* Original File */}
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
            <Field orientation="horizontal" className="mb-4 w-fit">
              <FieldContent>
                <FieldLabel htmlFor="switch-visible">
                  Visible?
                </FieldLabel>
              </FieldContent>
              <Switch checked={isPublicState} onCheckedChange={handleVisibleChange} id="switch-visible" />
            </Field>
            <div className="space-y-4">
              {isImage ? (
                <img
                  src={getFileUrl(path, undefined, secret)}
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
                  href={getFileUrl(path, undefined, secret)}
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

        {/* Cached Versions - Only for images */}
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
                  {versions.map(
                    (version: {
                      fileName: string
                      size?: string
                      format: string
                      url: string
                    }) => {
                      // Parse the existing URL to extract size/format
                      const existingUrl = new URL(version.url, window.location.origin)
                      const size = existingUrl.searchParams.get('size') || undefined
                      const format = existingUrl.searchParams.get('format') || undefined

                      return (
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
                              src={getFileUrl(path, { size, format }, secret)}
                              alt={`${path} - ${version.size || 'original'} - ${version.format}`}
                              className="w-full h-auto rounded border"
                            />
                            <a
                              href={getFileUrl(path, { size, format })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline block"
                            >
                              Open in new tab →
                            </a>
                          </CardContent>
                        </Card>
                      )
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
