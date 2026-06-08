// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import type { ComposerImageAttachment } from '../../../state/composer/composer.types'
import type { ComposerContextUsageState } from '../../../state/composer/composer-context-usage.selectors'

import { SessionComposer } from '../SessionComposer'

function ControlledComposer({
  status = 'idle',
  isAttached = true,
  canAttach = true,
  onAttach = () => undefined,
  onInterrupt = () => undefined,
  onSubmit = () => undefined,
  composerContextUsage = null,
  composerContextUsageDisplayMode = 'percentage',
  workspaceFileSearch,
  availableModels = [
    {
      id: 'gpt-5.4',
      name: 'GPT 5.4',
      supportedReasoningEfforts: ['medium', 'high'],
      defaultReasoningEffort: 'medium',
    },
    { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
  ],
}: {
  status?: 'idle' | 'active' | 'waiting' | 'completed' | 'reconnecting' | 'error' | 'orphaned'
  isAttached?: boolean
  canAttach?: boolean
  onAttach?: () => void
  onInterrupt?: () => void
  onSubmit?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
    reasoningEffort?: string
    images?: Array<{ type: 'base64'; data: string; mediaType: 'image/png' }>
  }) => void
  composerContextUsage?: ComposerContextUsageState | null
  composerContextUsageDisplayMode?: 'percentage' | 'tokens'
  workspaceFileSearch?: ComponentProps<typeof SessionComposer>['workspaceFileSearch']
  availableModels?: Array<{
    id: string
    name: string
    supportedReasoningEfforts?: string[]
    defaultReasoningEffort?: string
  }>
}) {
  const [draft, setDraft] = useState('')
  const [modelId, setModelId] = useState('gpt-5.4')
  const [interactionMode, setInteractionMode] = useState('auto')
  const [reasoningEffort, setReasoningEffort] = useState('medium')
  const [autonomyLevel, setAutonomyLevel] = useState('medium')
  const [imageAttachments, setImageAttachments] = useState<ComposerImageAttachment[]>([])

  const modelPickerViewModel = {
    categories: [
      { id: 'favorites', label: 'Favorites', count: 0 },
      { id: 'factory', label: 'Factory AI', count: availableModels.length },
      { id: 'custom', label: 'Custom', count: 0 },
    ],
    activeCategory: 'factory',
    filteredModels: availableModels,
    searchQuery: '',
    selectedModelId: modelId,
    favoriteModelIds: [],
  }

  return (
    <SessionComposer
      availableModels={availableModels}
      canAttach={canAttach}
      draft={draft}
      isAttached={isAttached}
      isAttaching={false}
      isInterrupting={false}
      isSubmitting={false}
      composerContextUsage={composerContextUsage}
      composerContextUsageDisplayMode={composerContextUsageDisplayMode}
      workspaceFileSearch={workspaceFileSearch}
      selectedAutonomyLevel={autonomyLevel}
      imageAttachments={imageAttachments}
      selectedMode={interactionMode}
      selectedModelId={modelId}
      selectedReasoningEffort={reasoningEffort}
      status={status}
      modelPickerViewModel={modelPickerViewModel}
      onAttach={onAttach}
      onAutonomyLevelChange={setAutonomyLevel}
      onDraftChange={setDraft}
      onImageAttachmentRemove={(attachmentId) => {
        setImageAttachments((current) =>
          current.filter((attachment) => attachment.id !== attachmentId),
        )
      }}
      onImageAttachmentsClear={() => setImageAttachments([])}
      onImageAttachmentsAdd={(attachments) => {
        setImageAttachments((current) => [...current, ...attachments])
      }}
      onInterrupt={onInterrupt}
      onModeChange={setInteractionMode}
      onModelChange={setModelId}
      onReasoningEffortChange={setReasoningEffort}
      onModelPickerSearchChange={() => undefined}
      onModelPickerToggleFavorite={() => undefined}
      onModelPickerCategoryChange={() => undefined}
      onSubmit={onSubmit}
    />
  )
}

