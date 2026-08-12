import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildFileCacheControl,
  buildFileETag,
  getSourceRevision,
  matchesIfNoneMatch,
  normalizeRelativeStoragePath,
  readStoredFile,
  uploadFile,
} from './file-server'

describe('normalizeRelativeStoragePath', () => {
  it('keeps distinct directories for identical basenames', () => {
    const a = normalizeRelativeStoragePath(
      'images/1322/811452576311493/aufnahme4.jpg',
      path,
    )
    const b = normalizeRelativeStoragePath(
      'images/9999/111111111111111/aufnahme4.jpg',
      path,
    )

    expect(a).toBe('images/1322/811452576311493/aufnahme4.jpg')
    expect(b).toBe('images/9999/111111111111111/aufnahme4.jpg')
    expect(a).not.toBe(b)
  })

  it('strips leading slashes and parent segments', () => {
    expect(normalizeRelativeStoragePath('/images/foo.jpg', path)).toBe(
      'images/foo.jpg',
    )
    expect(normalizeRelativeStoragePath('../images/foo.jpg', path)).toBe(
      'images/foo.jpg',
    )
  })
})

describe('buildFileETag', () => {
  it('differs by size and format for the same path', () => {
    const pathOnly = buildFileETag('images/a/aufnahme4.jpg')
    const card = buildFileETag('images/a/aufnahme4.jpg', '400x300', 'webp')
    const map = buildFileETag('images/a/aufnahme4.jpg', '300x200', 'webp')

    expect(pathOnly).not.toBe(card)
    expect(card).not.toBe(map)
  })

  it('differs when source revision changes', () => {
    const before = buildFileETag('images/a.jpg', '10x10', 'webp', '100')
    const after = buildFileETag('images/a.jpg', '10x10', 'webp', '200')
    expect(before).not.toBe(after)
  })
})

describe('buildFileCacheControl', () => {
  it('marks versioned URLs immutable and leaves mutable URLs without immutable', () => {
    expect(buildFileCacheControl('123')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(buildFileCacheControl()).toBe('public, max-age=31536000')
    expect(buildFileCacheControl(undefined)).toBe('public, max-age=31536000')
  })
})

describe('matchesIfNoneMatch', () => {
  const etag = buildFileETag('images/a.jpg', '10x10', 'webp', '100')

  it('returns false without a header', () => {
    expect(matchesIfNoneMatch(etag, null)).toBe(false)
    expect(matchesIfNoneMatch(etag, '')).toBe(false)
  })

  it('matches a strong ETag', () => {
    expect(matchesIfNoneMatch(etag, etag)).toBe(true)
  })

  it('matches a weak ETag and list members', () => {
    expect(matchesIfNoneMatch(etag, `W/${etag}`)).toBe(true)
    expect(matchesIfNoneMatch(etag, `"other", ${etag}`)).toBe(true)
  })

  it('matches * and rejects other tags', () => {
    expect(matchesIfNoneMatch(etag, '*')).toBe(true)
    expect(matchesIfNoneMatch(etag, '"nope"')).toBe(false)
  })
})

describe('source overwrite invalidates transformed bytes', () => {
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

  async function withTempStorage() {
    prevStorage = process.env.FILE_STORAGE_PATH
    prevCache = process.env.FILE_CACHE_PATH
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-storage-'))
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cabby-cache-'))
    process.env.FILE_STORAGE_PATH = storageDir
    process.env.FILE_CACHE_PATH = cacheDir
  }

  it('serves new transformed bytes after the same public path is overwritten', async () => {
    await withTempStorage()

    const sharp = (await import('sharp')).default
    const filePath = 'images/overwrite.jpg'
    const red = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()
    const blue = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer()

    const firstUpload = await uploadFile(filePath, red)
    expect(firstUpload.success).toBe(true)
    expect(firstUpload.revision).toBeTruthy()

    const first = await readStoredFile({
      filePath,
      sizeParam: '20x20',
      formatParam: 'webp',
    })
    const firstRevision = await getSourceRevision(filePath)

    // Ensure mtime advances so revision changes on overwrite
    await new Promise((r) => setTimeout(r, 20))

    const secondUpload = await uploadFile(filePath, blue)
    expect(secondUpload.success).toBe(true)
    expect(secondUpload.revision).toBeTruthy()
    expect(secondUpload.revision).not.toBe(firstUpload.revision)

    const second = await readStoredFile({
      filePath,
      sizeParam: '20x20',
      formatParam: 'webp',
    })
    const secondRevision = await getSourceRevision(filePath)

    expect(secondRevision).not.toBe(firstRevision)
    expect(second.buffer.equals(first.buffer)).toBe(false)
    expect(second.revision).toBe(secondRevision)
    expect(
      buildFileETag(filePath, '20x20', 'webp', second.revision),
    ).not.toBe(buildFileETag(filePath, '20x20', 'webp', first.revision))
  })

  it('keeps response bytes and ETag revision consistent across mid-read overwrite', async () => {
    await withTempStorage()

    const sharp = (await import('sharp')).default
    const filePath = 'images/race.jpg'
    const red = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()
    const blue = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer()

    const firstUpload = await uploadFile(filePath, red)
    expect(firstUpload.success).toBe(true)

    let overwrote = false
    const raced = await readStoredFile({
      filePath,
      sizeParam: '20x20',
      formatParam: 'webp',
      afterSourceRevision: async ({ revision }) => {
        if (overwrote) return
        overwrote = true
        expect(revision).toBe(firstUpload.revision)
        // Simulate an overwrite between metadata lookup and byte retrieval.
        await new Promise((r) => setTimeout(r, 20))
        const secondUpload = await uploadFile(filePath, blue)
        expect(secondUpload.success).toBe(true)
        expect(secondUpload.revision).not.toBe(firstUpload.revision)
      },
    })

    expect(overwrote).toBe(true)
    expect(raced.revision).toBe(await getSourceRevision(filePath))
    expect(raced.revision).not.toBe(firstUpload.revision)

    const steady = await readStoredFile({
      filePath,
      sizeParam: '20x20',
      formatParam: 'webp',
    })
    expect(raced.revision).toBe(steady.revision)
    expect(raced.buffer.equals(steady.buffer)).toBe(true)
    expect(
      buildFileETag(filePath, '20x20', 'webp', raced.revision),
    ).toBe(buildFileETag(filePath, '20x20', 'webp', steady.revision))
  })
})
