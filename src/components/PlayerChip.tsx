import { cn } from '../cn'
import type { Player } from '../types'

export function PlayerChip({
  player,
  you,
}: {
  player: Player
  you?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel-2/70 px-3 py-3">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold text-void"
        style={{ backgroundColor: player.color, borderColor: '#ffffff55' }}
      >
        {player.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-fog">
          {player.name}
          {you ? <span className="ml-2 text-xs font-medium text-muted">you</span> : null}
        </p>
        {player.isHost ? (
          <p className="text-xs uppercase tracking-[0.18em] text-warn">Host</p>
        ) : null}
      </div>
      <span
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          you ? 'bg-ok shadow-[0_0_10px_#3ee07a]' : 'bg-muted/50',
        )}
      />
    </div>
  )
}
