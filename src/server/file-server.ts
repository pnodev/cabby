// Server-only imports - these modules are not available in the browser
// We use dynamic imports to prevent Vite from bundling them for the client
import { createServerFn } from '@tanstack/react-start'
import z from 'zod'

// Dynamically import Node.js modules only when needed (server-side only)
async function getFs() {
  const fs = await import('node:fs')
  return fs
}

async function getPath() {
  const path = await import('node:path')
  return path
}

// Dynamically import sharp only when needed (server-side only)
async function getSharp() {
  const sharp = await import('sharp')
  // Sharp is a CommonJS module, so it might have a default export
  return sharp.default
}

// Get storage directory from environment variable
export function getStoragePath(): string {
  const storagePath = process.env.FILE_STORAGE_PATH
  if (!storagePath) {
    throw new Error('FILE_STORAGE_PATH environment variable is not set')
  }
  return storagePath
}

// Validate AUTH_SECRET for bypassing private file restrictions
function validateSecret(providedSecret: string | undefined): boolean {
  const expectedSecret = process.env.AUTH_SECRET
  if (!expectedSecret) {
    // If no AUTH_SECRET is configured, don't allow bypass
    return false
  }
  return providedSecret === expectedSecret
}

// Get cache directory (relative to storage or absolute)
// Ensures the cache directory exists
export async function getCachePath(): Promise<string> {
  const path = await getPath()
  const fs = await getFs()
  const storagePath = getStoragePath()
  const cachePath =
    process.env.FILE_CACHE_PATH || path.join(storagePath, '.cache')

  // Ensure cache directory exists
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true })
  }

  return cachePath
}

// Internal helper function for checking if a file is an image
// This is used internally within server functions for performance
async function checkIsImageFile(filePath: string): Promise<boolean> {
  const path = await getPath()
  const imageExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.avif',
    '.tiff',
    '.bmp',
    '.svg',
  ]
  const ext = path.extname(filePath).toLowerCase()
  return imageExtensions.includes(ext)
}

