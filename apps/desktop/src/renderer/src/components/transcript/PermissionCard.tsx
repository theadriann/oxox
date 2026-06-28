import { Button } from '../ui/button'
import type {
  PermissionOptionTimelineItem,
  PermissionTimelineItem,
  RiskLevel,
} from './timelineTypes'

function formatRiskLevel(riskLevel: RiskLevel): string {
  if (riskLevel === 'unknown') return 'Risk pending'
  return `${riskLevel} risk`
}

function isDenyOption(option: PermissionOptionTimelineItem): boolean {
  const value = option.value.toLowerCase()
  const label = option.label.toLowerCase()
  return value === 'cancel' || value.includes('deny') || label.includes('deny')
}

function getOptionTone(option: PermissionOptionTimelineItem): 'approve' | 'deny' {
  return isDenyOption(option) ? 'deny' : 'approve'
}

function findSelectedOption(
  options: PermissionOptionTimelineItem[],
  selectedOption: string | null,
): PermissionOptionTimelineItem | null {
  if (!selectedOption) return null
  return options.find((option) => option.value === selectedOption) ?? null
}

function getDecisionLabel(
  selectedOption: string | null,
  option: PermissionOptionTimelineItem | null,
): string {
  if (!selectedOption) return 'Decision recorded'
  return option && isDenyOption(option) ? 'Denied' : 'Approved'
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
  const selectedOption = findSelectedOption(item.options, item.selectedOption)
  const decisionLabel = getDecisionLabel(item.selectedOption, selectedOption)
  const isResolved = item.selectedOption !== null
  const areActionsDisabled = isPending || isResolved || !onResolve || item.options.length === 0

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
            <span className="text-fd-tertiary">
              ({selectedOption?.label ?? item.selectedOption})
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={getOptionTone(option) === 'deny' ? 'secondary' : 'default'}
            disabled={areActionsDisabled}
            onClick={() => {
              if (!onResolve) return
              onResolve({ requestId: item.requestId, selectedOption: option.value })
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </article>
  )
}
