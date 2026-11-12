import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateFileReadAccess,
  hasTraversalSegment,
  isDeniedInternalStoragePath,
} from './file-access'
import { setFilePrivate } from './file-metadata'
import {
  SIGNED_URL_EXPIRY_PARAM,
  SIGNED_URL_SIGNATURE_PARAM,
  createSignedUrlParams,
} from './signed-url'

describe('file-access', () => {
  let storageDir: string
  let prevStorage: string | undefined

  afterEach(() => {
    vi.unstubAllEnvs()
    if (prevStorage === undefined) delete process.env.FILE_STORAGE_PATH
    else process.env.FILE_STORAGE_PATH = prevStorage
    if (storageDir) {
      fs.rmSync(storageDir, { recursive: true, force: true })
      storageDir = ''
    }
  })

  function withTempStorage() {
    prevStorage = process.env.FILE_STORAGE_PATH
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-access-'))
    process.env.FILE_STORAGE_PATH = storageDir
    vi.stubEnv('SIGNED_URL_SECRET', 'test-secret')
  }

  it('denies internal .cache and .cabby paths', () => {
    expect(isDeniedInternalStoragePath('.cache/x')).toBe(true)
    expect(isDeniedInternalStoragePath('.cabby/metadata/a.json')).toBe(true)
    expect(isDeniedInternalStoragePath('images/a.jpg')).toBe(false)
  })

  it('detects traversal segments before normalization', () => {
    expect(hasTraversalSegment('../docs/a.pdf')).toBe(true)
    expect(hasTraversalSegment('docs/../a.pdf')).toBe(true)
    expect(hasTraversalSegment('docs/a.pdf')).toBe(false)
  })

  it('requires a signed URL for private files', async () => {
    withTempStorage()
    fs.mkdirSync(path.join(storageDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(storageDir, 'docs', 'a.pdf'), 'secret')
    await setFilePrivate(storageDir, 'docs/a.pdf', true)

    const denied = await evaluateFileReadAccess({
      storagePath: storageDir,
      normalizedPath: 'docs/a.pdf',
      searchParams: new URLSearchParams(),
    })
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) expect(denied.status).toBe(403)

    const signed = createSignedUrlParams({ filePath: 'docs/a.pdf' })
    const params = new URLSearchParams()
    params.set(SIGNED_URL_EXPIRY_PARAM, String(signed.expiresAt))
    params.set(SIGNED_URL_SIGNATURE_PARAM, signed.signature)
    const allowed = await evaluateFileReadAccess({
      storagePath: storageDir,
      normalizedPath: 'docs/a.pdf',
      searchParams: params,
    })
    expect(allowed.allowed).toBe(true)
    if (allowed.allowed) {
      expect(allowed.cacheControl).toBe('private, no-store')
    }
  })

  it('returns 404 for internal cache paths even when unsigned', async () => {
    withTempStorage()
    const result = await evaluateFileReadAccess({
      storagePath: storageDir,
      normalizedPath: '.cache/images/a.jpg/a_10x10.webp',
      searchParams: new URLSearchParams(),
    })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.status).toBe(404)
  })
})
