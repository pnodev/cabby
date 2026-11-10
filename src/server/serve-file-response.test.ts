import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadFile } from './file-server'
import { serveFileResponse } from './serve-file-response'

describe('serveFileResponse range support', () => {
  let storageDir: string
  let cacheDir: string
  let prevStorage: string | undefined
  let prevCache: string | undefined

  afterEach(() => {
    vi.restoreAllMocks()
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

  async function putFile(relPath: string, contents: Buffer | string) {
    const result = await uploadFile(
      relPath,
      typeof contents === 'string' ? Buffer.from(contents) : contents,
    )
    expect(result.success).toBe(true)
    return result
  }

  it('returns 200 with Accept-Ranges when no Range is sent', async () => {
    await withTempStorage()
    const body = 'hello-world-payload'
    await putFile('videos/clip.mp4', body)

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/clip.mp4?v=1'),
      filePath: 'videos/clip.mp4',
      sourceRevisionInUrl: '1',
      wantsTransform: false,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Length')).toBe(String(body.length))
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(await response.text()).toBe(body)
  })

  it('returns 206 with correct Content-Range and body for bytes=0-1023', async () => {
    await withTempStorage()
    const bytes = Buffer.alloc(2048, 0)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
    await putFile('videos/big.mp4', bytes)

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/big.mp4', {
        headers: { Range: 'bytes=0-1023' },
      }),
      filePath: 'videos/big.mp4',
      wantsTransform: false,
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Range')).toBe('bytes 0-1023/2048')
    expect(response.headers.get('Content-Length')).toBe('1024')
    const got = Buffer.from(await response.arrayBuffer())
    expect(got.equals(bytes.subarray(0, 1024))).toBe(true)
  })

  it('honors suffix ranges', async () => {
    await withTempStorage()
    await putFile('videos/tail.mp4', '0123456789')

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/tail.mp4', {
        headers: { Range: 'bytes=-4' },
      }),
      filePath: 'videos/tail.mp4',
      wantsTransform: false,
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 6-9/10')
    expect(await response.text()).toBe('6789')
  })

  it('returns 416 for unsatisfiable ranges', async () => {
    await withTempStorage()
    await putFile('videos/short.mp4', 'abc')

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/short.mp4', {
        headers: { Range: 'bytes=100-200' },
      }),
      filePath: 'videos/short.mp4',
      wantsTransform: false,
    })

    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */3')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
  })

  it('does not buffer the entire file for ranged streaming responses', async () => {
    await withTempStorage()
    // Large enough that buffering would be noticeable; content is patterned.
    const size = 8 * 1024 * 1024
    const filePath = 'videos/large.mp4'
    const fullPath = path.join(storageDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    const handle = fs.openSync(fullPath, 'w')
    const chunk = Buffer.alloc(64 * 1024, 7)
    for (let written = 0; written < size; written += chunk.length) {
      fs.writeSync(handle, chunk)
    }
    fs.closeSync(handle)

    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync')

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/large.mp4', {
        headers: { Range: 'bytes=0-1023' },
      }),
      filePath,
      wantsTransform: false,
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Length')).toBe('1024')
    const got = Buffer.from(await response.arrayBuffer())
    expect(got.length).toBe(1024)
    expect(got.every((b) => b === 7)).toBe(true)

    // Streaming path must not read the whole object via readFileSync.
    expect(readFileSyncSpy).not.toHaveBeenCalled()
  })

  it('still supports Range with cache-busting ?v= query params', async () => {
    await withTempStorage()
    await putFile('videos/v.mp4', 'abcdefghij')

    const response = await serveFileResponse({
      request: new Request('http://localhost/files/videos/v.mp4?v=123', {
        headers: { Range: 'bytes=0-3' },
      }),
      filePath: 'videos/v.mp4',
      sourceRevisionInUrl: '123',
      wantsTransform: false,
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(await response.text()).toBe('abcd')
  })
})
