import type { ReactNode } from 'react'
import { Button } from './Button'

export function InfoDialog({
  title,
  message,
  onClose,
}: {
  title: string
  message: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-void/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-panel px-5 py-5">
        <h2
          id="info-title"
          className="font-display text-2xl font-extrabold uppercase"
        >
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted">{message}</div>
        <div className="mt-5">
          <Button variant="ghost" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}
