import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ExternalLink, Grid3x3, List, Upload } from 'lucide-react'
import { getAllFiles } from '#/server/file-server'
import { getFileUrl } from './file.$'

export const Route = createFileRoute('/')({
  loader: async () => {
    try {
      return await getAllFiles()
    } catch (error) {
      console.error('Error loading files:', error)
      return []
    }
  },
  component: App,
})

function App() {
  const files = Route.useLoaderData()
  const [viewMode, setViewMode] = React.useState<'card' | 'list'>('card')

  return (
    <div className="page-wrap px-4 pb-8 pt-14">
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold mb-2">File Storage</h1>
            <p className="text-muted-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/upload">
              <Button variant="default" size="default">
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            </Link>
            <Button
              type="button"
              variant={viewMode === 'card' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('card')}
              aria-label="Card view"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {files.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No files found in storage directory
          </CardContent>
        </Card>
      ) : viewMode === 'card' ? (
        // Card view
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map(
            (file: {
              path: string
              isImage: boolean
              hasCache: boolean
              cacheCount: number
            }) => (
              <Card key={file.path}>
                <CardHeader>
                  <CardAction>
                    <a
                      href={getFileUrl(file.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Open file in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </CardAction>
                  <CardTitle className="text-sm font-medium truncate">
                    {file.path}
                  </CardTitle>
                  <CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      {file.isImage ? (
                        file.hasCache ? (
                          <Badge variant="secondary">
                            {file.cacheCount} cached version
                            {file.cacheCount !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Image - No cache</Badge>
                        )
                      ) : (
                        <Badge variant="outline">File</Badge>
                      )}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/file/$"
                    params={{ _splat: file.path }}
                    className="text-sm text-primary hover:underline block"
                  >
                    View details →
                  </Link>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      ) : (
        // List view
        <div className="space-y-2">
          {files.map(
            (file: {
              path: string
              isImage: boolean
              hasCache: boolean
              cacheCount: number
            }) => (
              <Card key={file.path}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <Link
                          to="/file/$"
                          params={{ _splat: file.path }}
                          className="text-sm font-medium truncate hover:text-primary"
                        >
                          {file.path}
                        </Link>
                        <div className="flex items-center gap-2">
                          {file.isImage ? (
                            file.hasCache ? (
                              <Badge variant="secondary" className="text-xs">
                                {file.cacheCount} cached
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Image
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              File
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <a
                      href={`/files/${file.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      aria-label="Open file in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  )
}
