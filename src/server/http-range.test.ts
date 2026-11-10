import { describe, expect, it } from 'vitest'
import { matchesIfNoneMatch } from './file-server'
import {
  parseByteRange,
  shouldHonorRange,
  sliceBufferForRange,
} from './http-range'

describe('parseByteRange', () => {
  it('returns none without a Range header', () => {
    expect(parseByteRange(null, 1000)).toEqual({ kind: 'none' })
  })

  it('parses bytes=0-1023', () => {
    expect(parseByteRange('bytes=0-1023', 657_000_000)).toEqual({
      kind: 'satisfiable',
      start: 0,
      end: 1023,
    })
  })

  it('parses open-ended and suffix ranges', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({
      kind: 'satisfiable',
      start: 500,
      end: 999,
    })
    expect(parseByteRange('bytes=-100', 1000)).toEqual({
      kind: 'satisfiable',
      start: 900,
      end: 999,
    })
  })

  it('clamps end to file size and rejects past-EOF starts', () => {
    expect(parseByteRange('bytes=0-9999', 100)).toEqual({
      kind: 'satisfiable',
      start: 0,
      end: 99,
    })
    expect(parseByteRange('bytes=100-200', 100)).toEqual({
      kind: 'unsatisfiable',
    })
  })

  it('ignores malformed and non-bytes units', () => {
    expect(parseByteRange('bytes=abc', 100)).toEqual({ kind: 'none' })
    expect(parseByteRange('items=0-1', 100)).toEqual({ kind: 'none' })
  })
})

describe('shouldHonorRange', () => {
  const etag = '"abc"'

  it('honors Range when If-Range is absent or matches', () => {
    expect(shouldHonorRange(null, etag, matchesIfNoneMatch)).toBe(true)
    expect(shouldHonorRange(etag, etag, matchesIfNoneMatch)).toBe(true)
  })

  it('ignores Range when If-Range ETag does not match', () => {
    expect(shouldHonorRange('"other"', etag, matchesIfNoneMatch)).toBe(false)
  })
})

describe('sliceBufferForRange', () => {
  it('returns the inclusive byte slice', () => {
    const buffer = Buffer.from('abcdefghij')
    expect(
      sliceBufferForRange(buffer, { kind: 'satisfiable', start: 2, end: 5 }).toString(),
    ).toBe('cdef')
  })
})
