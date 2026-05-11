type Tab = "youtube" | "spotify";
interface Props { tab: Tab; onTab: (t: Tab) => void; onHistory: () => void; }

export default function Nav({ tab, onTab, onHistory }: Props) {
  return (
    <nav className="nav">
      <div className="nav__mark">dl<em>.</em></div>
      <div className="nav__tabs">
        <button className={`nav__tab${tab === "youtube" ? " active" : ""}`} onClick={() => onTab("youtube")}>YouTube</button>
        <button className={`nav__tab${tab === "spotify" ? " active" : ""}`} onClick={() => onTab("spotify")}>Spotify</button>
      </div>
      <div className="nav__right">
        <button className="nav__history-btn" onClick={onHistory}>History</button>
      </div>
    </nav>
  );
}