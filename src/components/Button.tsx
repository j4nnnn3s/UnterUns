import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../cn'

type Variant = 'primary' | 'ghost' | 'emergency' | 'report' | 'crew' | 'danger'
type Size = 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-fog text-void hover:bg-white active:scale-[0.98] shadow-[0_0_24px_rgba(244,241,255,0.12)]',
  ghost:
    'bg-panel-2/80 text-fog border border-line hover:border-fog/40 active:scale-[0.98]',
  emergency:
    'bg-imposter text-white shadow-[0_0_40px_rgba(255,53,87,0.35)] hover:brightness-110 active:scale-[0.98]',
  report:
    'bg-warn text-void shadow-[0_0_36px_rgba(255,176,32,0.3)] hover:brightness-110 active:scale-[0.98]',
  crew: 'bg-crew text-void hover:brightness-110 active:scale-[0.98] shadow-[0_0_28px_rgba(62,224,255,0.25)]',
  danger:
    'bg-transparent text-imposter border border-imposter/40 hover:bg-imposter/10',
}

const sizes: Record<Size, string> = {
  md: 'min-h-12 px-4 text-base',
  lg: 'min-h-14 px-5 text-lg',
  xl: 'min-h-[4.75rem] px-6 text-xl',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'w-full rounded-2xl font-bold tracking-wide transition disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
