import type { ReactNode } from 'react'
import { Button } from './Button'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-void/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        onClick={onCancel}
        aria-label="Cancel"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-panel px-5 py-5">
        <h2
          id="confirm-title"
          className="font-display text-2xl font-extrabold uppercase"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm text-muted">{message}</p>
        <div className="mt-5 space-y-2">
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