// Server Function for checking if a file is an image
export const isImageFile = createServerFn()
  .inputValidator(
    z.object({
      filePath: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<boolean> => {
    return await checkIsImageFile(data.filePath)
  })

// Parse size parameter (e.g., "180x240")
export function parseSize(
  sizeParam: string | undefined,
): { width?: number; height?: number } | undefined {
  if (!sizeParam) return undefined

  const match = sizeParam.match(/^(\d+)x(\d+)$/)
  if (!match) return undefined

  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  }
}

// Get output format from parameter
export async function getOutputFormat(
  formatParam: string | undefined,
  originalPath: string,
): Promise<string> {
  if (formatParam) {
    // Remove leading dot if present
    return formatParam.replace(/^\./, '').toLowerCase()
  }

  // Default to original format
  const path = await getPath()
  const ext = path.extname(originalPath).toLowerCase().replace(/^\./, '')
  return ext || 'jpg'
}

// Generate cache key from file path and transformation parameters
// Returns just the filename part (without the directory structure)
export async function generateCacheKey(
  filePath: string,
  size: { width?: number; height?: number } | undefined,
  format: string,
): Promise<string> {
  const path = await getPath()
  const baseName = path.basename(filePath, path.extname(filePath))
  const sizeStr = size ? `_${size.width}x${size.height}` : ''
  const formatStr = format ? `.${format}` : ''

  return `${baseName}${sizeStr}${formatStr}`
}

// Get cache directory for a specific file (includes original filename with extension)
export async function getCacheDirForFile(filePath: string): Promise<string> {
  const path = await getPath()
  const fs = await getFs()
  const cacheDir = await getCachePath()
  const fileName = path.basename(filePath) // Includes extension
  const decodedFileName = decodeURIComponent(fileName)

  const fileCacheDir = path.join(cacheDir, decodedFileName)

  // Ensure cache directory exists
  if (!fs.existsSync(fileCacheDir)) {
    fs.mkdirSync(fileCacheDir, { recursive: true })
  }

  return fileCacheDir
}

// Get cache file path
export async function getCacheFilePath(
  filePath: string,
  cacheKey: string,
): Promise<string> {
  const path = await getPath()
  const fileCacheDir = await getCacheDirForFile(filePath)
  return path.join(fileCacheDir, cacheKey)
}

// Check if format is supported for image conversion
export function isSupportedImageFormat(format: string): boolean {
  const supportedFormats = ['webp', 'avif', 'png', 'jpg', 'jpeg']
  return supportedFormats.includes(format.toLowerCase())
}

const TransformImageInputSchema = z.object({
  inputPath: z.string(),
  outputPath: z.string(),
  size: z
    .object({ width: z.number().optional(), height: z.number().optional() })
    .optional(),
  format: z.string(),
})

export const transformImage = createServerFn()
  .inputValidator(TransformImageInputSchema)
  .handler(async (ctx): Promise<void> => {
    const { inputPath, outputPath, format, size } = ctx.data
    const path = await getPath()
    const fs = await getFs()

    if (!isSupportedImageFormat(format)) {
      throw new Error(
        `Unsupported image format: ${format}. Supported formats: webp, png, jpg, jpeg`,
      )
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Dynamically import sharp (server-side only)
    const sharp = await getSharp()

    let pipeline = sharp(inputPath)

    // Resize if size is specified
    if (size) {
      pipeline = pipeline.resize(size.width, size.height, {
        fit: 'cover', // Cover the entire area, may crop
        position: 'center',
      })
    }

    // Convert format
    switch (format.toLowerCase()) {
      case 'webp':
        await pipeline.webp({ quality: 85 }).toFile(outputPath)
        break
      case 'png':
        await pipeline.png({ quality: 85 }).toFile(outputPath)
        break
      case 'jpg':
      case 'jpeg':
        await pipeline.jpeg({ quality: 85 }).toFile(outputPath)
        break
      default:
        // Fallback: try to use format directly
        await pipeline.toFormat(format as any).toFile(outputPath)
    }
  })

const GetFileInputSchema = z.object({
  filePath: z.string(),
  sizeParam: z.string().optional(),
  formatParam: z.string().optional(),
  secret: z.string().optional(),
})

export const getFile = createServerFn()
  .inputValidator(GetFileInputSchema)
  .handler(
    async (
      ctx,
    ): Promise<{ buffer: Buffer; contentType: string; cacheKey?: string }> => {
      const { filePath, sizeParam, formatParam, secret } = ctx.data
      const path = await getPath()
      const fs = await getFs()
      const storagePath = getStoragePath()

      // Decode URL-encoded path (e.g., %20 -> space)
      const decodedPath = decodeURIComponent(filePath)

      // Normalize and resolve the file path to prevent directory traversal
      const normalizedPath = path
        .normalize(decodedPath)
        .replace(/^(\.\.(\/|\\|$))+/, '')
      const fullPath = path.resolve(storagePath, normalizedPath)
      const resolvedStoragePath = path.resolve(storagePath)

      // Security check: ensure the resolved path is within the storage directory
      if (!fullPath.startsWith(resolvedStoragePath)) {
        throw new Error('File not found')
      }

      // Block dot files and files in dot directories
      const pathParts = normalizedPath.split(/[\/\\]/)
      const hasDotFileOrDir = pathParts.some((part) => part.startsWith('.'))
      if (hasDotFileOrDir) {
        throw new Error('File not found')
      }

      // Check if original file exists
      if (!fs.existsSync(fullPath)) {
        throw new Error('File not found')
      }

      // Check if file is public (private files return 404 unless AUTH_SECRET is provided)
      const { isFilePublic } = await import('#/server/file-state')
      const hasValidSecret = validateSecret(secret)

      if (!hasValidSecret && !(await isFilePublic(normalizedPath))) {
        throw new Error('File not found')
      }

      const isImage = await checkIsImageFile(decodedPath)
      // If it's an image and we have transformation parameters, process it
      if (isImage && (sizeParam || formatParam)) {
        const size = parseSize(sizeParam)
        const format = await getOutputFormat(formatParam, decodedPath)
        const cacheKey = await generateCacheKey(decodedPath, size, format)
        const cacheFilePath = await getCacheFilePath(decodedPath, cacheKey)

        // Check if cached version exists
        if (fs.existsSync(cacheFilePath)) {
          const buffer = fs.readFileSync(cacheFilePath)
          const contentType = getContentType(format)
          return { buffer, contentType, cacheKey }
        }

        // Generate transformed version
        await transformImage({
          data: {
            inputPath: fullPath,
            outputPath: cacheFilePath,
            size,
            format,
          },
        })
        const buffer = fs.readFileSync(cacheFilePath)
        const contentType = getContentType(format)
        return { buffer, contentType, cacheKey }
      }

      // Return original file
      const buffer = fs.readFileSync(fullPath)
      const contentType = getContentType(path.extname(filePath))
      return { buffer, contentType }
    },
  )

// Get content type from file extension or format
export function getContentType(formatOrExt: string): string {
  const format = formatOrExt.replace(/^\./, '').toLowerCase()

  const contentTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    webm: 'video/webm',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
  }

  return contentTypes[format] || 'application/octet-stream'
}

const GetAllFilesInputSchema = z.object({
  secret: z.string().optional(),
})

export const getAllFiles = createServerFn()
  .inputValidator(GetAllFilesInputSchema)
  .handler(
    async (): Promise<
      Array<{
        path: string
        isImage: boolean
        hasCache: boolean
        cacheCount: number
      }>
    > => {
      // secret parameter is accepted for API consistency but not needed here
      // since getAllFiles already returns all files (frontend shows all)
      const path = await getPath()
      const fs = await getFs()
      const storagePath = getStoragePath()
      const cacheDir = await getCachePath()
      const files: Array<{
        path: string
        isImage: boolean
        hasCache: boolean
        cacheCount: number
      }> = []

      async function walkDirectory(
        dir: string,
        basePath: string = '',
      ): Promise<void> {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })

          for (const entry of entries) {
            // Skip dot files and dot directories (e.g., .file-state.json, .cache, .git, etc.)
            if (entry.name.startsWith('.')) {
              continue
            }

            const fullPath = path.join(dir, entry.name)
            const relativePath = basePath
              ? path.join(basePath, entry.name)
              : entry.name

            if (entry.isDirectory()) {
              await walkDirectory(fullPath, relativePath)
            } else if (entry.isFile()) {
              // Use helper function instead of Server Function for better performance
              const isImage = await checkIsImageFile(entry.name)
              // Only count cache for images
              const cacheCount = isImage
                ? await countCacheFiles(relativePath, cacheDir)
                : 0
              files.push({
                path: relativePath,
                isImage,
                hasCache: cacheCount > 0,
                cacheCount,
              })
            }
          }
        } catch (error) {
          console.error(`Error reading directory ${dir}:`, error)
        }
      }

      if (fs.existsSync(storagePath)) {
        await walkDirectory(storagePath)
      }

      // Return all files (no filtering - frontend shows all files)
      // Private files are only blocked in /files/$ route (getFile handler)
      return files.sort((a, b) => a.path.localeCompare(b.path))
    },
  )

