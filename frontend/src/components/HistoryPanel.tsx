import { useState, useEffect } from "react";
import { loadHistory, saveHistory, HistoryItem } from "../App";

interface Props {
  open: boolean;
  onClose: () => void;
  onReuse: (url: string) => void;
}

const timeAgo = (ms: number) => {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};

export default function HistoryPanel({ open, onClose, onReuse }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (open) setItems(loadHistory());
  }, [open]);

  const clear = () => {
    saveHistory([]);
    setItems([]);
  };

  return (
    <div className={`history-panel${open ? " open" : ""}`}>
      <div className="history-panel__head">
        <span className="history-panel__title">History</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {items.length > 0 && (
            <button className="history-panel__clear" onClick={clear}>Clear</button>
          )}
          <button className="history-panel__close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="history-list">
        {items.length === 0 && (
          <div className="hist-empty">No downloads yet</div>
        )}
        {items.map(item => (
          <div key={item.id} className="hist-item" onClick={() => onReuse(item.url)}>
            {item.thumbnail
              ? <img className="hist-item__thumb" src={item.thumbnail} alt="" />
              : <div className="hist-item__thumb" />
            }
            <div className="hist-item__info">
              <div className="hist-item__title">{item.title}</div>
              <div className="hist-item__meta">{item.format.toUpperCase()} · {timeAgo(item.date)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}