import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutList,
  LoaderCircle,
  Lock,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';

interface Props {
  courseId: string;
  data: KnowledgeGraphData;
  mode: 'path' | 'list';
  onOpenLearn: (nodeId: string) => void;
  onFocusInGraph: (nodeId: string) => void;
}

interface GroupedBucket {
  key: string;
  label: string;
  sortOrder: number;
  nodes: KnowledgeGraphNode[];
}

const PASTEL_TYPE_STYLE: Record<string, { bg: string; border: string; badgeBg: string; text: string; label: string }> = {
  Concept: { bg: '#e8f4fc', border: '#93c5fd', badgeBg: '#e0f2fe', text: '#0369a1', label: 'Khái niệm' },
  LO: { bg: '#e8f8f0', border: '#86efac', badgeBg: '#d1fae5', text: '#047857', label: 'Chuẩn đầu ra' },
  Assignment: { bg: '#fff0f2', border: '#fda4af', badgeBg: '#ffe4e6', text: '#be123c', label: 'Bài tập' },
  Item: { bg: '#fff4eb', border: '#fdba74', badgeBg: '#ffedd5', text: '#c2410c', label: 'Câu hỏi' },
  Course: { bg: '#fefce8', border: '#fde047', badgeBg: '#fef9c3', text: '#a16207', label: 'Môn học' },
  Content: { bg: '#f8fafc', border: '#cbd5e1', badgeBg: '#f1f5f9', text: '#475569', label: 'Tài liệu' },
};

function styleOf(type: string) {
  return PASTEL_TYPE_STYLE[type] ?? PASTEL_TYPE_STYLE.Concept;
}

function groupKeyOf(node: KnowledgeGraphNode): { key: string; label: string; sortOrder: number } {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const chapter = props.chapter_id ?? props.chapterId;
  if (typeof chapter === 'string' && chapter.trim()) {
    const match = chapter.match(/\d+/);
    const num = match ? Number(match[0]) : 500;
    return {
      key: `ch-${chapter}`,
      label: `Chương ${match ? match[0] : chapter}`,
      sortOrder: num,
    };
  }
  const week = props.default_week ?? props.defaultWeek;
  if (typeof week === 'number' && Number.isFinite(week)) {
    return { key: `ch-ch${week}`, label: `Chương ${week}`, sortOrder: week };
  }
  return { key: 'general', label: 'Tổng quan & Khái niệm chung', sortOrder: 999 };
}

/** Xác định vị trí X theo đường cong zigzag (lượn sóng) giống lộ trình G4LMS */
const ROADMAP_CENTER_X = 240;
const ROADMAP_X_OFFSETS = [0, 78, 108, 62, -24, -92, -74, 10];
const ROADMAP_STEP_Y = 122;
const ROADMAP_TOP_Y = 56;

function chapterInfoOf(node: KnowledgeGraphNode): { key: string; label: string; sortOrder: number } {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const raw = props.chapter_id ?? props.chapterId;
  if (typeof raw === 'string' && raw.trim()) {
    const match = raw.match(/\d+/);
    return {
      key: raw.trim(),
      label: match ? `Chương ${match[0]}` : raw.trim(),
      sortOrder: match ? Number(match[0]) : 500,
    };
  }
  return { key: 'other', label: 'Nội dung chung', sortOrder: 999 };
}

function nodePos(index: number): { x: number; y: number } {
  const offset = ROADMAP_X_OFFSETS[index % ROADMAP_X_OFFSETS.length];
  return {
    x: ROADMAP_CENTER_X + offset,
    y: ROADMAP_TOP_Y + index * ROADMAP_STEP_Y,
  };
}