// Count cache files for a given image path
async function countCacheFiles(
  imagePath: string,
  cacheDir: string,
): Promise<number> {
  try {
    const path = await getPath()
    const fs = await getFs()
    // Get the cache directory for this specific file
    const fileName = path.basename(imagePath) // Includes extension
    const fileCacheDir = path.join(cacheDir, fileName)

    if (!fs.existsSync(fileCacheDir)) {
      return 0
    }

    // Count all files in the file's cache directory
    const cacheFiles = fs.readdirSync(fileCacheDir, { withFileTypes: true })
    return cacheFiles.filter((entry) => entry.isFile()).length
  } catch (error) {
    console.error('Error counting cache files:', error)
    return 0
  }
}

const GetCachedVersionsInputSchema = z.object({
  imagePath: z.string(),
})

export const getCachedVersions = createServerFn()
  .inputValidator(GetCachedVersionsInputSchema)
  .handler(
    async (
      ctx,
    ): Promise<
      Array<{
        fileName: string
        size?: string
        format: string
        url: string
      }>
    > => {
      const path = await getPath()
      const fs = await getFs()
      const { imagePath } = ctx.data

      const cacheDir = await getCachePath()
      const fileName = path.basename(imagePath) // Includes extension
      const fileCacheDir = path.join(cacheDir, fileName)
      const versions: Array<{
        fileName: string
        size?: string
        format: string
        url: string
      }> = []

      if (!fs.existsSync(fileCacheDir)) {
        return versions
      }

      try {
        const cacheFiles = fs.readdirSync(fileCacheDir, { withFileTypes: true })

        for (const entry of cacheFiles) {
          if (entry.isFile()) {
            const cacheFileName = entry.name
            // Parse cache file name: {baseName}_{width}x{height}.{format} or {baseName}.{format}
            const match = cacheFileName.match(/^(.+?)(?:_(\d+)x(\d+))?\.(.+)$/)

            if (match) {
              const [, , width, height, format] = match

              // Build URL with parameters
              const params = new URLSearchParams()
              if (width && height) {
                params.set('size', `${width}x${height}`)
              }
              if (format) {
                params.set('format', format)
              }

              const url = `/files/${imagePath}${params.toString() ? `?${params.toString()}` : ''}`

              versions.push({
                fileName: cacheFileName,
                size: width && height ? `${width}x${height}` : undefined,
                format,
                url,
              })
            }
          }
        }

        return versions.sort((a, b) => {
          // Sort by size first, then by format
          if (a.size && !b.size) return -1
          if (!a.size && b.size) return 1
          if (a.size && b.size) {
            const aSize = parseInt(a.size.split('x')[0])
            const bSize = parseInt(b.size.split('x')[0])
            if (aSize !== bSize) return aSize - bSize
          }
          return a.format.localeCompare(b.format)
        })
      } catch (error) {
        console.error('Error getting cached versions:', error)
        return versions
      }
    },
  )

