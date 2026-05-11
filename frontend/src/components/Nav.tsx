type Tab = "youtube" | "spotify";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
}

const Nav: React.FC<Props> = ({ tab, onTab }) => (
  <nav className="nav">
    <div className="nav__wordmark">dl<em>.</em></div>
    <div className="nav__tabs">
      <button className={`nav__tab${tab === "youtube" ? " active" : ""}`} onClick={() => onTab("youtube")}>
        <span className="nav__tab-dot" />
        YouTube
      </button>
      <button className={`nav__tab${tab === "spotify" ? " active" : ""}`} onClick={() => onTab("spotify")}>
        <span className="nav__tab-dot" />
        Spotify
      </button>
    </div>
  </nav>
);

export default Nav;