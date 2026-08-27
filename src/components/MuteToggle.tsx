import { isMuted, setMuted, unlockAudio } from '../audio'
import { cn } from '../cn'
import { useState } from 'react'

export function MuteToggle({ className }: { className?: string }) {
  const [muted, setMutedState] = useState(() => isMuted())

  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute alerts' : 'Mute alerts'}
      onClick={() => {
        const next = !muted
        setMuted(next)
        setMutedState(next)
        if (!next) unlockAudio()
      }}
      className={cn(
        'grid h-11 w-11 place-items-center rounded-full border border-line bg-panel-2 text-lg',
        className,
      )}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
