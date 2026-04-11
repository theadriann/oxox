import { useEffect, useState } from 'react'

import { Button } from '../ui/button'
import type { AskUserTimelineItem } from './timelineTypes'

export function AskUserCard({
  item,
  isPending,
  onSubmit,
}: {
  item: AskUserTimelineItem
  isPending: boolean
  onSubmit?: (payload: {
    requestId: string
    answers: Array<{ index: number; question: string; answer: string }>
  }) => void
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (item.submittedAnswers ?? item.questions).map((entry) => [
        entry.index,
        'answer' in entry ? entry.answer : '',
      ]),
    ),
  )
  const isResolved = item.submittedAnswers !== null

  useEffect(() => {
    if (isResolved) {
      setDrafts(
        Object.fromEntries(
          (item.submittedAnswers ?? []).map((answer) => [answer.index, answer.answer]),
        ),
      )
    }
  }, [isResolved, item.submittedAnswers])

  const questions = item.questions.length
    ? item.questions
    : [
        {
          index: 0,
          topic: 'Question',
          question: item.prompt,
          options: item.options,
        },
      ]

  const canSubmit = questions.every((question) => (drafts[question.index] ?? '').trim().length > 0)

  return (
    <article
      data-testid={`ask-user-card-${item.requestId}`}
      className="rounded-md border border-fd-ember-400/20 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
          Ask user
        </span>
        <span className="font-mono text-[10px] text-fd-tertiary">{item.requestId}</span>
      </div>

      {isResolved ? (
        <div className="mt-2 flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
            Submitted answer
          </span>
          {item.submittedAnswers?.map((answer) => (
            <div key={`${item.requestId}-${answer.index}`} className="flex flex-col gap-0.5">
              <p className="text-[12px] text-fd-tertiary">{answer.question}</p>
              <p className="text-[13px] text-fd-secondary">{answer.answer}</p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-col gap-3">
            {questions.map((question, index) => (
              <div key={`${item.requestId}-${question.index}`} className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-0.5">
                  {question.topic ? (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
                      {question.topic}
                    </span>
                  ) : null}
                  <p className="whitespace-pre-wrap text-[13px] leading-5 text-fd-primary">
                    {question.question}
                  </p>
                  {question.options.length > 0 ? (
                    <p className="text-[10px] text-fd-tertiary">
                      Options: {question.options.join(', ')}
                    </p>
                  ) : null}
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
                    Your answer
                  </span>
                  <input
                    aria-label={`Answer for ${item.requestId} question ${index + 1}`}
                    className="h-8 w-full rounded-md border border-fd-border-default bg-fd-panel px-2.5 text-[13px] text-fd-primary outline-none transition-colors focus:border-fd-ember-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending || !onSubmit}
                    value={drafts[question.index] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [question.index]: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="mt-2">
            <Button
              type="button"
              size="xs"
              disabled={isPending || !onSubmit || !canSubmit}
              onClick={() => {
                if (!onSubmit || !canSubmit) return
                onSubmit({
                  requestId: item.requestId,
                  answers: questions.map((question) => ({
                    index: question.index,
                    question: question.question,
                    answer: (drafts[question.index] ?? '').trim(),
                  })),
                })
              }}
            >
              Submit response
            </Button>
          </div>
        </>
      )}
    </article>
  )
}
