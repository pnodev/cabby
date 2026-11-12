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

/**
 * Normalize a storage-relative file path for cache lookup.
 * Must preserve the full relative path (not just basename) so files that share
 * a filename in different folders cannot collide in the transform cache.
 */
export function normalizeRelativeStoragePath(
  filePath: string,
  pathApi: { normalize: (p: string) => string },
): string {
  const decoded = decodeURIComponent(filePath)
  return pathApi
    .normalize(decoded)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '')
}

// Generate cache key from file path and transformation parameters
// Returns just the filename part (directory is handled by getCacheDirForFile)
export async function generateCacheKey(
  filePath: string,
  size: { width?: number; height?: number } | undefined,
  format: string,
): Promise<string> {
  const path = await getPath()
  const relativePath = normalizeRelativeStoragePath(filePath, path)
  const baseName = path.basename(relativePath, path.extname(relativePath))
  const sizeStr = size ? `_${size.width}x${size.height}` : ''
  const formatStr = format ? `.${format}` : ''

  return `${baseName}${sizeStr}${formatStr}`
}

/**
 * Absolute cache directory for a source file (does not create it).
 * Mirrors the full relative storage path under the cache root so that e.g.
 * `images/a/aufnahme4.jpg` and `images/b/aufnahme4.jpg` get separate dirs.
 */
export async function resolveCacheDirForFile(
  filePath: string,
): Promise<string> {
  const path = await getPath()
  const cacheDir = await getCachePath()
  const relativePath = normalizeRelativeStoragePath(filePath, path)
  const fileCacheDir = path.resolve(cacheDir, relativePath)

  // Security: keep resolved cache path inside the cache root
  const resolvedCacheRoot = path.resolve(cacheDir)
  if (
    fileCacheDir !== resolvedCacheRoot &&
    !fileCacheDir.startsWith(resolvedCacheRoot + path.sep)
  ) {
    throw new Error('Invalid file path')
  }

  return fileCacheDir
}

/**
 * Cache directory for a specific source file (creates it if missing).
 */
export async function getCacheDirForFile(filePath: string): Promise<string> {
  const fs = await getFs()
  const fileCacheDir = await resolveCacheDirForFile(filePath)

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

/** Remove all cached transforms for a source file (best-effort). */
export async function clearCacheForFile(filePath: string): Promise<boolean> {
  const fs = await getFs()
  try {
    const cacheDir = await resolveCacheDirForFile(filePath)
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true })
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Resolve a storage-relative path to an absolute file path inside FILE_STORAGE_PATH.
 * Throws `File not found` on traversal or missing files.
 */
export async function resolveStoredFilePath(filePath: string): Promise<string> {
  const path = await getPath()
  const storagePath = getStoragePath()
  const relativePath = normalizeRelativeStoragePath(filePath, path)
  const fullPath = path.resolve(storagePath, relativePath)
  const resolvedStoragePath = path.resolve(storagePath)

  if (
    fullPath !== resolvedStoragePath &&
    !fullPath.startsWith(resolvedStoragePath + path.sep)
  ) {
    throw new Error('File not found')
  }

  return fullPath
}

/**
 * Source content revision for cache identity (mtime ms).
 * Changes when the file is overwritten so ETags/URLs can bust stale caches.
 */
export async function getSourceRevision(filePath: string): Promise<string> {
  const fs = await getFs()
  const fullPath = await resolveStoredFilePath(filePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error('File not found')
  }

  return String(fs.statSync(fullPath).mtimeMs)
}

/**
 * Metadata for streaming a stored file without loading it into memory.
 */
export async function statStoredFile(filePath: string): Promise<{
  fullPath: string
  contentType: string
  revision: string
  size: number
}> {
  const path = await getPath()
  const fs = await getFs()
  const fullPath = await resolveStoredFilePath(filePath)

  let stat: Awaited<ReturnType<typeof fs.promises.stat>>
  try {
    stat = await fs.promises.stat(fullPath)
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Error('File not found')
    }
    throw error
  }

  if (!stat.isFile()) {
    throw new Error('File not found')
  }

  return {
    fullPath,
    contentType: getContentType(path.extname(filePath)),
    revision: String(stat.mtimeMs),
    size: stat.size,
  }
}

