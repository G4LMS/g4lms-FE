import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  LayoutList,
  LoaderCircle,
  Lock,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Scan,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../../types';

const SHOW_PREREQ_ARCS = false;

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

function formatStudentChapterTitle(num: number, rawTitle?: unknown): string {
  const titleStr = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : '';
  if (!titleStr || /^(Tuần|Week|Chương|Chapter)\s+\d+$/i.test(titleStr)) {
    return `Chương ${num}`;
  }
  if (/^(Chương|Chapter)\s+/i.test(titleStr)) {
    return titleStr;
  }
  if (/^(Tuần|Week)\s+\d+/i.test(titleStr)) {
    return titleStr.replace(/^(Tuần|Week)\s+(\d+)/i, 'Chương $2');
  }
  return `Chương ${num}: ${titleStr}`;
}

function groupKeyOf(node: KnowledgeGraphNode): { key: string; label: string; sortOrder: number } {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const rawTitle = props.chapter_title ?? props.chapterTitle;
  const chapter = props.chapter_id ?? props.chapterId;
  if (typeof chapter === 'string' && chapter.trim()) {
    const match = chapter.match(/\d+/);
    const num = match ? Number(match[0]) : 500;
    return {
      key: `ch-${chapter}`,
      label: match ? formatStudentChapterTitle(num, rawTitle) : (typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : chapter),
      sortOrder: num,
    };
  }
  const week = props.default_week ?? props.defaultWeek ?? props.week;
  if (typeof week === 'number' && Number.isFinite(week)) {
    return {
      key: `ch-ch${week}`,
      label: formatStudentChapterTitle(week, rawTitle),
      sortOrder: week,
    };
  }
  return { key: 'general', label: 'Tổng quan & Khái niệm chung', sortOrder: 999 };
}

function chapterInfoOf(node: KnowledgeGraphNode): { key: string; label: string; sortOrder: number } {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const rawTitle = props.chapter_title ?? props.chapterTitle;
  const raw = props.chapter_id ?? props.chapterId;
  if (typeof raw === 'string' && raw.trim()) {
    const match = raw.match(/\d+/);
    const num = match ? Number(match[0]) : 500;
    return {
      key: raw.trim(),
      label: match ? formatStudentChapterTitle(num, rawTitle) : (typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : raw.trim()),
      sortOrder: num,
    };
  }
  const week = props.default_week ?? props.defaultWeek ?? props.week;
  if (typeof week === 'number' && Number.isFinite(week)) {
    return { key: `ch${week}`, label: formatStudentChapterTitle(week, rawTitle), sortOrder: week };
  }
  return { key: 'other', label: 'Nội dung chung', sortOrder: 999 };
}

