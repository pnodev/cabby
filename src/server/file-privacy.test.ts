import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isPrivateFile } from './file-metadata'
import { setFilesPrivacy, uploadFile } from './file-server'

describe('setFilesPrivacy', () => {
  let storageDir: string
  let cacheDir: string
  let prevStorage: string | undefined
  let prevCache: string | undefined

  afterEach(() => {
    if (prevStorage === undefined) delete process.env.FILE_STORAGE_PATH
    else process.env.FILE_STORAGE_PATH = prevStorage
    if (prevCache === undefined) delete process.env.FILE_CACHE_PATH
    else process.env.FILE_CACHE_PATH = prevCache

    fs.rmSync(storageDir, { recursive: true, force: true })
    fs.rmSync(cacheDir, { recursive: true, force: true })
  })

  function withTempStorage() {
    prevStorage = process.env.FILE_STORAGE_PATH
    prevCache = process.env.FILE_CACHE_PATH
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-privacy-'))
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-privacy-cache-'))
    process.env.FILE_STORAGE_PATH = storageDir
    process.env.FILE_CACHE_PATH = cacheDir
  }

  it('marks existing files private and reports missing/invalid', async () => {
    withTempStorage()
    await uploadFile('docs/a.pdf', Buffer.from('a'))
    await uploadFile('docs/b.pdf', Buffer.from('b'))

    const first = await setFilesPrivacy(
      ['docs/a.pdf', 'docs/missing.pdf', '', '../docs/a.pdf', 'docs/b.pdf'],
      true,
    )

    expect(first.updated.sort()).toEqual(['docs/a.pdf', 'docs/b.pdf'])
    expect(first.unchanged).toEqual([])
    expect(first.missing).toEqual(['docs/missing.pdf'])
    expect(first.invalid).toEqual(['', '../docs/a.pdf'])
    expect(await isPrivateFile(storageDir, 'docs/a.pdf')).toBe(true)
    expect(await isPrivateFile(storageDir, 'docs/b.pdf')).toBe(true)

    const second = await setFilesPrivacy(['docs/a.pdf'], true)
    expect(second.updated).toEqual([])
    expect(second.unchanged).toEqual(['docs/a.pdf'])

    const cleared = await setFilesPrivacy(['docs/a.pdf'], false)
    expect(cleared.updated).toEqual(['docs/a.pdf'])
    expect(await isPrivateFile(storageDir, 'docs/a.pdf')).toBe(false)
  })
})
