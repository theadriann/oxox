import { Button } from '../ui/button'
import type { PermissionTimelineItem, RiskLevel } from './timelineTypes'

function formatRiskLevel(riskLevel: RiskLevel): string {
  if (riskLevel === 'unknown') return 'Risk pending'
  return `${riskLevel} risk`
}

function isDenyOption(option: string): boolean {
  return option === 'cancel' || option.includes('deny')
}

function selectApproveOption(options: string[]): string | null {
  return options.find((option) => !isDenyOption(option)) ?? options[0] ?? null
}

function selectDenyOption(options: string[]): string | null {
  return options.find((option) => isDenyOption(option)) ?? options.at(-1) ?? null
}

function getDecisionLabel(selectedOption: string | null): string {
  if (!selectedOption) return 'Decision recorded'
  return isDenyOption(selectedOption) ? 'Denied' : 'Approved'
}

export function PermissionCard({
  item,
  isPending,
  onResolve,
}: {
  item: PermissionTimelineItem
  isPending: boolean
  onResolve?: (payload: { requestId: string; selectedOption: string }) => void
}) {
  const approveOption = selectApproveOption(item.options)
  const denyOption = selectDenyOption(item.options)
  const decisionLabel = getDecisionLabel(item.selectedOption)
  const isResolved = item.selectedOption !== null
  const areActionsDisabled = isPending || isResolved || !onResolve || !approveOption || !denyOption

  return (
    <article
      data-testid={`permission-card-${item.requestId}`}
      className="rounded-md border border-fd-warning/20 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
            Permission request
          </span>
          <span className="text-[10px] capitalize text-fd-warning">
            {formatRiskLevel(item.riskLevel)}
          </span>
        </div>
        <span className="font-mono text-[10px] text-fd-tertiary">{item.requestId}</span>
      </div>

      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-fd-primary">
        {item.description}
      </p>

      {item.toolUseIds.length > 0 ? (
        <p className="mt-1.5 font-mono text-[10px] text-fd-tertiary">
          Tools: {item.toolUseIds.join(', ')}
        </p>
      ) : null}

      {isResolved ? (
        <div className="mt-2 flex items-center gap-1.5 text-[13px]">
          <span className="font-medium text-fd-ready">{decisionLabel}</span>
          {item.selectedOption ? (
            <span className="text-fd-tertiary">({item.selectedOption})</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          disabled={areActionsDisabled}
          onClick={() => {
            if (!approveOption || !onResolve) return
            onResolve({ requestId: item.requestId, selectedOption: approveOption })
          }}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={areActionsDisabled}
          onClick={() => {
            if (!denyOption || !onResolve) return
            onResolve({ requestId: item.requestId, selectedOption: denyOption })
          }}
        >
          Deny
        </Button>
      </div>
    </article>
  )
}
