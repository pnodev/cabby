import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSignaturePayload,
  createSignedUrlParams,
  signPayload,
  verifySignedUrlAccess,
} from './signed-url'

describe('signed-url', () => {
  beforeEach(() => {
    vi.stubEnv('SIGNED_URL_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a stable signature payload', () => {
    expect(
      buildSignaturePayload({
        filePath: 'images/a.jpg',
        expiresAt: 1700000000,
        sizeParam: '100x200',
        formatParam: 'webp',
      }),
    ).toBe('GET\nimages/a.jpg\n1700000000\n100x200\nwebp')
  })

  it('creates and verifies a signed URL', () => {
    const signed = createSignedUrlParams({
      filePath: 'docs/report.pdf',
      ttlSeconds: 3600,
      secret: 'test-secret',
    })

    const params = new URLSearchParams()
    params.set('se', String(signed.expiresAt))
    params.set('sig', signed.signature)

    expect(
      verifySignedUrlAccess({
        filePath: 'docs/report.pdf',
        searchParams: params,
        secret: 'test-secret',
      }).valid,
    ).toBe(true)
  })

  it('includes transform params in the signature', () => {
    const signed = createSignedUrlParams({
      filePath: 'images/a.jpg',
      sizeParam: '180x240',
      formatParam: 'webp',
      ttlSeconds: 3600,
      secret: 'test-secret',
    })

    const params = new URLSearchParams()
    params.set('size', '180x240')
    params.set('format', 'webp')
    params.set('se', String(signed.expiresAt))
    params.set('sig', signed.signature)

    expect(
      verifySignedUrlAccess({
        filePath: 'images/a.jpg',
        searchParams: params,
        secret: 'test-secret',
      }).valid,
    ).toBe(true)

    params.set('size', '999x999')
    expect(
      verifySignedUrlAccess({
        filePath: 'images/a.jpg',
        searchParams: params,
        secret: 'test-secret',
      }),
    ).toEqual({ valid: false, reason: 'invalid_signature' })
  })

  it('rejects expired signatures', () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 10
    const payload = buildSignaturePayload({
      filePath: 'images/a.jpg',
      expiresAt,
    })
    const signature = signPayload(payload, 'test-secret')
    const params = new URLSearchParams()
    params.set('se', String(expiresAt))
    params.set('sig', signature)

    expect(
      verifySignedUrlAccess({
        filePath: 'images/a.jpg',
        searchParams: params,
        secret: 'test-secret',
      }),
    ).toEqual({ valid: false, reason: 'expired' })
  })

  it('rejects missing signature params', () => {
    expect(
      verifySignedUrlAccess({
        filePath: 'images/a.jpg',
        searchParams: new URLSearchParams(),
        secret: 'test-secret',
      }),
    ).toEqual({ valid: false, reason: 'missing_params' })
  })
})
