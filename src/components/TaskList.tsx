import { useState } from 'react'
import { cn } from '../cn'
import type { Task } from '../types'

export function TaskList({
  tasks,
  onToggle,
  disabled,
}: {
  tasks: Task[]
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        No tasks yet. The host can add some in the lobby.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className={cn(
            'rounded-2xl border transition',
            task.done ? 'border-ok/30 bg-ok/10' : 'border-line bg-panel-2/80',
          )}
        >
          <div className="flex items-start gap-3 px-3 py-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(task.id)}
              aria-label={`${task.done ? 'Mark incomplete' : 'Complete'}: ${task.text}`}
              className={cn(
                'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-black',
                task.done
                  ? 'border-ok bg-ok text-void'
                  : 'border-muted/40 bg-transparent text-transparent',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
              aria-expanded={expandedId === task.id}
              aria-controls={`task-details-${task.id}`}
              className="min-w-0 flex-1 text-left"
            >
              <span className="mb-1 inline-flex rounded-full bg-crew/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-crew">
                {task.room}
              </span>
              <span
                className={cn(
                  'block font-semibold leading-snug',
                  task.done ? 'text-muted line-through' : 'text-fog',
                )}
              >
                {task.text}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {expandedId === task.id ? 'Hide details' : 'Show details'}
              </span>
            </button>
          </div>
          {expandedId === task.id ? (
            <div
              id={`task-details-${task.id}`}
              className="border-t border-line/70 px-4 py-3 text-sm leading-relaxed text-muted"
            >
              {task.details || 'No extra details for this task.'}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
