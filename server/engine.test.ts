import assert from 'node:assert/strict'
import test from 'node:test'
import { GameEngine } from './engine.js'

test('creates, joins, and resumes a lobby', () => {
  const engine = new GameEngine()
  const created = engine.createGame('host-id-123', ' Host ')
  const code = created.game.code

  assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/)
  assert.equal(created.players[0]?.name, 'Host')

  const joined = engine.joinGame('player-id-456', code.toLowerCase(), 'Player')
  assert.equal(joined.players.length, 2)
  assert.equal(engine.resumeGame(code, 'player-id-456').game.code, code)
  assert.throws(() => engine.joinGame('third-id-789', code, 'player'), /name is already/)
})

test('enforces host-only settings and start actions', () => {
  const engine = new GameEngine()
  const code = engine.createGame('host-id-123', 'Host').game.code
  engine.joinGame('player-id-456', code, 'Player')
  engine.joinGame('player-id-789', code, 'Player Two')

  assert.throws(
    () => engine.updateSettings(code, 'player-id-456', { discussionSeconds: 30 }),
    /Only the host/,
  )
  assert.throws(() => engine.startGame(code, 'player-id-456'), /Only the host/)
  assert.throws(() => engine.startPregame(code, 'player-id-456'), /Only the host/)
  assert.throws(
    () =>
      engine.updateSettings(code, 'host-id-123', {
        tasks: [
          {
            id: 'invalid',
            text: 'Mystery task',
            room: '',
            details: '',
            done: false,
            doneByName: null,
          },
        ],
      }),
    /needs a room/,
  )

  engine.updateSettings(code, 'host-id-123', {
    impostorCount: 1,
    discussionSeconds: 30,
    tasksPerPlayer: 1,
    tasks: [
      {
        id: 'task-kitchen',
        text: 'Clean the counter',
        room: 'Kitchen',
        details: 'Use the blue cloth.',
        done: true,
        doneByName: 'Someone',
      },
    ],
  })
  const task = engine.snapshot(code, 'host-id-123').game.tasks[0]
  assert.equal(task?.room, 'Kitchen')
  assert.equal(task?.details, 'Use the blue cloth.')
  assert.equal(task?.done, false)
  assert.throws(() => engine.startGame(code, 'host-id-123'), /Review the setup/)
  engine.startPregame(code, 'host-id-123')
  const briefing = engine.snapshot(code, 'player-id-456')
  assert.equal(briefing.game.status, 'pregame')
  assert.equal(briefing.game.tasks.length, 1)
  assert.equal(briefing.players.every((player) => player.role === null), true)
  engine.joinGame('late-player-101', code, 'Late Player')
  engine.startGame(code, 'host-id-123')
  const started = engine.snapshot(code, 'host-id-123')
  assert.equal(started.game.status, 'playing')
  assert.equal(started.game.tasks.length, 1)
})

test('limits imposters by player count and accepts unbounded half-minute timers', () => {
  const engine = new GameEngine()
  const code = engine.createGame('host-id-123', 'Host').game.code
  engine.joinGame('player-id-456', code, 'Player One')
  engine.joinGame('player-id-789', code, 'Player Two')

  assert.throws(
    () => engine.updateSettings(code, 'host-id-123', { impostorCount: 2 }),
    /strictly lower than half/,
  )
  engine.joinGame('player-id-101', code, 'Player Three')
  engine.joinGame('player-id-102', code, 'Player Four')
  engine.updateSettings(code, 'host-id-123', { impostorCount: 2, discussionSeconds: 3600 })
  assert.equal(engine.snapshot(code, 'host-id-123').game.discussionSeconds, 3600)
  assert.throws(
    () => engine.updateSettings(code, 'host-id-123', { discussionSeconds: 45 }),
    /30-second steps/,
  )
})

