import { GameProvider } from './game/GameProvider'
import { useGame } from './game/context'
import { DashboardScreen } from './screens/DashboardScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { PlayScreen } from './screens/PlayScreen'
import { PreGameScreen } from './screens/PreGameScreen'
import { SabotageDeviceScreen } from './screens/SabotageDeviceScreen'
import { Screen } from './components/Screen'

export default function App() {
  return (
    <GameProvider>
      <AppView />
    </GameProvider>
  )
}

function AppView() {
  const { loading, game, device, dashboard } = useGame()

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-imposter">
          UnterUns
        </p>
        <h1 className="mt-3 font-display text-2xl font-extrabold uppercase">
          Linking up...
        </h1>
      </Screen>
    )
  }
  if (dashboard) return <DashboardScreen />
  if (device) return <SabotageDeviceScreen />
  if (!game) return <HomeScreen />
  if (game.status === 'lobby') return <LobbyScreen />
  if (game.status === 'pregame') return <PreGameScreen />
  return <PlayScreen />
}
