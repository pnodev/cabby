import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPrivateFile, readFileMetadata, setFilePrivate } from './file-metadata'
import { uploadFile } from './file-server'

describe('private files', () => {
  let storageDir: string
  let previousStoragePath: string | undefined

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-private-'))
    previousStoragePath = process.env.FILE_STORAGE_PATH
    process.env.FILE_STORAGE_PATH = storageDir
    vi.stubEnv('SIGNED_URL_SECRET', 'test-secret')
  })

  afterEach(() => {
    process.env.FILE_STORAGE_PATH = previousStoragePath
    fs.rmSync(storageDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('stores and reads private metadata on upload', async () => {
    const result = await uploadFile('secret/doc.pdf', Buffer.from('hello'), {
      isPrivate: true,
    })

    expect(result.success).toBe(true)
    expect(await isPrivateFile(storageDir, 'secret/doc.pdf')).toBe(true)

    const metaPath = path.join(
      storageDir,
      '.cabby',
      'metadata',
      'secret',
      'doc.pdf.json',
    )
    expect(fs.existsSync(metaPath)).toBe(true)
  })

  it('clears private metadata when uploading as public', async () => {
    await uploadFile('secret/doc.pdf', Buffer.from('hello'), {
      isPrivate: true,
    })
    await uploadFile('secret/doc.pdf', Buffer.from('hello again'), {
      isPrivate: false,
    })

    expect(await isPrivateFile(storageDir, 'secret/doc.pdf')).toBe(false)
  })

  it('setFilePrivate writes and removes metadata', async () => {
    await setFilePrivate(storageDir, 'images/a.jpg', true)
    expect(await isPrivateFile(storageDir, 'images/a.jpg')).toBe(true)

    await setFilePrivate(storageDir, 'images/a.jpg', false)
    expect(await isPrivateFile(storageDir, 'images/a.jpg')).toBe(false)
  })

  it('readFileMetadata throws on invalid JSON', async () => {
    const metaDir = path.join(storageDir, '.cabby', 'metadata', 'broken')
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(path.join(metaDir, 'file.json'), '{not json')

    await expect(readFileMetadata(storageDir, 'broken/file')).rejects.toThrow()
  })
})