test('redacts roles according to the viewer role', () => {
  const engine = new GameEngine()
  const ids = ['host-id-123', 'player-id-456', 'player-id-789']
  const code = engine.createGame(ids[0]!, 'Host').game.code
  engine.joinGame(ids[1]!, code, 'Player One')
  engine.joinGame(ids[2]!, code, 'Player Two')
  engine.startPregame(code, ids[0]!)
  engine.startGame(code, ids[0]!)
  for (const id of ids) {
    assert.equal(engine.snapshot(code, id).game.tasks.length, 3)
  }

  const roles = new Map(
    ids.map((id) => [
      id,
      engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
    ]),
  )
  const imposterId = ids.find((id) => roles.get(id) === 'imposter')
  const crewmateId = ids.find((id) => roles.get(id) === 'crewmate')
  assert.ok(imposterId)
  assert.ok(crewmateId)

  const imposterView = engine.snapshot(code, imposterId)
  assert.equal(
    imposterView.players.filter((player) => player.role === 'imposter').length,
    1,
  )

  const crewmateView = engine.snapshot(code, crewmateId)
  assert.equal(
    crewmateView.players.filter((player) => player.role === 'imposter').length,
    0,
  )
  assert.equal(
    crewmateView.players.find((player) => player.id === crewmateId)?.role,
    'crewmate',
  )

  const crewTaskId = crewmateView.game.tasks[0]!.id
  engine.toggleTask(code, crewmateId, crewTaskId)
  const progressAfterCrew = engine.snapshot(code, imposterId).game.taskProgress
  assert.deepEqual(progressAfterCrew, { done: 1, total: 6 })

  const imposterTaskId = engine.snapshot(code, imposterId).game.tasks[0]!.id
  engine.toggleTask(code, imposterId, imposterTaskId)
  assert.deepEqual(engine.snapshot(code, crewmateId).game.taskProgress, progressAfterCrew)
})

test('rejects late joins but permits an existing player to resume', () => {
  const engine = new GameEngine()
  const code = engine.createGame('host-id-123', 'Host').game.code
  engine.joinGame('player-id-456', code, 'Player')
  engine.joinGame('player-id-789', code, 'Player Two')
  engine.startPregame(code, 'host-id-123')
  engine.startGame(code, 'host-id-123')

  assert.throws(() => engine.joinGame('late-player-789', code, 'Late'), /already started/)
  assert.equal(engine.resumeGame(code, 'player-id-456').game.status, 'playing')
})

test('updates tasks and meeting state on the server', () => {
  const originalNow = Date.now
  let now = 1_100_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const code = engine.createGame('host-id-123', 'Host').game.code
    engine.joinGame('player-id-456', code, 'Player')
    engine.joinGame('player-id-789', code, 'Player Two')
    engine.startPregame(code, 'host-id-123')
    engine.startGame(code, 'host-id-123')
    assert.equal(engine.snapshot(code, 'host-id-123').game.roundId, 1)
    assert.equal(engine.snapshot(code, 'host-id-123').game.roundAlivePlayerIds.length, 3)

    const taskId = engine.snapshot(code, 'player-id-456').game.tasks[0]!.id
    engine.toggleTask(code, 'player-id-456', taskId)
    const completed = engine.snapshot(code, 'player-id-456').game.tasks[0]!
    assert.equal(completed.done, true)
    assert.equal(completed.doneByName, 'Player')
    assert.equal(
      engine.snapshot(code, 'host-id-123').game.tasks.every((task) => !task.done),
      true,
    )

    now += 60_001
    engine.callMeeting(code, 'player-id-456', 'emergency')
    const gathering = engine.snapshot(code, 'host-id-123').game
    assert.equal(gathering.status, 'meeting')
    assert.equal(gathering.meeting?.startedAtMs, null)
    assert.throws(() => engine.startMeeting(code, 'host-id-123'), /player who called/)
    engine.startMeeting(code, 'player-id-456')
    const callerMeeting = engine.snapshot(code, 'player-id-456').game.meeting
    const hostMeeting = engine.snapshot(code, 'host-id-123').game.meeting
    assert.equal(typeof hostMeeting?.startedAtMs, 'number')
    assert.equal(hostMeeting?.startedAtMs, callerMeeting?.startedAtMs)
    assert.throws(() => engine.endMeeting(code, 'player-id-789'), /host or meeting caller/)
    engine.endMeeting(code, 'player-id-456')
    const after = engine.snapshot(code, 'host-id-123').game
    assert.equal(after.status, 'playing')
    assert.equal(after.roundId, 2)
  } finally {
    Date.now = originalNow
  }
})

