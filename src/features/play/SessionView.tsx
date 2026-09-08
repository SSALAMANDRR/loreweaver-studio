import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { quitTable } from "../../store/hostLocal"
import InputBox from "./InputBox"
import ManualRollCard from "./ManualRollCard"
import NarrativeLog from "./NarrativeLog"
import { PanelSidebar, PanelTray } from "./panels/PanelDeck"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatePanel from "./StatePanel"
import StatusPill from "./StatusPill"
import TurnStatus from "./TurnStatus"
import VersionBadge from "./VersionBadge"

export default function SessionView({
  onMenu,
  onCharacter,
}: {
  onMenu?: () => void
  onCharacter?: () => void
}) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)

  return (
    <div className="session">
      <div className="chronicle-pane">
        <header className="session-head">
          {onMenu ? (
            <button type="button" className="ghost-button" onClick={onMenu}>
              {t("play.menuButton")}
            </button>
          ) : null}
          {onCharacter ? (
            <button type="button" className="ghost-button" onClick={onCharacter}>
              {t("play.menu.character")}
            </button>
          ) : null}
          <span className="session-room">{welcome ? `${welcome.room} · ${welcome.you.name}` : "…"}</span>
          <PanelMenu />
          <StatusPill />
          <VersionBadge />
          <button type="button" className="ghost-button" onClick={() => void quitTable()}>
            {t("connect.disconnect")}
          </button>
        </header>
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <PanelTray />
        <ManualRollCard />
        <InputBox />
      </div>
      <aside className="desk-pane">
        <PanelSidebar />
        <StatePanel />
      </aside>
      <PanelModalHost />
    </div>
  )
}
