import { afterEach, describe, expect, it } from 'vitest'
import {
  getCabbyVersion,
  getCabbyVersionHeaders,
  resetCabbyVersionCache,
} from './version'

describe('getCabbyVersion', () => {
  afterEach(() => {
    delete process.env.CABBY_VERSION
    delete process.env.CABBY_GIT_SHA
    resetCabbyVersionCache()
  })

  it('uses CABBY_VERSION when set', () => {
    process.env.CABBY_VERSION = '9.9.9-test'
    resetCabbyVersionCache()
    expect(getCabbyVersion()).toBe('9.9.9-test')
    expect(getCabbyVersionHeaders()).toEqual({
      'X-Cabby-Version': '9.9.9-test',
    })
  })

  it('appends a short git sha when CABBY_GIT_SHA is set', () => {
    process.env.CABBY_VERSION = '1.2.3'
    process.env.CABBY_GIT_SHA = 'abcdef0123456789deadbeef'
    resetCabbyVersionCache()
    expect(getCabbyVersion()).toBe('1.2.3+abcdef012345')
  })

  it('falls back to package.json version', () => {
    resetCabbyVersionCache()
    const version = getCabbyVersion()
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
