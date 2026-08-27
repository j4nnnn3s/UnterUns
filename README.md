# UnterUns

UnterUns is a mobile-first social deduction game for people in the same house:
Among Us meets Werewolf, played on everyone's phones with real household tasks.

One PC serves the web app and runs the authoritative game over the local Wi-Fi.
There is no cloud backend, account system, or internet dependency during play.

## Requirements

- Node.js 22 or newer
- One laptop or desktop to host the game
- Phones and host connected to the same Wi-Fi
- A network that permits device-to-device traffic

Guest networks often enable client isolation and will not work unless that
setting is disabled.

## Run a game

Install dependencies once:

```bash
npm install
```

Start the complete application:

```bash
npm run host
```

This single command builds and starts both the website and WebSocket game
server. No second server or terminal is required. The terminal prints the LAN
address and a QR code:

```text
UnterUns is running on port 4173
LAN: http://192.168.1.23:4173

Scan to open UnterUns:
<QR code>
```

Scan the QR code on every phone, including the host's phone if desired.
Alternatively, enter the printed LAN address manually. Do not substitute
`localhost`: on a phone, that would refer to the phone itself.

Keep the terminal running for the whole game. Press `Ctrl+C` when finished.
Stopping the process deletes every active room because game state is held only
in memory.

### Use another port

```bash
PORT=8080 npm run host
```

The QR code and printed LAN address automatically use the selected port.

### Connection troubleshooting

If a phone cannot open or connect to UnterUns:

1. Confirm it uses the exact printed `http://LAN-IP:PORT` address.
2. Confirm the phone and host are on the same non-guest Wi-Fi.
3. Disable VPNs and automatic mobile-data switching temporarily.
4. Allow the selected TCP port through the host firewall.
5. Disable AP/client isolation in the router.
6. Close stale browser tabs and scan the newly printed QR code again.

## Gameplay

### 1. Create and join

The host opens UnterUns, enters a display name, and creates a room. Other
players scan the same QR code or open the same LAN address, then join with the
four-character room code. No accounts are required.

### 2. Configure the lobby

Before starting, the host controls:

- Number of imposters, which must remain strictly below half of all players
- Meeting duration in 30-second steps, with no upper limit
- Time between a kill report and becoming a ghost
- Per-killer, initial global, and post-meeting kill cooldowns
- Emergency meetings per living player, plus opening and post-meeting cooldowns
- A dashboard device code for a spare phone or TV
- Global sabotage cooldown and room-specific sabotage definitions
- Number of tasks assigned to each player
- The shared task pool
- Each task's room and optional instructions

At least three players are required to satisfy the imposter ratio.

Lobby settings can be exported to `unteruns-settings.json` and imported later.
Presets contain settings, task and sabotage definitions, and stable sabotage
codes—never players, roles, completion progress, or active room codes.

### 3. Brief everyone

The host first opens a pre-game briefing instead of assigning roles
immediately. Everyone sees the complete task list and all sabotage locations in
a compact, code-free view. Use this phase to walk through the house, explain
unusual tasks, and show where repairs happen. Players may still join or leave.
The host can return to lobby editing or start the round when everyone is ready.

### 4. Reveal roles

The server randomly assigns roles. Crewmates receive only their own role.
Imposters receive their own role and the names of fellow imposters. Role data
not intended for a player is never sent to that player's browser.

### 5. Complete tasks

Every player receives a random personal subset from the host's task pool.
Tasks show their room and can be expanded for additional instructions.
Crewmates complete their assignments; imposters receive plausible fake tasks.

All phones display the same global progress bar. It counts completed tasks
across all crewmates and deliberately ignores imposter task completion. Tap
the bar for a short explanation. When it reaches 100%, the crewmates win.

### 6. Kills and ghosts

When a crewmate is killed in person, they tap **I was killed** and privately
select the imposter responsible. A blocking countdown reminds them to stay
silent. When it ends, they become a ghost: they attend meetings, but cannot
call one themselves. Ghost status and the killer's identity remain private to
that player. Ghost tasks still count on the shared progress bar. If no living
crewmates remain, the imposters win immediately.