// Server Function for loading file details (always runs server-side)
const GetFileDetailsInputSchema = z.object({
  filePath: z.string(),
})

export const getFileDetails = createServerFn()
  .inputValidator(GetFileDetailsInputSchema)
  .handler(
    async ({ data }): Promise<{
      path: string
      isImage: boolean
      versions: Array<{
        fileName: string
        size?: string
        format: string
        url: string
      }>
      isPublic: boolean
      secret: string | undefined
    }> => {
      const { getCachedVersions, isImageFile } = await import('#/server/file-server')
      const { isFilePublic } = await import('#/server/file-state')

      const path = decodeURIComponent(data.filePath)
      const isImage = await isImageFile({ data: { filePath: path } })
      const versions = isImage
        ? await getCachedVersions({ data: { imagePath: path } })
        : []
      const isPublic = await isFilePublic(path)
      const secret = process.env.AUTH_SECRET

      return { path, isImage, versions, isPublic, secret }
    },
  )


// Upload a file to the storage directory
export async function uploadFile(
  filePath: string,
  fileBuffer: Buffer,
): Promise<{ success: boolean; path: string; error?: string }> {
  try {
    const path = await getPath()
    const fs = await getFs()
    const storagePath = getStoragePath()

    // Decode and normalize the file path
    const decodedPath = decodeURIComponent(filePath)
    const normalizedPath = path
      .normalize(decodedPath)
      .replace(/^(\.\.(\/|\\|$))+/, '')
    const fullPath = path.resolve(storagePath, normalizedPath)
    const resolvedStoragePath = path.resolve(storagePath)

    // Security check: ensure the resolved path is within the storage directory
    if (!fullPath.startsWith(resolvedStoragePath)) {
      return { success: false, path: filePath, error: 'Invalid file path' }
    }

    // Ensure the directory exists
    const fileDir = path.dirname(fullPath)
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true })
    }

    // Write the file
    fs.writeFileSync(fullPath, fileBuffer)

    return { success: true, path: normalizedPath }
  } catch (error) {
    console.error('Error uploading file:', error)
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
