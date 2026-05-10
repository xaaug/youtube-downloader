import { Format } from "../../types/youtube";

interface Props {
  formats: Format[];
  selected: string;
  onSelect: (quality: string) => void;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return null;
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
};

const ResolutionSelect: React.FC<Props> = ({ formats, selected, onSelect }) => {
  return (
    <div className="resolution-section">
      <span className="resolution-label">Resolution</span>
      <div className="resolution-grid">
        {formats.map((f, i) => (
          <button
            key={f.quality}
            className={`resolution-chip${selected === f.quality ? " selected" : ""}${i === 0 ? " best" : ""}`}
            onClick={() => onSelect(f.quality)}
          >
            {f.quality}
            {f.filesize ? ` · ${formatSize(f.filesize)}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ResolutionSelect;