import * as React from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Upload, File, CheckCircle2, AlertCircle } from 'lucide-react'

export const Route = createFileRoute('/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData()
          const fileEntry = formData.get('file')
          const path = formData.get('path') as string | null

          if (!fileEntry || !(fileEntry instanceof File)) {
            return json(
              { success: false, error: 'No file provided' },
              { status: 400 },
            )
          }

          if (!path || path.trim() === '') {
            return json(
              { success: false, error: 'No path provided' },
              { status: 400 },
            )
          }

          // Convert File to Buffer
          const arrayBuffer = await fileEntry.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          // Dynamic import to ensure this only runs server-side
          const { uploadFile } = await import('#/server/file-server')
          const result = await uploadFile(path, buffer)

          if (result.success) {
            return json({ success: true, path: result.path })
          } else {
            return json(
              { success: false, error: result.error || 'Upload failed' },
              { status: 500 },
            )
          }
        } catch (error) {
          console.error('Error in upload handler:', error)
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
  component: UploadPage,
})

function UploadPage() {
  const router = useRouter()
  const [file, setFile] = React.useState<File | null>(null)
  const [path, setPath] = React.useState<string>('')
  const [uploading, setUploading] = React.useState(false)
  const [result, setResult] = React.useState<{
    success: boolean
    path?: string
    error?: string
  } | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Auto-fill path with filename if path is empty
      if (!path) {
        setPath(selectedFile.name)
      }
      setResult(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !path.trim()) {
      setResult({
        success: false,
        error: 'Please select a file and provide a path',
      })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path.trim())

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      })

      const payload = (await response.json()) as {
        success: boolean
        path?: string
        error?: string
      }
      setResult(payload)

      if (payload.success) {
        // Reset form after successful upload
        setFile(null)
        setPath('')
        // Reset file input
        const fileInput = document.getElementById('file-input')
        if (fileInput instanceof HTMLInputElement) {
          fileInput.value = ''
        }
        // Redirect to file list after a short delay
        setTimeout(() => {
          router.invalidate()
          router.navigate({ to: '/' })
        }, 1500)
      }
    } catch (error) {
      console.error('Upload error:', error)
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page-wrap px-4 pb-8 pt-14">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Upload File</h1>
          <p className="text-muted-foreground">
            Upload a file to the storage directory. You can specify a path with
            subdirectories (e.g., "images/photo.jpg").
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>
              Select a file and specify where it should be stored
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="file-input" className="text-sm font-medium">
                  File
                </label>
                <div className="flex items-center gap-4">
                  <label
                    htmlFor="file-input"
                    className="flex items-center gap-2 px-4 py-2 border border-input rounded-md cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{file ? file.name : 'Choose file'}</span>
                  </label>
                  <input
                    id="file-input"
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploading}
                  />
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <File className="h-4 w-4" />
                      <span>{(file.size / 1024).toFixed(2)} KB</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="path-input" className="text-sm font-medium">
                  Storage Path
                </label>
                <input
                  id="path-input"
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="e.g., images/photo.jpg or documents/file.pdf"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  The path where the file will be stored. Subdirectories will be
                  created automatically.
                </p>
              </div>

              {result && (
                <div
                  className={`p-4 rounded-md border ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            File uploaded successfully!
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            Path: {result.path}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        <div>
                          <p className="text-sm font-medium text-red-900 dark:text-red-100">
                            Upload failed
                          </p>
                          <p className="text-xs text-red-700 dark:text-red-300">
                            {result.error}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={uploading || !file || !path.trim()}
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFile(null)
                    setPath('')
                    setResult(null)
                    const fileInput = document.getElementById('file-input')
                    if (fileInput instanceof HTMLInputElement) {
                      fileInput.value = ''
                    }
                  }}
                  disabled={uploading}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
