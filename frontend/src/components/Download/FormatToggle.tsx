interface Props {
    selected: "mp4" | "mp3";
    onSelect: (f: "mp4" | "mp3") => void;
  }
  
  const FormatToggle: React.FC<Props> = ({ selected, onSelect }) => {
    return (
      <div className="format-section">
        <span className="format-label">Output Format</span>
        <div className="format-toggle">
          <button
            className={`format-toggle__btn${selected === "mp4" ? " active" : ""}`}
            onClick={() => onSelect("mp4")}
          >
            ▶ MP4 Video
          </button>
          <button
            className={`format-toggle__btn${selected === "mp3" ? " active" : ""}`}
            onClick={() => onSelect("mp3")}
          >
            ♪ MP3 Audio
          </button>
        </div>
      </div>
    );
  };
  
  export default FormatToggle;