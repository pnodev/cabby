async function getFs() {
  return import('node:fs')
}

async function getPath() {
  return import('node:path')
}

/** Directory under storage root for Cabby metadata (private flags, etc.). */
export const CABBY_META_DIR = '.cabby'

function normalizeStorageRelativePath(filePath: string): string {
  // Lazy sync import avoided — caller paths are already normalized in most cases.
  // We re-normalize via the shared helper once path module is available synchronously
  // in callers; here we use a minimal inline normalize for metadata keys.
  const decoded = decodeURIComponent(filePath)
  return decoded
    .replace(/\\/g, '/')
    .replace(/^(\.\.(\/|$))+/, '')
    .replace(/^\/+/, '')
}

export async function getMetadataRoot(storagePath: string): Promise<string> {
  const path = await getPath()
  return path.join(storagePath, CABBY_META_DIR, 'metadata')
}

export async function getMetadataFilePath(
  storagePath: string,
  filePath: string,
): Promise<string> {
  const path = await getPath()
  const relativePath = normalizeStorageRelativePath(filePath)
  const metaRoot = await getMetadataRoot(storagePath)
  const metaPath = path.join(metaRoot, `${relativePath}.json`)
  const resolvedMetaRoot = path.resolve(metaRoot)
  const resolvedMetaPath = path.resolve(metaPath)

  if (
    resolvedMetaPath !== resolvedMetaRoot &&
    !resolvedMetaPath.startsWith(resolvedMetaRoot + path.sep)
  ) {
    throw new Error('Invalid file path')
  }

  return metaPath
}

export type FileMetadata = {
  private: boolean
}

export async function readFileMetadata(
  storagePath: string,
  filePath: string,
): Promise<FileMetadata | null> {
  const fs = await getFs()
  try {
    const metaPath = await getMetadataFilePath(storagePath, filePath)
    if (!fs.existsSync(metaPath)) return null
    const raw = fs.readFileSync(metaPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<FileMetadata>
    if (typeof parsed.private !== 'boolean') return null
    return { private: parsed.private }
  } catch {
    return null
  }
}

export async function isPrivateFile(
  storagePath: string,
  filePath: string,
): Promise<boolean> {
  const meta = await readFileMetadata(storagePath, filePath)
  return meta?.private === true
}

export async function writeFileMetadata(
  storagePath: string,
  filePath: string,
  metadata: FileMetadata,
): Promise<void> {
  const fs = await getFs()
  const path = await getPath()
  const metaPath = await getMetadataFilePath(storagePath, filePath)
  const metaDir = path.dirname(metaPath)
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true })
  }
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))
}

export async function setFilePrivate(
  storagePath: string,
  filePath: string,
  isPrivate: boolean,
): Promise<void> {
  if (isPrivate) {
    await writeFileMetadata(storagePath, filePath, { private: true })
  } else {
    await deleteFileMetadata(storagePath, filePath)
  }
}

export async function deleteFileMetadata(
  storagePath: string,
  filePath: string,
): Promise<void> {
  const fs = await getFs()
  try {
    const metaPath = await getMetadataFilePath(storagePath, filePath)
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath)
    }
  } catch {
    // Best-effort
  }
}
