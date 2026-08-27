import type { Task } from '../types'
import { createId } from '../id'

export interface TaskTemplate {
  text: string
  room: string
  details: string
}

export const DEFAULT_TASKS: TaskTemplate[] = [
  { text: 'Water the plants', room: 'Kitchen', details: 'Use the small green watering can.' },
  { text: 'Sort the recycling', room: 'Hallway', details: 'Separate paper, plastic, and glass.' },
  { text: 'Wipe down the sink', room: 'Bathroom', details: 'Use the cloth under the sink.' },
  { text: 'Take out the trash', room: 'Kitchen', details: 'Bring it to the outside bins.' },
  { text: 'Load or unload the dishwasher', room: 'Kitchen', details: '' },
  { text: 'Sweep the floor', room: 'Hallway', details: 'The broom is next to the coat rack.' },
  { text: 'Check that the stove is off', room: 'Kitchen', details: 'Check every control knob.' },
  { text: 'Fold one load of laundry', room: 'Laundry room', details: '' },
]

export const CREW_COLORS = [
  '#c51111',
  '#132ed1',
  '#117f2d',
  '#ed54ba',
  '#ef7d0d',
  '#f6f658',
  '#3f474e',
  '#d6e0f0',
  '#6b2fbb',
  '#71491e',
  '#38fedc',
  '#50ef39',
]

export const DEFAULT_DISCUSSION_SECONDS = 90
export const DEFAULT_IMPOSTOR_COUNT = 1
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4

export function createTask(template: TaskTemplate): Task {
  return {
    id: createId(),
    text: template.text.trim(),
    room: template.room.trim(),
    details: template.details.trim(),
    done: false,
    doneByName: null,
  }
}

export function tasksFromTemplates(templates: TaskTemplate[]): Task[] {
  return templates
    .filter((template) => template.text.trim() && template.room.trim())
    .map(createTask)
}
