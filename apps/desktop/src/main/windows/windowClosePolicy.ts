export type WindowCloseSource = 'system-close' | 'command-close'
export type WindowCloseAction = 'close' | 'hide'

export interface WindowClosePolicyInput {
  isAppQuitting: boolean
  source: WindowCloseSource
  windowCount: number
}

export function getWindowCloseAction({
  isAppQuitting,
  windowCount,
}: WindowClosePolicyInput): WindowCloseAction {
  if (isAppQuitting) {
    return 'close'
  }

  if (windowCount > 1) {
    return 'close'
  }

  return 'hide'
}
