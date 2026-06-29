// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ContentContainer } from '../ContentContainer'

describe('ContentContainer', () => {
  it('constrains fixed content with shared middle-column gutters', () => {
    render(
      <ContentContainer layout="fixed">
        <div>Fixed content</div>
      </ContentContainer>,
    )

    const container = screen.getByText('Fixed content').parentElement

    expect(container?.className).toContain('mx-auto')
    expect(container?.className).toContain('w-full')
    expect(container?.className).toContain('px-4')
    expect(container?.className).toContain('max-w-5xl')
  })

  it('keeps fluid content full width with shared middle-column gutters', () => {
    render(
      <ContentContainer layout="fluid">
        <div>Fluid content</div>
      </ContentContainer>,
    )

    const container = screen.getByText('Fluid content').parentElement

    expect(container?.className).toContain('mx-auto')
    expect(container?.className).toContain('w-full')
    expect(container?.className).toContain('px-4')
    expect(container?.className).not.toContain('max-w-5xl')
  })
})
