import { useDownloader } from "../../hooks/useDownloader";
import UrlInput from "./UrlInput";
import FormatToggle from "./FormatToggle";
import VideoPreview from "./VideoPreview";
import ResolutionSelect from "./ResolutionSelect";
import DownloadButton from "./DownloadButton";

const DownloadVideo: React.FC = () => {
  const {
    url,
    setUrl,
    metadata,
    fetching,
    error,
    selectedQuality,
    setSelectedQuality,
    selectedFormat,
    setSelectedFormat,
    loadMetadata,
  } = useDownloader();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") loadMetadata();
  };

  return (
    <div>
      {/* HERO */}
      <div className="dl-hero">
        <h1 className="dl-hero__title">
          <span className="text-gray-500">Download</span><br />
          <strong>anything.</strong>
        </h1>
        <p className="dl-hero__sub">
          YouTube videos, playlists, MP4, MP3 — all at max quality.
        </p>
      </div>

      {/* URL INPUT */}
      <div className="url-section">
        <UrlInput
          value={url}
          onChange={setUrl}
          onKeyDown={handleKeyDown}
          onFetch={loadMetadata}
          fetching={fetching}
        />
      </div>

      {error && (
        <p className="url-error" style={{ marginTop: 12 }}>
          ✗ {error}
        </p>
      )}

      {/* METADATA RESULTS */}
      {metadata && (
        <div className="section-enter">
          <div className="dl-divider" />

          {/* VIDEO / PLAYLIST PREVIEW */}
          <VideoPreview metadata={metadata} />

          {/* FORMAT TOGGLE — always shown */}
          <FormatToggle
            selected={selectedFormat}
            onSelect={setSelectedFormat}
          />

          {/* RESOLUTION — only for mp4 */}
          {selectedFormat === "mp4" && (
            <ResolutionSelect
              formats={metadata.formats}
              selected={selectedQuality}
              onSelect={setSelectedQuality}
            />
          )}

          {/* DOWNLOAD */}
          <DownloadButton
            url={url}
            quality={selectedQuality}
            format={selectedFormat}
            isPlaylist={metadata.is_playlist}
          />
        </div>
      )}
    </div>
  );
};

export default DownloadVideo;