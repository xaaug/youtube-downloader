const Header: React.FC = () => {
  return (
    <header className="dl-header">
      <div className="dl-header__logo">
        DL<span>.</span>
      </div>
      <span className="dl-header__badge">v2.0 · yt-dlp</span>
    </header>
  );
};

export default Header;