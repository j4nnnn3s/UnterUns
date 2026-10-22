export function SabotageStrobe({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div
      className="sabotage-strobe pointer-events-none fixed inset-0 z-20"
      aria-hidden="true"
    />
  )
}
