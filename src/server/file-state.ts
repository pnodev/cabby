/**
 * File visibility state stored in .file-state.json next to storage — no DB.
 * visibility[path] === false → private (not listed, not served on /files/...).
 * Missing key → public (backward compatible).
 */
import { createServerFn } from '@tanstack/react-start'
import z from 'zod'

const FILE_STATE_FILENAME = '.file-state.json'

export type FileStateJson = {
  visibility: Record<string, boolean>
}

async function getPath() {
  const path = await import('node:path')
  return path
}

async function getFs() {
  const path = await import('node:fs')
  return path
}

function storageRoot(): string | null {
  return process.env.FILE_STORAGE_PATH || null
}

export async function getFileStatePath(): Promise<string | null> {
  const storagePath = storageRoot()
  if (!storagePath) return null
  const path = await getPath()
  return path.join(storagePath, FILE_STATE_FILENAME)
}

let cached: FileStateJson | null = null
let cachedMtime = 0

async function readState(): Promise<FileStateJson> {
  const storagePath = storageRoot()
  if (!storagePath) {
    // If FILE_STORAGE_PATH is not set, return empty state (all files public)
    return { visibility: {} }
  }

  const fs = await getFs()
  const statePath = await getFileStatePath()
  if (!statePath) return { visibility: {} }

  try {
    if (!fs.existsSync(statePath)) return { visibility: {} }
    const stat = fs.statSync(statePath)
    if (cached && stat.mtimeMs === cachedMtime) return cached
    const raw = fs.readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'visibility' in parsed &&
      typeof (parsed as FileStateJson).visibility === 'object'
    ) {
      cached = parsed as FileStateJson
      cachedMtime = stat.mtimeMs
      return cached
    }
    return { visibility: {} }
  } catch {
    return { visibility: {} }
  }
}

/** Missing key → public. false → private (not listed, not served). */
export async function isFilePublic(path: string): Promise<boolean> {
  const state = await readState()
  if (path in state.visibility) return state.visibility[path] !== false
  return true
}

export async function setFileVisibility(
  path: string,
  isPublic: boolean,
): Promise<void> {
  const storagePath = storageRoot()
  if (!storagePath) {
    throw new Error('FILE_STORAGE_PATH environment variable is not set')
  }

  const fs = await getFs()
  const statePath = await getFileStatePath()
  if (!statePath) {
    throw new Error('FILE_STORAGE_PATH environment variable is not set')
  }

  const state = await readState()
  state.visibility[path] = isPublic
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
  cached = state
  try {
    cachedMtime = fs.statSync(statePath).mtimeMs
  } catch {
    cachedMtime = Date.now()
  }
}

// Server Function for setting file visibility
const SetFileVisibilityInputSchema = z.object({
  filePath: z.string(),
  isPublic: z.boolean(),
})

export const setFileVisibilityServerFn = createServerFn()
  .inputValidator(SetFileVisibilityInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await setFileVisibility(data.filePath, data.isPublic)
  })
