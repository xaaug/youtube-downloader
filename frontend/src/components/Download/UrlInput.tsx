import { isValidYouTubeUrl } from "../../utils/validateYoutubeUrl";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFetch: () => void;
  fetching: boolean;
}

const UrlInput: React.FC<Props> = ({
  value,
  onChange,
  onKeyDown,
  onFetch,
  fetching,
}) => {
  const invalid = value.length > 0 && !isValidYouTubeUrl(value);
  const canFetch = value.length > 0 && !invalid && !fetching;

  return (
    <div>
      <label className="url-label">YouTube URL</label>
      <div className={`url-row${invalid ? " invalid" : ""}`}>
        <input
          className="url-input"
          type="text"
          placeholder="https://youtube.com/watch?v=... or playlist"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="fetch-btn"
          onClick={onFetch}
          disabled={!canFetch}
        >
          {fetching ? (
            <>
              <span className="spinner" />
              Fetching
            </>
          ) : (
            "Fetch →"
          )}
        </button>
      </div>
      {invalid && (
        <p className="url-error">✗ Not a valid YouTube URL</p>
      )}
    </div>
  );
};

export default UrlInput;