export function StudentJourneyViews({ courseId, data, mode, onOpenLearn, onFocusInGraph }: Props) {
  const studyNodes = useMemo(
    () => data.nodes.filter((n) => n.type !== 'Content' && n.type !== 'Course' && n.type !== 'LO'),
    [data.nodes],
  );

  const buckets = useMemo(() => {
    const map = new Map<string, GroupedBucket>();
    for (const node of studyNodes) {
      const g = groupKeyOf(node);
      const existing = map.get(g.key);
      if (existing) existing.nodes.push(node);
      else map.set(g.key, { ...g, nodes: [node] });
    }
    return Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((bucket) => {
        const sortedNodes = [...bucket.nodes].sort(
          (a, b) => chapterInfoOf(a).sortOrder - chapterInfoOf(b).sortOrder,
        );
        const chapterLabels: string[] = [];
        const seenCh = new Set<string>();
        for (const n of sortedNodes) {
          const ch = chapterInfoOf(n);
          if (ch.key !== 'other' && !seenCh.has(ch.key)) {
            seenCh.add(ch.key);
            chapterLabels.push(ch.label);
          }
        }
        return { ...bucket, nodes: sortedNodes, chapterLabels };
      });
  }, [studyNodes]);

  const [selectedBucketKey, setSelectedBucketKey] = useState<string>(() => buckets[0]?.key ?? 'general');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'learning' | 'remedial' | 'unlearned' | 'locked'>('all');
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [graphBoxEl, setGraphBoxEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!graphBoxEl) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        setZoom((z) => Math.min(1.6, Math.max(0.45, Number((z + delta).toFixed(2)))));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX * 0.6, y: p.y - e.deltaY * 0.6 }));
      }
    };
    graphBoxEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => graphBoxEl.removeEventListener('wheel', handleWheel);
  }, [graphBoxEl]);

  type LearningState = 'mastered' | 'learning' | 'remedial' | 'unlearned' | 'locked';

  const learningStateMap = useMemo(() => {
    const map = new Map<string, { state: LearningState; lockReason?: string }>();
    const prereqSources = new Map<string, string[]>();
    const nameById = new Map(data.nodes.map((n) => [n.id, n.name]));

    for (const e of data.edges) {
      if (e.type === 'PREREQUISITE') {
        const arr = prereqSources.get(e.target) ?? [];
        arr.push(e.source);
        prereqSources.set(e.target, arr);
      }
    }

    let hasLearning = false;
    let hasRemedial = false;

    for (const node of studyNodes) {
      const p = (node.properties ?? {}) as Record<string, unknown>;
      const ls = String(p.learning_state ?? p.learningState ?? '');
      const masteryVal = typeof p.mastery === 'number' ? p.mastery : null;

      if (ls === 'mastered' || (masteryVal !== null && masteryVal >= 70)) {
        map.set(node.id, { state: 'mastered' });
      } else if (ls === 'learning') {
        hasLearning = true;
        map.set(node.id, { state: 'learning' });
      } else if (ls === 'remedial' || p.status === 'proposed' || p.status === 'pending_review') {
        hasRemedial = true;
        map.set(node.id, { state: 'remedial' });
      } else {
        map.set(node.id, { state: 'unlearned' });
      }
    }

    // Lock nodes whose PREREQUISITE source is not mastered (when there is at least one unmastered prereq)
    for (const node of studyNodes) {
      const cur = map.get(node.id);
      if (!cur || cur.state === 'mastered' || cur.state === 'learning') continue;
      const reqs = prereqSources.get(node.id) ?? [];
      const missing = reqs.find((srcId) => map.get(srcId)?.state !== 'mastered');
      if (missing) {
        map.set(node.id, {
          state: 'locked',
          lockReason: `Cần hoàn thành: ${nameById.get(missing) ?? missing}`,
        });
      }
    }

    // Lock subsequent sessions/weeks when an earlier session is not yet fully mastered
    let unfinishedSessionLabel: string | null = null;
    for (const bucket of buckets) {
      if (unfinishedSessionLabel) {
        for (const n of bucket.nodes) {
          if (map.get(n.id)?.state !== 'mastered') {
            map.set(n.id, {
              state: 'locked',
              lockReason: `Cần hoàn thành: ${unfinishedSessionLabel}`,
            });
          }
        }
      } else {
        const hasPending = bucket.nodes.some((n) => map.get(n.id)?.state !== 'mastered');
        if (hasPending) {
          unfinishedSessionLabel = bucket.label;
        }
      }
    }

    // Ensure at least 1 active "Đang học" item if none exists
    if (!hasLearning) {
      const firstOpen = studyNodes.find((n) => map.get(n.id)?.state === 'unlearned') ?? studyNodes.find((n) => map.get(n.id)?.state !== 'locked') ?? studyNodes[0];
      if (firstOpen && map.get(firstOpen.id)?.state !== 'locked') {
        map.set(firstOpen.id, { state: 'learning' });
      }
    }
    if (!hasRemedial) {
      const candidate = studyNodes.find((n) => {
        const s = map.get(n.id)?.state;
        const conf = typeof n.properties?.confidence === 'number' ? n.properties.confidence : 1;
        return s === 'unlearned' && conf < 0.85;
      });
      if (candidate) map.set(candidate.id, { state: 'remedial' });
    }

    return map;
  }, [studyNodes, buckets, data.edges, data.nodes]);

  const activeBucket = buckets.find((b) => b.key === selectedBucketKey) ?? buckets[0];
  const selectedNode = useMemo(
    () => studyNodes.find((n) => n.id === selectedNodeId) ?? null,
    [studyNodes, selectedNodeId],
  );

  const nodeRelations = useMemo(() => {
    if (!selectedNode) return { before: [] as KnowledgeGraphNode[], after: [] as KnowledgeGraphNode[], related: [] as KnowledgeGraphNode[] };
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const before: KnowledgeGraphNode[] = [];
    const after: KnowledgeGraphNode[] = [];
    const related: KnowledgeGraphNode[] = [];

    for (const e of data.edges) {
      if (e.type === 'PREREQUISITE') {
        if (e.target === selectedNode.id) {
          const src = byId.get(e.source);
          if (src) before.push(src);
        } else if (e.source === selectedNode.id) {
          const tgt = byId.get(e.target);
          if (tgt) after.push(tgt);
        }
      } else if (e.type === 'RELATED_TO' || e.type === 'DEVELOP') {
        if (e.source === selectedNode.id) {
          const tgt = byId.get(e.target);
          if (tgt && tgt.type !== 'Content') related.push(tgt);
        } else if (e.target === selectedNode.id) {
          const src = byId.get(e.source);
          if (src && src.type !== 'Content') related.push(src);
        }
      }
    }
    return { before, after, related };
  }, [selectedNode, data]);

  const filteredListBuckets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buckets
      .map((b) => {
        const masteredCount = b.nodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
        const matchingNodes = b.nodes.filter((n) => {
          const st = learningStateMap.get(n.id)?.state ?? 'unlearned';
          if (statusFilter !== 'all' && st !== statusFilter) return false;
          if (!q) return true;
          return `${n.name} ${n.description ?? ''} ${n.id}`.toLowerCase().includes(q);
        });
        return { ...b, totalInBucket: b.nodes.length, masteredCount, nodes: matchingNodes };
      })
      .filter((b) => b.nodes.length > 0);
  }, [buckets, query, statusFilter, learningStateMap]);

  const counts = useMemo(() => {
    let learning = 0;
    let remedial = 0;
    let unlearned = 0;
    let locked = 0;
    for (const n of studyNodes) {
      const st = learningStateMap.get(n.id)?.state ?? 'unlearned';
      if (st === 'learning') learning += 1;
      else if (st === 'remedial') remedial += 1;
      else if (st === 'locked') locked += 1;
      else if (st === 'unlearned') unlearned += 1;
    }
    return { all: studyNodes.length, learning, remedial, unlearned, locked };
  }, [studyNodes, learningStateMap]);

  const selectedProps = (selectedNode?.properties ?? {}) as Record<string, unknown>;
  const activeNodes = activeBucket?.nodes ?? [];
  const canvasHeight = Math.max(280, ROADMAP_TOP_Y + Math.max(0, activeNodes.length - 1) * ROADMAP_STEP_Y + 90);
  const firstPendingIndex = activeNodes.findIndex((n) => {
    const st = String(n.properties?.status ?? '');
    return st !== 'approved' && st !== 'instructor_approved' && st !== 'mastered';
  });
  const activeNodeIdx = firstPendingIndex >= 0 ? firstPendingIndex : 0;

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', background: '#f8fafc' }}>
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 22px' }}>
        {mode === 'path' ? (
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            {/* Pastel Week / Session Stepper */}
            <nav
              aria-label="Chọn chặng học"
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 12,
                marginBottom: 14,
              }}
            >
              {buckets.map((bucket) => {
                const active = activeBucket?.key === bucket.key;
                const bucketLocked = bucket.nodes.length > 0 && bucket.nodes.every((n) => learningStateMap.get(n.id)?.state === 'locked');
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() => {
                      setSelectedBucketKey(bucket.key);
                      setSelectedNodeId(null);
                      setPan({ x: 0, y: 0 });
                      setZoom(1);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: `1.5px solid ${active ? '#7dd3fc' : '#e2e8f0'}`,
                      background: active ? '#e0f2fe' : bucketLocked ? '#f1f5f9' : '#ffffff',
                      color: active ? '#0369a1' : bucketLocked ? '#64748b' : '#334155',
                      whiteSpace: 'nowrap',
                      boxShadow: active ? '0 2px 8px rgba(14, 165, 233, 0.14)' : 'none',
                    }}
                  >
                    {bucketLocked ? <Lock size={13} /> : <CalendarDays size={14} />}
                    <span style={{ textAlign: 'left' }}>
                      <b style={{ display: 'block', fontSize: 12 }}>{bucket.label}</b>
                      <small style={{ fontSize: 10, opacity: 0.8 }}>
                        {bucketLocked ? 'Đang khóa' : `${bucket.nodes.length} khái niệm`}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Week Summary Card */}
            {activeBucket && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #bae6fd',
                  borderRadius: 14,
                  padding: '14px 18px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  boxShadow: '0 2px 10px rgba(14, 165, 233, 0.06)',
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0c4a6e' }}>
                    {activeBucket.label} · {activeBucket.nodes.length} mục
                  </div>
                  <div className="muted-xs" style={{ marginTop: 2, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    {activeBucket.chapterLabels.length > 0
                      ? activeBucket.chapterLabels.join(' · ')
                      : `${courseId} · Lộ trình học tập gợi ý theo đồ thị`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => onFocusInGraph(activeBucket.nodes[0]?.id ?? '')}
                >
                  <Network size={13} /> Xem quan hệ
                </button>
              </div>
            )}

            {/* Winding S-Curve Roadmap (Floating Pan & Zoom inside this box) */}
            {activeNodes.length === 0 ? (
              <div className="admin-card" style={{ padding: 24, textAlign: 'center' }}>
                <p className="muted">Chưa có nội dung trong chặng học này.</p>
              </div>
            ) : (
              <div
                ref={setGraphBoxEl}
                onPointerDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button, a, input, select, [data-no-pan="true"]')) return;
                  setDragging(true);
                  dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!dragging || !dragStartRef.current) return;
                  setPan({
                    x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
                    y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
                  });
                }}
                onPointerUp={(e) => {
                  if (!dragging) return;
                  setDragging(false);
                  dragStartRef.current = null;
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch { /* ignore */ }
                }}
                style={{
                  position: 'relative',
                  width: 560,
                  maxWidth: '100%',
                  height: 'min(580px, 68vh)',
                  margin: '0 auto',
                  backgroundColor: '#ffffff',
                  backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: `${pan.x}px ${pan.y}px`,
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
                  overflow: 'hidden',
                  overscrollBehavior: 'contain',
                  cursor: dragging ? 'grabbing' : 'grab',
                  userSelect: dragging ? 'none' : 'auto',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 480,
                    height: canvasHeight,
                    margin: '0 auto',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <svg
                    width={480}
                    height={canvasHeight}
                    viewBox={`0 0 480 ${canvasHeight}`}
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                    aria-hidden
                  >
                    {activeNodes.slice(0, -1).map((node, i) => {
                      const p1 = nodePos(i);
                      const p2 = nodePos(i + 1);
                      const midY = (p1.y + p2.y) / 2;
                      const d = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
                      const midX = (p1.x + p2.x) / 2;
                      return (
                        <g key={`curve-${node.id}`}>
                          <path d={d} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" />
                          <circle cx={midX} cy={midY} r={3.5} fill="#94a3b8" />
                        </g>
                      );
                    })}
                  </svg>

                  {activeNodes.map((node, index) => {
                    const pos = nodePos(index);
                    const st = styleOf(node.type);
                    const lInfo = learningStateMap.get(node.id);
                    const lState = lInfo?.state ?? 'unlearned';
                    const isDone = lState === 'mastered';
                    const isCurrent = lState === 'learning' || (index === activeNodeIdx && lState !== 'locked' && !isDone);
                    const isLocked = lState === 'locked';
                    const isSelected = selectedNodeId === node.id;
                    const labelOnLeft = pos.x > ROADMAP_CENTER_X + 20;

                    const circleBg = isCurrent ? '#0284c7' : isDone ? '#d1fae5' : isLocked ? '#f1f5f9' : st.bg;
                    const circleBorder = isCurrent ? '#38bdf8' : isDone ? '#34d399' : isLocked ? '#cbd5e1' : st.border;
                    const circleColor = isCurrent ? '#ffffff' : isDone ? '#047857' : isLocked ? '#64748b' : st.text;

                    return (
                      <div
                        key={node.id}
                        style={{
                          position: 'absolute',
                          left: pos.x,
                          top: pos.y,
                          transform: 'translate(-50%, -50%)',
                          display: 'flex',
                          alignItems: 'center',
                          opacity: isLocked ? 0.72 : 1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(node.id)}
                          aria-label={node.name}
                          style={{
                            width: isCurrent ? 68 : 58,
                            height: isCurrent ? 68 : 58,
                            borderRadius: '50%',
                            border: `3px solid ${isSelected ? '#0f172a' : circleBorder}`,
                            background: circleBg,
                            color: circleColor,
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: isCurrent
                              ? '0 0 0 7px rgba(56, 189, 248, 0.22), 0 6px 16px rgba(2, 132, 199, 0.25)'
                              : '0 3px 10px rgba(15, 23, 42, 0.06)',
                            transition: 'transform 0.15s ease',
                          }}
                        >
                          {isDone ? (
                            <Check size={22} strokeWidth={2.6} />
                          ) : isCurrent ? (
                            <LoaderCircle size={24} />
                          ) : isLocked ? (
                            <Lock size={20} />
                          ) : (
                            <BookOpen size={20} />
                          )}
                        </button>

                        <div
                          data-no-pan="true"
                          onClick={() => setSelectedNodeId(node.id)}
                          style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            ...(labelOnLeft ? { right: 'calc(100% + 12px)', textAlign: 'right' } : { left: 'calc(100% + 12px)', textAlign: 'left' }),
                            width: 150,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12, color: isLocked ? '#64748b' : '#0f172a', lineHeight: 1.3 }}>
                            {node.name}
                          </div>
                          <div style={{ fontSize: 10, color: isCurrent ? '#0284c7' : isLocked ? '#b45309' : '#64748b', marginTop: 2 }}>
                            {isCurrent ? 'Đang học' : isDone ? 'Đã vững' : isLocked ? (lInfo?.lockReason ?? 'Đang khóa') : st.label}
                          </div>
                          {isCurrent && !isLocked && (
                            <button
                              type="button"
                              className="btn btn-primary sm"
                              style={{ marginTop: 6, borderRadius: 999, padding: '4px 12px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenLearn(node.id);
                              }}
                            >
                              Tiếp tục <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Floating Zoom / Reset Controls inside the graph box */}
                <div
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: 4,
                    borderRadius: 10,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <button
                    type="button"
                    className="kg-btn sm"
                    title="Phóng to"
                    onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.12).toFixed(2))))}
                  >
                    <ZoomIn size={14} />
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', minWidth: 40, textAlign: 'center' }}>
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="kg-btn sm"
                    title="Thu nhỏ"
                    onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.12).toFixed(2))))}
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    type="button"
                    className="kg-btn sm"
                    title="Đặt lại vị trí"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* List Mode (giống G4LMS: Tất cả, Đang học, Cần ôn, Chưa học, Khóa + Accordion theo tuần) */
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: '#f8fafc',
                  flex: '1 1 240px',
                }}
              >
                <Search size={14} color="#64748b" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc mã bài..."
                  style={{ border: 0, outline: 'none', width: '100%', background: 'transparent' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    ['all', `Tất cả (${counts.all})`],
                    ['learning', `Đang học (${counts.learning})`],
                    ['remedial', `Cần ôn (${counts.remedial})`],
                    ['unlearned', `Chưa học (${counts.unlearned})`],
                    ['locked', `Khóa (${counts.locked})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      border: `1.5px solid ${statusFilter === key ? '#0284c7' : '#e2e8f0'}`,
                      background: statusFilter === key ? '#e0f2fe' : '#fff',
                      color: statusFilter === key ? '#0369a1' : '#475569',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredListBuckets.length === 0 ? (
              <div className="admin-card" style={{ padding: 24, textAlign: 'center' }}>
                <LayoutList size={22} color="#94a3b8" style={{ marginBottom: 6 }} />
                <p className="muted">Không tìm thấy bài học nào phù hợp bộ lọc.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredListBuckets.map((bucket, idx) => {
                  const isOpen = openBuckets[bucket.key] ?? idx === 0;
                  const hasLearning = bucket.nodes.some((n) => learningStateMap.get(n.id)?.state === 'learning');
                  return (
                    <div
                      key={bucket.key}
                      style={{
                        border: `1.5px solid ${hasLearning ? '#7dd3fc' : '#e2e8f0'}`,
                        borderRadius: 12,
                        background: '#fff',
                        overflow: 'hidden',
                        boxShadow: hasLearning ? '0 2px 10px rgba(14, 165, 233, 0.08)' : 'none',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenBuckets((prev) => ({ ...prev, [bucket.key]: !isOpen }))}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          border: 0,
                          background: hasLearning ? '#f0f9ff' : '#fff',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: hasLearning ? '#0284c7' : '#f1f5f9',
                            color: hasLearning ? '#fff' : '#334155',
                            flexShrink: 0,
                          }}
                        >
                          {bucket.label}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                            {bucket.chapterLabels.length > 0
                              ? bucket.chapterLabels.join(' · ')
                              : `${bucket.label} · ${bucket.totalInBucket} khái niệm`}
                          </div>
                          <div className="muted-xs" style={{ marginTop: 2 }}>
                            {hasLearning ? 'Buổi hiện tại' : 'Đã mở'}
                            {bucket.chapterLabels.length > 1 ? ` · ${bucket.chapterLabels.length} chương` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginRight: 6 }}>
                          <div style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>
                            {bucket.masteredCount}/{bucket.totalInBucket}
                          </div>
                          <div className="muted-xs">khái niệm đã vững</div>
                        </div>
                        {isOpen ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                      </button>

                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {bucket.nodes.map((node, nodeIdx) => {
                            const info = learningStateMap.get(node.id) ?? { state: 'unlearned' as const };
                            const st = info.state;
                            const typeStyle = styleOf(node.type);
                            const props = (node.properties ?? {}) as Record<string, unknown>;
                            const duration = props.duration_min ?? props.durationMin;
                            const isSelected = selectedNodeId === node.id;
                            const chInfo = chapterInfoOf(node);
                            const prevChKey = nodeIdx > 0 ? chapterInfoOf(bucket.nodes[nodeIdx - 1]).key : null;
                            const showChapterHeader = bucket.chapterLabels.length > 0 && chInfo.key !== prevChKey;
                            const chNodes = showChapterHeader
                              ? bucket.nodes.filter((n) => chapterInfoOf(n).key === chInfo.key)
                              : [];
                            const chMastered = showChapterHeader
                              ? chNodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length
                              : 0;

                            const rowBg =
                              st === 'learning'
                                ? '#f0f9ff'
                                : st === 'remedial'
                                  ? '#fffbeb'
                                  : isSelected
                                    ? typeStyle.bg
                                    : '#fff';

                            const leftBorder =
                              st === 'learning'
                                ? '3px solid #0284c7'
                                : st === 'remedial'
                                  ? '3px solid #d97706'
                                  : '3px solid transparent';

                            return (
                              <div key={node.id}>
                                {showChapterHeader && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '7px 16px',
                                      borderTop: '1px solid #e2e8f0',
                                      background: '#f8fafc',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: '#475569',
                                      letterSpacing: '0.04em',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    <span>{chInfo.label}</span>
                                    <span>{chMastered}/{chNodes.length}</span>
                                  </div>
                                )}
                              <div
                                onClick={() => setSelectedNodeId(node.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  padding: '11px 16px',
                                  borderTop: '1px solid #f1f5f9',
                                  borderLeft: leftBorder,
                                  background: rowBg,
                                  cursor: 'pointer',
                                }}
                              >
                                <span
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    border: `1.5px solid ${
                                      st === 'mastered'
                                        ? '#86efac'
                                        : st === 'learning'
                                          ? '#7dd3fc'
                                          : st === 'remedial'
                                            ? '#fcd34d'
                                            : '#cbd5e1'
                                    }`,
                                    background:
                                      st === 'mastered'
                                        ? '#ecfdf5'
                                        : st === 'learning'
                                          ? '#e0f2fe'
                                          : st === 'remedial'
                                            ? '#fef3c7'
                                            : '#f8fafc',
                                    color:
                                      st === 'mastered'
                                        ? '#16a34a'
                                        : st === 'learning'
                                          ? '#0284c7'
                                          : st === 'remedial'
                                            ? '#d97706'
                                            : '#64748b',
                                    display: 'grid',
                                    placeItems: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {st === 'mastered' ? (
                                    <Check size={16} />
                                  ) : st === 'learning' ? (
                                    <LoaderCircle size={16} />
                                  ) : st === 'remedial' ? (
                                    <AlertCircle size={16} />
                                  ) : st === 'locked' ? (
                                    <Lock size={15} />
                                  ) : (
                                    <CalendarDays size={15} />
                                  )}
                                </span>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{node.name}</span>
                                    {st === 'learning' && (
                                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1' }}>
                                        Đang học
                                      </span>
                                    )}
                                    {st === 'remedial' && (
                                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309' }}>
                                        ✨ Gợi ý
                                      </span>
                                    )}
                                  </div>
                                  <div className="muted-xs" style={{ marginTop: 2, color: st === 'remedial' ? '#b45309' : st === 'learning' ? '#0284c7' : '#64748b' }}>
                                    {st === 'mastered'
                                      ? 'Đã vững'
                                      : st === 'learning'
                                        ? 'Đang học'
                                        : st === 'remedial'
                                          ? 'Cần ôn'
                                          : st === 'locked'
                                            ? 'Khóa tiên quyết'
                                            : 'Chưa học'}
                                    {duration != null ? ` · ${String(duration)} phút` : ''}
                                  </div>
                                </div>

                                {st === 'locked' ? (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', textAlign: 'right' }}>
                                    {info.lockReason ?? 'Cần hoàn thành bài tiên quyết'}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenLearn(node.id);
                                    }}
                                  >
                                    Vào học <ArrowRight size={12} />
                                  </button>
                                )}
                              </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Detail Panel */}
      {selectedNode && (
        <aside
          className="kg-panel"
          style={{ width: 320, background: '#ffffff', borderLeft: '1px solid #e2e8f0', overscrollBehavior: 'contain' }}
          aria-label="Chi tiết khái niệm"
        >
          <div className="kg-panel-head">
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: styleOf(selectedNode.type).badgeBg,
                color: styleOf(selectedNode.type).text,
              }}
            >
              {styleOf(selectedNode.type).label}
            </span>
            <button type="button" className="kg-btn sm" onClick={() => setSelectedNodeId(null)} aria-label="Đóng chi tiết">
              <X size={13} />
            </button>
          </div>

          <div className="kg-title" style={{ marginTop: 6 }}>{selectedNode.name}</div>
          {selectedNode.description && (
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginTop: 6 }}>{selectedNode.description}</p>
          )}

          {Boolean(selectedProps.outcome) && (
            <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1' }}>
              <Sparkles size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              <b>Mục tiêu:</b> {String(selectedProps.outcome)}
            </div>
          )}

          {learningStateMap.get(selectedNode.id)?.state === 'locked' && (
            <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={13} />
              <span>{learningStateMap.get(selectedNode.id)?.lockReason ?? 'Cần hoàn thành chương trước.'}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary sm"
              style={{ flex: 1 }}
              disabled={learningStateMap.get(selectedNode.id)?.state === 'locked'}
              onClick={() => onOpenLearn(selectedNode.id)}
            >
              <BookOpen size={13} /> {learningStateMap.get(selectedNode.id)?.state === 'locked' ? 'Đang khóa' : 'Vào học'} <ArrowRight size={13} />
            </button>
            <button type="button" className="btn btn-outline sm" onClick={() => onFocusInGraph(selectedNode.id)}>
              <Network size={13} /> Xem sơ đồ
            </button>
          </div>

          <div className="kg-rels" style={{ marginTop: 14 }}>
            {[
              { title: 'Nên học trước', list: nodeRelations.before, dir: '←' },
              { title: 'Học tiếp', list: nodeRelations.after, dir: '→' },
              { title: 'Liên quan', list: nodeRelations.related, dir: '↔' },
            ].map((grp) => (
              <div key={grp.title}>
                <h3>
                  {grp.title} <span>{grp.list.length}</span>
                </h3>
                {grp.list.length === 0 ? (
                  <div className="kg-empty-sub">Chưa có quan hệ trực tiếp</div>
                ) : (
                  grp.list.slice(0, 5).map((other) => (
                    <button key={other.id} type="button" className="kg-rel" onClick={() => setSelectedNodeId(other.id)}>
                      <span className="dir">{grp.dir}</span>
                      <span className="kg-dot" style={{ background: styleOf(other.type).badgeBg, border: `1px solid ${styleOf(other.type).border}` }} />
                      <span>{other.name}</span>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
