let ctx: AudioContext | null = null
let muted = localStorage.getItem('amonghaus.muted') === '1'

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
}

export function unlockAudio(): void {
  const audio = getCtx()
  if (!audio) return
  if (audio.state === 'suspended') {
    void audio.resume()
  }
}

function tone(
  audio: AudioContext,
  start: number,
  duration: number,
  freq: number,
  type: OscillatorType,
  gainValue: number,
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export function playMeetingAlarm(): void {
  if (muted) return
  const audio = getCtx()
  if (!audio) return
  void audio.resume()

  const t = audio.currentTime
  tone(audio, t, 0.35, 140, 'sine', 0.16)
  tone(audio, t + 0.12, 0.4, 90, 'triangle', 0.12)
  tone(audio, t + 0.55, 0.25, 220, 'square', 0.08)
  tone(audio, t + 0.9, 0.55, 80, 'sine', 0.18)
}

export function vibrateForMeeting(): void {
  if (muted || !navigator.vibrate) return
  navigator.vibrate([400, 120, 600])
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