test('tracks private ghost state and per-imposter kill cooldowns', () => {
  const originalNow = Date.now
  let now = 1_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = [
      'host-id-123',
      'player-id-456',
      'player-id-789',
      'player-id-101',
      'player-id-102',
    ]
    const code = engine.createGame(ids[0]!, 'Host').game.code
    ids.slice(1).forEach((id, index) => engine.joinGame(id, code, `Player ${index + 1}`))
    engine.updateSettings(code, ids[0]!, {
      impostorCount: 2,
      deathSeconds: 30,
      killerCooldownSeconds: 120,
      initialKillCooldownSeconds: 60,
      postMeetingKillCooldownSeconds: 60,
    })
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')
    const victimId = crewmates[0]!
    const callerId = crewmates[1]!
    const killerId = imposters[0]!

    assert.throws(() => engine.killCandidates(code, victimId), /global kill cooldown/)
    now += 60_001
    assert.equal(engine.killCandidates(code, victimId).length, 2)
    const deathEndsAtMs = engine.reportKilled(code, victimId, killerId)
    assert.equal(deathEndsAtMs, now + 30_000)
    assert.equal(engine.snapshot(code, victimId).players.find((p) => p.id === victimId)?.lifeStatus, 'dying')
    assert.equal(engine.snapshot(code, callerId).players.find((p) => p.id === victimId)?.lifeStatus, 'alive')
    assert.equal(engine.killCandidates(code, callerId).length, 1)
    assert.throws(() => engine.callMeeting(code, victimId, 'body', killerId), /Ghosts cannot/)
    assert.equal(
      engine.snapshot(code, victimId).players.find((player) => player.id === victimId)
        ?.killedInRoundId,
      1,
    )
    assert.equal(
      engine.snapshot(code, callerId).players.find((player) => player.id === victimId)
        ?.killedInRoundId,
      null,
    )

    now += 30_000
    engine.makeGhost(code, victimId)
    const ghostView = engine.snapshot(code, victimId)
    assert.equal(ghostView.players.find((player) => player.id === victimId)?.lifeStatus, 'ghost')
    const taskId = ghostView.game.tasks[0]!.id
    engine.toggleTask(code, victimId, taskId)
    assert.equal(engine.snapshot(code, victimId).game.tasks[0]?.done, true)

    engine.callMeeting(code, callerId, 'body', victimId)
    assert.equal(engine.snapshot(code, callerId).game.meeting?.reportedPlayerName, ghostView.players.find((player) => player.id === victimId)?.name)
    engine.startMeeting(code, callerId)
    engine.endMeeting(code, callerId)
    const afterMeeting = engine.snapshot(code, callerId).game
    assert.equal(afterMeeting.roundAlivePlayerIds.includes(victimId), false)
    assert.throws(() => engine.callMeeting(code, callerId, 'body', victimId), /No body found/)
    assert.equal(
      engine.snapshot(code, imposters[1]!).game.globalKillCooldownEndsAtMs,
      now + 60_000,
    )
    assert.equal(
      engine.snapshot(code, callerId).game.globalKillCooldownEndsAtMs,
      now + 60_000,
    )
  } finally {
    Date.now = originalNow
  }
})