describe('SessionComposer', () => {
  it('submits via the send button with the selected model, mode, and autonomy level', () => {
    const onSubmit = vi.fn()

    render(<ControlledComposer onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/Message composer/i), {
      target: { value: 'Send with the composer button' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Send message/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Send with the composer button',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      reasoningEffort: 'medium',
      autonomyLevel: 'medium',
    })
  })

  it('opens a workspace file popover after an @ token and hides it after whitespace', () => {
    const onQueryChange = vi.fn()

    render(
      <ControlledComposer
        workspaceFileSearch={{
          enabled: true,
          files: ['src/App.tsx', 'src/main.ts'],
          isLoading: false,
          onQueryChange,
        }}
      />,
    )

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    fireEvent.change(composer, {
      target: { value: 'Review @sr', selectionStart: 10, selectionEnd: 10 },
    })

    expect(onQueryChange).toHaveBeenLastCalledWith('sr')
    expect(screen.getByRole('listbox', { name: /Workspace files/i })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'src/App.tsx' })).toBeTruthy()
    expect(screen.queryByText('Workspace files')).toBeNull()
    expect(screen.getByTestId('workspace-file-search-panel').className).toContain('border-b')

    fireEvent.change(composer, {
      target: { value: 'Review @sr ', selectionStart: 11, selectionEnd: 11 },
    })

    expect(screen.queryByRole('listbox', { name: /Workspace files/i })).toBeNull()
  })

  it('shows workspace file scroll gradients only where more results remain', () => {
    render(
      <ControlledComposer
        workspaceFileSearch={{
          enabled: true,
          files: Array.from({ length: 12 }, (_, index) => `src/file-${index}.ts`),
          isLoading: false,
          onQueryChange: vi.fn(),
        }}
      />,
    )

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    fireEvent.change(composer, {
      target: { value: '@src', selectionStart: 4, selectionEnd: 4 },
    })

    const listbox = screen.getByRole('listbox', { name: /Workspace files/i })
    expect(screen.queryByTestId('workspace-file-search-top-shadow')).toBeNull()
    expect(screen.getByTestId('workspace-file-search-bottom-shadow')).toBeTruthy()

    Object.defineProperty(listbox, 'scrollTop', { configurable: true, value: 40 })
    Object.defineProperty(listbox, 'clientHeight', { configurable: true, value: 120 })
    Object.defineProperty(listbox, 'scrollHeight', { configurable: true, value: 240 })
    fireEvent.scroll(listbox)

    expect(screen.getByTestId('workspace-file-search-top-shadow')).toBeTruthy()
    expect(screen.getByTestId('workspace-file-search-bottom-shadow')).toBeTruthy()

    Object.defineProperty(listbox, 'scrollTop', { configurable: true, value: 120 })
    fireEvent.scroll(listbox)

    expect(screen.getByTestId('workspace-file-search-top-shadow')).toBeTruthy()
    expect(screen.queryByTestId('workspace-file-search-bottom-shadow')).toBeNull()
  })

  it('replaces the active @ token with a reusable @ file mention and preserves image payloads', async () => {
    const onSubmit = vi.fn()
    const onQueryChange = vi.fn()
    const imageFile = new File(['fake image'], 'attached.png', { type: 'image/png' })

    render(
      <ControlledComposer
        onSubmit={onSubmit}
        workspaceFileSearch={{
          enabled: true,
          files: ['src/App.tsx'],
          isLoading: false,
          onQueryChange,
        }}
      />,
    )

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    fireEvent.paste(composer, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
      },
    })
    expect(await screen.findByAltText('attached.png attachment preview')).toBeTruthy()

    fireEvent.change(composer, {
      target: { value: 'Review @ap', selectionStart: 10, selectionEnd: 10 },
    })
    fireEvent.click(screen.getByRole('option', { name: 'src/App.tsx' }))

    expect(composer.value).toBe('Review @src/App.tsx ')

    fireEvent.select(composer, {
      target: { selectionStart: 19, selectionEnd: 19 },
    })

    expect(onQueryChange).toHaveBeenLastCalledWith('src/App.tsx')
    expect(screen.getByRole('listbox', { name: /Workspace files/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Send message/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Review @src/App.tsx',
          images: [
            expect.objectContaining({
              type: 'base64',
              mediaType: 'image/png',
            }),
          ],
        }),
      )
    })
  })

  it('does not show workspace file mentions when the selected session is not daemon-backed', () => {
    const onQueryChange = vi.fn()

    render(
      <ControlledComposer
        workspaceFileSearch={{
          enabled: false,
          files: ['src/App.tsx'],
          isLoading: false,
          onQueryChange,
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Message composer/i), {
      target: { value: '@sr', selectionStart: 3, selectionEnd: 3 },
    })

    expect(onQueryChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox', { name: /Workspace files/i })).toBeNull()
  })

  it('attaches pasted image clipboard data and submits it with the message payload', async () => {
    const onSubmit = vi.fn()
    const imageFile = new File(['fake image'], 'screenshot.png', { type: 'image/png' })

    render(<ControlledComposer onSubmit={onSubmit} />)

    const composer = screen.getByLabelText(/Message composer/i)
    fireEvent.paste(composer, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
      },
    })

    expect(await screen.findByAltText('screenshot.png attachment preview')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Clear all image attachments/i })).toBeNull()

    fireEvent.change(composer, {
      target: { value: 'Describe this screenshot' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Describe this screenshot',
          images: [
            expect.objectContaining({
              type: 'base64',
              mediaType: 'image/png',
            }),
          ],
        }),
      )
    })
  })

  it('attaches dropped image files and removes attachments before submit', async () => {
    const onSubmit = vi.fn()
    const imageFile = new File(['fake image'], 'drop.png', { type: 'image/png' })

    render(<ControlledComposer onSubmit={onSubmit} />)

    const composer = screen.getByLabelText(/Message composer/i)
    fireEvent.drop(composer, {
      dataTransfer: {
        files: [imageFile],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile,
          },
        ],
      },
    })

    expect(await screen.findByAltText('drop.png attachment preview')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Remove drop.png attachment/i }))
    await waitFor(() => {
      expect(screen.queryByAltText('drop.png attachment preview')).toBeNull()
    })

    fireEvent.change(composer, {
      target: { value: 'No image now' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'No image now',
      }),
    )
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('images')
  })

  it('appends dropped non-image file paths to the draft', () => {
    const documentFile = createDroppedFileWithPath(
      ['notes'],
      'Dia Recovery Kit.pdf',
      'text/plain',
      '/Users/brojbean/Documents/Dia Recovery Kit.pdf',
    )

    render(<ControlledComposer />)

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    fireEvent.change(composer, {
      target: { value: 'Review this file:' },
    })
    fireEvent.drop(composer, {
      dataTransfer: {
        files: [documentFile],
        items: [
          {
            kind: 'file',
            type: 'text/plain',
            getAsFile: () => documentFile,
          },
        ],
      },
    })

    expect(composer.value).toBe(
      'Review this file:\n"/Users/brojbean/Documents/Dia Recovery Kit.pdf"',
    )
  })

  it('uses the Electron bridge to resolve dropped file paths when File.path is unavailable', () => {
    const previousOxox = Reflect.get(window, 'oxox')
    const documentFile = new File(['notes'], 'notes.txt', { type: 'text/plain' })

    window.oxox = {
      dialog: {
        selectDirectory: vi.fn(),
        getPathForFile: vi.fn(() => '/Users/brojbean/Documents/Dia Recovery Kit.pdf'),
      },
    } as unknown as typeof window.oxox

    try {
      render(<ControlledComposer />)

      const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
      fireEvent.drop(composer, {
        dataTransfer: {
          files: [documentFile],
          items: [
            {
              kind: 'file',
              type: 'text/plain',
              getAsFile: () => documentFile,
            },
          ],
        },
      })

      expect(window.oxox.dialog.getPathForFile).toHaveBeenCalledWith(documentFile)
      expect(composer.value).toBe('"/Users/brojbean/Documents/Dia Recovery Kit.pdf"')
    } finally {
      if (previousOxox) {
        window.oxox = previousOxox
      } else {
        Reflect.deleteProperty(window, 'oxox')
      }
    }
  })

  it('handles mixed dropped image attachments and non-image file paths', async () => {
    const imageFile = createDroppedFileWithPath(
      ['fake image'],
      'screenshot.png',
      'image/png',
      '/Users/adrian/project/screenshot.png',
    )
    const sourceFile = createDroppedFileWithPath(
      ['source'],
      'index.ts',
      'video/mp2t',
      '/Users/adrian/project/src/index with spaces.ts',
    )
    const folderEntry = createDroppedFileWithPath(
      [],
      'fixtures',
      '',
      '/Users/adrian/project/fixtures',
    )

    render(<ControlledComposer />)

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    fireEvent.drop(composer, {
      dataTransfer: {
        files: [imageFile, sourceFile, folderEntry],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile,
          },
          {
            kind: 'file',
            type: 'video/mp2t',
            getAsFile: () => sourceFile,
          },
          {
            kind: 'file',
            type: '',
            getAsFile: () => folderEntry,
          },
        ],
      },
    })

    expect(await screen.findByAltText('screenshot.png attachment preview')).toBeTruthy()
    expect(composer.value).toBe(
      '"/Users/adrian/project/src/index with spaces.ts"\n"/Users/adrian/project/fixtures"',
    )
  })

  it('shows a clear-all action for multiple image attachments', async () => {
    const firstImage = new File(['fake image 1'], 'first.png', { type: 'image/png' })
    const secondImage = new File(['fake image 2'], 'second.png', { type: 'image/png' })

    render(<ControlledComposer />)

    fireEvent.drop(screen.getByLabelText(/Message composer/i), {
      dataTransfer: {
        files: [firstImage, secondImage],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => firstImage,
          },
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => secondImage,
          },
        ],
      },
    })

    expect(await screen.findByAltText('first.png attachment preview')).toBeTruthy()
    expect(await screen.findByAltText('second.png attachment preview')).toBeTruthy()

    const clearAllButton = screen.getByRole('button', { name: /Clear all image attachments/i })
    expect(clearAllButton.parentElement?.className).toContain('justify-start')
    expect(screen.getByTestId('image-attachment-container').className).toContain('max-h-[150px]')
    expect(screen.getByTestId('image-attachment-container').className).toContain('overflow-y-auto')

    fireEvent.click(clearAllButton)

    await waitFor(() => {
      expect(screen.queryByAltText('first.png attachment preview')).toBeNull()
      expect(screen.queryByAltText('second.png attachment preview')).toBeNull()
    })
  })

  it('shows reasoning effort selection only when the selected model supports it', () => {
    const { rerender } = render(<ControlledComposer />)

    expect(screen.getByRole('combobox', { name: /Reasoning effort selector/i })).toBeTruthy()

    rerender(
      <ControlledComposer availableModels={[{ id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' }]} />,
    )

    expect(screen.queryByRole('combobox', { name: /Reasoning effort selector/i })).toBeNull()
  })

  it('allows drafting and submitting a queued message while showing the working-state stop action', () => {
    const onInterrupt = vi.fn()
    const onSubmit = vi.fn()
    render(
      <ControlledComposer
        isAttached={true}
        onInterrupt={onInterrupt}
        onSubmit={onSubmit}
        status="active"
      />,
    )

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement

    expect(screen.getByText(/Generating/i)).toBeTruthy()
    expect(composer.disabled).toBe(false)

    fireEvent.change(composer, {
      target: { value: 'Queue this next' },
    })
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Queue this next',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      reasoningEffort: 'medium',
      autonomyLevel: 'medium',
    })

    fireEvent.click(screen.getByRole('button', { name: /Stop generation/i }))
    expect(onInterrupt).toHaveBeenCalledTimes(1)
  })

  it('disables the composer when the selected session is completed', () => {
    render(<ControlledComposer canAttach={false} isAttached={false} status="completed" />)

    expect(screen.getByText(/Session ended/i)).toBeTruthy()
    expect((screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('enables the detached composer and send action when the session can still attach', () => {
    const onSubmit = vi.fn()

    render(<ControlledComposer canAttach={true} isAttached={false} onSubmit={onSubmit} />)

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    const sendButton = screen.getByRole('button', { name: /Send message/i }) as HTMLButtonElement

    expect(composer.disabled).toBe(false)
    expect(sendButton.disabled).toBe(true)

    fireEvent.change(composer, {
      target: { value: 'Auto attach from send' },
    })
    fireEvent.click(sendButton)

    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Auto attach from send',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      reasoningEffort: 'medium',
      autonomyLevel: 'medium',
    })
  })

  it('shows reconnect guidance when the live connection is lost or orphaned', () => {
    const onAttach = vi.fn()
    const { rerender } = render(
      <ControlledComposer
        canAttach={true}
        isAttached={true}
        onAttach={onAttach}
        status={'reconnecting' as never}
      />,
    )

    expect(screen.getByText(/Reconnecting/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reconnect$/i }))
    expect(onAttach).toHaveBeenCalledTimes(1)

    rerender(
      <ControlledComposer
        canAttach={true}
        isAttached={false}
        onAttach={onAttach}
        status={'orphaned' as never}
      />,
    )

    expect(screen.getByText(/Reconnect to continue/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reconnect$/i })).toBeTruthy()
  })

  it('shows a context usage percentage next to send and exposes the full breakdown in a tooltip', async () => {
    render(
      <ControlledComposer
        composerContextUsage={{
          contextLimit: 258000,
          usedContext: 78000,
          remainingContext: 180000,
          usedPercentage: 30,
          accuracy: 'estimated',
          source: 'sdk-context-stats',
          totalProcessedTokens: 298000,
        }}
      />,
    )

    expect(screen.getByText('30%')).toBeTruthy()
    const contextUsageButton = screen.getByRole('button', { name: /Context usage/i })

    expect(contextUsageButton.getAttribute('title')).toMatch(/78k\/258k context used/i)
    expect(contextUsageButton.getAttribute('title')).toMatch(/Estimated actual context in use/i)
    expect(contextUsageButton.getAttribute('title')).toMatch(/Total processed: 298k tokens/i)
  })

  it('omits total processed from the context tooltip when token processing totals are unavailable', () => {
    render(
      <ControlledComposer
        composerContextUsage={{
          contextLimit: 300000,
          usedContext: 300000,
          remainingContext: 0,
          usedPercentage: 100,
          accuracy: 'estimated',
          source: 'sdk-context-stats',
          totalProcessedTokens: null,
        }}
      />,
    )

    const contextUsageButton = screen.getByRole('button', { name: /Context usage/i })

    expect(contextUsageButton.getAttribute('title')).toMatch(/300k\/300k context used/i)
    expect(contextUsageButton.getAttribute('title')).not.toMatch(/Total processed/i)
  })

  it('shows a placeholder instead of guessing when exact context usage is unavailable', () => {
    render(<ControlledComposer />)

    expect(screen.getByText('--')).toBeTruthy()
  })

  it('suppresses the global orange focus ring on the message input', () => {
    render(<ControlledComposer />)

    const composer = screen.getByLabelText(/Message composer/i)

    expect(composer.className).toContain('focus-visible:shadow-none')
  })
})

function createDroppedFileWithPath(
  bits: BlobPart[],
  name: string,
  type: string,
  path: string,
): File {
  const file = new File(bits, name, { type })
  Object.defineProperty(file, 'path', {
    value: path,
    configurable: true,
  })
  return file
}
