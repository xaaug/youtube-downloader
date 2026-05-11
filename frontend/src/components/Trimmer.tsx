import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  duration: number;
  startTime: number;
  endTime: number;
  onChange: (start: number, end: number) => void;
}

const fmt = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${m}:${String(ss).padStart(2,"0")}`;
};

const parseTime = (str: string): number | null => {
  const parts = str.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const Trimmer: React.FC<Props> = ({ duration, startTime, endTime, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [startInput, setStartInput] = useState(fmt(startTime));
  const [endInput,   setEndInput]   = useState(fmt(endTime));

  useEffect(() => setStartInput(fmt(startTime)), [startTime]);
  useEffect(() => setEndInput(fmt(endTime)),     [endTime]);

  const pct = (t: number) => `${(t / duration) * 100}%`;

  const timeFromEvent = useCallback((e: MouseEvent) => {
    if (!trackRef.current) return 0;
    const rect  = trackRef.current.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * duration);
  }, [duration]);

  const onMouseDown = (handle: "start"|"end") => (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const t = timeFromEvent(ev);
      if (handle === "start") onChange(clamp(t, 0, endTime - 1), endTime);
      else                    onChange(startTime, clamp(t, startTime + 1, duration));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const commitStart = () => {
    const t = parseTime(startInput);
    if (t !== null) onChange(clamp(t, 0, endTime - 1), endTime);
    else setStartInput(fmt(startTime));
  };
  const commitEnd = () => {
    const t = parseTime(endInput);
    if (t !== null) onChange(startTime, clamp(t, startTime + 1, duration));
    else setEndInput(fmt(endTime));
  };

  return (
    <div className="trimmer">
      <div className="trimmer__top">
        <span className="trimmer__title">✂ Clip</span>
        <span className="trimmer__dur">{fmt(endTime - startTime)} selected</span>
      </div>

      <div className="trimmer__track" ref={trackRef}>
        <div className="trimmer__fade" style={{ left: 0, width: pct(startTime) }} />
        <div className="trimmer__fade" style={{ right: 0, width: pct(duration - endTime), position: "absolute", top: 0, bottom: 0 }} />
        <div className="trimmer__sel"  style={{ left: pct(startTime), width: pct(endTime - startTime) }} />
        <div className="trimmer__handle" style={{ left: pct(startTime) }} onMouseDown={onMouseDown("start")}>
          <span className="trimmer__handle-tip">{fmt(startTime)}</span>
        </div>
        <div className="trimmer__handle" style={{ left: pct(endTime) }} onMouseDown={onMouseDown("end")}>
          <span className="trimmer__handle-tip">{fmt(endTime)}</span>
        </div>
      </div>

      <div className="trimmer__inputs">
        <div className="trimmer__time-group">
          <span className="trimmer__time-label">Start</span>
          <input className="trimmer__time-input" value={startInput}
            onChange={e => setStartInput(e.target.value)}
            onBlur={commitStart} onKeyDown={e => e.key==="Enter" && commitStart()} />
        </div>
        <span className="trimmer__sep">→</span>
        <div className="trimmer__time-group">
          <span className="trimmer__time-label">End</span>
          <input className="trimmer__time-input" value={endInput}
            onChange={e => setEndInput(e.target.value)}
            onBlur={commitEnd} onKeyDown={e => e.key==="Enter" && commitEnd()} />
        </div>
        <button className="trimmer__reset" onClick={() => onChange(0, duration)}>↺ Full</button>
      </div>
    </div>
  );
};

export default Trimmer;