test('runs trust, code, and device sabotages through cooldown and victory', () => {
  const originalNow = Date.now
  let now = 2_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    engine.joinGame(ids[1]!, code, 'Player One')
    engine.joinGame(ids[2]!, code, 'Player Two')
    engine.updateSettings(code, ids[0]!, {
      sabotageCooldownSeconds: 60,
      sabotages: [
        {
          id: 'lights',
          name: 'Lights',
          room: 'Hallway',
          timerSeconds: 120,
          method: 'trust',
          deactivationCode: '',
          deviceCode: '',
        },
        {
          id: 'reactor',
          name: 'Reactor',
          room: 'Kitchen',
          timerSeconds: 120,
          method: 'code',
          deactivationCode: 'ABCDEFGHJK',
          deviceCode: '',
        },
        {
          id: 'radio',
          name: 'Radio',
          room: 'Bedroom',
          timerSeconds: 120,
          method: 'device',
          deactivationCode: '',
          deviceCode: 'MNPQ2345',
        },
      ],
    })
    assert.equal(engine.snapshot(code, ids[0]!).game.sabotages[1]?.deactivationCode, 'ABCDEFGHJK')
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const imposterId = ids.find(
      (id) =>
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role ===
        'imposter',
    )!
    const crewIds = ids.filter((id) => id !== imposterId)
    assert.deepEqual(engine.snapshot(code, crewIds[0]!).game.sabotages, [])
    assert.equal(engine.snapshot(code, imposterId).game.sabotages[1]?.deactivationCode, '')

    engine.activateSabotage(code, imposterId, 'lights')
    assert.equal(engine.snapshot(code, crewIds[0]!).game.activeSabotage?.name, 'Lights')
    engine.deactivateSabotage(code, crewIds[0]!)
    assert.throws(
      () => engine.activateSabotage(code, imposterId, 'reactor'),
      /sabotage cooldown/,
    )

    now += 60_000
    engine.activateSabotage(code, imposterId, 'reactor')
    assert.throws(
      () => engine.callMeeting(code, crewIds[0]!, 'emergency'),
      /during a sabotage/,
    )
    engine.deactivateSabotage(code, crewIds[0]!, 'ABCDEFGHJK')
    now += 60_000
    engine.callMeeting(code, crewIds[0]!, 'emergency')
    assert.throws(
      () => engine.activateSabotage(code, imposterId, 'reactor'),
      /during a meeting/,
    )
    engine.startMeeting(code, crewIds[0]!)
    engine.endMeeting(code, crewIds[0]!)
    engine.activateSabotage(code, imposterId, 'reactor')
    assert.throws(
      () => engine.deactivateSabotage(code, crewIds[0]!, 'WRONGCODE'),
      /Incorrect/,
    )
    engine.deactivateSabotage(code, crewIds[0]!, 'ABCDEFGHJK')

    now += 60_000
    const deviceConnection = engine.connectDevice('MNPQ2345')
    assert.equal(deviceConnection.kind, 'sabotage')
    assert.equal(deviceConnection.sabotageId, 'radio')
    const active = engine.activateSabotage(code, imposterId, 'radio')
    assert.equal(engine.snapshotDevice(code, 'radio').active, true)
    assert.throws(
      () => engine.deactivateSabotage(code, crewIds[0]!),
      /dedicated device/,
    )
    engine.deactivateSabotageFromDevice(code, 'radio')
    assert.equal(engine.snapshotDevice(code, 'radio').active, false)

    now += 60_000
    const finalSabotage = engine.activateSabotage(code, imposterId, 'lights')
    assert.notEqual(finalSabotage.id, active.id)
    assert.equal(engine.expireSabotage(code, finalSabotage.id), true)
    const ended = engine.snapshot(code, crewIds[0]!).game
    assert.equal(ended.status, 'ended')
    assert.equal(ended.winner, 'imposters')
    assert.equal(ended.winReason, 'sabotage')
  } finally {
    Date.now = originalNow
  }
})

test('body reports end an active sabotage and only accept current-round kills', () => {
  const originalNow = Date.now
  let now = 3_500_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789', 'player-id-101']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    ids.slice(1).forEach((id, index) => engine.joinGame(id, code, `Player ${index + 1}`))
    engine.updateSettings(code, ids[0]!, {
      impostorCount: 1,
      initialKillCooldownSeconds: 30,
      sabotages: [
        {
          id: 'lights',
          name: 'Lights',
          room: 'Hallway',
          timerSeconds: 120,
          method: 'trust',
          deactivationCode: '',
          deviceCode: '',
        },
      ],
    })
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')
    engine.activateSabotage(code, imposters[0]!, 'lights')
    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'emergency'),
      /during a sabotage/,
    )

    now += 30_001
    engine.reportKilled(code, crewmates[0]!, imposters[0]!)
    engine.callMeeting(code, crewmates[1]!, 'body', crewmates[0]!)
    const meeting = engine.snapshot(code, crewmates[1]!).game
    assert.equal(meeting.status, 'meeting')
    assert.equal(meeting.activeSabotage, null)
    assert.equal(meeting.meeting?.kind, 'body')
    assert.equal(meeting.meeting?.reportedPlayerId, crewmates[0]!)
  } finally {
    Date.now = originalNow
  }
})

test('splits emergency meetings from current-round body reports', () => {
  const originalNow = Date.now
  let now = 3_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    engine.joinGame(ids[1]!, code, 'Player One')
    engine.joinGame(ids[2]!, code, 'Player Two')
    engine.updateSettings(code, ids[0]!, {
      emergencyMeetingsPerPlayer: 2,
      initialEmergencyCooldownSeconds: 60,
      postMeetingEmergencyCooldownSeconds: 60,
      initialKillCooldownSeconds: 30,
      postMeetingKillCooldownSeconds: 30,
    })
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')

    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'emergency'),
      /still on cooldown/,
    )
    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'body', crewmates[0]!),
      /No body found/,
    )
    assert.equal(engine.snapshot(code, crewmates[1]!).game.status, 'playing')

    now += 30_001
    engine.reportKilled(code, crewmates[0]!, imposters[0]!)
    engine.callMeeting(code, crewmates[1]!, 'body', crewmates[0]!)
    engine.startMeeting(code, crewmates[1]!)
    engine.endMeeting(code, crewmates[1]!)
    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'emergency'),
      /still on cooldown/,
    )
    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'body', crewmates[0]!),
      /No body found/,
    )

    now += 60_000
    engine.callMeeting(code, crewmates[1]!, 'emergency')
    engine.endMeeting(code, crewmates[1]!)
    now += 60_000
    engine.callMeeting(code, crewmates[1]!, 'emergency')
    engine.endMeeting(code, crewmates[1]!)
    now += 60_000
    assert.throws(
      () => engine.callMeeting(code, crewmates[1]!, 'emergency'),
      /no emergency meetings left/,
    )
  } finally {
    Date.now = originalNow
  }
})

