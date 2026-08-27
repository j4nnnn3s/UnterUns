let sentinel: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    sentinel = null
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release()
  } catch {
    // already released
  }
  sentinel = null
}