/**
 * Stream bytes from disk. `end` is inclusive (same as Node createReadStream / HTTP Range).
 */
export async function createStoredFileWebStream(
  fullPath: string,
  range?: { start: number; end: number },
): Promise<ReadableStream<Uint8Array>> {
  const fs = await getFs()
  const { Readable } = await import('node:stream')
  const nodeStream = fs.createReadStream(
    fullPath,
    range
      ? { start: range.start, end: range.end }
      : undefined,
  )
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

/** Cache-Control: only mark versioned URLs (with `v`) as immutable. */
export function buildFileCacheControl(sourceRevisionInUrl?: string): string {
  if (sourceRevisionInUrl) {
    return 'public, max-age=31536000, immutable'
  }
  return 'public, max-age=31536000'
}

/** Stable ETag including path, transform params, and source revision. */
export function buildFileETag(
  filePath: string,
  sizeParam?: string,
  formatParam?: string,
  revision?: string,
): string {
  const payload = `${filePath}|size=${sizeParam ?? ''}|format=${formatParam ?? ''}|rev=${revision ?? ''}`
  return `"${Buffer.from(payload).toString('base64')}"`
}

/**
 * RFC 9110 If-None-Match (weak comparison): true when the client already has
 * this representation and the server may answer 304.
 */
export function matchesIfNoneMatch(
  etag: string,
  ifNoneMatch: string | null,
): boolean {
  if (!ifNoneMatch) return false

  const header = ifNoneMatch.trim()
  if (!header) return false
  if (header === '*') return true

  const normalize = (value: string) => value.trim().replace(/^W\//i, '')
  const target = normalize(etag)

  return header.split(',').some((part) => normalize(part) === target)
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

/** Transform an image on disk (plain helper; usable outside Start runtime). */
export async function transformImageToFile(options: {
  inputPath: string
  outputPath: string
  format: string
  size?: { width?: number; height?: number }
}): Promise<void> {
  const { inputPath, outputPath, format, size } = options
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
}

export const transformImage = createServerFn()
  .inputValidator(TransformImageInputSchema)
  .handler(async (ctx): Promise<void> => {
    await transformImageToFile(ctx.data)
  })

const GetFileInputSchema = z.object({
  filePath: z.string(),
  sizeParam: z.string().optional(),
  formatParam: z.string().optional(),
  /** Signed expiry (`se`) required when the file is private. */
  se: z.string().optional(),
  /** Signature (`sig`) required when the file is private. */
  sig: z.string().optional(),
})

const READ_STORED_FILE_MAX_ATTEMPTS = 3

/** Read a stored file, optionally transforming (plain helper for tests/routes). */
export async function readStoredFile(options: {
  filePath: string
  sizeParam?: string
  formatParam?: string
  /**
   * Test-only hook: runs after the source revision is captured and before bytes
   * are read/transformed, so races can be simulated deterministically.
   */
  afterSourceRevision?: (ctx: {
    revision: string
    fullPath: string
  }) => void | Promise<void>
}): Promise<{
  buffer: Buffer
  contentType: string
  revision: string
  cacheKey?: string
}> {
  const { filePath, sizeParam, formatParam, afterSourceRevision } = options
  const path = await getPath()
  const fs = await getFs()
  const storagePath = getStoragePath()

  // Decode URL-encoded path (e.g., %20 -> space)
  const decodedPath = decodeURIComponent(filePath)

  // Normalize and resolve the file path to prevent directory traversal
  const normalizedPath = path
    .normalize(decodedPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
  const { isDeniedInternalStoragePath } = await import('#/server/file-access')
  if (isDeniedInternalStoragePath(normalizedPath)) {
    throw new Error('File not found')
  }
  const fullPath = path.resolve(storagePath, normalizedPath)
  const resolvedStoragePath = path.resolve(storagePath)

  // Security check: ensure the resolved path is within the storage directory
  if (
    fullPath !== resolvedStoragePath &&
    !fullPath.startsWith(resolvedStoragePath + path.sep)
  ) {
    throw new Error('File not found')
  }

  const isImage = await checkIsImageFile(decodedPath)
  const wantsTransform = isImage && Boolean(sizeParam || formatParam)

  for (let attempt = 0; attempt < READ_STORED_FILE_MAX_ATTEMPTS; attempt++) {
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found')
    }

    const revision = String(fs.statSync(fullPath).mtimeMs)
    if (afterSourceRevision) {
      await afterSourceRevision({ revision, fullPath })
    }

    let buffer: Buffer
    let contentType: string
    let cacheKey: string | undefined

    if (wantsTransform) {
      const size = parseSize(sizeParam)
      const format = await getOutputFormat(formatParam, decodedPath)
      cacheKey = await generateCacheKey(decodedPath, size, format)
      const cacheFilePath = await getCacheFilePath(decodedPath, cacheKey)

      if (fs.existsSync(cacheFilePath)) {
        buffer = fs.readFileSync(cacheFilePath)
      } else {
        await transformImageToFile({
          inputPath: fullPath,
          outputPath: cacheFilePath,
          size,
          format,
        })
        buffer = fs.readFileSync(cacheFilePath)
      }
      contentType = getContentType(format)
    } else {
      buffer = fs.readFileSync(fullPath)
      contentType = getContentType(path.extname(filePath))
    }

    // Same source snapshot as the bytes we are about to return?
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found')
    }
    const revisionAfter = String(fs.statSync(fullPath).mtimeMs)
    if (revisionAfter === revision) {
      return { buffer, contentType, revision, cacheKey }
    }

    // Source changed mid-read; drop possibly-stale transforms and retry.
    await clearCacheForFile(normalizedPath)
  }

  throw new Error('File changed while reading')
}

export const getFile = createServerFn()
  .inputValidator(GetFileInputSchema)
  .handler(async (ctx) => {
    const path = await getPath()
    const storagePath = getStoragePath()
    const normalizedPath = normalizeRelativeStoragePath(ctx.data.filePath, path)
    const searchParams = new URLSearchParams()
    if (ctx.data.sizeParam) searchParams.set('size', ctx.data.sizeParam)
    if (ctx.data.formatParam) searchParams.set('format', ctx.data.formatParam)
    if (ctx.data.se) searchParams.set('se', ctx.data.se)
    if (ctx.data.sig) searchParams.set('sig', ctx.data.sig)

    const { evaluateFileReadAccess } = await import('#/server/file-access')
    const access = await evaluateFileReadAccess({
      storagePath,
      normalizedPath,
      searchParams,
    })
    if (!access.allowed) {
      throw new Response(access.message, {
        status: access.status,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return readStoredFile(ctx.data)
  })

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
    css: 'text/css',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
  }

  return contentTypes[format] || 'application/octet-stream'
}

export const getAllFiles = createServerFn().handler(
  async (): Promise<
    Array<{
      path: string
      isImage: boolean
      hasCache: boolean
      cacheCount: number
      isPrivate: boolean
    }>
  > => {
    const path = await getPath()
    const fs = await getFs()
    const storagePath = getStoragePath()
    const cacheDir = await getCachePath()
    const { isPrivateFile, CABBY_META_DIR } = await import(
      '#/server/file-metadata'
    )
    const files: Array<{
      path: string
      isImage: boolean
      hasCache: boolean
      cacheCount: number
      isPrivate: boolean
    }> = []

    async function walkDirectory(
      dir: string,
      basePath: string = '',
    ): Promise<void> {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relativePath = basePath
            ? path.join(basePath, entry.name)
            : entry.name

          if (entry.isDirectory()) {
            // Skip cache and Cabby metadata directories
            if (entry.name !== '.cache' && entry.name !== CABBY_META_DIR) {
              await walkDirectory(fullPath, relativePath)
            }
          } else if (entry.isFile()) {
            // Use helper function instead of Server Function for better performance
            const isImage = await checkIsImageFile(entry.name)
            // Only count cache for images
            const cacheCount = isImage
              ? await countCacheFiles(relativePath, cacheDir)
              : 0
            const isPrivate = await isPrivateFile(storagePath, relativePath)
            files.push({
              path: relativePath,
              isImage,
              hasCache: cacheCount > 0,
              cacheCount,
              isPrivate,
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

    return files.sort((a, b) => a.path.localeCompare(b.path))
  },
)

// Count cache files for a given image path
async function countCacheFiles(
  imagePath: string,
  _cacheDir: string,
): Promise<number> {
  try {
    const fs = await getFs()
    const fileCacheDir = await resolveCacheDirForFile(imagePath)

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
      const fs = await getFs()
      const { imagePath } = ctx.data

      const fileCacheDir = await resolveCacheDirForFile(imagePath)
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

const WEB_UI_SIGNED_URL_TTL = 900

const GetFileDetailViewInputSchema = z.object({
  filePath: z.string(),
})

export const getFileDetailView = createServerFn()
  .inputValidator(GetFileDetailViewInputSchema)
  .handler(
    async ({
      data,
    }): Promise<{
      path: string
      isImage: boolean
      isPrivate: boolean
      needsWriteToken: boolean
      fileUrl: string
      versions: Array<{
        fileName: string
        size?: string
        format: string
        url: string
      }>
    }> => {
      const filePath = data.filePath
      const isImage = await checkIsImageFile(filePath)
      const storagePath = getStoragePath()
      const { isPrivateFile } = await import('#/server/file-metadata')
      const isPrivate = await isPrivateFile(storagePath, filePath)

      if (isPrivate) {
        const { getRequest } = await import('@tanstack/react-start/server')
        const { requireWriteToken } = await import('#/server/request-auth')
        const unauthorized = requireWriteToken(getRequest())
        if (unauthorized) {
          // Preserve write-token requirement; UI collects the token and signs via POST /sign.
          return {
            path: filePath,
            isImage,
            isPrivate: true,
            needsWriteToken: true,
            fileUrl: '',
            versions: [],
          }
        }
      }

      const rawVersions = isImage
        ? await getCachedVersions({ data: { imagePath: filePath } })
        : []

      const { encodeStoragePathSegments } = await import('#/server/signed-url')
      const encodedPath = encodeStoragePathSegments(filePath)
      let fileUrl = `/files/${encodedPath}`
      let versions = rawVersions.map((version) => {
        const versionUrl = new URL(version.url, 'http://local')
        const query = versionUrl.search
        return {
          ...version,
          url: `/files/${encodedPath}${query}`,
        }
      })

      if (isPrivate) {
        const { buildSignedFileRelativeUrl } = await import(
          '#/server/signed-url'
        )
        fileUrl = buildSignedFileRelativeUrl({
          filePath,
          ttlSeconds: WEB_UI_SIGNED_URL_TTL,
        })
        versions = rawVersions.map((version) => {
          const versionUrl = new URL(version.url, 'http://local')
          return {
            ...version,
            url: buildSignedFileRelativeUrl({
              filePath,
              sizeParam: versionUrl.searchParams.get('size') || undefined,
              formatParam: versionUrl.searchParams.get('format') || undefined,
              ttlSeconds: WEB_UI_SIGNED_URL_TTL,
            }),
          }
        })
      }

      return {
        path: filePath,
        isImage,
        isPrivate,
        needsWriteToken: false,
        fileUrl,
        versions,
      }
    },
  )

// Upload a file to the storage directory
export async function uploadFile(
  filePath: string,
  fileBuffer: Buffer,
  options?: { isPrivate?: boolean },
): Promise<{
  success: boolean
  path: string
  error?: string
  revision?: string
  isPrivate?: boolean
}> {
  const path = await getPath()
  const fs = await getFs()
  let storagePath: string
  try {
    storagePath = getStoragePath()
  } catch (error) {
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  const { hasTraversalSegment } = await import('#/server/file-access')
  if (hasTraversalSegment(filePath)) {
    return { success: false, path: filePath, error: 'Invalid file path' }
  }

  // Decode and normalize the file path
  const decodedPath = decodeURIComponent(filePath)
  const normalizedPath = path
    .normalize(decodedPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.resolve(storagePath, normalizedPath)
  const resolvedStoragePath = path.resolve(storagePath)

  // Security check: ensure the resolved path is within the storage directory
  if (
    fullPath !== resolvedStoragePath &&
    !fullPath.startsWith(resolvedStoragePath + path.sep)
  ) {
    return { success: false, path: filePath, error: 'Invalid file path' }
  }

  const { isPrivateFile, setFilePrivate } = await import(
    '#/server/file-metadata'
  )
  const priorPrivate = await isPrivateFile(storagePath, normalizedPath)
  const wantPrivate = options?.isPrivate === true

  try {
    // Ensure the directory exists
    const fileDir = path.dirname(fullPath)
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true })
    }

    // Commit bytes first; only then update privacy so a failed write cannot
    // leave an existing file marked private incorrectly.
    fs.writeFileSync(fullPath, fileBuffer)

    try {
      await setFilePrivate(storagePath, normalizedPath, wantPrivate)
    } catch (privacyError) {
      try {
        await setFilePrivate(storagePath, normalizedPath, priorPrivate)
      } catch {
        // Best-effort restore
      }
      throw privacyError
    }

    // Drop stale transforms if this path is being overwritten
    await clearCacheForFile(normalizedPath)

    const revision = String(fs.statSync(fullPath).mtimeMs)

    return {
      success: true,
      path: normalizedPath,
      revision,
      isPrivate: wantPrivate,
    }
  } catch (error) {
    console.error('Error uploading file:', error)
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function deleteFile(
  filePath: string,
): Promise<{
  success: boolean
  path: string
  error?: string
  deletedCache?: boolean
}> {
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

    if (!fs.existsSync(fullPath)) {
      return { success: false, path: normalizedPath, error: 'File not found' }
    }

    fs.unlinkSync(fullPath)

    const { deleteFileMetadata } = await import('#/server/file-metadata')
    await deleteFileMetadata(storagePath, normalizedPath)

    // Best-effort: remove cache directory for this file, if present
    const deletedCache = await clearCacheForFile(normalizedPath)

    return { success: true, path: normalizedPath, deletedCache }
  } catch (error) {
    console.error('Error deleting file:', error)
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export type SetFilesPrivacyResult = {
  updated: string[]
  unchanged: string[]
  missing: string[]
  invalid: string[]
}

/**
 * Mark existing stored files private or public. Missing paths are reported,
 * not created. Idempotent for already-matching privacy state.
 */
export async function setFilesPrivacy(
  filePaths: string[],
  isPrivate: boolean,
): Promise<SetFilesPrivacyResult> {
  const path = await getPath()
  const fs = await getFs()
  const storagePath = getStoragePath()
  const {
    isPrivateFile,
    setFilePrivate,
  } = await import('#/server/file-metadata')

  const updated: string[] = []
  const unchanged: string[] = []
  const missing: string[] = []
  const invalid: string[] = []

  const { hasTraversalSegment, isDeniedInternalStoragePath } = await import(
    '#/server/file-access'
  )

  for (const filePath of filePaths) {
    let normalizedPath: string
    try {
      if (typeof filePath !== 'string' || filePath.trim() === '') {
        invalid.push(filePath)
        continue
      }
      if (hasTraversalSegment(filePath)) {
        invalid.push(filePath)
        continue
      }
      normalizedPath = normalizeRelativeStoragePath(filePath, path)
      if (!normalizedPath || normalizedPath === '.' || normalizedPath === '..') {
        invalid.push(filePath)
        continue
      }
      if (isDeniedInternalStoragePath(normalizedPath)) {
        invalid.push(filePath)
        continue
      }
      const fullPath = path.resolve(storagePath, normalizedPath)
      const resolvedStoragePath = path.resolve(storagePath)
      if (
        fullPath !== resolvedStoragePath &&
        !fullPath.startsWith(resolvedStoragePath + path.sep)
      ) {
        invalid.push(filePath)
        continue
      }
    } catch {
      invalid.push(filePath)
      continue
    }

    const fullPath = path.resolve(storagePath, normalizedPath)
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      missing.push(normalizedPath)
      continue
    }

    const currentlyPrivate = await isPrivateFile(storagePath, normalizedPath)
    if (currentlyPrivate === isPrivate) {
      unchanged.push(normalizedPath)
      continue
    }

    await setFilePrivate(storagePath, normalizedPath, isPrivate)
    updated.push(normalizedPath)
  }

  return { updated, unchanged, missing, invalid }
}
