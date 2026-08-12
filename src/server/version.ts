import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CABBY_VERSION_HEADER = 'X-Cabby-Version'

let cachedVersion: string | undefined

function readPackageVersion(): string {
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    if (typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim()
    }
  } catch {
    // Fall through.
  }

  const npmPkgVersion = process.env.npm_package_version?.trim()
  if (npmPkgVersion) return npmPkgVersion

  return 'unknown'
}

/**
 * Deploy-visible Cabby version for response headers.
 * Prefer `CABBY_VERSION`, else package.json, optionally append `CABBY_GIT_SHA`.
 */
export function getCabbyVersion(): string {
  if (cachedVersion) return cachedVersion

  const fromEnv = process.env.CABBY_VERSION?.trim()
  const base = fromEnv || readPackageVersion()
  const sha = process.env.CABBY_GIT_SHA?.trim()
  cachedVersion = sha ? `${base}+${sha.slice(0, 12)}` : base
  return cachedVersion
}

export function getCabbyVersionHeaders(): Record<string, string> {
  return { [CABBY_VERSION_HEADER]: getCabbyVersion() }
}

/** Test helper: clear the cached version string. */
export function resetCabbyVersionCache(): void {
  cachedVersion = undefined
}
