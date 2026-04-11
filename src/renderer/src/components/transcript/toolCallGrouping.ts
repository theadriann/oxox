type ToolLikeItem = {
  id: string
  toolName: string
}

export type GroupedToolRenderItem<T> =
  | { kind: 'item'; id: string; item: T }
  | { kind: 'tool-group'; id: string; items: T[] }

export function groupConsecutiveToolItems<T extends ToolLikeItem>(
  items: T[],
): GroupedToolRenderItem<T>[] {
  const groupedItems: GroupedToolRenderItem<T>[] = []
  let currentGroup: T[] = []

  const flushGroup = () => {
    if (currentGroup.length === 0) {
      return
    }

    if (currentGroup.length === 1) {
      const [item] = currentGroup
      if (item) {
        groupedItems.push({ kind: 'item', id: item.id, item })
      }
    } else {
      groupedItems.push({
        kind: 'tool-group',
        id: `tool-group:${currentGroup[0]?.id ?? groupedItems.length}`,
        items: currentGroup,
      })
    }

    currentGroup = []
  }

  for (const item of items) {
    currentGroup.push(item)
  }

  flushGroup()

  return groupedItems
}

export function summarizeToolNames(toolNames: string[], previewLimit = 4): string {
  const uniqueNames = toolNames.filter((toolName, index) => toolNames.indexOf(toolName) === index)
  const visibleNames = uniqueNames.slice(0, previewLimit)
  const hiddenCount = uniqueNames.length - visibleNames.length

  if (hiddenCount <= 0) {
    return visibleNames.join(', ')
  }

  return `${visibleNames.join(', ')}, +${hiddenCount} more`
}
