let ctx: AudioContext | null = null
let muted = localStorage.getItem('amonghaus.muted') === '1'
let unlocked = false
let requested: AlarmKind | null = null
let playing: AlarmKind | null = null
let nodes: Array<AudioNode | OscillatorNode> = []
let vibeTimer: number | null = null

export type AlarmKind = 'emergency' | 'body' | 'sabotage'

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  localStorage.setItem('amonghaus.muted', next ? '1' : '0')
  if (muted) {
    haltPlayback()
    return
  }
  unlockAudio()
  if (requested) beginPlayback(requested)
}

export function unlockAudio(): void {
  const audio = getCtx()
  if (!audio) return
  const resume = audio.resume()
  void resume.then(() => {
    unlocked = audio.state === 'running'
    if (unlocked && requested && !muted && playing !== requested) {
      beginPlayback(requested)
    }
  })
}

export function startAlarm(kind: AlarmKind): void {
  requested = kind
  if (muted) {
    haltPlayback()
    return
  }
  if (playing === kind) return
  if (!unlocked) {
    unlockAudio()
    return
  }
  beginPlayback(kind)
}

export function stopAlarm(): void {
  requested = null
  haltPlayback()
}

function beginPlayback(kind: AlarmKind): void {
  const audio = getCtx()
  if (!audio || audio.state !== 'running') return
  haltPlayback()
  playing = kind
  nodes = startKind(audio, kind)
  startVibrate(kind)
}

function haltPlayback(): void {
  playing = null
  for (const node of nodes) {
    try {
      if ('stop' in node) (node as OscillatorNode).stop()
    } catch {
      // Already stopped.
    }
    try {
      node.disconnect()
    } catch {
      // Already disconnected.
    }
  }
  nodes = []
  stopVibrate()
}

function startKind(audio: AudioContext, kind: AlarmKind): Array<AudioNode | OscillatorNode> {
  const master = audio.createGain()
  master.gain.value = 0.12
  master.connect(audio.destination)

  if (kind === 'emergency') {
    const osc = audio.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 740
    const lfo = audio.createOscillator()
    lfo.type = 'triangle'
    lfo.frequency.value = 1.7
    const depth = audio.createGain()
    depth.gain.value = 210
    lfo.connect(depth)
    depth.connect(osc.frequency)
    osc.connect(master)
    osc.start()
    lfo.start()
    return [osc, lfo, depth, master]
  }

  if (kind === 'body') {
    const osc = audio.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 210
    const pulse = audio.createOscillator()
    pulse.type = 'square'
    pulse.frequency.value = 2.4
    const pulseDepth = audio.createGain()
    pulseDepth.gain.value = 0.09
    master.gain.value = 0.09
    pulse.connect(pulseDepth)
    pulseDepth.connect(master.gain)
    osc.connect(master)
    osc.start()
    pulse.start()
    return [osc, pulse, pulseDepth, master]
  }

  const rumble = audio.createOscillator()
  rumble.type = 'sine'
  rumble.frequency.value = 95
  const beep = audio.createOscillator()
  beep.type = 'triangle'
  beep.frequency.value = 620
  const pulse = audio.createOscillator()
  pulse.type = 'square'
  pulse.frequency.value = 2
  const beepGain = audio.createGain()
  beepGain.gain.value = 0.06
  const pulseDepth = audio.createGain()
  pulseDepth.gain.value = 0.05
  pulse.connect(pulseDepth)
  pulseDepth.connect(beepGain.gain)
  rumble.connect(master)
  beep.connect(beepGain)
  beepGain.connect(master)
  rumble.start()
  beep.start()
  pulse.start()
  return [rumble, beep, pulse, beepGain, pulseDepth, master]
}

function startVibrate(kind: AlarmKind): void {
  if (muted || !navigator.vibrate) return
  const pattern =
    kind === 'emergency'
      ? [500, 180, 500, 400]
      : kind === 'body'
        ? [180, 80, 180, 80, 420, 300]
        : [280, 120, 280, 120, 280, 400]
  navigator.vibrate(pattern)
  vibeTimer = window.setInterval(() => {
    navigator.vibrate?.(pattern)
  }, 1600)
}

function stopVibrate(): void {
  if (vibeTimer !== null) {
    window.clearInterval(vibeTimer)
    vibeTimer = null
  }
  navigator.vibrate?.(0)
}

if (typeof window !== 'undefined') {
  const unlock = () => unlockAudio()
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('touchstart', unlock, { passive: true })
  window.addEventListener('click', unlock)
  window.addEventListener('keydown', unlock)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    unlockAudio()
    if (requested && !muted) beginPlayback(requested)
  })
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
