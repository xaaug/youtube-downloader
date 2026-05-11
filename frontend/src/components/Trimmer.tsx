import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  duration: number;
  startTime: number;
  endTime: number;
  onChange: (s: number, e: number) => void;
}

const fmt = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  const h = Math.floor(v/3600), m = Math.floor((v%3600)/60), ss = v%60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${m}:${String(ss).padStart(2,"0")}`;
};

const parse = (str: string): number | null => {
  const p = str.trim().split(":").map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
  if (p.length === 2) return p[0]*60 + p[1];
  return p[0] ?? null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function Trimmer({ duration, startTime, endTime, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [si, setSi] = useState(fmt(startTime));
  const [ei, setEi] = useState(fmt(endTime));

  useEffect(() => setSi(fmt(startTime)), [startTime]);
  useEffect(() => setEi(fmt(endTime)),   [endTime]);

  const pct = (t: number) => `${(t/duration)*100}%`;

  const fromEvent = useCallback((e: MouseEvent) => {
    if (!trackRef.current) return 0;
    const r = trackRef.current.getBoundingClientRect();
    return Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * duration);
  }, [duration]);

  const drag = (which: "s"|"e") => (ev: React.MouseEvent) => {
    ev.preventDefault();
    const move = (e: MouseEvent) => {
      const t = fromEvent(e);
      which === "s" ? onChange(clamp(t, 0, endTime-1), endTime)
                    : onChange(startTime, clamp(t, startTime+1, duration));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const commitS = () => { const t = parse(si); t !== null ? onChange(clamp(t,0,endTime-1),endTime) : setSi(fmt(startTime)); };
  const commitE = () => { const t = parse(ei); t !== null ? onChange(startTime,clamp(t,startTime+1,duration)) : setEi(fmt(endTime)); };

  return (
    <div className="trimmer">
      <div className="trimmer__top">
        <span className="trimmer__ttl">Trim</span>
        <span className="trimmer__sel">{fmt(endTime - startTime)}</span>
      </div>
      <div className="trimmer__track" ref={trackRef}>
        <div className="trimmer__fade" style={{ left:0, width: pct(startTime) }} />
        <div className="trimmer__fade" style={{ right:0, width: pct(duration-endTime), position:"absolute", top:0, bottom:0 }} />
        <div className="trimmer__zone" style={{ left: pct(startTime), width: pct(endTime-startTime) }} />
        <div className="trimmer__handle" style={{ left: pct(startTime) }} onMouseDown={drag("s")}>
          <span className="trimmer__tip">{fmt(startTime)}</span>
        </div>
        <div className="trimmer__handle" style={{ left: pct(endTime) }} onMouseDown={drag("e")}>
          <span className="trimmer__tip">{fmt(endTime)}</span>
        </div>
      </div>
      <div className="trimmer__inputs">
        <div className="trimmer__grp">
          <span className="trimmer__lbl">Start</span>
          <input className="trimmer__in" value={si} onChange={e=>setSi(e.target.value)} onBlur={commitS} onKeyDown={e=>e.key==="Enter"&&commitS()} />
        </div>
        <span className="trimmer__arrow">→</span>
        <div className="trimmer__grp">
          <span className="trimmer__lbl">End</span>
          <input className="trimmer__in" value={ei} onChange={e=>setEi(e.target.value)} onBlur={commitE} onKeyDown={e=>e.key==="Enter"&&commitE()} />
        </div>
        <button className="trimmer__rst" onClick={() => onChange(0, duration)}>↺</button>
      </div>
    </div>
  );
}