test('ends the round for crewmates when every crewmate task is done', () => {
  const engine = new GameEngine()
  const ids = ['host-id-123', 'player-id-456', 'player-id-789']
  const code = engine.createGame(ids[0]!, 'Host').game.code
  engine.joinGame(ids[1]!, code, 'Player One')
  engine.joinGame(ids[2]!, code, 'Player Two')
  engine.updateSettings(code, ids[0]!, {
    tasksPerPlayer: 1,
    tasks: [
      {
        id: 'task-kitchen',
        text: 'Clean the counter',
        room: 'Kitchen',
        details: '',
        done: false,
        doneByName: null,
      },
    ],
  })
  engine.startPregame(code, ids[0]!)
  engine.startGame(code, ids[0]!)

  const roles = new Map(
    ids.map((id) => [
      id,
      engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
    ]),
  )
  const imposters = ids.filter((id) => roles.get(id) === 'imposter')
  const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')
  const imposterTask = engine.snapshot(code, imposters[0]!).game.tasks[0]!
  engine.toggleTask(code, imposters[0]!, imposterTask.id)
  const afterFake = engine.snapshot(code, crewmates[0]!).game
  assert.equal(afterFake.status, 'playing')
  assert.equal(afterFake.taskProgress.done, 0)

  for (const crewId of crewmates) {
    const task = engine.snapshot(code, crewId).game.tasks[0]!
    engine.toggleTask(code, crewId, task.id)
  }
  const ended = engine.snapshot(code, crewmates[0]!).game
  assert.equal(ended.status, 'ended')
  assert.equal(ended.winner, 'crewmates')
  assert.equal(ended.winReason, 'tasks')
  assert.equal(ended.taskProgress.done, ended.taskProgress.total)
})

test('connects a dashboard device and reveals dead roles there', () => {
  const originalNow = Date.now
  let now = 4_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    engine.joinGame(ids[1]!, code, 'Player One')
    engine.joinGame(ids[2]!, code, 'Player Two')
    const dashboardCode = engine.snapshot(code, ids[0]!).game.dashboardCode
    assert.match(dashboardCode, /^[A-HJ-NP-Z2-9]{8}$/)
    assert.equal(engine.snapshot(code, ids[1]!).game.dashboardCode, '')
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const connection = engine.connectDevice(dashboardCode)
    assert.equal(connection.kind, 'dashboard')
    const before = engine.snapshotDashboard(code)
    assert.equal(before.players.every((player) => player.alive && player.role === null), true)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')
    now += 60_001
    engine.reportKilled(code, crewmates[0]!, imposters[0]!)
    engine.makeGhost(code, crewmates[0]!)
    const dash = engine.snapshotDashboard(code)
    const dead = dash.players.find((player) => player.id === crewmates[0]!)
    const living = dash.players.find((player) => player.id === crewmates[1]!)
    assert.equal(dead?.alive, false)
    assert.equal(dead?.role, 'crewmate')
    assert.equal(living?.alive, true)
    assert.equal(living?.role, null)
  } finally {
    Date.now = originalNow
  }
})

test('caller can vote someone out and living counts decide the round', () => {
  const originalNow = Date.now
  let now = 5_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    engine.joinGame(ids[1]!, code, 'Player One')
    engine.joinGame(ids[2]!, code, 'Player Two')
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')

    now += 60_001
    engine.callMeeting(code, crewmates[0]!, 'emergency')
    assert.throws(() => engine.voteOut(code, crewmates[1]!, imposters[0]!), /who called/)
    const ejection = engine.voteOut(code, crewmates[0]!, imposters[0]!)
    assert.equal(ejection.role, 'imposter')
    const afterVote = engine.snapshot(code, crewmates[0]!).game
    assert.equal(afterVote.status, 'ended')
    assert.equal(afterVote.winner, 'crewmates')
    assert.equal(afterVote.winReason, 'votes')
    assert.equal(afterVote.ejection?.name, ejection.name)
  } finally {
    Date.now = originalNow
  }
})

