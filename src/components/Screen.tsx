import type { ReactNode } from 'react'
import { cn } from '../cn'

export function Screen({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="app-bg min-h-dvh">
      <div
        className={cn(
          'mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
