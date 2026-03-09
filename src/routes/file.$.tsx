import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/file/$')({
  loader: async ({ params }) => {
    try {
      // Dynamic import to ensure this only runs server-side
      const { getCachedVersions, isImageFile } = await import('#/server/file-server')

      // Get the file path from the route parameter
      // Decode the path in case it contains URL-encoded characters
      const path = decodeURIComponent(params._splat || '')
      const isImage = await isImageFile({ data: { filePath: path } })
      // Only get cached versions for images
      const versions = isImage ? await getCachedVersions({ data: { imagePath: path } }) : []
      return { path, isImage, versions }
    } catch (error) {
      console.error('Error loading file details:', error)
      const path = decodeURIComponent(params._splat || '')
      return { path, isImage: false, versions: [] }
    }
  },
  component: FileDetail,
})

function FileDetail() {
  const { path, isImage, versions } = Route.useLoaderData()

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
              {isImage ? 'Original file without transformations' : 'Original file'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isImage ? (
                <img
                  src={`/files/${path}`}
                  alt={path}
                  className="max-w-full h-auto rounded-lg border"
                />
              ) : (
                <div className="p-8 border rounded-lg bg-muted text-center">
                  <p className="text-muted-foreground">Preview not available for this file type</p>
                </div>
              )}
              <div>
                <a
                  href={`/files/${path}`}
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
                  No cached versions found. Request the image with size or format parameters to
                  generate cached versions.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {versions.map((version: { fileName: string; size?: string; format: string; url: string }) => (
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
    </div>
  )
}