test('imposters win when no living crewmates remain', () => {
  const originalNow = Date.now
  let now = 6_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const ids = ['host-id-123', 'player-id-456', 'player-id-789']
    const code = engine.createGame(ids[0]!, 'Host').game.code
    engine.joinGame(ids[1]!, code, 'Player One')
    engine.joinGame(ids[2]!, code, 'Player Two')
    engine.updateSettings(code, ids[0]!, {
      killerCooldownSeconds: 30,
      initialKillCooldownSeconds: 30,
    })
    engine.startPregame(code, ids[0]!)
    engine.startGame(code, ids[0]!)

    const roles = new Map(
      ids.map((id) => [
        id,
        engine.snapshot(code, id).players.find((player) => player.id === id)?.role,
      ]),
    )
    const imposters = ids.filter((id) => roles.get(id) === 'imposter')
    const crewmates = ids.filter((id) => roles.get(id) === 'crewmate')
    now += 30_001
    engine.reportKilled(code, crewmates[0]!, imposters[0]!)
    assert.equal(engine.snapshot(code, crewmates[1]!).game.status, 'playing')
    now += 30_001
    engine.reportKilled(code, crewmates[1]!, imposters[0]!)
    const ended = engine.snapshot(code, imposters[0]!).game
    assert.equal(ended.status, 'ended')
    assert.equal(ended.winner, 'imposters')
    assert.equal(ended.winReason, 'kills')
  } finally {
    Date.now = originalNow
  }
})

test('host leave closes the room while player leave keeps it alive', () => {
  const engine = new GameEngine()
  const code = engine.createGame('host-id-123', 'Host').game.code
  engine.joinGame('player-id-456', code, 'Player')

  assert.deepEqual(engine.leaveGame(code, 'player-id-456'), { closed: false })
  assert.equal(engine.snapshot(code, 'host-id-123').players.length, 1)
  assert.deepEqual(engine.leaveGame(code, 'host-id-123'), { closed: true })
  assert.equal(engine.hasRoom(code), false)
})

test('a session token restores the same seat and a visible player id does not', () => {
  const engine = new GameEngine()
  const hostId = 'host-id-123'
  const crewId = 'player-id-456'
  const created = engine.createGame(hostId, 'Host')
  const code = created.game.code
  engine.joinGame(crewId, code, 'Player')
  engine.joinGame('player-id-789', code, 'Player Two')
  engine.startPregame(code, hostId)
  engine.startGame(code, hostId)

  const hostToken = engine.openSession(code, hostId)
  const crewToken = engine.openSession(code, crewId)
  assert.notEqual(hostToken, crewToken)
  assert.equal(hostToken.length >= 32, true)

  const restored = engine.resumeByToken(hostToken, code.toLowerCase())
  assert.equal(restored.game.hostId, hostId)
  assert.equal(restored.players.find((player) => player.id === hostId)?.isHost, true)
  assert.equal(restored.game.dashboardCode.length > 0, true)

  const crewView = engine.resumeByToken(crewToken, code)
  assert.equal(crewView.players.find((player) => player.id === crewId)?.isHost, false)
  assert.equal(crewView.game.dashboardCode, '')
  assert.equal(JSON.stringify(crewView).includes(hostToken), false)
  assert.equal(JSON.stringify(crewView).includes(crewToken), false)
  assert.equal(crewView.game.hostId, hostId)
  assert.throws(() => engine.resumeByToken(hostId, code), /no longer active/)
  assert.throws(() => engine.resumeByToken(crewId, code), /no longer active/)
  assert.throws(() => engine.updateSettings(code, crewId, { discussionSeconds: 60 }), /Only the host/)

  engine.leaveGame(code, crewId)
  assert.throws(() => engine.resumeByToken(crewToken, code), /no longer active/)
  assert.equal(engine.resumeByToken(hostToken, code).game.code, code)

  engine.leaveGame(code, hostId)
  assert.throws(() => engine.resumeByToken(hostToken, code), /no longer active/)
})

test('snapshots include the server clock so clients can render timers', () => {
  const originalNow = Date.now
  const now = 5_000_000
  Date.now = () => now
  try {
    const engine = new GameEngine()
    const created = engine.createGame('host-id-123', 'Host')
    assert.equal(created.game.serverNowMs, now)
    assert.equal(engine.snapshotDashboard(created.game.code).serverNowMs, now)
  } finally {
    Date.now = originalNow
  }
})
