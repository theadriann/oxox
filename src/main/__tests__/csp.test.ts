import { describe, expect, it } from 'vitest'

import { getContentSecurityPolicy } from '../security/csp'

describe('getContentSecurityPolicy', () => {
  it('keeps production scripts strict with no dev connections', () => {
    const productionPolicy = getContentSecurityPolicy(false)

    expect(productionPolicy).toContain("default-src 'self'")
    expect(productionPolicy).toContain("script-src 'self'")
    expect(productionPolicy).toContain("connect-src 'self'")
    expect(productionPolicy).toContain("worker-src 'self'")
    expect(productionPolicy).not.toContain('unsafe-eval')
    expect(productionPolicy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(productionPolicy).not.toContain('ws://localhost')
    expect(productionPolicy).not.toContain('blob:')
  })

  it('allows inline scripts, blob workers, and dev connections in development', () => {
    const developmentPolicy = getContentSecurityPolicy(true)

    expect(developmentPolicy).toContain("script-src 'self' 'unsafe-inline'")
    expect(developmentPolicy).toContain(
      "connect-src 'self' ws://localhost:3105 http://localhost:3105",
    )
    expect(developmentPolicy).toContain("worker-src 'self' blob:")
    expect(developmentPolicy).not.toContain('unsafe-eval')
  })
})
