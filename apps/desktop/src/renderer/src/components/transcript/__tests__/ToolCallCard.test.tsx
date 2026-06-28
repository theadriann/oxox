// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { ToolCallCard } from '../ToolCallCard'

describe('ToolCallCard', () => {
  it('renders ApplyPatch tool calls with PatchDiffPreview', () => {
    function TestHarness() {
      const [expanded, setExpanded] = useState(false)

      return (
        <ToolCallCard
          entry={{
            kind: 'tool_call',
            id: 'tool-apply-patch',
            toolUseId: 'tool-apply-patch',
            occurredAt: '2026-03-26T01:00:00.000Z',
            toolName: 'ApplyPatch',
            status: 'completed',
            inputMarkdown:
              '```json\n{\n  "input": "*** Begin Patch\\n*** Update File: /tmp/example.tsx\\n@@\\n-const oldValue = 1\\n+const nextValue = 1\\n console.log(nextValue)\\n*** End Patch\\n"\n}\n```',
            resultMarkdown:
              '```json\n{"success":true,"content":"const nextValue = 1\\nconsole.log(nextValue)"}\n```',
            resultIsError: false,
          }}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
      )
    }

    render(<TestHarness />)

    fireEvent.click(screen.getByRole('button', { name: /toggle details for applypatch/i }))

    // Should show the patch summary badge
    expect(screen.getByText('Edited')).toBeTruthy()
    // Should show the file name in the diff header
    expect(screen.getAllByText('example.tsx').length).toBeGreaterThanOrEqual(1)
    // Should show the full file path
    expect(screen.getByText('/tmp/example.tsx')).toBeTruthy()
    // Should NOT show generic Input section (diff view replaces it)
    expect(screen.queryByText('Input')).toBeNull()
    // Should show success status instead of raw result JSON
    expect(screen.getByText('Applied successfully')).toBeTruthy()
  })

  it('renders Edit tool calls with EditDiffView', () => {
    function TestHarness() {
      const [expanded, setExpanded] = useState(false)

      return (
        <ToolCallCard
          entry={{
            kind: 'tool_call',
            id: 'tool-edit',
            toolUseId: 'tool-edit',
            occurredAt: '2026-03-26T01:00:00.000Z',
            toolName: 'Edit',
            status: 'completed',
            inputMarkdown:
              '```json\n{\n  "file_path": "/src/components/App.tsx",\n  "old_str": "const x = 1",\n  "new_str": "const x = 2"\n}\n```',
            resultMarkdown: 'File edited successfully.',
            resultIsError: false,
          }}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
      )
    }

    render(<TestHarness />)

    // Should show context label in collapsed state
    expect(screen.getByText('App.tsx')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /toggle details for edit/i }))

    // Should show the diff header with file name
    expect(screen.getAllByText('App.tsx').length).toBeGreaterThanOrEqual(1)
    // Should show the full path
    expect(screen.getByText('/src/components/App.tsx')).toBeTruthy()
    // Should show success status instead of raw result
    expect(screen.getByText('Applied successfully')).toBeTruthy()
  })

  it('renders generic tool calls with Input/Result sections', () => {
    function TestHarness() {
      const [expanded, setExpanded] = useState(false)

      return (
        <ToolCallCard
          entry={{
            kind: 'tool_call',
            id: 'tool-read',
            toolUseId: 'tool-read',
            occurredAt: '2026-03-26T01:00:00.000Z',
            toolName: 'Read',
            status: 'completed',
            inputMarkdown: '```json\n{\n  "file_path": "/tmp/test.ts"\n}\n```',
            resultMarkdown: 'File contents loaded.',
            resultIsError: false,
          }}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
      )
    }

    render(<TestHarness />)

    fireEvent.click(screen.getByRole('button', { name: /toggle details for read/i }))

    // Generic tools show Input and Result sections
    expect(screen.getByText('Input')).toBeTruthy()
    expect(screen.getByText('Result')).toBeTruthy()
    expect(screen.getByText('File contents loaded.')).toBeTruthy()
  })
})
