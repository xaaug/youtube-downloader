
import { useEffect, useState } from "react";
import {XIcon} from "lucide-react"

interface Props {
  url: string;
  onUse: () => void;
  onDismiss: () => void;
}

export default function ClipboardToast({ url, onUse, onDismiss }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [url]);

  const short = url.replace(/https?:\/\/(www\.)?/, "").slice(0, 48);
  const isSpotify = url.includes("spotify.com");

  return (
    <div className={`clipboard-toast${show ? " show" : ""}`}>
      <span style={{ color: "var(--sub)", fontSize: 11 }}>
        {isSpotify ? "Spotify" : "YouTube"} link detected
      </span>
      <span className="clipboard-toast__url">{short}</span>
      <button className="clipboard-toast__btn" onClick={onUse}>
        Use it →
      </button>
      <button className="clipboard-toast__dismiss" onClick={onDismiss}>
        <XIcon />
      </button>
    </div>
  );
}