The responsible imposter receives an individual kill cooldown. All imposters
also share a global cooldown at the start of a round and after every meeting.
Imposters see both cooldowns as compact timers; crewmates do not see them.
Tap any cooldown for a short explanation.

### 7. Sabotage

The host can define sabotages with a name, deactivation room, countdown, and
one of three repair methods:

- **Trust:** a living crewmate reaches the room and confirms on their phone.
- **Written code:** the host writes the generated 10-character code and places
  it in the room; a living crewmate enters it in the app.
- **Dedicated device:** a spare phone uses the eight-character device code
  from the home screen and remains at the deactivation location.

Imposters can activate one sabotage at a time while normal play is active.
Every phone alerts and displays its remaining time, but tasks stay available.
The timer continues during meetings, though new sabotages cannot be started
there. After a repair, all imposters share the configured sabotage cooldown.
If the timer expires, the round ends immediately with an imposter victory.

Generated codes remain stable until the host regenerates them and are included
in exported lobby presets. They are otherwise only sent to the host while
editing the lobby.

### 8. Call a meeting

Living players have two ways to gather the group:

- **Emergency meeting:** each living player can call this a limited number of
  times per round (default 1). Emergencies are blocked by an opening cooldown
  (default 1 minute) and by another cooldown after any meeting (default 1
  minute).
- **Body found:** unlimited, with no cooldown.

Ghosts still attend meetings but cannot call either type. Every phone alerts
and asks the group to gather. The meeting clock does not start immediately.

Once everyone is together, only the player who called the meeting can start the
timer. During discussion the caller votes one living player out. That player's
role is revealed to everyone and they become a ghost. The caller or host can
skip the vote and resume play. The server also ends discussion when the
host-configured duration expires, which skips the vote.

If the last living imposter is voted out, the crewmates win. If no living
crewmates remain — by kills or by voting out the last crewmate — the imposters
win.

### 9. House dashboard

The host sees an 8-character dashboard code in the lobby. Enter it on a spare
phone or TV from the home screen, the same way as a sabotage device. The
dashboard shows global task progress, who is alive or dead (with roles only
after death), and which sabotages are idle or active. Dying players stay
hidden as alive until they become ghosts.

### 10. Play another round

The host can return everyone to the lobby. Players remain connected, roles are
cleared, and the host can adjust settings before starting another round.

## Reconnection and storage

Refreshing or briefly disconnecting preserves a player's session in the same
browser tab. Separate tabs can act as separate players for local testing.
Explicitly leaving removes that player. If the host closes the room from the
UI, the room is deleted.

Game state is never written to disk. Restarting the server clears all active
rooms. Export a lobby preset if its setup should be reused later.

## Development

Development uses two terminals so Vite can provide hot module replacement:

```bash
# Terminal 1: game server
npm run dev:server

# Terminal 2: Vite frontend
npm run dev
```

Open the Vite network address, normally `http://LAN-IP:5173`. Vite proxies
`/ws` to the local game server, so phones only connect to port 5173 during
development. For normal gameplay, use `npm run host` instead.

Quality checks:

```bash
npm run lint
npm test
npm run build
npm run check
```

## GitHub Pages

The static project page lives in `site/`. It explains the project but does not
host the game, because GitHub Pages cannot run the Node.js game server.

After pushing to GitHub, select **Settings → Pages → Source: GitHub Actions**.
Changes under `site/` on `master` are deployed by
`.github/workflows/pages.yml`.

## Browser limitations on local HTTP

Core gameplay, WebSockets, audio, and vibration work over local HTTP. Browser
security policies may disable Wake Lock, clipboard access, or installable-PWA
behavior because a LAN IP is not a secure context. Local HTTPS would require
each phone to trust a certificate and is therefore not enabled by default.

## Stack

- React 19, TypeScript, Tailwind CSS 4, and Vite
- Node.js HTTP server and WebSockets (`ws`)
- In-memory authoritative game engine
- Terminal QR generation with `qrcode`

Not currently included: in-app voting/elimination, accounts, native packaging,
durable game storage, or recovery after a host restart.
