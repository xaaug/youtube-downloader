import { Metadata } from "../../types/youtube";

interface Props {
  metadata: Metadata;
}

const formatDuration = (secs: number | null) => {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatViews = (n: number | null) => {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
};

const VideoPreview: React.FC<Props> = ({ metadata }) => {
  const isPlaylist = metadata.is_playlist;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="preview-card fade-in">
        {/* THUMBNAIL */}
        <div className="preview-card__thumb">
          {metadata.thumbnail && (
            <img src={metadata.thumbnail} alt="" />
          )}
          {!isPlaylist && (metadata as any).duration && (
            <span className="preview-card__duration">
              {formatDuration((metadata as any).duration)}
            </span>
          )}
        </div>

        {/* INFO */}
        <div className="preview-card__info">
          <div className="preview-card__type-badge">
            <span className="dot" />
            {isPlaylist
              ? `Playlist · ${(metadata as any).count} videos`
              : "Video"}
          </div>

          <p className="preview-card__title">{metadata.title}</p>

          <div className="preview-card__meta">
            {metadata.uploader && (
              <span>{metadata.uploader}</span>
            )}
            {!isPlaylist && (metadata as any).view_count && (
              <>
                {" · "}
                <span>{formatViews((metadata as any).view_count)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PLAYLIST ENTRIES */}
      {isPlaylist && (metadata as any).entries?.length > 0 && (
        <div className="playlist-entries fade-in">
          {(metadata as any).entries.map((entry: any, i: number) => (
            <div key={entry.id} className="playlist-entry">
              <span className="playlist-entry__index">{i + 1}</span>
              <img
                className="playlist-entry__thumb"
                src={entry.thumbnail}
                alt=""
                loading="lazy"
              />
              <span className="playlist-entry__title">{entry.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoPreview;