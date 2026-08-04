import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildFileETag,
  normalizeRelativeStoragePath,
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
})