const ROADMAP_WIDTH = 920;
const ROADMAP_CENTER_X = 460;
const ROADMAP_X_OFFSETS = [0, 150, 210, 125, -35, -180, -195, -80];
const ROADMAP_STEP_Y = 132;
const ROADMAP_TOP_Y = 112;

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
      if (existing) {
        existing.nodes.push(node);
        if (g.label.length > existing.label.length && !/^Chương \d+$/i.test(g.label)) {
          existing.label = g.label;
        }
      } else {
        map.set(g.key, { ...g, nodes: [node] });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((bucket) => {
        const idsInBucket = new Set(bucket.nodes.map((n) => n.id));
        const inDeg = new Map<string, number>();
        const adj = new Map<string, string[]>();
        for (const n of bucket.nodes) {
          inDeg.set(n.id, 0);
          adj.set(n.id, []);
        }
        for (const e of data.edges) {
          if (e.type === 'PREREQUISITE' && idsInBucket.has(e.source) && idsInBucket.has(e.target) && e.source !== e.target) {
            adj.get(e.source)!.push(e.target);
            inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
          }
        }
        const topoRank = new Map<string, number>();
        const ready = bucket.nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0);
        let rank = 0;
        while (ready.length > 0) {
          ready.sort((a, b) => a.name.localeCompare(b.name));
          const cur = ready.shift()!;
          topoRank.set(cur.id, rank++);
          for (const nxt of adj.get(cur.id) ?? []) {
            const d = (inDeg.get(nxt) ?? 0) - 1;
            inDeg.set(nxt, d);
            if (d === 0) {
              const nxtNode = bucket.nodes.find((x) => x.id === nxt);
              if (nxtNode) ready.push(nxtNode);
            }
          }
        }
        const sortedNodes = [...bucket.nodes].sort((a, b) => {
          const seqA = Number((a.properties ?? {}).step_seq);
          const seqB = Number((b.properties ?? {}).step_seq);
          const hasSeqA = Number.isFinite(seqA) && seqA > 0;
          const hasSeqB = Number.isFinite(seqB) && seqB > 0;
          if (hasSeqA && hasSeqB && seqA !== seqB) return seqA - seqB;
          if (hasSeqA !== hasSeqB) return hasSeqA ? -1 : 1;
          const ra = topoRank.get(a.id) ?? 9999;
          const rb = topoRank.get(b.id) ?? 9999;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
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
  }, [studyNodes, data.edges]);

  const [selectedBucketKey, setSelectedBucketKey] = useState<string>(() => buckets[0]?.key ?? 'general');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'learning' | 'remedial' | 'unlearned' | 'locked'>('all');
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [smoothCamera, setSmoothCamera] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [graphBoxEl, setGraphBoxEl] = useState<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 900, height: 600 });
  const pendingFocusNodeIdRef = useRef<string | null>(null);
  const autoFramedKeyRef = useRef<string>('');

  type LearningState = 'mastered' | 'learning' | 'remedial' | 'unlearned' | 'locked';

  const learningStateMap = useMemo(() => {
    const map = new Map<string, { state: LearningState; lockReason?: string; blockingIds: string[] }>();
    const prereqSources = new Map<string, string[]>();
    const nameById = new Map(data.nodes.map((n) => [n.id, n.name]));

    for (const e of data.edges) {
      if (e.type === 'PREREQUISITE' && (e.properties ?? {}).strength !== 'soft') {
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
        map.set(node.id, { state: 'mastered', blockingIds: [] });
      } else if (ls === 'learning') {
        hasLearning = true;
        map.set(node.id, { state: 'learning', blockingIds: [] });
      } else if (ls === 'remedial' || p.status === 'proposed' || p.status === 'pending_review') {
        hasRemedial = true;
        map.set(node.id, { state: 'remedial', blockingIds: [] });
      } else if (ls === 'locked') {
        map.set(node.id, { state: 'locked', blockingIds: [] });
      } else {
        map.set(node.id, { state: 'unlearned', blockingIds: [] });
      }
    }

    for (const node of studyNodes) {
      const cur = map.get(node.id);
      if (!cur || cur.state === 'mastered' || cur.state === 'learning') continue;
      const reqs = prereqSources.get(node.id) ?? [];
      const missingIds = reqs.filter((srcId) => map.get(srcId)?.state !== 'mastered');
      if (missingIds.length > 0) {
        map.set(node.id, {
          state: 'locked',
          lockReason: `Cần hoàn thành: ${nameById.get(missingIds[0]) ?? missingIds[0]}`,
          blockingIds: missingIds,
        });
      } else if (cur.state === 'locked') {
        map.set(node.id, { state: 'locked', lockReason: 'Cần hoàn thành khái niệm tiên quyết trước', blockingIds: [] });
      }
    }

    const orderedStudyNodes = buckets.flatMap((b) => b.nodes);
    const orderedSource = orderedStudyNodes.length > 0 ? orderedStudyNodes : studyNodes;
    if (!hasLearning) {
      const firstOpen =
        orderedSource.find((n) => map.get(n.id)?.state === 'unlearned') ??
        orderedSource.find((n) => map.get(n.id)?.state !== 'locked') ??
        orderedSource[0];
      if (firstOpen && map.get(firstOpen.id)?.state !== 'locked') {
        map.set(firstOpen.id, { state: 'learning', blockingIds: [] });
      }
    }
    if (!hasRemedial) {
      const candidate = orderedSource.find((n) => {
        const s = map.get(n.id)?.state;
        const conf = typeof n.properties?.confidence === 'number' ? n.properties.confidence : 1;
        return s === 'unlearned' && conf < 0.85;
      });
      if (candidate) map.set(candidate.id, { state: 'remedial', blockingIds: [] });
    }

    return map;
  }, [studyNodes, buckets, data.edges, data.nodes]);

  useEffect(() => {
    if (!buckets.length) return;
    if (!buckets.some((b) => b.key === selectedBucketKey)) {
      const activeB =
        buckets.find((b) => b.nodes.some((n) => learningStateMap.get(n.id)?.state === 'learning')) ??
        buckets[0];
      if (activeB) setSelectedBucketKey(activeB.key);
    }
  }, [buckets, selectedBucketKey, learningStateMap]);

  const activeBucket = buckets.find((b) => b.key === selectedBucketKey) ?? buckets[0];
  const activeNodes = activeBucket?.nodes ?? [];
  const canvasHeight = Math.max(420, ROADMAP_TOP_Y + Math.max(0, activeNodes.length - 1) * ROADMAP_STEP_Y + 140);

  const firstPendingIndex = activeNodes.findIndex((n) => {
    const st = learningStateMap.get(n.id)?.state;
    return st !== 'mastered' && st !== 'locked';
  });
  const activeNodeIdx = activeNodes.findIndex((n) => learningStateMap.get(n.id)?.state === 'learning');
  const resolvedFocusIdx = activeNodeIdx >= 0 ? activeNodeIdx : firstPendingIndex >= 0 ? firstPendingIndex : 0;

  useEffect(() => {
    if (!graphBoxEl) return;
    const measure = () => {
      const rect = graphBoxEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(graphBoxEl);
    return () => ro?.disconnect();
  }, [graphBoxEl]);

  const clampPan = useCallback(
    (nextPan: { x: number; y: number }, targetZoom: number) => {
      const scaledW = ROADMAP_WIDTH * targetZoom;
      const scaledH = canvasHeight * targetZoom;
      const centeredX = (viewportSize.width - scaledW) / 2;
      const maxOffsetX = Math.max(220, scaledW * 0.45);
      const minX = centeredX - maxOffsetX;
      const maxX = centeredX + maxOffsetX;
      const minY = Math.min(40, viewportSize.height - scaledH - 110);
      const maxY = 90;
      return {
        x: Math.round(Math.max(minX, Math.min(maxX, nextPan.x))),
        y: Math.round(Math.max(minY, Math.min(maxY, nextPan.y))),
      };
    },
    [viewportSize, canvasHeight],
  );

  const focusNodeInViewport = useCallback(
    (nodeIndex: number, targetZoom?: number) => {
      const safeIdx = Math.max(0, Math.min(Math.max(0, activeNodes.length - 1), nodeIndex));
      const pos = nodePos(safeIdx);
      const z = targetZoom ?? zoom;
      if (targetZoom !== undefined) setZoom(z);
      const centeredX = (viewportSize.width - ROADMAP_WIDTH * z) / 2;
      const desiredY = viewportSize.height * 0.38 - pos.y * z;
      setSmoothCamera(true);
      setPan(clampPan({ x: centeredX, y: desiredY }, z));
    },
    [activeNodes.length, zoom, viewportSize, clampPan],
  );

  const fitChapterToView = useCallback(() => {
    const availW = Math.max(320, viewportSize.width - 48);
    const availH = Math.max(280, viewportSize.height - 96);
    const fitZ = Math.max(0.45, Math.min(1.05, Number(Math.min(availW / ROADMAP_WIDTH, availH / canvasHeight).toFixed(2))));
    const centeredX = (viewportSize.width - ROADMAP_WIDTH * fitZ) / 2;
    const centeredY = Math.max(24, (viewportSize.height - canvasHeight * fitZ) / 2 + 18);
    setSmoothCamera(true);
    setZoom(fitZ);
    setPan(clampPan({ x: centeredX, y: centeredY }, fitZ));
  }, [viewportSize, canvasHeight, clampPan]);

  // Auto-frame active bucket on switch / resize / cross-chapter node jump
  useEffect(() => {
    if (mode !== 'path' || !activeBucket || viewportSize.width <= 0) return;
    if (pendingFocusNodeIdRef.current) {
      const targetIdx = activeNodes.findIndex((n) => n.id === pendingFocusNodeIdRef.current);
      if (targetIdx >= 0) {
        pendingFocusNodeIdRef.current = null;
        autoFramedKeyRef.current = `${activeBucket.key}:${Math.round(viewportSize.width / 80)}`;
        focusNodeInViewport(targetIdx, 1);
        return;
      }
    }
    const frameSig = `${activeBucket.key}:${Math.round(viewportSize.width / 80)}`;
    if (autoFramedKeyRef.current === frameSig) return;
    autoFramedKeyRef.current = frameSig;
    focusNodeInViewport(resolvedFocusIdx, 1);
  }, [mode, activeBucket, activeNodes, resolvedFocusIdx, viewportSize.width, focusNodeInViewport]);

  useEffect(() => {
    if (!graphBoxEl) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSmoothCamera(false);
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        setZoom((prevZoom) => {
          const nextZoom = Math.min(1.6, Math.max(0.45, Number((prevZoom + delta).toFixed(2))));
          setPan((prevPan) => clampPan(prevPan, nextZoom));
          return nextZoom;
        });
      } else {
        setPan((prevPan) =>
          clampPan({ x: prevPan.x - e.deltaX * 0.75, y: prevPan.y - e.deltaY * 0.75 }, zoom),
        );
      }
    };
    graphBoxEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => graphBoxEl.removeEventListener('wheel', handleWheel);
  }, [graphBoxEl, zoom, clampPan]);

  const jumpToNode = useCallback(
    (targetNode: KnowledgeGraphNode) => {
      setSelectedNodeId(targetNode.id);
      const targetBucket = buckets.find((b) => b.nodes.some((n) => n.id === targetNode.id));
      if (!targetBucket) return;
      if (targetBucket.key !== activeBucket?.key) {
        pendingFocusNodeIdRef.current = targetNode.id;
        setSelectedBucketKey(targetBucket.key);
      } else {
        const idx = targetBucket.nodes.findIndex((n) => n.id === targetNode.id);
        if (idx >= 0) focusNodeInViewport(idx);
      }
    },
    [buckets, activeBucket?.key, focusNodeInViewport],
  );

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

  const focusDepIds = useMemo(() => {
    const focusId = hoveredNodeId ?? selectedNodeId;
    if (!focusId) return { focusId: null as string | null, incoming: new Set<string>(), outgoing: new Set<string>() };
    const activeIds = new Set(activeNodes.map((n) => n.id));
    const incoming = new Set<string>();
    const outgoing = new Set<string>();
    for (const e of data.edges) {
      if (e.type !== 'PREREQUISITE') continue;
      if (e.target === focusId && activeIds.has(e.source)) incoming.add(e.source);
      if (e.source === focusId && activeIds.has(e.target)) outgoing.add(e.target);
    }
    return { focusId, incoming, outgoing };
  }, [hoveredNodeId, selectedNodeId, activeNodes, data.edges]);

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

  const overallProgress = useMemo(() => {
    const masteredTotal = studyNodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
    const totalConcepts = studyNodes.length;
    const pctTotal = totalConcepts > 0 ? Math.round((masteredTotal / totalConcepts) * 100) : 0;
    const orderedAll = buckets.flatMap((b) => b.nodes);
    const nextNode =
      orderedAll.find((n) => learningStateMap.get(n.id)?.state === 'learning') ??
      orderedAll.find((n) => {
        const st = learningStateMap.get(n.id)?.state;
        return st !== 'mastered' && st !== 'locked';
      }) ??
      null;
    return { masteredTotal, totalConcepts, pctTotal, nextNode };
  }, [studyNodes, buckets, learningStateMap]);

  const activeBucketIdx = buckets.findIndex((b) => b.key === activeBucket?.key);
  const prevBucket = activeBucketIdx > 0 ? buckets[activeBucketIdx - 1] : null;
  const nextBucket = activeBucketIdx >= 0 && activeBucketIdx < buckets.length - 1 ? buckets[activeBucketIdx + 1] : null;
  const masteredInActive = activeNodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
  const selectedProps = (selectedNode?.properties ?? {}) as Record<string, unknown>;
  const ringRadius = 18;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - overallProgress.pctTotal / 100);

  return (
    <div className={`sj-shell${expanded ? ' is-expanded' : ''}`}>
      {/* Left Collapsible Chapter Rail (in Path mode) */}
      {mode === 'path' && (
        <aside className={`sj-rail${railCollapsed ? ' is-collapsed' : ''}`} aria-label="Danh sách chương">
          <div className="sj-rail-head">
            <div className="sj-rail-head-row">
              {!railCollapsed && (
                <strong style={{ fontSize: 13, color: '#0f172a' }}>Chương học ({buckets.length})</strong>
              )}
              <button
                type="button"
                className="kg-btn sm"
                onClick={() => setRailCollapsed((v) => !v)}
                aria-label={railCollapsed ? 'Mở thanh chương' : 'Thu gọn thanh chương'}
                title={railCollapsed ? 'Mở rộng danh sách chương' : 'Thu gọn để mở rộng không gian'}
              >
                {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
            </div>

            {!railCollapsed && overallProgress.totalConcepts > 0 && (
              <div className="sj-rail-progress">
                <svg className="sj-ring-svg" viewBox="0 0 46 46" aria-hidden>
                  <circle className="sj-ring-track" cx="23" cy="23" r={ringRadius} />
                  <circle
                    className="sj-ring-progress"
                    cx="23"
                    cy="23"
                    r={ringRadius}
                    strokeDasharray={ringCirc}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e' }}>
                    {overallProgress.pctTotal}% hoàn thành
                  </div>
                  <div className="muted-xs">
                    {overallProgress.masteredTotal}/{overallProgress.totalConcepts} khái niệm đã vững
                  </div>
                  {overallProgress.nextNode && (
                    <button
                      type="button"
                      className="btn btn-primary sm"
                      style={{ marginTop: 6, width: '100%', justifyContent: 'center', fontSize: 11.5, padding: '4px 8px' }}
                      onClick={() => jumpToNode(overallProgress.nextNode!)}
                    >
                      Học tiếp <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sj-rail-list">
            {buckets.map((bucket, idx) => {
              const active = activeBucket?.key === bucket.key;
              const masteredCnt = bucket.nodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
              const allDone = bucket.nodes.length > 0 && masteredCnt === bucket.nodes.length;
              const bucketLocked =
                bucket.nodes.length > 0 && bucket.nodes.every((n) => learningStateMap.get(n.id)?.state === 'locked');
              const hasActiveNode = bucket.nodes.some((n) => learningStateMap.get(n.id)?.state === 'learning');
              const chPct = bucket.nodes.length > 0 ? Math.round((masteredCnt / bucket.nodes.length) * 100) : 0;

              if (railCollapsed) {
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    title={`${bucket.label} (${masteredCnt}/${bucket.nodes.length} đã vững)`}
                    onClick={() => {
                      setSelectedBucketKey(bucket.key);
                      setSelectedNodeId(null);
                    }}
                    className={`sj-chapter-pill-mini${active ? ' is-active' : allDone ? ' is-done' : ''}`}
                  >
                    {allDone ? <Check size={14} /> : idx + 1}
                  </button>
                );
              }

              return (
                <button
                  key={bucket.key}
                  type="button"
                  title={bucket.label}
                  onClick={() => {
                    setSelectedBucketKey(bucket.key);
                    setSelectedNodeId(null);
                  }}
                  className={`sj-chapter-btn${active ? ' is-active' : ''}${bucketLocked ? ' is-locked' : ''}`}
                >
                  <div className="sj-chapter-btn-top">
                    <span className="sj-chapter-badge">Chương {idx + 1}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                      {allDone ? (
                        <Check size={13} color="#16a34a" />
                      ) : bucketLocked ? (
                        <Lock size={12} color="#94a3b8" />
                      ) : hasActiveNode ? (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0ea5e9', display: 'inline-block' }} />
                      ) : null}
                      <b>{masteredCnt}/{bucket.nodes.length}</b>
                    </span>
                  </div>
                  <div className="sj-chapter-title">{bucket.label.replace(/^Chương \d+\s*[:\-–]\s*/i, '')}</div>
                  <div className="sj-mini-bar">
                    <div className="sj-mini-bar-fill" style={{ width: `${chPct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {/* Main Interactive Area */}
      {mode === 'path' ? (
        <div className="sj-stage-wrap">
          {/* Floating Frosted Glass Topbar */}
          {activeBucket && (
            <div className="sj-floating-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <button
                  type="button"
                  className="kg-btn sm"
                  disabled={!prevBucket}
                  title={prevBucket ? prevBucket.label : 'Chương đầu'}
                  onClick={() => {
                    if (prevBucket) {
                      setSelectedBucketKey(prevBucket.key);
                      setSelectedNodeId(null);
                    }
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="kg-btn sm"
                  disabled={!nextBucket}
                  title={nextBucket ? nextBucket.label : 'Chương cuối'}
                  onClick={() => {
                    if (nextBucket) {
                      setSelectedBucketKey(nextBucket.key);
                      setSelectedNodeId(null);
                    }
                  }}
                >
                  <ChevronRight size={15} />
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0c4a6e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 }}>
                    {activeBucket.label}
                  </div>
                  <div className="muted-xs">
                    {masteredInActive}/{activeNodes.length} khái niệm đã vững · {activeNodes.length} bước học
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="sj-legend-dot"><i style={{ background: '#10b981' }} />Đã vững</span>
                <span className="sj-legend-dot"><i style={{ background: '#0284c7' }} />Đang học</span>
                <span className="sj-legend-dot"><i style={{ background: '#93c5fd' }} />Sẵn sàng</span>
                <span className="sj-legend-dot"><i style={{ background: '#cbd5e1' }} />Khóa</span>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => onFocusInGraph(selectedNodeId ?? activeNodes[0]?.id ?? '')}
                >
                  <Network size={13} /> Xem quan hệ
                </button>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => setExpanded((e) => !e)}
                  title={expanded ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'}
                >
                  {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  {expanded ? 'Thu nhỏ' : 'Mở rộng'}
                </button>
              </div>
            </div>
          )}

          {/* Full-Bleed Pan & Zoom Viewport */}
          {activeNodes.length === 0 ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
              <div className="admin-card" style={{ padding: 28, textAlign: 'center' }}>
                <p className="muted">Chưa có khái niệm nào trong chương này.</p>
              </div>
            </div>
          ) : (
            <div
              ref={setGraphBoxEl}
              className={`sj-canvas-viewport${dragging ? ' is-dragging' : ''}`}
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button, a, input, select, [data-no-pan="true"]')) return;
                setSmoothCamera(false);
                setDragging(true);
                dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragging || !dragStartRef.current) return;
                setPan(
                  clampPan(
                    {
                      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
                      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
                    },
                    zoom,
                  ),
                );
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
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            >
              <div
                className={`sj-canvas-stage${smoothCamera && !dragging ? ' is-animated' : ''}`}
                style={{
                  width: ROADMAP_WIDTH,
                  height: canvasHeight,
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                }}
              >
                <svg
                  width={ROADMAP_WIDTH}
                  height={canvasHeight}
                  viewBox={`0 0 ${ROADMAP_WIDTH} ${canvasHeight}`}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  aria-hidden
                >
                  <defs>
                    <linearGradient id="sjGradDone" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                    <linearGradient id="sjGradActive" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                    {SHOW_PREREQ_ARCS && (
                      <>
                        <marker id="sjArrowBlue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284c7" />
                        </marker>
                        <marker id="sjArrowViolet" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7c3aed" />
                        </marker>
                      </>
                    )}
                  </defs>

                  {/* Sequential milestone path segments */}
                  {activeNodes.slice(0, -1).map((node, i) => {
                    const p1 = nodePos(i);
                    const p2 = nodePos(i + 1);
                    const midY = (p1.y + p2.y) / 2;
                    const d = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
                    const midX = (p1.x + p2.x) / 2;
                    const st1 = learningStateMap.get(node.id)?.state;
                    const st2 = learningStateMap.get(activeNodes[i + 1].id)?.state;
                    const segmentDone = st1 === 'mastered' && st2 === 'mastered';
                    const segmentActive = st2 === 'learning' || i + 1 === resolvedFocusIdx;

                    return (
                      <g key={`curve-${node.id}`}>
                        {segmentDone ? (
                          <>
                            <path d={d} fill="none" stroke="url(#sjGradDone)" strokeWidth={4} strokeLinecap="round" />
                            <circle cx={midX} cy={midY} r={4} fill="#10b981" />
                          </>
                        ) : segmentActive ? (
                          <>
                            <path d={d} fill="none" stroke="#bae6fd" strokeWidth={4.5} strokeLinecap="round" />
                            <path d={d} fill="none" stroke="url(#sjGradActive)" strokeWidth={3.5} strokeLinecap="round" className="sj-path-active" />
                            <circle cx={midX} cy={midY} r={4.5} fill="#0284c7" />
                          </>
                        ) : (
                          <>
                            <path d={d} fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" />
                            <circle cx={midX} cy={midY} r={3.5} fill="#94a3b8" />
                          </>
                        )}
                      </g>
                    );
                  })}

                  {/* Hovered / Selected Prerequisite Arcs (hidden when SHOW_PREREQ_ARCS is false) */}
                  {SHOW_PREREQ_ARCS && focusDepIds.focusId && (() => {
                    const targetIdx = activeNodes.findIndex((n) => n.id === focusDepIds.focusId);
                    if (targetIdx < 0) return null;
                    const pFocus = nodePos(targetIdx);
                    const arcs: JSX.Element[] = [];

                    focusDepIds.incoming.forEach((srcId) => {
                      const srcIdx = activeNodes.findIndex((n) => n.id === srcId);
                      if (srcIdx < 0) return;
                      const pSrc = nodePos(srcIdx);
                      const bendX = (pSrc.x + pFocus.x) / 2 - 90;
                      const midY = (pSrc.y + pFocus.y) / 2;
                      arcs.push(
                        <path
                          key={`in-${srcId}`}
                          d={`M ${pSrc.x} ${pSrc.y} Q ${bendX} ${midY} ${pFocus.x} ${pFocus.y}`}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth={2.5}
                          className="sj-prereq-arc"
                          markerEnd="url(#sjArrowBlue)"
                        />,
                      );
                    });

                    focusDepIds.outgoing.forEach((tgtId) => {
                      const tgtIdx = activeNodes.findIndex((n) => n.id === tgtId);
                      if (tgtIdx < 0) return;
                      const pTgt = nodePos(tgtIdx);
                      const bendX = (pFocus.x + pTgt.x) / 2 + 90;
                      const midY = (pFocus.y + pTgt.y) / 2;
                      arcs.push(
                        <path
                          key={`out-${tgtId}`}
                          d={`M ${pFocus.x} ${pFocus.y} Q ${bendX} ${midY} ${pTgt.x} ${pTgt.y}`}
                          fill="none"
                          stroke="#7c3aed"
                          strokeWidth={2.5}
                          className="sj-prereq-arc"
                          markerEnd="url(#sjArrowViolet)"
                        />,
                      );
                    });

                    return arcs;
                  })()}
                </svg>

                {/* Animated Milestone Nodes (keyed per chapter for staggered entrance) */}
                <div key={activeBucket?.key ?? 'empty'}>
                  {activeNodes.map((node, index) => {
                    const pos = nodePos(index);
                    const st = styleOf(node.type);
                    const p = (node.properties ?? {}) as Record<string, unknown>;
                    const lInfo = learningStateMap.get(node.id);
                    const lState = lInfo?.state ?? 'unlearned';
                    const isDone = lState === 'mastered';
                    const isCurrent = lState === 'learning' || (index === resolvedFocusIdx && lState !== 'locked' && !isDone);
                    const isLocked = lState === 'locked';
                    const isSelected = selectedNodeId === node.id;
                    const isRelated =
                      focusDepIds.incoming.has(node.id) || focusDepIds.outgoing.has(node.id);
                    const labelOnLeft = pos.x > ROADMAP_CENTER_X + 20;

                    const stepSeq = Number(p.step_seq ?? 0);
                    const contentCnt = Number(p.approved_content_count ?? 0);
                    const quizCnt = Number(p.published_quiz_count ?? 0);
                    const durationMin = Number(p.duration_min ?? p.durationMin ?? 0);
                    const metaParts: string[] = [];
                    if (contentCnt > 0) metaParts.push(`${contentCnt} bài học`);
                    if (quizCnt > 0) metaParts.push(`${quizCnt} quiz`);
                    if (durationMin > 0) metaParts.push(`~${durationMin}p`);

                    return (
                      <div
                        key={node.id}
                        className={`sj-node-anchor${isSelected || isCurrent || isRelated ? ' is-highlighted' : ''}`}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId((cur) => (cur === node.id ? null : cur))}
                        style={{
                          left: pos.x,
                          top: pos.y,
                          animationDelay: `${Math.min(index, 14) * 35}ms`,
                          opacity: isLocked && !isSelected && !isRelated ? 0.78 : 1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(node.id)}
                          onDoubleClick={() => !isLocked && onOpenLearn(node.id)}
                          aria-label={node.name}
                          className={`sj-node-circle${isDone ? ' is-done' : isCurrent ? ' is-current' : isLocked ? ' is-locked' : ''}${isSelected ? ' is-selected' : ''}`}
                        >
                          {isDone ? (
                            <Check size={24} strokeWidth={2.6} />
                          ) : isCurrent ? (
                            <LoaderCircle size={26} className="sj-spin-icon" />
                          ) : isLocked ? (
                            <Lock size={20} />
                          ) : (
                            <BookOpen size={20} />
                          )}
                        </button>

                        <div
                          data-no-pan="true"
                          onClick={() => setSelectedNodeId(node.id)}
                          onDoubleClick={() => !isLocked && onOpenLearn(node.id)}
                          className={`sj-node-card ${labelOnLeft ? 'is-left' : 'is-right'}${isCurrent ? ' is-current' : ''}${isSelected ? ' is-selected' : ''}${isLocked ? ' is-locked' : ''}${isRelated ? ' is-related' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: labelOnLeft ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                            {Number.isFinite(stepSeq) && stepSeq > 0 && (
                              <span className="student-concept-seq">#{stepSeq}</span>
                            )}
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: isDone
                                  ? '#dcfce7'
                                  : isCurrent
                                    ? '#e0f2fe'
                                    : isLocked
                                      ? '#fef3c7'
                                      : st.badgeBg,
                                color: isDone
                                  ? '#15803d'
                                  : isCurrent
                                    ? '#0369a1'
                                    : isLocked
                                      ? '#b45309'
                                      : st.text,
                              }}
                            >
                              {isCurrent ? 'Đang học' : isDone ? 'Đã vững' : isLocked ? 'Đang khóa' : 'Sẵn sàng'}
                            </span>
                          </div>

                          <div className="sj-node-card-title">{node.name}</div>

                          {metaParts.length > 0 && (
                            <div className="muted-xs" style={{ marginTop: 4 }}>
                              {metaParts.join(' · ')}
                            </div>
                          )}

                          {isLocked && lInfo?.lockReason && (
                            <div className="muted-xs" style={{ marginTop: 4, color: '#b45309' }}>
                              {lInfo.lockReason}
                            </div>
                          )}

                          {!isLocked && (isCurrent || isSelected || hoveredNodeId === node.id) && (
                            <div style={{ marginTop: 8, display: 'flex', justifyContent: labelOnLeft ? 'flex-end' : 'flex-start' }}>
                              <button
                                type="button"
                                className="btn btn-primary sm"
                                style={{ borderRadius: 999, padding: '4px 12px', fontSize: 11.5 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenLearn(node.id);
                                }}
                              >
                                {isDone ? 'Ôn lại' : isCurrent ? 'Tiếp tục' : 'Vào học'} <ArrowRight size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Floating Bottom-Left Helper Hint */}
              <div className="sj-floating-hint">
                Kéo để di chuyển · Cuộn để lướt · Ctrl + Cuộn để thu phóng · Nhấp đúp để vào học
              </div>

              {/* Floating Bottom-Right Camera Toolbar */}
              <div className="sj-floating-controls" data-no-pan="true">
                <button
                  type="button"
                  className="kg-btn sm"
                  title="Tập trung vào bài đang học"
                  onClick={() => focusNodeInViewport(resolvedFocusIdx, 1)}
                >
                  <Crosshair size={14} />
                </button>
                <button
                  type="button"
                  className="kg-btn sm"
                  title="Hiển thị vừa khung"
                  onClick={fitChapterToView}
                >
                  <Scan size={14} />
                </button>
                <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />
                <button
                  type="button"
                  className="kg-btn sm"
                  title="Phóng to"
                  onClick={() => {
                    setSmoothCamera(true);
                    setZoom((z) => {
                      const next = Math.min(1.6, Number((z + 0.14).toFixed(2)));
                      setPan((p) => clampPan(p, next));
                      return next;
                    });
                  }}
                >
                  <ZoomIn size={14} />
                </button>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', minWidth: 42, textAlign: 'center' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="kg-btn sm"
                  title="Thu nhỏ"
                  onClick={() => {
                    setSmoothCamera(true);
                    setZoom((z) => {
                      const next = Math.max(0.45, Number((z - 0.14).toFixed(2)));
                      setPan((p) => clampPan(p, next));
                      return next;
                    });
                  }}
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  className="kg-btn sm"
                  title="Đặt lại camera"
                  onClick={() => focusNodeInViewport(0, 1)}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Expanded List Mode */
        <div className="sj-list-scroll">
          <div className="sj-list-inner">
            {overallProgress.totalConcepts > 0 && (
              <div className="student-chapter-summary" style={{ marginBottom: 14 }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0c4a6e' }}>
                    Tiến độ theo Đồ thị môn học: {overallProgress.masteredTotal}/{overallProgress.totalConcepts} khái niệm ({overallProgress.pctTotal}%)
                  </div>
                  <div className="progress-track" style={{ height: 6, marginTop: 6, maxWidth: 360 }}>
                    <div className="progress-fill" style={{ width: `${overallProgress.pctTotal}%` }} />
                  </div>
                </div>
                {overallProgress.nextNode && (
                  <button
                    type="button"
                    className="btn btn-primary sm"
                    onClick={() => onOpenLearn(overallProgress.nextNode!.id)}
                  >
                    Học tiếp: {overallProgress.nextNode.name} <ArrowRight size={13} />
                  </button>
                )}
              </div>
            )}

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
                  flex: '1 1 260px',
                }}
              >
                <Search size={14} color="#64748b" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm khái niệm theo tên hoặc mô tả..."
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
                <p className="muted">Không tìm thấy khái niệm nào phù hợp bộ lọc.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredListBuckets.map((bucket, idx) => {
                  const isOpen = openBuckets[bucket.key] ?? idx === 0;
                  const hasLearning = bucket.nodes.some((n) => learningStateMap.get(n.id)?.state === 'learning');
                  const chPct = bucket.totalInBucket > 0 ? Math.round((bucket.masteredCount / bucket.totalInBucket) * 100) : 0;

                  return (
                    <div
                      key={bucket.key}
                      className="sj-list-card"
                      style={{
                        border: `1.5px solid ${hasLearning ? '#7dd3fc' : '#e2e8f0'}`,
                        boxShadow: hasLearning ? '0 3px 14px rgba(14, 165, 233, 0.08)' : 'none',
                        animationDelay: `${Math.min(idx, 8) * 40}ms`,
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
                          padding: '13px 16px',
                          border: 0,
                          background: hasLearning ? '#f0f9ff' : '#fff',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>{bucket.label}</div>
                          <div className="sj-mini-bar" style={{ maxWidth: 260, marginTop: 6 }}>
                            <div className="sj-mini-bar-fill" style={{ width: `${chPct}%` }} />
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
                          {bucket.nodes.map((node) => {
                            const info = learningStateMap.get(node.id) ?? { state: 'unlearned' as const, blockingIds: [] };
                            const st = info.state;
                            const typeStyle = styleOf(node.type);
                            const props = (node.properties ?? {}) as Record<string, unknown>;
                            const duration = props.duration_min ?? props.durationMin;
                            const stepSeq = Number(props.step_seq ?? 0);
                            const isSelected = selectedNodeId === node.id;

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
                              <div
                                key={node.id}
                                className="sj-list-row"
                                onClick={() => setSelectedNodeId(node.id)}
                                style={{
                                  borderLeft: leftBorder,
                                  background: rowBg,
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
                                    <LoaderCircle size={16} className="sj-spin-icon" />
                                  ) : st === 'remedial' ? (
                                    <AlertCircle size={16} />
                                  ) : st === 'locked' ? (
                                    <Lock size={15} />
                                  ) : (
                                    <BookOpen size={15} />
                                  )}
                                </span>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    {Number.isFinite(stepSeq) && stepSeq > 0 && (
                                      <span className="student-concept-seq">#{stepSeq}</span>
                                    )}
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{node.name}</span>
                                    {st === 'learning' && (
                                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#e0f2fe', color: '#0369a1' }}>
                                        Đang học
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
                                            : 'Sẵn sàng học'}
                                    {duration != null ? ` · ~${String(duration)} phút` : ''}
                                  </div>
                                </div>

                                {st === 'locked' ? (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', textAlign: 'right' }}>
                                    {info.lockReason ?? 'Cần hoàn thành khái niệm tiên quyết trước'}
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
                                    {st === 'mastered' ? 'Ôn lại' : 'Vào học'} <ArrowRight size={12} />
                                  </button>
                                )}
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
        </div>
      )}

      {/* Slide-In Right Detail Drawer */}
      {selectedNode && (() => {
        const lInfo = learningStateMap.get(selectedNode.id);
        const isLocked = lInfo?.state === 'locked';
        const stepSeq = Number(selectedProps.step_seq ?? 0);
        const contentCnt = Number(selectedProps.approved_content_count ?? 0);
        const quizCnt = Number(selectedProps.published_quiz_count ?? 0);
        const durationMin = Number(selectedProps.duration_min ?? selectedProps.durationMin ?? 0);
        const blockingNodes = (lInfo?.blockingIds ?? [])
          .map((bid) => studyNodes.find((n) => n.id === bid))
          .filter((n): n is KnowledgeGraphNode => Boolean(n));

        return (
          <aside className="sj-drawer" aria-label="Chi tiết khái niệm">
            <div className="kg-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {Number.isFinite(stepSeq) && stepSeq > 0 && (
                  <span className="student-concept-seq">Bước #{stepSeq}</span>
                )}
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
                  {chapterInfoOf(selectedNode).label}
                </span>
              </div>
              <button type="button" className="kg-btn sm" onClick={() => setSelectedNodeId(null)} aria-label="Đóng chi tiết">
                <X size={13} />
              </button>
            </div>

            <div className="kg-title" style={{ marginTop: 8 }}>{selectedNode.name}</div>
            {selectedNode.description && (
              <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55, marginTop: 8 }}>{selectedNode.description}</p>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="pill-badge">{contentCnt} bài học</span>
              <span className="pill-badge">{quizCnt} bài kiểm tra</span>
              {durationMin > 0 && <span className="pill-badge">~{durationMin} phút</span>}
            </div>

            {Boolean(selectedProps.outcome) && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1' }}>
                <Sparkles size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                <b>Mục tiêu:</b> {String(selectedProps.outcome)}
              </div>
            )}

            {isLocked && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: 12, color: '#92400e' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <Lock size={13} />
                  <span>{lInfo?.lockReason ?? 'Cần hoàn thành khái niệm tiên quyết trước.'}</span>
                </div>
                {blockingNodes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {blockingNodes.map((bn) => (
                      <button
                        key={bn.id}
                        type="button"
                        className="btn btn-outline sm"
                        style={{ fontSize: 11, background: '#fff' }}
                        onClick={() => jumpToNode(bn)}
                      >
                        Mở khóa bằng: {bn.name} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary sm"
                style={{ flex: 1 }}
                disabled={isLocked}
                onClick={() => onOpenLearn(selectedNode.id)}
              >
                <BookOpen size={13} /> {isLocked ? 'Đang khóa' : 'Vào học ngay'} <ArrowRight size={13} />
              </button>
              <button type="button" className="btn btn-outline sm" onClick={() => onFocusInGraph(selectedNode.id)}>
                <Network size={13} /> Sơ đồ quan hệ
              </button>
            </div>

            <div className="kg-rels" style={{ marginTop: 16 }}>
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
                    grp.list.slice(0, 6).map((other) => (
                      <button key={other.id} type="button" className="kg-rel" onClick={() => jumpToNode(other)}>
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
        );
      })()}
    </div>
  );
}
