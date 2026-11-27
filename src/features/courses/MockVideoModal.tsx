import { Pause, Play, Video, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  title: string;
  sectionTitle?: string;
  courseCode: string;
  durationSeconds?: number;
  isVi: boolean;
  onClose: () => void;
}

function formatClock(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Interactive video preview modal using duration metadata provided by the course resource. */
export function MockVideoModal({ title, sectionTitle, courseCode, durationSeconds = 300, isVi, onClose }: Props) {
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.25 | 1.5>(1);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((prev) => (prev + 1 >= durationSeconds ? 0 : prev + 1));
    }, Math.round(1000 / speed));
    return () => window.clearInterval(timer);
  }, [playing, speed, durationSeconds]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)',
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--line, #e2e8f0)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              {courseCode}{sectionTitle ? ` · ${sectionTitle}` : ''}
            </div>
            <strong style={{ fontSize: 15 }}>{title}</strong>
          </div>
          <button type="button" className="icon-plain" aria-label={isVi ? 'Đóng video' : 'Close video'} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f3b66 100%)',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.28)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={26} /> : <Play size={26} />}
          </div>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#93c5fd', marginBottom: 6 }}>
              <Video size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
              {playing ? (isVi ? 'Đang phát bài giảng mô phỏng' : 'Playing lecture preview') : (isVi ? 'Đã tạm dừng' : 'Paused')}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{title}</div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: '#0f172a', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-outline sm"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', background: 'transparent' }}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? (isVi ? 'Tạm dừng' : 'Pause') : (isVi ? 'Phát' : 'Play')}
          </button>
          <input
            type="range"
            min={0}
            max={durationSeconds}
            value={elapsed}
            aria-label={isVi ? 'Tiến độ video' : 'Video progress'}
            onChange={(e) => setElapsed(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#38bdf8' }}
          />
          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 86, textAlign: 'right' }}>
            {formatClock(elapsed)} / {formatClock(durationSeconds)}
          </span>
          <button
            type="button"
            className="btn btn-outline sm"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', background: 'transparent', minWidth: 52 }}
            onClick={() => setSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 1.5 : 1))}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
