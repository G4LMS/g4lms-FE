import * as d3 from 'd3';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronRight,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssessmentVerdict,
  ChapterLessonItem,
  CourseRelationItem,
  KnowledgeGraphData,
  OutlineChapter,
  OutlineLearningOutcome,
  RelationEndpointOption,
  ReviewDecision,
} from '../../types';

export interface CreateDraftLessonInput {
  title: string;
  content: string;
  level: 'topic' | 'lesson';
  loCodes: string[];
  outcome?: string;
  durationMin?: number;
  aliases?: string[];
  slideId?: string;
}

export interface CreateDraftRelationInput {
  sourceId: string;
  targetId: string;
  relationType: 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO';
  strength?: 'hard' | 'soft' | null;
  reason: string;
  requiredKnowledge?: string;
}

export type Neo4jDraftGraphProps =
  | {
      mode: 'lessons';
      chapter: OutlineChapter;
      lessons: ChapterLessonItem[];
      learningOutcomes: OutlineLearningOutcome[];
      busy: boolean;
      locked: boolean;
      onLessonDecision: (
        lessonId: string,
        decision: ReviewDecision,
        changes?: Partial<ChapterLessonItem>,
        customReviewNote?: string,
      ) => Promise<void> | void;
      onCreateLesson?: (input: CreateDraftLessonInput) => Promise<void> | void;
      onDeleteLesson?: (lessonId: string) => Promise<void> | void;
      /** Increment to programmatically open the manual lesson creation drawer form. */
      createTrigger?: number;
    }
  | {
      mode: 'relations';
      relations: CourseRelationItem[];
      chapters: OutlineChapter[];
      reviewGraph?: KnowledgeGraphData | null;
      endpoints?: RelationEndpointOption[];
      busy: boolean;
      locked: boolean;
      onRelationDecision: (relationId: string, decision: ReviewDecision) => Promise<void> | void;
      onUpdateRelation?: (
        relationId: string,
        changes: Partial<CourseRelationItem>,
        reviewNote?: string,
      ) => Promise<void> | void;
      onCreateRelation?: (input: CreateDraftRelationInput) => Promise<void> | void;
      onDeleteRelation?: (relationId: string) => Promise<void> | void;
      /** Week (chapter) currently being edited at Step 3; its nodes get a highlight ring. */
      activeWeekId?: string;
      /** Multi-chapter selection at Step 3; all included chapters get active highlight rings. */
      activeWeekIds?: string[];
      activeWeekTitle?: string;
      /** Display label for the currently selected snapshot baseline (e.g. 'Snapshot v2'). */
      snapshotLabel?: string;
      /** True when the active week can no longer be edited (already merged into Master). */
      activeWeekLocked?: boolean;
      /** True when all chapters are merged into Bản tạm. */
      allMerged?: boolean;
      /** Increment to programmatically enter Connect Mode from outside the canvas. */
      connectTrigger?: number;
      /** Jump and focus onto a specific edge from List view. */
      focusEdgeRequest?: { id: string; nonce: number } | null;
    };

type GraphLayer = 'full' | 'entity' | 'lexical';
type DrawerTab = 'overview' | 'inspector';
type LayoutMode = 'force' | 'hierarchical';
type NodeLabel = 'Document' | 'Chunk' | 'Session' | 'Topic' | 'Concept' | 'LO' | 'Course';
type RelType =
  | 'PREREQUISITE'
  | 'PART_OF'
  | 'DEVELOP'
  | 'RELATED_TO'
  | 'MENTIONED_IN'
  | 'PART_OF_DOC'
  | 'NEXT_CHUNK';
type StatusFilter = 'all' | 'pending' | 'warn' | 'approved' | 'rejected';

interface ChunkQuote {
  entityId: string;
  entityName: string;
  quote: string;
  isEdge?: boolean;
}

interface ChunkMeta {
  slideId: string;
  docId: string;
  pageNumber?: number;
  quotes: ChunkQuote[];
}

interface DraftNode {
  id: string;
  label: NodeLabel;
  name: string;
  caption: string;
  chapterTitle?: string;
  description?: string;
  decision?: ReviewDecision;
  hasWarning?: boolean;
  missingLo?: boolean;
  lessonRef?: ChapterLessonItem;
  loRef?: OutlineLearningOutcome;
  chunkMeta?: ChunkMeta;
  properties?: Record<string, unknown>;
  /** Step 3 whole-course graph: which part of the course this node belongs to. */
  nodeScope?: GraphItemScope;
  /** Endpoint id accepted by the relation API (only set for active-week endpoints). */
  apiEndpointId?: string;
  r: number;
}

type GraphItemScope = 'active' | 'master' | 'other';

interface DraftEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelType;
  labelText: string;
  decision?: ReviewDecision;
  hasWarning?: boolean;
  relationRef?: CourseRelationItem;
  edgeScope?: GraphItemScope;
  reason?: string;
  requiredKnowledge?: string;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  data: DraftNode;
  r: number;
  pinned?: boolean;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  data: DraftEdge;
  source: SimNode;
  target: SimNode;
  offset?: number;
}

interface HoverTarget {
  kind: 'node' | 'edge';
  cypher: string;
}

const NODE_PALETTE: Record<
  NodeLabel,
  { fill: string; stroke: string; text: string; r: number; vi: string }
> = {
  Document: { fill: '#334155', stroke: '#0F172A', text: '#F8FAFC', r: 28, vi: 'Tài liệu nguồn' },
  Chunk: { fill: '#FEF3C7', stroke: '#D97706', text: '#78350F', r: 20, vi: 'Trang / Chunk' },
  Session: { fill: '#F79767', stroke: '#D9723F', text: '#1F2937', r: 33, vi: 'Buổi học' },
  Topic: { fill: '#C990C0', stroke: '#9B6192', text: '#1F2937', r: 29, vi: 'Chủ đề' },
  Concept: { fill: '#57C7E3', stroke: '#0284C7', text: '#0F172A', r: 26, vi: 'Khái niệm / Bài học' },
  LO: { fill: '#8DCC93', stroke: '#018B43', text: '#0F172A', r: 24, vi: 'Chuẩn đầu ra' },
  Course: { fill: '#FFE8A3', stroke: '#D97706', text: '#1F2937', r: 33, vi: 'Môn học' },
};

const EDGE_PALETTE: Record<
  RelType,
  { color: string; width: number; dash: string; arrow: boolean; dist: number; str: number; vi: string }
> = {
  PREREQUISITE: {
    color: '#2563EB',
    width: 2.3,
    dash: '',
    arrow: true,
    dist: 155,
    str: 0.28,
    vi: 'Tiên quyết',
  },
  PART_OF: {
    color: '#018B43',
    width: 2.1,
    dash: '',
    arrow: true,
    dist: 125,
    str: 0.42,
    vi: 'Thuộc về',
  },
  DEVELOP: {
    color: '#7C3AED',
    width: 1.9,
    dash: '',
    arrow: true,
    dist: 148,
    str: 0.26,
    vi: 'Phát triển LO',
  },
  RELATED_TO: {
    color: '#64748B',
    width: 1.7,
    dash: '5 4',
    arrow: false,
    dist: 155,
    str: 0.18,
    vi: 'Liên quan',
  },
  MENTIONED_IN: {
    color: '#D97706',
    width: 1.5,
    dash: '3 3',
    arrow: true,
    dist: 115,
    str: 0.22,
    vi: 'Trích từ trang',
  },
  PART_OF_DOC: {
    color: '#475569',
    width: 1.6,
    dash: '',
    arrow: true,
    dist: 105,
    str: 0.42,
    vi: 'Thuộc tài liệu',
  },
  NEXT_CHUNK: {
    color: '#94A3B8',
    width: 1.5,
    dash: '',
    arrow: true,
    dist: 82,
    str: 0.48,
    vi: 'Trang kế tiếp',
  },
};

const LEXICAL_REL_TYPES = new Set<RelType>(['MENTIONED_IN', 'PART_OF_DOC', 'NEXT_CHUNK']);

const DECISION_META: Record<ReviewDecision, { text: string; tone: string }> = {
  PENDING: { text: 'Chờ duyệt', tone: 'pending' },
  APPROVE: { text: 'Đã duyệt', tone: 'approved' },
  EDIT: { text: 'Đã sửa & duyệt', tone: 'approved' },
  REJECT: { text: 'Đã từ chối', tone: 'rejected' },
};

const VERDICT_META: Record<AssessmentVerdict, { text: string; tone: string }> = {
  supported: { text: 'AI: Đủ bằng chứng', tone: 'approved' },
  revise: { text: 'AI: Cần chỉnh sửa', tone: 'warn' },
  unsupported: { text: 'AI: Thiếu bằng chứng', tone: 'rejected' },
};

function formatSlidePage(slideId?: string): string {
  if (!slideId) return '';
  const m = slideId.match(/:p(\d+)$/i);
  if (m) return `Tr. ${m[1]}`;
  const tail = slideId.split(':').pop();
  return tail || slideId;
}

function parseChunkMeta(
  slideId: string,
  fallbackDocTitle: string,
): {
  docKey: string;
  docTitle: string;
  chunkId: string;
  pageNumber?: number;
  caption: string;
} {
  const pageMatch = slideId.match(/:p(\d+)$/i);
  const pageNumber = pageMatch ? Number(pageMatch[1]) : undefined;
  const docKey = pageMatch ? slideId.slice(0, -pageMatch[0].length) : slideId;
  const docTail = docKey.split(':').pop() || '';
  const cleanTitle =
    docTail && docTail.length <= 16 && !/^[0-9a-f]{8,}$/i.test(docTail)
      ? `${fallbackDocTitle} · ${docTail}`
      : fallbackDocTitle;
  const caption = pageNumber != null ? `Tr. ${pageNumber}` : slideId.split(':').pop() || slideId;
  return {
    docKey: docKey || fallbackDocTitle,
    docTitle: cleanTitle,
    chunkId: `chunk:${slideId}`,
    pageNumber,
    caption,
  };
}

function shortId(id?: string | null): string {
  if (!id) return '';
  const parts = id.split(':');
  return parts.length > 2 ? parts.slice(-2).join(':') : id;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      else lines.push(w.slice(0, maxChars - 1) + '…');
      cur = next.length > maxChars && cur ? w : '';
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < words.join(' ').length && !lines[maxLines - 1].endsWith('…')) {
      lines[maxLines - 1] =
        lines[maxLines - 1].slice(0, Math.max(1, maxChars - 1)).trimEnd() + '…';
    }
  }
  return lines;
}

function edgeStrokeColor(e: DraftEdge): string {
  if (e.decision === 'REJECT') return '#DC2626';
  return EDGE_PALETTE[e.type].color;
}

function edgeStrokeDash(e: DraftEdge): string | null {
  if (e.decision === 'REJECT') return '4 4';
  const base = EDGE_PALETTE[e.type].dash;
  return base || null;
}

function edgeStrokeWidth(e: DraftEdge): number {
  return EDGE_PALETTE[e.type].width;
}

function normalizeNodeLabel(rawType?: string): NodeLabel {
  if (rawType === 'Chapter' || rawType === 'Session') return 'Session';
  if (rawType === 'Topic') return 'Topic';
  if (rawType === 'LO') return 'LO';
  if (rawType === 'Course') return 'Course';
  if (rawType === 'Document') return 'Document';
  if (rawType === 'Chunk') return 'Chunk';
  return 'Concept';
}

function parallelOffsets(links: SimLink[]): void {
  const groups = new Map<string, SimLink[]>();
  links.forEach((l) => {
    const a = l.source.id;
    const b = l.target.id;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const list = groups.get(key);
    if (list) list.push(l);
    else groups.set(key, [l]);
  });
  groups.forEach((g) => {
    g.forEach((e, i) => {
      e.offset = (i - (g.length - 1) / 2) * 32;
    });
  });
}

function computeEdgeGeom(e: SimLink, nodeScale: number) {
  const s = e.source;
  const t = e.target;
  const sx = s.x ?? 0;
  const sy = s.y ?? 0;
  const tx = t.x ?? 0;
  const ty = t.y ?? 0;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const sign = s.id < t.id ? 1 : -1;
  const c = (e.offset ?? 0) * sign * 1.9;
  const mx = (sx + tx) / 2 + nx * c;
  const my = (sy + ty) / 2 + ny * c;
  const palette = EDGE_PALETTE[e.data.type];
  const tgtPad = palette.arrow ? 5 : 2;
  const sr = s.r * nodeScale;
  const tr = t.r * nodeScale;

  let ux: number;
  let uy: number;
  let vx: number;
  let vy: number;
  if (c === 0) {
    ux = dx / len;
    uy = dy / len;
    vx = -ux;
    vy = -uy;
  } else {
    const l1 = Math.hypot(mx - sx, my - sy) || 1;
    ux = (mx - sx) / l1;
    uy = (my - sy) / l1;
    const l2 = Math.hypot(mx - tx, my - ty) || 1;
    vx = (mx - tx) / l2;
    vy = (my - ty) / l2;
  }

  const x1 = sx + ux * (sr + 2);
  const y1 = sy + uy * (sr + 2);
  const x2 = tx + vx * (tr + tgtPad);
  const y2 = ty + vy * (tr + tgtPad);
  const d = c === 0 ? `M${x1},${y1}L${x2},${y2}` : `M${x1},${y1}Q${mx},${my} ${x2},${y2}`;
  const lx = c === 0 ? (x1 + x2) / 2 : 0.25 * x1 + 0.5 * mx + 0.25 * x2;
  const ly = c === 0 ? (y1 + y2) / 2 : 0.25 * y1 + 0.5 * my + 0.25 * y2;
  let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  return { d, lx, ly, ang };
}

function computeHierarchicalTargets(
  nodes: DraftNode[],
  edges: DraftEdge[],
  mode: 'lessons' | 'relations',
): Map<string, number> {
  const out = new Map<string, number>();
  if (mode === 'lessons') {
    nodes.forEach((n) => {
      if (n.label === 'Document') out.set(n.id, -380);
      else if (n.label === 'Chunk') out.set(n.id, -210);
      else if (n.label === 'Concept') out.set(n.id, -20);
      else if (n.label === 'Topic') out.set(n.id, 130);
      else if (n.label === 'Session') out.set(n.id, 275);
      else if (n.label === 'LO') out.set(n.id, 410);
      else out.set(n.id, 0);
    });
    return out;
  }

  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const entityNodes = nodes.filter(
    (n) => n.label !== 'Document' && n.label !== 'Chunk' && n.label !== 'LO',
  );
  const entityIds = new Set(entityNodes.map((n) => n.id));
  entityNodes.forEach((n) => {
    adj.set(n.id, []);
    indeg.set(n.id, 0);
  });
  edges.forEach((e) => {
    if (
      (e.type === 'PREREQUISITE' || e.type === 'PART_OF') &&
      entityIds.has(e.sourceId) &&
      entityIds.has(e.targetId)
    ) {
      adj.get(e.sourceId)!.push(e.targetId);
      indeg.set(e.targetId, (indeg.get(e.targetId) ?? 0) + 1);
    }
  });

  const depth = new Map<string, number>();
  const queue: string[] = [];
  indeg.forEach((deg, id) => {
    if (deg === 0) {
      depth.set(id, 0);
      queue.push(id);
    }
  });
  if (queue.length === 0 && entityNodes.length > 0) {
    depth.set(entityNodes[0].id, 0);
    queue.push(entityNodes[0].id);
  }
  const visits = new Map<string, number>();
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curD = depth.get(cur) ?? 0;
    const nexts = adj.get(cur) ?? [];
    for (const nxt of nexts) {
      const seen = visits.get(nxt) ?? 0;
      if (seen > entityNodes.length) continue;
      if (curD + 1 > (depth.get(nxt) ?? -1) && curD + 1 <= 8) {
        depth.set(nxt, curD + 1);
        visits.set(nxt, seen + 1);
        queue.push(nxt);
      }
    }
  }
  const maxD = Math.max(0, ...Array.from(depth.values()));
  const step = 170;
  nodes.forEach((n) => {
    if (n.label === 'Document') out.set(n.id, -420);
    else if (n.label === 'Chunk') out.set(n.id, -260);
    else if (n.label === 'LO') out.set(n.id, (maxD / 2 + 1) * step + 120);
    else {
      const d = depth.get(n.id) ?? 0;
      out.set(n.id, (d - maxD / 2) * step);
    }
  });
  return out;
}

function escapeCypherStr(v: string): string {
  return v.replace(/"/g, '\\"');
}

function cypherForNode(n: DraftNode): string {
  const parts = [`name: "${escapeCypherStr(n.name)}"`];
  if (n.chunkMeta?.pageNumber != null) parts.push(`page: ${n.chunkMeta.pageNumber}`);
  if (n.decision) parts.push(`decision: "${n.decision}"`);
  if (n.chapterTitle) parts.push(`session: "${escapeCypherStr(n.chapterTitle)}"`);
  return `(:${n.label} {${parts.join(', ')}})`;
}

function cypherForEdge(e: DraftEdge, src?: DraftNode, tgt?: DraftNode): string {
  const sLabel = src?.label ?? 'Concept';
  const sName = escapeCypherStr(src?.name ?? e.sourceId);
  const tLabel = tgt?.label ?? 'Concept';
  const tName = escapeCypherStr(tgt?.name ?? e.targetId);
  const props: string[] = [];
  if (e.decision) props.push(`decision: "${e.decision}"`);
  const propStr = props.length ? ` {${props.join(', ')}}` : '';
  return `(:${sLabel} {name: "${sName}"})-[:${e.type}${propStr}]->(:${tLabel} {name: "${tName}"})`;
}

export function Neo4jDraftGraph(props: Neo4jDraftGraphProps) {
  const contextKey = props.mode === 'lessons' ? `lessons:${props.chapter.id}` : 'relations';

  const [graphLayer, setGraphLayer] = useState<GraphLayer>('entity');
  /** Step 3: incremental Bản tạm + active week, active week only, or whole course. */
  const [graphScope, setGraphScope] = useState<'incremental' | 'week' | 'course'>('incremental');
  const [connectHint, setConnectHint] = useState<string | null>(null);
  const relActiveWeekId = props.mode === 'relations' ? props.activeWeekId : undefined;
  const relActiveWeekIdSet = useMemo(() => {
    const s = new Set<string>();
    if (props.mode === 'relations') {
      if (props.activeWeekId) s.add(props.activeWeekId);
      (props.activeWeekIds ?? []).forEach((id) => s.add(id));
    }
    return s;
  }, [props]);
  const relActiveWeekTitle = props.mode === 'relations' ? props.activeWeekTitle : undefined;
  const relSnapshotLabel = props.mode === 'relations' ? props.snapshotLabel : undefined;
  const relActiveWeekLocked = props.mode === 'relations' ? Boolean(props.activeWeekLocked) : false;
  const relAllMerged = props.mode === 'relations' ? Boolean(props.allMerged) : false;
  const relConnectTrigger = props.mode === 'relations' ? props.connectTrigger ?? 0 : 0;
  const lessonCreateTrigger = props.mode === 'lessons' ? props.createTrigger ?? 0 : 0;
  const relFocusEdgeRequest = props.mode === 'relations' ? props.focusEdgeRequest ?? null : null;
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
  const [hiddenLabels, setHiddenLabels] = useState<Set<NodeLabel>>(() =>
    props.mode === 'lessons' ? new Set<NodeLabel>(['Session', 'LO']) : new Set<NodeLabel>(['LO']),
  );
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<RelType>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [qualityHighlight, setQualityHighlight] = useState<'none' | 'warn' | 'missing_lo'>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [relayoutCounter, setRelayoutCounter] = useState(0);

  // Layout & visual adjustment state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [linkScale, setLinkScale] = useState(1);
  const [chargeStrength, setChargeStrength] = useState(-340);
  const [nodeScale, setNodeScale] = useState(1);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pinnedCount, setPinnedCount] = useState(0);

  // Create & Connect state
  const [drawerCreateMode, setDrawerCreateMode] = useState<'none' | 'lesson' | 'relation'>('none');
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  // New Lesson Form state (D2)
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newLevel, setNewLevel] = useState<'lesson' | 'topic'>('lesson');
  const [newOutcome, setNewOutcome] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newLoCodes, setNewLoCodes] = useState<string[]>([]);
  const [newAliases, setNewAliases] = useState('');
  const [newSlideId, setNewSlideId] = useState('');

  // Edit Lesson Form state (D2)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLevel, setEditLevel] = useState<'lesson' | 'topic'>('lesson');
  const [editOutcome, setEditOutcome] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editLoCodes, setEditLoCodes] = useState<string[]>([]);
  const [editAliases, setEditAliases] = useState('');
  const [editReviewNote, setEditReviewNote] = useState('');

  // New Relation Form state (D3)
  const [newRelSourceId, setNewRelSourceId] = useState('');
  const [newRelTargetId, setNewRelTargetId] = useState('');
  const [newRelType, setNewRelType] = useState<'PREREQUISITE' | 'PART_OF' | 'RELATED_TO'>('PREREQUISITE');
  const [newRelStrength, setNewRelStrength] = useState<'hard' | 'soft'>('hard');
  const [newRelReason, setNewRelReason] = useState('');
  const [newRelRequired, setNewRelRequired] = useState('');

  // Edit Relation Form state (D3)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editRelSourceId, setEditRelSourceId] = useState('');
  const [editRelTargetId, setEditRelTargetId] = useState('');
  const [editRelType, setEditRelType] = useState<'PREREQUISITE' | 'PART_OF' | 'RELATED_TO'>('PREREQUISITE');
  const [editRelStrength, setEditRelStrength] = useState<'hard' | 'soft'>('hard');
  const [editRelReason, setEditRelReason] = useState('');
  const [editRelRequired, setEditRelRequired] = useState('');
  const [editRelReviewNote, setEditRelReviewNote] = useState('');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const edgeGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodeGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const posMapRef = useRef<Map<string, SimNode>>(new Map());
  const autoFitRef = useRef(true);
  const tickCountRef = useRef(0);
  const prevContextRef = useRef<string>('');
  const prevStructKeyRef = useRef<string>('');
  const pendingFocusIdRef = useRef<string | null>(null);

  const nodeScaleRef = useRef(nodeScale);
  nodeScaleRef.current = nodeScale;

  // Fresh connect-mode handler for D3 SVG click listener without rebuilding simulation
  const connectClickRef = useRef<(nodeId: string, node: DraftNode) => boolean>(() => false);
  connectClickRef.current = (nodeId: string, node: DraftNode) => {
    if (!connectMode || props.mode !== 'relations') return false;
    if (node.label === 'Document' || node.label === 'Chunk' || node.label === 'LO' || node.label === 'Course') {
      setConnectHint('Chỉ có thể nối quan hệ giữa các Khái niệm / Chủ đề.');
      return true;
    }
    if (!node.apiEndpointId || node.nodeScope === 'other') {
      setConnectHint('Chỉ nối được giữa chương đang xử lý và các nút đã có trong Bản tạm.');
      return true;
    }
    if (!connectSourceId) {
      setConnectSourceId(nodeId);
      setConnectHint(null);
      return true;
    }
    if (connectSourceId === nodeId) return true;
    const srcNode = fullGraph.nodeById.get(connectSourceId);
    if (!srcNode?.apiEndpointId) {
      setConnectSourceId(null);
      return true;
    }
    if (srcNode.nodeScope !== 'active' && node.nodeScope !== 'active') {
      setConnectHint('Cần chọn ít nhất 1 nút thuộc chương đang nối (viền nét đứt) để liên kết với Bản tạm.');
      return true;
    }
    setConnectMode(false);
    setConnectHint(null);
    setNewRelSourceId(srcNode.apiEndpointId);
    setNewRelTargetId(node.apiEndpointId);
    setNewRelType('PREREQUISITE');
    setNewRelStrength('hard');
    setNewRelReason('');
    setNewRelRequired('');
    setConnectSourceId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDrawerCreateMode('relation');
    setDrawerTab('inspector');
    setInspectorOpen(true);
    return true;
  };

  useEffect(() => {
    if (relConnectTrigger > 0 && props.mode === 'relations' && !props.locked && !relActiveWeekLocked && props.onCreateRelation) {
      setConnectHint(null);
      setConnectSourceId(null);
      setConnectMode(true);
    }
  }, [relConnectTrigger, props.mode, props.locked, relActiveWeekLocked]);

  // Reset transient state when switching between D2 chapters or D2 <-> D3
  useEffect(() => {
    setGraphLayer('entity');
    setDrawerTab('overview');
    setDrawerCreateMode('none');
    setConnectMode(false);
    setConnectSourceId(null);
    setConnectHint(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEditingLessonId(null);
    setEditingEdgeId(null);
    setStatusFilter('all');
    setQualityHighlight('none');
    setSearchQuery('');
    setHiddenLabels(
      props.mode === 'lessons' ? new Set<NodeLabel>(['Session', 'LO']) : new Set<NodeLabel>(['LO']),
    );
    setHiddenEdgeTypes(new Set());
    setPinnedCount(0);
    autoFitRef.current = true;
  }, [contextKey]);

  useEffect(() => {
    if (lessonCreateTrigger > 0 && props.mode === 'lessons' && !props.locked && props.onCreateLesson) {
      setNewTitle('');
      setNewContent('');
      setNewLevel('lesson');
      setNewOutcome('');
      setNewDuration('');
      setNewLoCodes([]);
      setNewAliases('');
      setNewSlideId('');
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setDrawerCreateMode('lesson');
      setDrawerTab('inspector');
      setInspectorOpen(true);
    }
  }, [lessonCreateTrigger, props.mode, props.locked]);

  useEffect(() => {
    setEditingLessonId(null);
  }, [selectedNodeId]);

  useEffect(() => {
    setEditingEdgeId(null);
  }, [selectedEdgeId]);

  useEffect(() => {
    if (selectedNodeId || selectedEdgeId) {
      setDrawerCreateMode('none');
      setDrawerTab('inspector');
    }
  }, [selectedNodeId, selectedEdgeId]);

  // Build full Lexical + Entity graph model
  const fullGraph = useMemo(() => {
    const nodes: DraftNode[] = [];
    const nodeById = new Map<string, DraftNode>();
    const edges: DraftEdge[] = [];
    const edgeById = new Map<string, DraftEdge>();
    const docChunkMap = new Map<string, DraftNode[]>();

    const addEdgeUnique = (e: DraftEdge) => {
      if (edgeById.has(e.id) || e.sourceId === e.targetId) return;
      edgeById.set(e.id, e);
      edges.push(e);
    };

    const ensureChunkAndDoc = (
      slideId: string,
      fallbackDocTitle: string,
      quoteEntry?: ChunkQuote,
    ): DraftNode => {
      const parsed = parseChunkMeta(slideId, fallbackDocTitle);
      const docNodeId = `doc:${parsed.docKey}`;
      if (!nodeById.has(docNodeId)) {
        const docNode: DraftNode = {
          id: docNodeId,
          label: 'Document',
          name: parsed.docTitle,
          caption: parsed.docTitle,
          description: `Tài liệu nguồn trích xuất cho ${fallbackDocTitle}`,
          r: NODE_PALETTE.Document.r,
        };
        nodes.push(docNode);
        nodeById.set(docNodeId, docNode);
      }

      let chunkNode = nodeById.get(parsed.chunkId);
      if (!chunkNode) {
        chunkNode = {
          id: parsed.chunkId,
          label: 'Chunk',
          name: `Nguồn ${parsed.caption}`,
          caption: parsed.caption,
          chapterTitle: fallbackDocTitle,
          chunkMeta: {
            slideId,
            docId: docNodeId,
            pageNumber: parsed.pageNumber,
            quotes: [],
          },
          r: NODE_PALETTE.Chunk.r,
        };
        nodes.push(chunkNode);
        nodeById.set(parsed.chunkId, chunkNode);

        const list = docChunkMap.get(docNodeId) ?? [];
        list.push(chunkNode);
        docChunkMap.set(docNodeId, list);

        addEdgeUnique({
          id: `edge:partdoc:${parsed.chunkId}`,
          sourceId: parsed.chunkId,
          targetId: docNodeId,
          type: 'PART_OF_DOC',
          labelText: 'PART_OF_DOC',
        });
      }

      if (quoteEntry && chunkNode.chunkMeta) {
        const dup = chunkNode.chunkMeta.quotes.some(
          (q) => q.entityId === quoteEntry.entityId && q.quote === quoteEntry.quote,
        );
        if (!dup) chunkNode.chunkMeta.quotes.push(quoteEntry);
      }
      return chunkNode;
    };

    if (props.mode === 'lessons') {
      const loByCode = new Map(props.learningOutcomes.map((lo) => [lo.code, lo]));
      const sessionNodeId = `session:${props.chapter.id}`;
      const sessionNode: DraftNode = {
        id: sessionNodeId,
        label: 'Session',
        name: props.chapter.title,
        caption: props.chapter.title,
        description: props.chapter.description,
        r: NODE_PALETTE.Session.r,
      };
      nodes.push(sessionNode);
      nodeById.set(sessionNodeId, sessionNode);

      props.lessons.forEach((lesson) => {
        const label: NodeLabel = lesson.level === 'topic' ? 'Topic' : 'Concept';
        const hasWarning = Boolean(
          lesson.hasWarning || (lesson.assessment && lesson.assessment.verdict !== 'supported'),
        );
        const lessonNode: DraftNode = {
          id: lesson.id,
          label,
          name: lesson.title,
          caption: lesson.title,
          chapterTitle: props.chapter.title,
          description: lesson.content,
          decision: lesson.decision,
          hasWarning,
          missingLo: lesson.loCodes.length === 0,
          lessonRef: lesson,
          r: NODE_PALETTE[label].r,
        };
        nodes.push(lessonNode);
        nodeById.set(lesson.id, lessonNode);

        addEdgeUnique({
          id: `edge:partof:${lesson.id}`,
          sourceId: lesson.id,
          targetId: sessionNodeId,
          type: 'PART_OF',
          labelText: 'PART_OF',
        });

        lesson.loCodes.forEach((code) => {
          const loId = `lo:${code}`;
          if (!nodeById.has(loId)) {
            const loRef = loByCode.get(code);
            const loNode: DraftNode = {
              id: loId,
              label: 'LO',
              name: code,
              caption: code,
              description: loRef?.description,
              loRef,
              r: NODE_PALETTE.LO.r,
            };
            nodes.push(loNode);
            nodeById.set(loId, loNode);
          }
          addEdgeUnique({
            id: `edge:dev:${lesson.id}:${code}`,
            sourceId: lesson.id,
            targetId: loId,
            type: 'DEVELOP',
            labelText: 'DEVELOP',
          });
        });

        const slideRefs = new Map<string, string>();
        lesson.evidence?.forEach((ev) => {
          if (ev.slideId) slideRefs.set(ev.slideId, ev.quote || lesson.content);
        });
        if (lesson.sourceRef && !slideRefs.has(lesson.sourceRef)) {
          slideRefs.set(lesson.sourceRef, lesson.content);
        }
        slideRefs.forEach((quote, slideId) => {
          const chunkNode = ensureChunkAndDoc(slideId, props.chapter.title, {
            entityId: lesson.id,
            entityName: lesson.title,
            quote,
          });
          addEdgeUnique({
            id: `edge:ment:${lesson.id}:${chunkNode.id}`,
            sourceId: lesson.id,
            targetId: chunkNode.id,
            type: 'MENTIONED_IN',
            labelText: 'MENTIONED_IN',
          });
        });
      });
    } else {
      const chapterById = new Map(props.chapters.map((c) => [c.id, c]));
      const kgNodeById = new Map((props.reviewGraph?.nodes ?? []).map((n) => [n.id, n]));
      const localToCanon = new Map<string, string>();
      const canonToEp = new Map<string, RelationEndpointOption>();
      (props.endpoints ?? []).forEach((ep) => {
        const canon = ep.canonicalId || ep.id;
        localToCanon.set(ep.id, canon);
        localToCanon.set(canon, canon);
        if (!canonToEp.has(canon) || ep.inDraft) {
          canonToEp.set(canon, ep);
        }
      });
      const canonicalIdFor = (rawId: string) => localToCanon.get(rawId) ?? rawId;

      const hasRelWarning = (r: CourseRelationItem) =>
        Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported'));

      const filteredRelations = props.relations.filter((r) => {
        if (statusFilter === 'pending') return r.decision === 'PENDING';
        if (statusFilter === 'warn') return hasRelWarning(r);
        if (statusFilter === 'approved') return r.decision === 'APPROVE' || r.decision === 'EDIT';
        if (statusFilter === 'rejected') return r.decision === 'REJECT';
        return true;
      });

      const ensureNode = (
        rawId: string,
        fallbackName: string,
        chapterId: string,
        fallbackLabel: NodeLabel,
        scopeOverride?: GraphItemScope,
        apiEpId?: string,
      ) => {
        const id = canonicalIdFor(rawId);
        const existing = nodeById.get(id);
        if (existing) {
          if (existing.label === 'Concept' && fallbackLabel !== 'Concept') {
            existing.label = fallbackLabel;
            existing.r = NODE_PALETTE[fallbackLabel].r;
          }
          if (scopeOverride === 'active') existing.nodeScope = 'active';
          if (apiEpId && !existing.apiEndpointId) existing.apiEndpointId = apiEpId;
          return id;
        }
        const kgNode = kgNodeById.get(id) ?? kgNodeById.get(rawId);
        const ep = canonToEp.get(id);
        const rawWeekId = String(
          chapterId ||
            ep?.weekId ||
            kgNode?.properties?.week_id ||
            kgNode?.properties?.chapter_id ||
            '',
        );
        let label = kgNode ? normalizeNodeLabel(kgNode.type) : fallbackLabel;
        if (!kgNode && ep?.level === 'topic') label = 'Topic';
        if (!kgNode && (/^L\.?O\.?\d/i.test(fallbackName) || /^lo:/i.test(id))) {
          label = 'LO';
        }
        const isActiveWeek = Boolean(rawWeekId && relActiveWeekIdSet.has(rawWeekId));
        const computedScope: GraphItemScope =
          scopeOverride ??
          (ep?.inDraft || isActiveWeek
            ? 'active'
            : kgNode?.properties?.scope === 'master' || ep
              ? 'master'
              : 'other');
        const chTitle =
          (typeof kgNode?.properties?.chapter_title === 'string' && kgNode.properties.chapter_title) ||
          chapterById.get(rawWeekId)?.title ||
          (computedScope === 'active' ? relActiveWeekTitle : undefined);
        const n: DraftNode = {
          id,
          label,
          name: kgNode?.name || ep?.name || fallbackName || id,
          caption: kgNode?.name || ep?.name || fallbackName || id,
          chapterTitle: chTitle,
          description: kgNode?.description,
          properties: kgNode?.properties,
          nodeScope: computedScope,
          apiEndpointId: apiEpId ?? ep?.id ?? (computedScope === 'master' && label !== 'LO' ? id : undefined),
          r: NODE_PALETTE[label].r,
        };
        nodes.push(n);
        nodeById.set(id, n);
        return id;
      };

      // 1. Seed Master / Snapshot nodes & explicitly selected raw chapters when viewing incremental or whole-course graph
      if (graphScope !== 'week' || relActiveWeekIdSet.size > 0) {
        for (const kgNode of props.reviewGraph?.nodes ?? []) {
          if (kgNode.type === 'Course') continue;
          const nScope = kgNode.properties?.scope;
          const nWeek = String(kgNode.properties?.week_id || kgNode.properties?.chapter_id || '');
          const inSelectedWeek = Boolean(nWeek && relActiveWeekIdSet.has(nWeek));
          if (graphScope === 'week' && !inSelectedWeek) continue;
          if (inSelectedWeek || nScope === 'master' || (graphScope === 'course' && nScope === 'draft') || nScope === 'active') {
            const isMasterOrActive = nScope === 'master' || nScope === 'active' || inSelectedWeek;
            const lbl = normalizeNodeLabel(kgNode.type);
            const scope: GraphItemScope =
              inSelectedWeek && (relAllMerged || nScope !== 'master')
                ? 'active'
                : nScope === 'active'
                  ? 'active'
                  : nScope === 'master'
                    ? 'master'
                    : 'other';
            ensureNode(
              kgNode.id,
              kgNode.name,
              nWeek,
              lbl,
              scope,
              isMasterOrActive && lbl !== 'LO' ? canonToEp.get(kgNode.id)?.id ?? kgNode.id : undefined,
            );
          }
        }
      }

      // 2. Seed endpoints passed from BE for the active week (and Master)
      (props.endpoints ?? []).forEach((ep) => {
        if (!ep.inDraft && graphScope === 'week') return;
        const lbl: NodeLabel = ep.level === 'topic' ? 'Topic' : 'Concept';
        const wk = ep.weekId || (ep.inDraft ? relActiveWeekId || '' : '');
        const scope: GraphItemScope = ep.inDraft
          ? 'active'
          : relAllMerged && relActiveWeekId && wk === relActiveWeekId
            ? 'active'
            : 'master';
        ensureNode(ep.id, ep.name, wk, lbl, scope, ep.id);
      });

      // 3. Add active-week relation edges (editable)
      const activeEdgeSigs = new Set<string>();
      filteredRelations.forEach((rel) => {
        const tgtFallback: NodeLabel =
          rel.relationType === 'DEVELOP'
            ? 'LO'
            : rel.relationType === 'PART_OF'
              ? 'Topic'
              : 'Concept';
        const srcCanon = ensureNode(rel.sourceId, rel.sourceName, rel.sourceChapterId, 'Concept');
        const tgtCanon = ensureNode(rel.targetId, rel.targetName, rel.targetChapterId, tgtFallback);
        activeEdgeSigs.add(`${srcCanon}|${tgtCanon}|${rel.relationType}`);

        addEdgeUnique({
          id: rel.id,
          sourceId: srcCanon,
          targetId: tgtCanon,
          type: rel.relationType,
          labelText: rel.relationType,
          decision: rel.decision,
          hasWarning: hasRelWarning(rel),
          relationRef: rel,
          edgeScope: 'active',
          reason: rel.reason,
          requiredKnowledge: rel.requiredKnowledge,
        });

        const docTitle = chapterById.get(rel.sourceChapterId)?.title || 'Tài liệu môn học';
        const slideRefs = new Map<string, string>();
        rel.evidence?.forEach((ev) => {
          if (ev.slideId) slideRefs.set(ev.slideId, ev.quote || rel.reason || '');
        });
        if (rel.sourceRef && !slideRefs.has(rel.sourceRef)) {
          slideRefs.set(rel.sourceRef, rel.reason || '');
        }
        slideRefs.forEach((quote, slideId) => {
          const chunkNode = ensureChunkAndDoc(slideId, docTitle, {
            entityId: rel.id,
            entityName: `${rel.sourceName} → ${rel.targetName}`,
            quote: quote || rel.relationType,
            isEdge: true,
          });
          addEdgeUnique({
            id: `edge:ment:${srcCanon}:${chunkNode.id}`,
            sourceId: srcCanon,
            targetId: chunkNode.id,
            type: 'MENTIONED_IN',
            labelText: 'MENTIONED_IN',
          });
          addEdgeUnique({
            id: `edge:ment:${tgtCanon}:${chunkNode.id}`,
            sourceId: tgtCanon,
            targetId: chunkNode.id,
            type: 'MENTIONED_IN',
            labelText: 'MENTIONED_IN',
          });
        });
      });

      // 4. Add Master (Bản tạm) & optional other-week edges from reviewGraph
      if (graphScope !== 'week') {
        for (const kgEdge of props.reviewGraph?.edges ?? []) {
          const rtype = kgEdge.type as RelType;
          if (!EDGE_PALETTE[rtype]) continue;
          const eScopeRaw = kgEdge.properties?.scope;
          if (eScopeRaw !== 'master' && graphScope !== 'course') continue;
          const srcCanon = canonicalIdFor(kgEdge.source);
          const tgtCanon = canonicalIdFor(kgEdge.target);
          if (!nodeById.has(srcCanon) || !nodeById.has(tgtCanon)) continue;
          if (activeEdgeSigs.has(`${srcCanon}|${tgtCanon}|${rtype}`)) continue;
          const edgeScope: GraphItemScope = eScopeRaw === 'master' ? 'master' : 'other';
          const edgeWeek = String(kgEdge.properties?.week_id || '');
          const isActiveMergedHighlight = relAllMerged && relActiveWeekId && edgeWeek === relActiveWeekId;
          addEdgeUnique({
            id: `kg:${srcCanon}:${rtype}:${tgtCanon}`,
            sourceId: srcCanon,
            targetId: tgtCanon,
            type: rtype,
            labelText: rtype,
            decision: kgEdge.properties?.status === 'proposed' ? 'PENDING' : 'APPROVE',
            edgeScope: isActiveMergedHighlight ? 'active' : edgeScope,
            reason: typeof kgEdge.properties?.reason === 'string' ? kgEdge.properties.reason : undefined,
            requiredKnowledge:
              typeof kgEdge.properties?.required_knowledge === 'string'
                ? kgEdge.properties.required_knowledge
                : undefined,
          });
        }
      }
    }

    const docNodes = nodes.filter((n) => n.label === 'Document');
    const titleCounts = new Map<string, number>();
    docNodes.forEach((d) => titleCounts.set(d.name, (titleCounts.get(d.name) ?? 0) + 1));
    const titleIdx = new Map<string, number>();
    docNodes.forEach((d) => {
      if ((titleCounts.get(d.name) ?? 0) > 1) {
        const idx = (titleIdx.get(d.name) ?? 0) + 1;
        titleIdx.set(d.name, idx);
        d.name = `${d.name} (#${idx})`;
        d.caption = d.name;
      }
    });

    docChunkMap.forEach((chunks) => {
      if (chunks.length < 2) return;
      const sorted = [...chunks].sort((a, b) => {
        const pa = a.chunkMeta?.pageNumber ?? 999999;
        const pb = b.chunkMeta?.pageNumber ?? 999999;
        if (pa !== pb) return pa - pb;
        return a.caption.localeCompare(b.caption);
      });
      for (let i = 0; i < sorted.length - 1; i += 1) {
        addEdgeUnique({
          id: `edge:next:${sorted[i].id}:${sorted[i + 1].id}`,
          sourceId: sorted[i].id,
          targetId: sorted[i + 1].id,
          type: 'NEXT_CHUNK',
          labelText: 'NEXT_CHUNK',
        });
      }
    });

    return { nodes, edges, nodeById, edgeById };
  }, [props, statusFilter, graphScope, relActiveWeekId, relActiveWeekIdSet, relActiveWeekTitle, relAllMerged]);

  const chunkOptions = useMemo(() => {
    return fullGraph.nodes
      .filter((n) => n.label === 'Chunk' && n.chunkMeta?.slideId)
      .map((n) => ({
        slideId: n.chunkMeta!.slideId,
        label: n.caption,
        pageNumber: n.chunkMeta?.pageNumber ?? 999999,
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }, [fullGraph.nodes]);

  const endpointOptions = useMemo<RelationEndpointOption[]>(() => {
    if (props.mode !== 'relations') return [];
    const map = new Map<string, RelationEndpointOption>();
    const addEp = (ep: RelationEndpointOption) => {
      const key = ep.canonicalId || ep.id;
      const existing = map.get(key);
      if (!existing || (!existing.inDraft && ep.inDraft)) {
        map.set(key, ep);
      }
    };
    (props.endpoints ?? []).forEach(addEp);
    fullGraph.nodes.forEach((n) => {
      if (
        !n.apiEndpointId ||
        n.nodeScope === 'other' ||
        n.label === 'Document' ||
        n.label === 'Chunk' ||
        n.label === 'LO' ||
        n.label === 'Session' ||
        n.label === 'Course'
      ) {
        return;
      }
      addEp({
        id: n.apiEndpointId,
        name: n.name,
        inDraft: n.nodeScope === 'active',
        level: n.label === 'Topic' ? 'topic' : 'lesson',
        canonicalId: n.id,
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.inDraft !== b.inDraft) return a.inDraft ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [props, fullGraph.nodes]);

  const layeredGraph = useMemo(() => {
    const nodes = fullGraph.nodes.filter((n) => {
      const isLex = n.label === 'Document' || n.label === 'Chunk';
      if (graphLayer === 'entity') return !isLex;
      if (graphLayer === 'lexical') return isLex;
      return true;
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = fullGraph.edges.filter((e) => {
      if (!nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)) return false;
      if (graphLayer === 'entity') return !LEXICAL_REL_TYPES.has(e.type);
      if (graphLayer === 'lexical') return e.type === 'PART_OF_DOC' || e.type === 'NEXT_CHUNK';
      return true;
    });
    return { nodes, edges };
  }, [fullGraph, graphLayer]);

  const chunkTotal = useMemo(
    () => fullGraph.nodes.filter((n) => n.label === 'Chunk').length,
    [fullGraph.nodes],
  );
  const entityTotal = useMemo(
    () => fullGraph.nodes.filter((n) => n.label !== 'Document' && n.label !== 'Chunk').length,
    [fullGraph.nodes],
  );

  const labelCounts = useMemo(() => {
    const counts = new Map<NodeLabel, number>();
    layeredGraph.nodes.forEach((n) => {
      counts.set(n.label, (counts.get(n.label) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [layeredGraph.nodes]);

  const edgeTypeCounts = useMemo(() => {
    const counts = new Map<RelType, number>();
    layeredGraph.edges.forEach((e) => {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [layeredGraph.edges]);

  const visible = useMemo(() => {
    const nodes = layeredGraph.nodes.filter((n) => !hiddenLabels.has(n.label));
    const visIds = new Set(nodes.map((n) => n.id));
    const edges = layeredGraph.edges.filter(
      (e) =>
        !hiddenEdgeTypes.has(e.type) && visIds.has(e.sourceId) && visIds.has(e.targetId),
    );
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(edges.map((e) => [e.id, e]));
    return { nodes, edges, nodeMap, edgeMap };
  }, [layeredGraph, hiddenLabels, hiddenEdgeTypes]);

  const qualityCounts = useMemo(() => {
    const warnCount =
      props.mode === 'lessons'
        ? props.lessons.filter((l) =>
            Boolean(l.hasWarning || (l.assessment && l.assessment.verdict !== 'supported')),
          ).length
        : props.relations.filter((r) =>
            Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported')),
          ).length;
    const missingLoCount =
      props.mode === 'lessons' ? props.lessons.filter((l) => l.loCodes.length === 0).length : 0;
    return { warnCount, missingLoCount };
  }, [props]);

  const highlightMatches = useMemo(() => {
    if (qualityHighlight !== 'none') {
      const matchedNodes = new Set<string>();
      const matchedEdges = new Set<string>();
      if (qualityHighlight === 'warn') {
        visible.nodes.forEach((n) => {
          if (n.hasWarning) matchedNodes.add(n.id);
        });
        visible.edges.forEach((e) => {
          if (e.hasWarning) {
            matchedEdges.add(e.id);
            matchedNodes.add(e.sourceId);
            matchedNodes.add(e.targetId);
          }
        });
      } else if (qualityHighlight === 'missing_lo') {
        visible.nodes.forEach((n) => {
          if (n.missingLo) matchedNodes.add(n.id);
        });
      }
      return { nodeIds: matchedNodes, edgeIds: matchedEdges };
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matchedNodes = new Set<string>();
    const matchedEdges = new Set<string>();
    visible.nodes.forEach((n) => {
      const chunkQuotes = n.chunkMeta?.quotes.map((x) => `${x.entityName} ${x.quote}`).join(' ') ?? '';
      const hay = `${n.name} ${n.caption} ${n.label} ${n.chapterTitle ?? ''} ${n.description ?? ''} ${chunkQuotes}`.toLowerCase();
      if (hay.includes(q)) matchedNodes.add(n.id);
    });
    visible.edges.forEach((e) => {
      const hay = `${e.type} ${e.labelText} ${e.relationRef?.reason ?? ''}`.toLowerCase();
      if (hay.includes(q)) {
        matchedEdges.add(e.id);
        matchedNodes.add(e.sourceId);
        matchedNodes.add(e.targetId);
      }
    });
    return { nodeIds: matchedNodes, edgeIds: matchedEdges };
  }, [qualityHighlight, searchQuery, visible]);

  useEffect(() => {
    if (pendingFocusIdRef.current) return;
    if (selectedNodeId && !visible.nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (selectedEdgeId && !visible.edgeMap.has(selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [visible, selectedNodeId, selectedEdgeId]);

  const fitView = useCallback(
    (animate = true) => {
      const svgEl = svgRef.current;
      const zoom = zoomRef.current;
      if (!svgEl || !zoom) return;
      const rect = svgEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const coords = Array.from(posMapRef.current.values()).filter(
        (n) => visible.nodeMap.has(n.id) && n.x !== undefined && n.y !== undefined,
      );
      if (coords.length === 0) return;

      const ns = nodeScaleRef.current;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      coords.forEach((n) => {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const r = n.r * ns;
        minX = Math.min(minX, x - r - 36);
        maxX = Math.max(maxX, x + r + 36);
        minY = Math.min(minY, y - r - 36);
        maxY = Math.max(maxY, y + r + 36);
      });

      const bw = Math.max(120, maxX - minX);
      const bh = Math.max(120, maxY - minY);
      const k = Math.min(1.2, Math.max(0.24, 0.86 / Math.max(bw / rect.width, bh / rect.height)));
      const tx = rect.width / 2 - k * ((minX + maxX) / 2);
      const ty = rect.height / 2 - k * ((minY + maxY) / 2);
      const t = d3.zoomIdentity.translate(tx, ty).scale(k);
      const svg = d3.select(svgEl);
      if (animate) {
        svg.transition().duration(360).call(zoom.transform, t);
      } else {
        svg.call(zoom.transform, t);
      }
    },
    [visible.nodeMap],
  );

  const panToCoords = useCallback((x: number, y: number) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgEl || !zoom) return;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    autoFitRef.current = false;
    const curK = Math.max(0.85, d3.zoomTransform(svgEl).k);
    const t = d3.zoomIdentity.translate(rect.width / 2 - curK * x, rect.height / 2 - curK * y).scale(curK);
    d3.select(svgEl).transition().duration(320).call(zoom.transform, t);
  }, []);

  const focusNode = useCallback(
    (nodeId: string) => {
      setDrawerCreateMode('none');
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setDrawerTab('inspector');
      setInspectorOpen(true);
      const sn = posMapRef.current.get(nodeId);
      if (sn && sn.x !== undefined && sn.y !== undefined) {
        panToCoords(sn.x, sn.y);
      } else {
        pendingFocusIdRef.current = nodeId;
      }
    },
    [panToCoords],
  );

  const focusEdge = useCallback(
    (edgeId: string) => {
      const edge = visible.edgeMap.get(edgeId);
      setDrawerCreateMode('none');
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setDrawerTab('inspector');
      setInspectorOpen(true);
      if (!edge) return;
      const sn = posMapRef.current.get(edge.sourceId);
      const tn = posMapRef.current.get(edge.targetId);
      if (
        sn &&
        tn &&
        sn.x !== undefined &&
        sn.y !== undefined &&
        tn.x !== undefined &&
        tn.y !== undefined
      ) {
        panToCoords((sn.x + tn.x) / 2, (sn.y + tn.y) / 2);
      }
    },
    [visible.edgeMap, panToCoords],
  );

  const jumpToChunk = useCallback(
    (slideId: string) => {
      const chunkId = `chunk:${slideId}`;
      if (graphLayer === 'entity') {
        pendingFocusIdRef.current = chunkId;
        setHiddenLabels((prev) => {
          const next = new Set(prev);
          next.delete('Chunk');
          next.delete('Document');
          return next;
        });
        setGraphLayer('full');
      }
      focusNode(chunkId);
    },
    [graphLayer, focusNode],
  );

  useEffect(() => {
    if (relFocusEdgeRequest?.id) {
      focusEdge(relFocusEdgeRequest.id);
    }
  }, [relFocusEdgeRequest?.nonce, relFocusEdgeRequest?.id, focusEdge]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const obs = new ResizeObserver(() => {
      if (!autoFitRef.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitView(false));
    });
    obs.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [fitView]);

  const syncPinnedCount = useCallback(() => {
    let count = 0;
    posMapRef.current.forEach((sn) => {
      if (sn.pinned && visible.nodeMap.has(sn.id)) count += 1;
    });
    setPinnedCount(count);
  }, [visible.nodeMap]);

  // Initialize SVG layers, arrowhead markers, zoom behavior, and force simulation once
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const makeMarker = (id: string, fill: string) => {
      defs
        .append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('markerUnits', 'userSpaceOnUse')
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4Z')
        .attr('fill', fill);
    };

    (Object.keys(EDGE_PALETTE) as RelType[]).forEach((t) => {
      makeMarker(`n4j-ar-${t}`, EDGE_PALETTE[t].color);
    });
    makeMarker('n4j-ar-REJECT', '#DC2626');

    const rootG = svg.append('g').attr('class', 'n4j-root');
    const edgeG = rootG.append('g').attr('class', 'n4j-edges');
    const nodeG = rootG.append('g').attr('class', 'n4j-nodes');
    rootGRef.current = rootG;
    edgeGRef.current = edgeG;
    nodeGRef.current = nodeG;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3.5])
      .on('zoom', (ev) => {
        if (ev.sourceEvent) autoFitRef.current = false;
        rootG.attr('transform', ev.transform.toString());
        rootG.classed('n4j-lowzoom', ev.transform.k < 0.55);
      });
    zoomRef.current = zoom;
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', () => {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    });

    const rect = svgEl.getBoundingClientRect();
    svg.call(zoom.transform, d3.zoomIdentity.translate(rect.width / 2, rect.height / 2));

    const sim = d3
      .forceSimulation<SimNode, SimLink>()
      .alphaDecay(0.036)
      .velocityDecay(0.42)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>()
          .id((d) => d.id)
          .distance((l) => EDGE_PALETTE[l.data.type].dist)
          .strength((l) => EDGE_PALETTE[l.data.type].str),
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-340).distanceMax(560))
      .force(
        'collide',
        d3
          .forceCollide<SimNode>()
          .radius((d) => d.r + 22)
          .strength(0.95),
      )
      .force('x', d3.forceX<SimNode>(0).strength(0.06))
      .force('y', d3.forceY<SimNode>(0).strength(0.08));

    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, []);

  // Reconcile D3 DOM + simulation when graph structure or metadata changes
  useEffect(() => {
    const sim = simRef.current;
    const edgeG = edgeGRef.current;
    const nodeG = nodeGRef.current;
    const rootG = rootGRef.current;
    if (!sim || !edgeG || !nodeG || !rootG) return;

    rootG.classed('n4j-hide-elabels', !showEdgeLabels);

    const posMap = posMapRef.current;
    if (prevContextRef.current !== contextKey) {
      posMap.clear();
      prevContextRef.current = contextKey;
      prevStructKeyRef.current = '';
    }

    const total = Math.max(visible.nodes.length, 1);
    const simNodes: SimNode[] = visible.nodes.map((n, idx) => {
      const existing = posMap.get(n.id);
      if (existing) {
        existing.data = n;
        existing.r = n.r;
        return existing;
      }
      let x = 0;
      let y = 0;
      if (n.label !== 'Session') {
        const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
        const rad =
          n.label === 'Document'
            ? 280
            : n.label === 'Chunk'
              ? 220
              : n.label === 'LO'
                ? 210
                : 135 + (idx % 3) * 26;
        x = Math.cos(angle) * rad;
        y = Math.sin(angle) * rad;
      }
      const created: SimNode = { id: n.id, data: n, r: n.r, x, y };
      posMap.set(n.id, created);
      return created;
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = [];
    for (const e of visible.edges) {
      const s = nodeById.get(e.sourceId);
      const t = nodeById.get(e.targetId);
      if (!s || !t) continue;
      simLinks.push({ id: e.id, data: e, source: s, target: t });
    }
    parallelOffsets(simLinks);

    // ---- Edges join ----
    const eSel = edgeG.selectAll<SVGGElement, SimLink>('g.n4j-edge').data(simLinks, (d) => d.id);
    eSel.exit().remove();
    const eEnter = eSel.enter().append('g').attr('class', 'n4j-edge');
    eEnter.append('path').attr('class', 'n4j-halo');
    eEnter.append('path').attr('class', 'n4j-line');
    eEnter.append('path').attr('class', 'n4j-hit');
    eEnter.append('text').attr('class', 'n4j-elabel').attr('text-anchor', 'middle').attr('dy', -5);

    const eAll = eEnter.merge(eSel);
    eAll
      .classed('is-rejected', (d) => d.data.decision === 'REJECT')
      .classed('is-master-edge', (d) => d.data.edgeScope === 'master')
      .classed('is-other-edge', (d) => d.data.edgeScope === 'other')
      .classed('is-cross-chapter', (d) =>
        Boolean(
          d.data.relationRef &&
            d.data.relationRef.sourceChapterId &&
            d.data.relationRef.targetChapterId &&
            d.data.relationRef.sourceChapterId !== d.data.relationRef.targetChapterId,
        ),
      )
      .on('click', (ev, d) => {
        ev.stopPropagation();
        setSelectedEdgeId(d.id);
        setSelectedNodeId(null);
        setInspectorOpen(true);
      })
      .on('mouseenter', (_ev, d) => {
        setHoverTarget({
          kind: 'edge',
          cypher: cypherForEdge(d.data, d.source.data, d.target.data),
        });
      })
      .on('mouseleave', () => setHoverTarget(null));

    eAll
      .select<SVGPathElement>('.n4j-line')
      .attr('stroke', (d) => edgeStrokeColor(d.data))
      .attr('stroke-width', (d) => edgeStrokeWidth(d.data))
      .attr('stroke-dasharray', (d) => edgeStrokeDash(d.data))
      .attr('marker-end', (d) => {
        if (!EDGE_PALETTE[d.data.type].arrow) return null;
        return d.data.decision === 'REJECT' ? 'url(#n4j-ar-REJECT)' : `url(#n4j-ar-${d.data.type})`;
      });

    eAll
      .select<SVGPathElement>('.n4j-halo')
      .attr('stroke-width', (d) => edgeStrokeWidth(d.data) + 7)
      .style('display', (d) => (d.data.hasWarning ? null : 'none'));

    eAll
      .select<SVGTextElement>('.n4j-elabel')
      .attr('fill', (d) => edgeStrokeColor(d.data))
      .text((d) => d.data.labelText);

    // ---- Nodes join ----
    const nSel = nodeG.selectAll<SVGGElement, SimNode>('g.n4j-node').data(simNodes, (d) => d.id);
    nSel.exit().remove();

    const nEnter = nSel.enter().append('g').attr('class', 'n4j-node');
    nEnter.append('circle').attr('class', 'n4j-week-ring');
    nEnter.append('circle').attr('class', 'n4j-ring');
    nEnter.append('circle').attr('class', 'n4j-body-circle');
    nEnter.append('circle').attr('class', 'n4j-status-dot').attr('r', 5.5);
    nEnter.append('circle').attr('class', 'n4j-warn-dot').attr('r', 5.5);
    nEnter.append('circle').attr('class', 'n4j-pin-dot').attr('r', 4);
    nEnter.append('text').attr('class', 'n4j-label');

    const ns = nodeScaleRef.current;
    const nAll = nEnter.merge(nSel);
    nAll
      .classed('is-rejected', (d) => d.data.decision === 'REJECT')
      .classed('is-chunk', (d) => d.data.label === 'Chunk')
      .classed('is-active-week', (d) => d.data.nodeScope === 'active')
      .classed('is-master-node', (d) => d.data.nodeScope === 'master')
      .classed('is-other-week', (d) => d.data.nodeScope === 'other');

    nAll
      .select<SVGCircleElement>('.n4j-week-ring')
      .attr('r', (d) => d.r * ns + 5);

    nAll
      .select<SVGCircleElement>('.n4j-ring')
      .attr('r', (d) => d.r * ns + 6)
      .attr('stroke', (d) => NODE_PALETTE[d.data.label].stroke);

    nAll
      .select<SVGCircleElement>('.n4j-body-circle')
      .attr('r', (d) => d.r * ns)
      .attr('fill', (d) => NODE_PALETTE[d.data.label].fill)
      .attr('stroke', (d) =>
        d.data.decision === 'REJECT' ? '#DC2626' : NODE_PALETTE[d.data.label].stroke,
      )
      .attr('stroke-dasharray', (d) => (d.data.decision === 'REJECT' ? '4 3' : null));

    nAll
      .select<SVGCircleElement>('.n4j-status-dot')
      .attr('cx', (d) => d.r * ns * 0.72)
      .attr('cy', (d) => -d.r * ns * 0.72)
      .style('display', (d) =>
        d.data.decision === 'APPROVE' || d.data.decision === 'EDIT' ? null : 'none',
      );

    nAll
      .select<SVGCircleElement>('.n4j-warn-dot')
      .attr('cx', (d) => -d.r * ns * 0.72)
      .attr('cy', (d) => -d.r * ns * 0.72)
      .style('display', (d) => (d.data.hasWarning ? null : 'none'));

    nAll
      .select<SVGCircleElement>('.n4j-pin-dot')
      .attr('cx', (d) => d.r * ns * 0.72)
      .attr('cy', (d) => d.r * ns * 0.72)
      .style('display', (d) => (d.pinned ? null : 'none'));

    nAll.select<SVGTextElement>('.n4j-label').each(function (d) {
      const el = d3.select(this);
      el.selectAll('*').remove();
      el.attr('fill', NODE_PALETTE[d.data.label].text);
      const maxChars = d.data.label === 'Chunk' ? 8 : d.data.label === 'Session' ? 12 : 11;
      const lines = wrapLines(d.data.caption, maxChars, d.data.label === 'Chunk' ? 2 : 3);
      lines.forEach((line, i) => {
        el.append('tspan')
          .attr('x', 0)
          .attr('dy', i === 0 ? `${-(lines.length - 1) * 0.55 + 0.35}em` : '1.1em')
          .text(line);
      });
    });

    nAll
      .on('click', (ev, d) => {
        ev.stopPropagation();
        if (connectClickRef.current(d.id, d.data)) return;
        setSelectedNodeId(d.id);
        setSelectedEdgeId(null);
        setInspectorOpen(true);
      })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation();
        if (d.pinned) {
          d.fx = null;
          d.fy = null;
          d.pinned = false;
          sim.alpha(0.25).restart();
          nAll
            .select<SVGCircleElement>('.n4j-pin-dot')
            .style('display', (item) => (item.pinned ? null : 'none'));
          syncPinnedCount();
        }
      })
      .on('mouseenter', (_ev, d) => {
        setHoverTarget({ kind: 'node', cypher: cypherForNode(d.data) });
      })
      .on('mouseleave', () => setHoverTarget(null));

    let dragMoved = false;
    let startX = 0;
    let startY = 0;
    nAll.call(
      d3
        .drag<SVGGElement, SimNode>()
        .filter((ev) => !ev.ctrlKey && !ev.button)
        .on('start', (ev, d) => {
          dragMoved = false;
          startX = ev.x;
          startY = ev.y;
          if (d.pinned) {
            d.fx = d.x;
            d.fy = d.y;
          }
        })
        .on('drag', (ev, d) => {
          if (!dragMoved && Math.hypot(ev.x - startX, ev.y - startY) < 4) return;
          if (!dragMoved) {
            dragMoved = true;
            if (!ev.active) sim.alphaTarget(0.22).restart();
          }
          d.fx = ev.x;
          d.fy = ev.y;
        })
        .on('end', (ev, d) => {
          if (dragMoved) {
            if (!ev.active) sim.alphaTarget(0);
            d.pinned = true;
            nAll
              .select<SVGCircleElement>('.n4j-pin-dot')
              .style('display', (item) => (item.pinned ? null : 'none'));
            syncPinnedCount();
          }
        }),
    );

    const ticked = () => {
      if (autoFitRef.current && ++tickCountRef.current % 20 === 0) {
        fitView(false);
      }
      const curScale = nodeScaleRef.current;
      eAll.each(function (e) {
        const g = computeEdgeGeom(e, curScale);
        const el = d3.select(this);
        el.select('.n4j-line').attr('d', g.d);
        el.select('.n4j-hit').attr('d', g.d);
        el.select('.n4j-halo').attr('d', g.d);
        el.select('.n4j-elabel').attr('transform', `translate(${g.lx},${g.ly}) rotate(${g.ang})`);
      });
      nAll.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    sim.on('tick', ticked);
    sim.on('end', () => {
      if (pendingFocusIdRef.current) {
        const pid = pendingFocusIdRef.current;
        pendingFocusIdRef.current = null;
        const pNode = posMapRef.current.get(pid);
        if (pNode && pNode.x !== undefined && pNode.y !== undefined) {
          panToCoords(pNode.x, pNode.y);
          return;
        }
      }
      if (autoFitRef.current) fitView(true);
    });

    const structKey = `${graphLayer}::${graphScope}::${visible.nodes
      .map((n) => n.id)
      .sort()
      .join(',')}::${visible.edges
      .map((e) => e.id)
      .sort()
      .join(',')}::${relayoutCounter}`;

    sim.nodes(simNodes);
    (sim.force('link') as d3.ForceLink<SimNode, SimLink>).links(simLinks);

    if (structKey !== prevStructKeyRef.current) {
      prevStructKeyRef.current = structKey;
      sim.alpha(0.78).restart();
    }
    ticked();
  }, [
    visible,
    graphLayer,
    graphScope,
    contextKey,
    relayoutCounter,
    showEdgeLabels,
    fitView,
    panToCoords,
    syncPinnedCount,
  ]);

  // Dynamically apply visual & force layout adjustments (Force vs Hierarchical, linkScale, charge, nodeScale)
  useEffect(() => {
    const sim = simRef.current;
    const edgeG = edgeGRef.current;
    const nodeG = nodeGRef.current;
    if (!sim || !edgeG || !nodeG) return;

    const targetXMap =
      layoutMode === 'hierarchical'
        ? computeHierarchicalTargets(visible.nodes, visible.edges, props.mode)
        : null;

    (sim.force('link') as d3.ForceLink<SimNode, SimLink>)
      .distance((l) => EDGE_PALETTE[l.data.type].dist * linkScale);
    (sim.force('charge') as d3.ForceManyBody<SimNode>).strength(chargeStrength);
    (sim.force('collide') as d3.ForceCollide<SimNode>).radius((d) => d.r * nodeScale + 22);
    sim.force(
      'x',
      targetXMap
        ? d3.forceX<SimNode>((d) => targetXMap.get(d.id) ?? 0).strength(0.38)
        : d3.forceX<SimNode>(0).strength(0.06),
    );

    const nAll = nodeG.selectAll<SVGGElement, SimNode>('g.n4j-node');
    nAll.select<SVGCircleElement>('.n4j-week-ring').attr('r', (d) => d.r * nodeScale + 5);
    nAll.select<SVGCircleElement>('.n4j-ring').attr('r', (d) => d.r * nodeScale + 6);
    nAll.select<SVGCircleElement>('.n4j-body-circle').attr('r', (d) => d.r * nodeScale);
    nAll
      .select<SVGCircleElement>('.n4j-status-dot')
      .attr('cx', (d) => d.r * nodeScale * 0.72)
      .attr('cy', (d) => -d.r * nodeScale * 0.72);
    nAll
      .select<SVGCircleElement>('.n4j-warn-dot')
      .attr('cx', (d) => -d.r * nodeScale * 0.72)
      .attr('cy', (d) => -d.r * nodeScale * 0.72);
    nAll
      .select<SVGCircleElement>('.n4j-pin-dot')
      .attr('cx', (d) => d.r * nodeScale * 0.72)
      .attr('cy', (d) => d.r * nodeScale * 0.72);
    nAll
      .select<SVGTextElement>('.n4j-label')
      .style('font-size', `${Math.round(10 * Math.max(0.85, Math.min(1.2, nodeScale)) * 10) / 10}px`);

    edgeG.selectAll<SVGGElement, SimLink>('g.n4j-edge').each(function (e) {
      const g = computeEdgeGeom(e, nodeScale);
      const el = d3.select(this);
      el.select('.n4j-line').attr('d', g.d);
      el.select('.n4j-hit').attr('d', g.d);
      el.select('.n4j-halo').attr('d', g.d);
      el.select('.n4j-elabel').attr('transform', `translate(${g.lx},${g.ly}) rotate(${g.ang})`);
    });

    sim.alpha(0.42).restart();
  }, [layoutMode, linkScale, chargeStrength, nodeScale, visible, props.mode]);

  // Apply selection, connect source, quality, or search dimming
  useEffect(() => {
    const edgeG = edgeGRef.current;
    const nodeG = nodeGRef.current;
    if (!edgeG || !nodeG) return;

    let hlNodes: Set<string> | null = null;
    let hlEdges: Set<string> | null = null;

    if (selectedNodeId) {
      hlNodes = new Set([selectedNodeId]);
      hlEdges = new Set();
      visible.edges.forEach((e) => {
        if (e.sourceId === selectedNodeId || e.targetId === selectedNodeId) {
          hlEdges!.add(e.id);
          hlNodes!.add(e.sourceId);
          hlNodes!.add(e.targetId);
        }
      });
    } else if (selectedEdgeId) {
      const e = visible.edgeMap.get(selectedEdgeId);
      if (e) {
        hlNodes = new Set([e.sourceId, e.targetId]);
        hlEdges = new Set([e.id]);
      }
    } else if (highlightMatches) {
      hlNodes = highlightMatches.nodeIds;
      hlEdges = highlightMatches.edgeIds;
    }

    nodeG
      .selectAll<SVGGElement, SimNode>('g.n4j-node')
      .classed('n4j-sel', (d) => d.id === selectedNodeId)
      .classed('n4j-connect-src', (d) => connectMode && d.id === connectSourceId)
      .classed('n4j-dim', (d) => (hlNodes ? !hlNodes.has(d.id) : false));

    edgeG
      .selectAll<SVGGElement, SimLink>('g.n4j-edge')
      .classed('n4j-edge-sel', (d) => d.id === selectedEdgeId)
      .classed('n4j-dim', (d) => (hlEdges ? !hlEdges.has(d.id) : false));
  }, [visible, selectedNodeId, selectedEdgeId, highlightMatches, connectMode, connectSourceId]);

  const selectedNode = selectedNodeId ? visible.nodeMap.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? visible.edgeMap.get(selectedEdgeId) ?? null : null;

  const selectedEdgeSrc = selectedEdge ? visible.nodeMap.get(selectedEdge.sourceId) ?? null : null;
  const selectedEdgeTgt = selectedEdge ? visible.nodeMap.get(selectedEdge.targetId) ?? null : null;

  const incidentEdges = useMemo(() => {
    if (!selectedNode) return { outgoing: [] as DraftEdge[], incoming: [] as DraftEdge[] };
    const outgoing: DraftEdge[] = [];
    const incoming: DraftEdge[] = [];
    visible.edges.forEach((e) => {
      if (e.sourceId === selectedNode.id) outgoing.push(e);
      if (e.targetId === selectedNode.id) incoming.push(e);
    });
    return { outgoing, incoming };
  }, [selectedNode, visible.edges]);

  const cypherBarText = useMemo(() => {
    if (hoverTarget) return hoverTarget.cypher;
    if (selectedNode) return cypherForNode(selectedNode);
    if (selectedEdge) {
      return cypherForEdge(
        selectedEdge,
        selectedEdgeSrc ?? undefined,
        selectedEdgeTgt ?? undefined,
      );
    }
    const layerName =
      graphLayer === 'full'
        ? 'Full Graph (Lexical + Entity)'
        : graphLayer === 'lexical'
          ? 'Lexical Graph (Document → Chunk)'
          : 'Entity Graph';
    return `${layerName} · ${visible.nodes.length} nút · ${visible.edges.length} quan hệ — Bấm nút/cạnh để chỉnh sửa & điều chỉnh vị trí`;
  }, [
    hoverTarget,
    selectedNode,
    selectedEdge,
    selectedEdgeSrc,
    selectedEdgeTgt,
    graphLayer,
    visible.nodes.length,
    visible.edges.length,
  ]);

  const overviewStats = useMemo(() => {
    if (props.mode === 'lessons') {
      const items = props.lessons;
      const warn = (l: ChapterLessonItem) =>
        Boolean(l.hasWarning || (l.assessment && l.assessment.verdict !== 'supported'));
      return {
        total: items.length,
        approved: items.filter((l) => l.decision === 'APPROVE' || l.decision === 'EDIT').length,
        pending: items.filter((l) => l.decision === 'PENDING').length,
        warn: items.filter(warn).length,
        rejected: items.filter((l) => l.decision === 'REJECT').length,
        attentionItems: items
          .filter((l) => warn(l) || l.decision === 'PENDING')
          .slice(0, 14)
          .map((l) => ({
            id: l.id,
            kind: 'node' as const,
            title: l.title,
            subtitle: warn(l) ? 'AI cần chú ý' : 'Chờ duyệt',
            warn: warn(l),
          })),
      };
    }
    const items = props.relations;
    const warn = (r: CourseRelationItem) =>
      Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported'));
    return {
      total: items.length,
      approved: items.filter((r) => r.decision === 'APPROVE' || r.decision === 'EDIT').length,
      pending: items.filter((r) => r.decision === 'PENDING').length,
      warn: items.filter(warn).length,
      rejected: items.filter((r) => r.decision === 'REJECT').length,
      attentionItems: items
        .filter((r) => warn(r) || r.decision === 'PENDING')
        .slice(0, 14)
        .map((r) => ({
          id: r.id,
          kind: 'edge' as const,
          title: `${r.sourceName} → ${r.targetName}`,
          subtitle: r.relationType,
          warn: warn(r),
        })),
    };
  }, [props]);

  const handleZoomBy = (factor: number) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgEl || !zoom) return;
    autoFitRef.current = false;
    d3.select(svgEl).transition().duration(200).call(zoom.scaleBy, factor);
  };

  const handleTogglePinNode = (nodeId: string) => {
    const sn = posMapRef.current.get(nodeId);
    const nodeG = nodeGRef.current;
    const sim = simRef.current;
    if (!sn) return;
    if (sn.pinned) {
      sn.fx = null;
      sn.fy = null;
      sn.pinned = false;
      sim?.alpha(0.22).restart();
    } else {
      sn.fx = sn.x ?? 0;
      sn.fy = sn.y ?? 0;
      sn.pinned = true;
    }
    nodeG
      ?.selectAll<SVGGElement, SimNode>('g.n4j-node')
      .select<SVGCircleElement>('.n4j-pin-dot')
      .style('display', (item) => (item.pinned ? null : 'none'));
    syncPinnedCount();
  };

  const handleUnpinAll = () => {
    posMapRef.current.forEach((sn) => {
      sn.fx = null;
      sn.fy = null;
      sn.pinned = false;
    });
    nodeGRef.current
      ?.selectAll<SVGGElement, SimNode>('g.n4j-node')
      .select<SVGCircleElement>('.n4j-pin-dot')
      .style('display', 'none');
    setPinnedCount(0);
    simRef.current?.alpha(0.38).restart();
  };

  const handleRelayout = () => {
    posMapRef.current.forEach((sn) => {
      sn.fx = null;
      sn.fy = null;
      sn.pinned = false;
    });
    setPinnedCount(0);
    autoFitRef.current = true;
    setRelayoutCounter((c) => c + 1);
  };

  const toggleLabel = (lbl: NodeLabel) => {
    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(lbl)) next.delete(lbl);
      else next.add(lbl);
      return next;
    });
  };

  const toggleEdgeType = (rt: RelType) => {
    setHiddenEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) next.delete(rt);
      else next.add(rt);
      return next;
    });
  };

  const openCreateLessonForm = () => {
    setNewTitle('');
    setNewContent('');
    setNewLevel('lesson');
    setNewOutcome('');
    setNewDuration('');
    setNewLoCodes([]);
    setNewAliases('');
    setNewSlideId(chunkOptions[0]?.slideId ?? '');
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDrawerCreateMode('lesson');
    setDrawerTab('inspector');
    setInspectorOpen(true);
  };

  const openCreateRelationForm = (preSrc?: string, preTgt?: string) => {
    const first =
      preSrc ??
      endpointOptions.find((e) => e.inDraft)?.id ??
      endpointOptions[0]?.id ??
      '';
    const second =
      preTgt ?? endpointOptions.find((e) => e.id !== first)?.id ?? '';
    setNewRelSourceId(first);
    setNewRelTargetId(second);
    setNewRelType('PREREQUISITE');
    setNewRelStrength('hard');
    setNewRelReason('');
    setNewRelRequired('');
    setConnectMode(false);
    setConnectSourceId(null);
    setConnectHint(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDrawerCreateMode('relation');
    setDrawerTab('inspector');
    setInspectorOpen(true);
  };

  const getNextReviewTargetId = useCallback(
    (currentId: string): string | null => {
      if (props.mode === 'lessons') {
        const candidates = props.lessons.filter(
          (l) => l.id !== currentId && (l.decision === 'PENDING' || l.hasWarning),
        );
        if (candidates.length === 0) return null;
        const curIdx = props.lessons.findIndex((l) => l.id === currentId);
        const after = props.lessons.slice(curIdx + 1).find((l) => l.id !== currentId && (l.decision === 'PENDING' || l.hasWarning));
        return (after ?? candidates[0]).id;
      }
      const candidates = props.relations.filter(
        (r) => r.id !== currentId && (r.decision === 'PENDING' || r.hasWarning),
      );
      if (candidates.length === 0) return null;
      const curIdx = props.relations.findIndex((r) => r.id === currentId);
      const after = props.relations.slice(curIdx + 1).find((r) => r.id !== currentId && (r.decision === 'PENDING' || r.hasWarning));
      return (after ?? candidates[0]).id;
    },
    [props],
  );

  const renderIncidentLinks = () => {
    const renderGroup = (title: string, list: DraftEdge[], dir: 'out' | 'in') => {
      if (list.length === 0) return null;
      return (
        <div className="n4j-section">
          <div className="n4j-section-title">
            {title} ({list.length})
          </div>
          <div className="n4j-rel-list">
            {list.map((e) => {
              const peerId = dir === 'out' ? e.targetId : e.sourceId;
              const peer = visible.nodeMap.get(peerId);
              const color = edgeStrokeColor(e);
              return (
                <div key={e.id} className="n4j-rel-row">
                  <button
                    type="button"
                    className="n4j-rel-main"
                    onClick={() => (e.relationRef ? focusEdge(e.id) : focusNode(peerId))}
                  >
                    <span className="n4j-rel-dir">{dir === 'out' ? '→' : '←'}</span>
                    <span className="n4j-rel-type" style={{ color }}>
                      [:{e.type}]
                    </span>
                    <span className="n4j-rel-peer">{peer?.name ?? peerId}</span>
                  </button>
                  {props.mode === 'relations' && e.relationRef && (
                    <div className="n4j-rel-mini">
                      <button
                        type="button"
                        className={
                          e.decision === 'APPROVE' || e.decision === 'EDIT' ? 'on approve' : ''
                        }
                        title="Duyệt quan hệ này"
                        disabled={props.busy || props.locked}
                        onClick={() => void props.onRelationDecision(e.id, 'APPROVE')}
                      >
                        <Check size={11} />
                      </button>
                      <button
                        type="button"
                        className={e.decision === 'REJECT' ? 'on reject' : ''}
                        title="Từ chối quan hệ này"
                        disabled={props.busy || props.locked}
                        onClick={() => void props.onRelationDecision(e.id, 'REJECT')}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <>
        {renderGroup('Quan hệ đi ra', incidentEdges.outgoing, 'out')}
        {renderGroup('Quan hệ đi vào', incidentEdges.incoming, 'in')}
      </>
    );
  };

  const renderCreateLessonForm = () => {
    if (props.mode !== 'lessons' || !props.onCreateLesson) return null;
    const toggleNewLo = (code: string) =>
      setNewLoCodes((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
      );

    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{
                background: NODE_PALETTE[newLevel === 'topic' ? 'Topic' : 'Concept'].fill,
                borderColor: NODE_PALETTE[newLevel === 'topic' ? 'Topic' : 'Concept'].stroke,
                color: '#0F172A',
              }}
            >
              + Thêm nút mới
            </span>
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Hủy"
            onClick={() => {
              setDrawerCreateMode('none');
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="n4j-form-grid">
          <label className="n4j-field">
            <span>Tên nút kiến thức *</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="VD: B+ Tree Indexing"
            />
          </label>

          <div className="n4j-field-row">
            <label className="n4j-field">
              <span>Cấp nút (Label)</span>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value as 'lesson' | 'topic')}
              >
                <option value="lesson">:Concept (Bài học)</option>
                <option value="topic">:Topic (Chủ đề)</option>
              </select>
            </label>
            <label className="n4j-field">
              <span>Thời lượng (phút)</span>
              <input
                type="number"
                min={1}
                max={120}
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                placeholder="15"
              />
            </label>
          </div>

          <label className="n4j-field">
            <span>Tóm tắt nội dung *</span>
            <textarea
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Mô tả khái niệm, nguyên lý hoặc bài học..."
            />
          </label>

          <label className="n4j-field">
            <span>Mục tiêu đạt được (Outcome)</span>
            <input
              value={newOutcome}
              onChange={(e) => setNewOutcome(e.target.value)}
              placeholder="Sinh viên hiểu và áp dụng được..."
            />
          </label>

          {props.learningOutcomes.length > 0 && (
            <div className="n4j-field">
              <span>Chuẩn đầu ra (LO)</span>
              <div className="n4j-lo-checks">
                {props.learningOutcomes.map((lo) => (
                  <label key={lo.code} className="n4j-lo-check" title={lo.description}>
                    <input
                      type="checkbox"
                      checked={newLoCodes.includes(lo.code)}
                      onChange={() => toggleNewLo(lo.code)}
                    />
                    <span>{lo.code}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="n4j-field">
            <span>Tên gọi khác (cách nhau dấu phẩy)</span>
            <input
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
              placeholder="B-Plus Tree, Chỉ mục B+"
            />
          </label>

          {chunkOptions.length > 0 && (
            <label className="n4j-field">
              <span>Gắn trang nguồn (:Chunk)</span>
              <select value={newSlideId} onChange={(e) => setNewSlideId(e.target.value)}>
                {chunkOptions.map((c) => (
                  <option key={c.slideId} value={c.slideId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={props.busy || !newTitle.trim()}
              onClick={async () => {
                await props.onCreateLesson?.({
                  title: newTitle.trim(),
                  content: newContent.trim() || newTitle.trim(),
                  level: newLevel,
                  loCodes: newLoCodes,
                  outcome: newOutcome.trim() || undefined,
                  durationMin: newDuration ? Number(newDuration) : undefined,
                  aliases: newAliases
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  slideId: newSlideId || undefined,
                });
                setDrawerCreateMode('none');
              }}
            >
              <Check size={12} /> Tạo &amp; Duyệt nút
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setDrawerCreateMode('none');
                setDrawerTab('overview');
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderCreateRelationForm = () => {
    if (props.mode !== 'relations' || !props.onCreateRelation) return null;
    const sameEndpoint = Boolean(newRelSourceId && newRelSourceId === newRelTargetId);

    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{ background: '#ecfdf5', borderColor: '#018b43', color: '#018b43' }}
            >
              + Tạo quan hệ mới
            </span>
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Hủy"
            onClick={() => {
              setDrawerCreateMode('none');
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="n4j-form-grid">
          <label className="n4j-field">
            <span>Nút nguồn (Source) *</span>
            <select
              value={newRelSourceId}
              onChange={(e) => setNewRelSourceId(e.target.value)}
            >
              <option value="">-- Chọn nút nguồn --</option>
              {endpointOptions.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} {ep.inDraft ? '(Buổi học)' : '(Master)'}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="n4j-act-btn"
              onClick={() => {
                setNewRelSourceId(newRelTargetId);
                setNewRelTargetId(newRelSourceId);
              }}
            >
              <ArrowLeftRight size={12} /> Đảo nguồn ↔ đích
            </button>
          </div>

          <label className="n4j-field">
            <span>Nút đích (Target) *</span>
            <select
              value={newRelTargetId}
              onChange={(e) => setNewRelTargetId(e.target.value)}
            >
              <option value="">-- Chọn nút đích --</option>
              {endpointOptions.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} {ep.inDraft ? '(Buổi học)' : '(Master)'}
                </option>
              ))}
            </select>
          </label>

          {sameEndpoint && (
            <div className="n4j-warn-box">Nút nguồn và nút đích phải khác nhau.</div>
          )}

          <label className="n4j-field">
            <span>Loại quan hệ</span>
            <select
              value={newRelType}
              onChange={(e) =>
                setNewRelType(e.target.value as 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO')
              }
            >
              <option value="PREREQUISITE">PREREQUISITE (Tiên quyết)</option>
              <option value="PART_OF">PART_OF (Thuộc về)</option>
              <option value="RELATED_TO">RELATED_TO (Liên quan)</option>
            </select>
          </label>

          {newRelType === 'PREREQUISITE' && (
            <>
              <label className="n4j-field">
                <span>Mức độ tiên quyết</span>
                <select
                  value={newRelStrength}
                  onChange={(e) => setNewRelStrength(e.target.value as 'hard' | 'soft')}
                >
                  <option value="hard">Bắt buộc (hard)</option>
                  <option value="soft">Khuyến nghị (soft)</option>
                </select>
              </label>
              <label className="n4j-field">
                <span>Kiến thức cần nắm trước</span>
                <input
                  value={newRelRequired}
                  onChange={(e) => setNewRelRequired(e.target.value)}
                  placeholder="VD: Nắm cấu trúc node và con trỏ trước khi học B+ Tree"
                />
              </label>
            </>
          )}

          <label className="n4j-field">
            <span>Lý do / Giải thích quan hệ *</span>
            <textarea
              rows={2}
              value={newRelReason}
              onChange={(e) => setNewRelReason(e.target.value)}
              placeholder="Lý do sư phạm của liên kết này..."
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={props.busy || !newRelSourceId || !newRelTargetId || sameEndpoint}
              onClick={async () => {
                await props.onCreateRelation?.({
                  sourceId: newRelSourceId,
                  targetId: newRelTargetId,
                  relationType: newRelType,
                  strength: newRelType === 'PREREQUISITE' ? newRelStrength : null,
                  reason: newRelReason.trim() || 'Giảng viên bổ sung quan hệ thủ công',
                  requiredKnowledge:
                    newRelType === 'PREREQUISITE'
                      ? newRelRequired.trim() || newRelReason.trim() || 'Kiến thức nền tảng'
                      : '',
                });
                setDrawerCreateMode('none');
              }}
            >
              <Check size={12} /> Tạo &amp; Duyệt quan hệ
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setDrawerCreateMode('none');
                setDrawerTab('overview');
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderLessonInspector = (lesson: ChapterLessonItem, node: DraftNode) => {
    const palette = NODE_PALETTE[node.label];
    const dec = DECISION_META[lesson.decision];
    const verdict = lesson.assessment ? VERDICT_META[lesson.assessment.verdict] : null;
    const warningText = lesson.assessment?.issue || lesson.aiComment || '';
    const isEditing = editingLessonId === lesson.id;
    const simPinned = Boolean(posMapRef.current.get(node.id)?.pinned);

    const toggleEditLo = (code: string) =>
      setEditLoCodes((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
      );

    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
            >
              :{node.label}
            </span>
            <span className={`n4j-status-pill ${dec.tone}`}>{dec.text}</span>
            {verdict && <span className={`n4j-status-pill ${verdict.tone}`}>{verdict.text}</span>}
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Về Tổng quan"
            onClick={() => {
              setSelectedNodeId(null);
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <h4 className="n4j-insp-title">{lesson.title}</h4>

        {props.mode === 'lessons' && (() => {
          const nextLessonId = getNextReviewTargetId(lesson.id);
          return (
          <div className="n4j-insp-actions">
            <button
              type="button"
              className={`n4j-act-btn approve${lesson.decision === 'APPROVE' || lesson.decision === 'EDIT' ? ' on' : ''}`}
              disabled={props.busy || props.locked}
              onClick={() => void props.onLessonDecision(lesson.id, 'APPROVE')}
            >
              <Check size={13} />{' '}
              {lesson.decision === 'APPROVE' || lesson.decision === 'EDIT' ? 'Đã duyệt' : 'Duyệt'}
            </button>
            {nextLessonId && (
              <button
                type="button"
                className="n4j-act-btn approve"
                disabled={props.busy || props.locked}
                title="Duyệt nút này và chuyển ngay sang nút chờ duyệt tiếp theo"
                onClick={async () => {
                  await props.onLessonDecision(lesson.id, 'APPROVE');
                  focusNode(nextLessonId);
                }}
              >
                <Check size={13} /> Duyệt &amp; Tiếp →
              </button>
            )}
            <button
              type="button"
              className={`n4j-act-btn${isEditing ? ' active' : ''}`}
              disabled={props.busy || props.locked}
              onClick={() => {
                if (isEditing) {
                  setEditingLessonId(null);
                } else {
                  setEditingLessonId(lesson.id);
                  setEditTitle(lesson.title);
                  setEditContent(lesson.content);
                  setEditLevel(lesson.level === 'topic' ? 'topic' : 'lesson');
                  setEditOutcome(lesson.outcome ?? '');
                  setEditDuration(lesson.durationMin != null ? String(lesson.durationMin) : '');
                  setEditLoCodes(lesson.loCodes ?? []);
                  setEditAliases((lesson.aliases ?? []).join(', '));
                  setEditReviewNote(lesson.reviewNote ?? '');
                }
              }}
            >
              <Pencil size={13} /> Sửa
            </button>
            <button
              type="button"
              className={`n4j-act-btn reject${lesson.decision === 'REJECT' ? ' on' : ''}`}
              disabled={props.busy || props.locked}
              onClick={() => void props.onLessonDecision(lesson.id, 'REJECT')}
            >
              <X size={13} /> Từ chối
            </button>
            <button
              type="button"
              className="n4j-act-btn icon"
              title={simPinned ? 'Bỏ ghim vị trí nút' : 'Ghim cố định vị trí nút'}
              onClick={() => handleTogglePinNode(node.id)}
            >
              {simPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            {props.onDeleteLesson && (
              <button
                type="button"
                className="n4j-act-btn reject icon"
                disabled={props.busy || props.locked}
                title="Xóa / loại bỏ nút khỏi buổi học"
                onClick={async () => {
                  if (!window.confirm(`Xác nhận xóa hoặc loại bỏ nút "${lesson.title}"?`)) return;
                  await props.onDeleteLesson?.(lesson.id);
                  setSelectedNodeId(null);
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          );
        })()}

        {isEditing && props.mode === 'lessons' && (
          <div className="n4j-edit-box">
            <label className="n4j-field">
              <span>Tên nút</span>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </label>
            <div className="n4j-field-row">
              <label className="n4j-field">
                <span>Cấp nút</span>
                <select
                  value={editLevel}
                  onChange={(e) => setEditLevel(e.target.value as 'lesson' | 'topic')}
                >
                  <option value="lesson">:Concept (Bài học)</option>
                  <option value="topic">:Topic (Chủ đề)</option>
                </select>
              </label>
              <label className="n4j-field">
                <span>Thời lượng (phút)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                />
              </label>
            </div>
            <label className="n4j-field">
              <span>Tóm tắt nội dung</span>
              <textarea
                rows={3}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </label>
            <label className="n4j-field">
              <span>Mục tiêu (Outcome)</span>
              <input value={editOutcome} onChange={(e) => setEditOutcome(e.target.value)} />
            </label>
            {props.learningOutcomes.length > 0 && (
              <div className="n4j-field">
                <span>Chuẩn đầu ra (LO)</span>
                <div className="n4j-lo-checks">
                  {props.learningOutcomes.map((lo) => (
                    <label key={lo.code} className="n4j-lo-check" title={lo.description}>
                      <input
                        type="checkbox"
                        checked={editLoCodes.includes(lo.code)}
                        onChange={() => toggleEditLo(lo.code)}
                      />
                      <span>{lo.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="n4j-field">
              <span>Tên khác (dấu phẩy)</span>
              <input value={editAliases} onChange={(e) => setEditAliases(e.target.value)} />
            </label>
            <label className="n4j-field">
              <span>Ghi chú giảng viên</span>
              <input
                value={editReviewNote}
                onChange={(e) => setEditReviewNote(e.target.value)}
                placeholder="Ghi chú xác nhận nếu AI cảnh báo"
              />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={props.busy || !editTitle.trim()}
                onClick={async () => {
                  await props.onLessonDecision(
                    lesson.id,
                    'EDIT',
                    {
                      title: editTitle.trim(),
                      content: editContent.trim() || editTitle.trim(),
                      level: editLevel,
                      outcome: editOutcome.trim(),
                      durationMin: editDuration ? Number(editDuration) : undefined,
                      loCodes: editLoCodes,
                      aliases: editAliases
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                    editReviewNote.trim() || undefined,
                  );
                  setEditingLessonId(null);
                }}
              >
                Lưu &amp; Duyệt
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setEditingLessonId(null)}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {warningText && (
          <div className="n4j-warn-box">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{warningText}</span>
          </div>
        )}

        <table className="n4j-props">
          <tbody>
            <tr>
              <td>&lt;id&gt;</td>
              <td>{shortId(lesson.id)}</td>
            </tr>
            <tr>
              <td>level</td>
              <td>{lesson.level === 'topic' ? 'Topic (Chủ đề)' : 'Concept (Bài học)'}</td>
            </tr>
            <tr>
              <td>summary</td>
              <td>{lesson.content}</td>
            </tr>
            {lesson.outcome && (
              <tr>
                <td>outcome</td>
                <td>{lesson.outcome}</td>
              </tr>
            )}
            {lesson.durationMin != null && (
              <tr>
                <td>duration</td>
                <td>{lesson.durationMin} phút</td>
              </tr>
            )}
            {lesson.confidence != null && (
              <tr>
                <td>confidence</td>
                <td>{Math.round(lesson.confidence * 100)}%</td>
              </tr>
            )}
            {lesson.loCodes.length > 0 && (
              <tr>
                <td>lo_codes</td>
                <td>{lesson.loCodes.join(', ')}</td>
              </tr>
            )}
            {lesson.aliases && lesson.aliases.length > 0 && (
              <tr>
                <td>aliases</td>
                <td>{lesson.aliases.join(', ')}</td>
              </tr>
            )}
            {lesson.assessment?.suggestedReuseId && (
              <tr>
                <td>suggested_reuse</td>
                <td>
                  <code>{shortId(lesson.assessment.suggestedReuseId)}</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {lesson.details && lesson.details.length > 0 && (
          <div className="n4j-section">
            <div className="n4j-section-title">Ý chính ({lesson.details.length})</div>
            <div className="n4j-detail-tags">
              {lesson.details.map((d, i) => (
                <span key={i} className="n4j-detail-tag">
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {(lesson.evidence?.length || lesson.sourceRef) && (
          <div className="n4j-section">
            <div className="n4j-section-title">
              Truy xuất nguồn · Source Provenance ({lesson.evidence?.length || 1})
            </div>
            <div className="n4j-evidence-list">
              {lesson.evidence && lesson.evidence.length > 0 ? (
                lesson.evidence.map((ev, i) => (
                  <div key={i} className="n4j-provenance-card">
                    <button
                      type="button"
                      className="n4j-chunk-jump"
                      title={`Xem nút Chunk ${ev.slideId}`}
                      onClick={() => jumpToChunk(ev.slideId)}
                    >
                      <FileText size={11} />
                      <span>{formatSlidePage(ev.slideId)}</span>
                    </button>
                    <p>"{ev.quote}"</p>
                  </div>
                ))
              ) : (
                <div className="n4j-provenance-card">
                  <button
                    type="button"
                    className="n4j-chunk-jump"
                    onClick={() => jumpToChunk(lesson.sourceRef)}
                  >
                    <FileText size={11} />
                    <span>{formatSlidePage(lesson.sourceRef)}</span>
                  </button>
                  <p>Trang nguồn chính của bài học</p>
                </div>
              )}
            </div>
          </div>
        )}

        {renderIncidentLinks()}
      </>
    );
  };

  const renderChunkInspector = (node: DraftNode) => {
    const palette = NODE_PALETTE.Chunk;
    const meta = node.chunkMeta;
    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
            >
              :Chunk
            </span>
            <span className="n4j-status-pill muted">{node.caption}</span>
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Về Tổng quan"
            onClick={() => {
              setSelectedNodeId(null);
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <h4 className="n4j-insp-title">{node.name}</h4>

        <table className="n4j-props">
          <tbody>
            {meta?.pageNumber != null && (
              <tr>
                <td>page_no</td>
                <td>Trang {meta.pageNumber}</td>
              </tr>
            )}
            {node.chapterTitle && (
              <tr>
                <td>document</td>
                <td>{node.chapterTitle}</td>
              </tr>
            )}
            <tr>
              <td>slide_id</td>
              <td>
                <code>{shortId(meta?.slideId)}</code>
              </td>
            </tr>
          </tbody>
        </table>

        {meta && meta.quotes.length > 0 && (
          <div className="n4j-section">
            <div className="n4j-section-title">
              Thực thể &amp; đoạn trích từ trang này ({meta.quotes.length})
            </div>
            <div className="n4j-evidence-list">
              {meta.quotes.map((q, idx) => (
                <div key={idx} className="n4j-provenance-card">
                  <button
                    type="button"
                    className="n4j-chunk-jump entity"
                    onClick={() => (q.isEdge ? focusEdge(q.entityId) : focusNode(q.entityId))}
                  >
                    <span>{q.entityName}</span>
                    <ChevronRight size={11} />
                  </button>
                  <p>"{q.quote}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {renderIncidentLinks()}
      </>
    );
  };

  const renderEdgeInspector = (edge: DraftEdge) => {
    const rel = edge.relationRef;
    const palette = EDGE_PALETTE[edge.type];
    const dec = edge.decision ? DECISION_META[edge.decision] : null;
    const verdict = rel?.assessment ? VERDICT_META[rel.assessment.verdict] : null;
    const warningText = rel?.assessment?.issue || rel?.aiComment || '';
    const isEditing = editingEdgeId === edge.id;
    const isCrossChapter = Boolean(
      rel && rel.sourceChapterId && rel.targetChapterId && rel.sourceChapterId !== rel.targetChapterId,
    );
    const nextRelId = rel ? getNextReviewTargetId(rel.id) : null;

    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{
                background: '#fff',
                borderColor: palette.color,
                color: palette.color,
              }}
            >
              [:{edge.type}]
            </span>
            {edge.edgeScope === 'master' ? (
              <span className="n4j-scope-pill is-master">Đã trong Bản tạm</span>
            ) : isCrossChapter ? (
              <span className="n4j-scope-pill is-active">Liên chương</span>
            ) : rel ? (
              <span className="n4j-scope-pill">Nội chương</span>
            ) : null}
            {rel?.strength && (
              <span className="n4j-status-pill muted">{rel.strength === 'hard' ? 'Bắt buộc (hard)' : 'Khuyến nghị (soft)'}</span>
            )}
            {dec && <span className={`n4j-status-pill ${dec.tone}`}>{dec.text}</span>}
            {verdict && <span className={`n4j-status-pill ${verdict.tone}`}>{verdict.text}</span>}
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Về Tổng quan"
            onClick={() => {
              setSelectedEdgeId(null);
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="n4j-triple-box">
          <button
            type="button"
            className="n4j-triple-node"
            onClick={() => focusNode(edge.sourceId)}
          >
            {selectedEdgeSrc && (
              <i
                className="n4j-dot"
                style={{ background: NODE_PALETTE[selectedEdgeSrc.label].fill }}
              />
            )}
            <span>{rel?.sourceName ?? selectedEdgeSrc?.name ?? edge.sourceId}</span>
          </button>
          <div className="n4j-triple-arrow" style={{ color: palette.color }}>
            ──[:{edge.labelText}]──▶
          </div>
          <button
            type="button"
            className="n4j-triple-node"
            onClick={() => focusNode(edge.targetId)}
          >
            {selectedEdgeTgt && (
              <i
                className="n4j-dot"
                style={{ background: NODE_PALETTE[selectedEdgeTgt.label].fill }}
              />
            )}
            <span>{rel?.targetName ?? selectedEdgeTgt?.name ?? edge.targetId}</span>
          </button>
        </div>

        {rel && props.mode === 'relations' && (
          <div className="n4j-insp-actions">
            <button
              type="button"
              className={`n4j-act-btn approve${rel.decision === 'APPROVE' || rel.decision === 'EDIT' ? ' on' : ''}`}
              disabled={props.busy || props.locked || relActiveWeekLocked}
              onClick={() => void props.onRelationDecision(rel.id, 'APPROVE')}
            >
              <Check size={13} />{' '}
              {rel.decision === 'APPROVE' || rel.decision === 'EDIT' ? 'Đã duyệt' : 'Duyệt'}
            </button>
            {nextRelId && !relActiveWeekLocked && (
              <button
                type="button"
                className="n4j-act-btn approve"
                disabled={props.busy || props.locked}
                title="Duyệt quan hệ này và chuyển ngay sang quan hệ chờ duyệt tiếp theo"
                onClick={async () => {
                  await props.onRelationDecision(rel.id, 'APPROVE');
                  focusEdge(nextRelId);
                }}
              >
                <Check size={13} /> Duyệt &amp; Tiếp →
              </button>
            )}
            {props.onUpdateRelation && (
              <button
                type="button"
                className={`n4j-act-btn${isEditing ? ' active' : ''}`}
                disabled={props.busy || props.locked || relActiveWeekLocked}
                onClick={() => {
                  if (isEditing) {
                    setEditingEdgeId(null);
                  } else {
                    setEditingEdgeId(rel.id);
                    setEditRelSourceId(rel.sourceId);
                    setEditRelTargetId(rel.targetId);
                    setEditRelType(
                      rel.relationType === 'PART_OF' || rel.relationType === 'RELATED_TO'
                        ? rel.relationType
                        : 'PREREQUISITE',
                    );
                    setEditRelStrength(rel.strength === 'soft' ? 'soft' : 'hard');
                    setEditRelReason(rel.reason ?? '');
                    setEditRelRequired(rel.requiredKnowledge ?? '');
                    setEditRelReviewNote(rel.reviewNote ?? '');
                  }
                }}
              >
                <Pencil size={13} /> Sửa
              </button>
            )}
            {props.onUpdateRelation && (
              <button
                type="button"
                className="n4j-act-btn"
                disabled={props.busy || props.locked || relActiveWeekLocked}
                title="Đảo chiều Nguồn ↔ Đích của quan hệ"
                onClick={() =>
                  void props.onUpdateRelation?.(rel.id, {
                    sourceId: rel.targetId,
                    targetId: rel.sourceId,
                  })
                }
              >
                <ArrowLeftRight size={13} /> Đảo
              </button>
            )}
            <button
              type="button"
              className={`n4j-act-btn reject${rel.decision === 'REJECT' ? ' on' : ''}`}
              disabled={props.busy || props.locked || relActiveWeekLocked}
              onClick={() => void props.onRelationDecision(rel.id, 'REJECT')}
            >
              <X size={13} /> Từ chối
            </button>
            {props.onDeleteRelation && (
              <button
                type="button"
                className="n4j-act-btn reject icon"
                disabled={props.busy || props.locked || relActiveWeekLocked}
                title="Xóa hẳn quan hệ này"
                onClick={async () => {
                  if (!window.confirm(`Xóa quan hệ ${rel.sourceName} → ${rel.targetName}?`)) return;
                  await props.onDeleteRelation?.(rel.id);
                  setSelectedEdgeId(null);
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {isEditing && rel && props.mode === 'relations' && props.onUpdateRelation && (
          <div className="n4j-edit-box">
            <label className="n4j-field">
              <span>Nút nguồn</span>
              <select
                value={editRelSourceId}
                onChange={(e) => setEditRelSourceId(e.target.value)}
              >
                {endpointOptions.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} {ep.inDraft ? '(Chương đang nối)' : '(Bản tạm)'}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="n4j-act-btn"
                onClick={() => {
                  setEditRelSourceId(editRelTargetId);
                  setEditRelTargetId(editRelSourceId);
                }}
              >
                <ArrowLeftRight size={12} /> Đảo nguồn ↔ đích
              </button>
            </div>
            <label className="n4j-field">
              <span>Nút đích</span>
              <select
                value={editRelTargetId}
                onChange={(e) => setEditRelTargetId(e.target.value)}
              >
                {endpointOptions.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} {ep.inDraft ? '(Chương đang nối)' : '(Bản tạm)'}
                  </option>
                ))}
              </select>
            </label>
            {editRelSourceId === editRelTargetId && (
              <div className="n4j-warn-box">Nút nguồn và nút đích phải khác nhau.</div>
            )}
            <label className="n4j-field">
              <span>Loại quan hệ</span>
              <select
                value={editRelType}
                onChange={(e) =>
                  setEditRelType(e.target.value as 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO')
                }
              >
                <option value="PREREQUISITE">PREREQUISITE</option>
                <option value="PART_OF">PART_OF</option>
                <option value="RELATED_TO">RELATED_TO</option>
              </select>
            </label>
            {editRelType === 'PREREQUISITE' && (
              <>
                <label className="n4j-field">
                  <span>Mức độ tiên quyết</span>
                  <select
                    value={editRelStrength}
                    onChange={(e) => setEditRelStrength(e.target.value as 'hard' | 'soft')}
                  >
                    <option value="hard">Bắt buộc (hard)</option>
                    <option value="soft">Khuyến nghị (soft)</option>
                  </select>
                </label>
                <label className="n4j-field">
                  <span>Kiến thức yêu cầu</span>
                  <input
                    value={editRelRequired}
                    onChange={(e) => setEditRelRequired(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="n4j-field">
              <span>Lý do quan hệ</span>
              <textarea
                rows={2}
                value={editRelReason}
                onChange={(e) => setEditRelReason(e.target.value)}
              />
            </label>
            <label className="n4j-field">
              <span>Ghi chú giảng viên</span>
              <input
                value={editRelReviewNote}
                onChange={(e) => setEditRelReviewNote(e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  props.busy || !editRelSourceId || !editRelTargetId || editRelSourceId === editRelTargetId
                }
                onClick={async () => {
                  await props.onUpdateRelation?.(
                    rel.id,
                    {
                      sourceId: editRelSourceId,
                      targetId: editRelTargetId,
                      relationType: editRelType,
                      strength: editRelType === 'PREREQUISITE' ? editRelStrength : null,
                      reason: editRelReason.trim() || rel.reason || 'Giảng viên điều chỉnh quan hệ',
                      requiredKnowledge:
                        editRelType === 'PREREQUISITE'
                          ? editRelRequired.trim() || editRelReason.trim() || 'Kiến thức nền tảng'
                          : '',
                    },
                    editRelReviewNote.trim() || undefined,
                  );
                  setEditingEdgeId(null);
                }}
              >
                Lưu thay đổi
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setEditingEdgeId(null)}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {warningText && (
          <div className="n4j-warn-box">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{warningText}</span>
          </div>
        )}

        <table className="n4j-props">
          <tbody>
            <tr>
              <td>&lt;id&gt;</td>
              <td>{shortId(edge.id)}</td>
            </tr>
            <tr>
              <td>type</td>
              <td>
                {edge.type} ({palette.vi})
              </td>
            </tr>
            {rel?.strength && (
              <tr>
                <td>strength</td>
                <td>{rel.strength === 'hard' ? 'hard (Bắt buộc)' : 'soft (Khuyến nghị)'}</td>
              </tr>
            )}
            {rel?.confidence != null && (
              <tr>
                <td>confidence</td>
                <td>{Math.round(rel.confidence * 100)}%</td>
              </tr>
            )}
            {selectedEdgeSrc?.chapterTitle && (
              <tr>
                <td>source_session</td>
                <td>{selectedEdgeSrc.chapterTitle}</td>
              </tr>
            )}
            {selectedEdgeTgt?.chapterTitle && (
              <tr>
                <td>target_session</td>
                <td>{selectedEdgeTgt.chapterTitle}</td>
              </tr>
            )}
            {(rel?.reason || edge.reason) && (
              <tr>
                <td>reason</td>
                <td>{rel?.reason ?? edge.reason}</td>
              </tr>
            )}
            {(rel?.requiredKnowledge || edge.requiredKnowledge) && (
              <tr>
                <td>required</td>
                <td>{rel?.requiredKnowledge ?? edge.requiredKnowledge}</td>
              </tr>
            )}
            {rel?.reviewNote && (
              <tr>
                <td>review_note</td>
                <td>{rel.reviewNote}</td>
              </tr>
            )}
          </tbody>
        </table>

        {rel && (rel.evidence?.length || rel.sourceRef) && (
          <div className="n4j-section">
            <div className="n4j-section-title">
              Truy xuất nguồn · Source Provenance ({rel.evidence?.length || 1})
            </div>
            <div className="n4j-evidence-list">
              {rel.evidence && rel.evidence.length > 0 ? (
                rel.evidence.map((ev, i) => (
                  <div key={i} className="n4j-provenance-card">
                    <button
                      type="button"
                      className="n4j-chunk-jump"
                      onClick={() => jumpToChunk(ev.slideId)}
                    >
                      <FileText size={11} />
                      <span>{formatSlidePage(ev.slideId)}</span>
                    </button>
                    <p>"{ev.quote}"</p>
                  </div>
                ))
              ) : (
                <div className="n4j-provenance-card">
                  <button
                    type="button"
                    className="n4j-chunk-jump"
                    onClick={() => jumpToChunk(rel.sourceRef)}
                  >
                    <FileText size={11} />
                    <span>{formatSlidePage(rel.sourceRef)}</span>
                  </button>
                  <p>{rel.reason || 'Trang nguồn tham chiếu quan hệ'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  const renderGenericNodeInspector = (node: DraftNode) => {
    const palette = NODE_PALETTE[node.label];
    const simPinned = Boolean(posMapRef.current.get(node.id)?.pinned);
    const canConnectFrom =
      props.mode === 'relations' &&
      Boolean(props.onCreateRelation) &&
      !relActiveWeekLocked &&
      Boolean(node.apiEndpointId) &&
      node.nodeScope !== 'other' &&
      node.label !== 'Document' &&
      node.label !== 'Chunk' &&
      node.label !== 'LO' &&
      node.label !== 'Course';

    return (
      <>
        <div className="n4j-insp-head">
          <div className="n4j-insp-badges">
            <span
              className="n4j-label-badge"
              style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
            >
              :{node.label}
            </span>
            {node.nodeScope === 'active' && (
              <span className="n4j-scope-pill is-active">Chương đang nối</span>
            )}
            {node.nodeScope === 'master' && (
              <span className="n4j-scope-pill is-master">Đã trong Bản tạm</span>
            )}
            <span className="n4j-status-pill muted">{palette.vi}</span>
          </div>
          <button
            type="button"
            className="n4j-icon-close"
            title="Về Tổng quan"
            onClick={() => {
              setSelectedNodeId(null);
              setDrawerTab('overview');
            }}
          >
            <X size={14} />
          </button>
        </div>

        <h4 className="n4j-insp-title">{node.name}</h4>

        <div className="n4j-insp-actions">
          <button
            type="button"
            className="n4j-act-btn"
            onClick={() => handleTogglePinNode(node.id)}
          >
            {simPinned ? <PinOff size={13} /> : <Pin size={13} />}{' '}
            {simPinned ? 'Bỏ ghim vị trí' : 'Ghim vị trí'}
          </button>
          {canConnectFrom && (
            <button
              type="button"
              className="n4j-act-btn approve on"
              disabled={props.busy || props.locked || relActiveWeekLocked}
              onClick={() => {
                setConnectHint(null);
                setConnectMode(true);
                setConnectSourceId(node.id);
              }}
            >
              <Plus size={13} /> Nối quan hệ từ nút này
            </button>
          )}
        </div>

        <table className="n4j-props">
          <tbody>
            <tr>
              <td>&lt;id&gt;</td>
              <td>{shortId(node.id)}</td>
            </tr>
            {node.chapterTitle && (
              <tr>
                <td>session</td>
                <td>{node.chapterTitle}</td>
              </tr>
            )}
            {node.description && (
              <tr>
                <td>description</td>
                <td>{node.description}</td>
              </tr>
            )}
          </tbody>
        </table>

        {renderIncidentLinks()}
      </>
    );
  };

  const approvedRatio = overviewStats.total
    ? Math.round((overviewStats.approved / overviewStats.total) * 100)
    : 0;

  const renderOverviewTab = () => (
    <>
      <div className="n4j-overview-grid">
        <div className="n4j-ov-card">
          <small>Nút hiển thị</small>
          <b>{visible.nodes.length}</b>
        </div>
        <div className="n4j-ov-card">
          <small>Quan hệ hiển thị</small>
          <b>{visible.edges.length}</b>
        </div>
      </div>

      <div className="n4j-progress-block">
        <div className="n4j-progress-head">
          <span>Tiến độ duyệt</span>
          <b>
            {overviewStats.approved}/{overviewStats.total} ({approvedRatio}%)
          </b>
        </div>
        <div className="n4j-progress-track">
          <div className="n4j-progress-fill" style={{ width: `${approvedRatio}%` }} />
        </div>
        <div className="n4j-mini-stats">
          <div>
            <b>{overviewStats.approved}</b>
            <span>Đã duyệt</span>
          </div>
          <div>
            <b>{overviewStats.pending}</b>
            <span>Chờ duyệt</span>
          </div>
          <div>
            <b>{overviewStats.warn}</b>
            <span>Cần chú ý</span>
          </div>
          <div>
            <b>{overviewStats.rejected}</b>
            <span>Từ chối</span>
          </div>
        </div>
      </div>

      <div className="n4j-section">
        <div className="n4j-section-head">
          <div className="n4j-section-title">Nhãn nút (Node Labels)</div>
          {hiddenLabels.size > 0 && (
            <button
              type="button"
              className="n4j-reset-link"
              onClick={() => setHiddenLabels(new Set())}
            >
              Hiện tất cả
            </button>
          )}
        </div>
        <div className="n4j-pills">
          {labelCounts.map(([lbl, count]) => {
            const pal = NODE_PALETTE[lbl];
            const off = hiddenLabels.has(lbl);
            return (
              <button
                key={lbl}
                type="button"
                className={`n4j-pill${off ? ' off' : ''}`}
                style={
                  off
                    ? undefined
                    : { background: pal.fill, borderColor: pal.stroke, color: pal.text }
                }
                onClick={() => toggleLabel(lbl)}
                title={`${pal.vi} — bấm để ẩn/hiện`}
              >
                :{lbl} <small>({count})</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="n4j-section">
        <div className="n4j-section-head">
          <div className="n4j-section-title">Loại quan hệ (Relationships)</div>
          {hiddenEdgeTypes.size > 0 && (
            <button
              type="button"
              className="n4j-reset-link"
              onClick={() => setHiddenEdgeTypes(new Set())}
            >
              Hiện tất cả
            </button>
          )}
        </div>
        <div className="n4j-pills">
          {edgeTypeCounts.map(([rt, count]) => {
            const pal = EDGE_PALETTE[rt];
            const off = hiddenEdgeTypes.has(rt);
            return (
              <button
                key={rt}
                type="button"
                className={`n4j-rpill${off ? ' off' : ''}`}
                style={off ? undefined : { color: pal.color, borderColor: pal.color }}
                onClick={() => toggleEdgeType(rt)}
                title={`${pal.vi} — bấm để ẩn/hiện`}
              >
                <i className={`${pal.dash ? 'dash ' : ''}${pal.arrow ? 'arrow' : ''}`} />
                {rt} <small>({count})</small>
              </button>
            );
          })}
        </div>
      </div>

      {overviewStats.attentionItems.length > 0 && (
        <div className="n4j-section">
          <div className="n4j-section-title">
            Cần xem xét ({overviewStats.attentionItems.length})
          </div>
          <div className="n4j-queue-list">
            {overviewStats.attentionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`n4j-queue-item${item.warn ? ' warn' : ''}`}
                onClick={() => (item.kind === 'node' ? focusNode(item.id) : focusEdge(item.id))}
              >
                <div>
                  <b>{item.title}</b>
                  <small>{item.subtitle}</small>
                </div>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="n4j-shell">
      {/* Neo4j Document Intelligence Top Workspace Bar */}
      <div className="n4j-topbar">
        {props.mode === 'relations' ? (
          <div className="n4j-scope-switch" role="tablist" aria-label="Phạm vi hiển thị đồ thị">
            <button
              type="button"
              role="tab"
              aria-selected={graphScope === 'incremental'}
              className={graphScope === 'incremental' ? 'on' : ''}
              onClick={() => setGraphScope('incremental')}
              title="Hiển thị Snapshot (Bản tạm) cùng các chương đã chọn"
            >
              <Layers size={12} /> {relSnapshotLabel ? `${relSnapshotLabel} + Đã chọn` : 'Bản tạm + Chương chọn'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={graphScope === 'week'}
              className={graphScope === 'week' ? 'on' : ''}
              onClick={() => setGraphScope('week')}
              title="Chỉ hiển thị các nút & quan hệ của các chương đang chọn"
            >
              Chỉ chương đã chọn
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={graphScope === 'course'}
              className={graphScope === 'course' ? 'on' : ''}
              onClick={() => setGraphScope('course')}
              title="Hiển thị toàn bộ các chương trong môn học"
            >
              Toàn môn
            </button>
          </div>
        ) : (
          <div className="n4j-layer-switch" role="tablist" aria-label="Chế độ lớp đồ thị Neo4j">
            <button
              type="button"
              role="tab"
              aria-selected={graphLayer === 'full'}
              className={graphLayer === 'full' ? 'on' : ''}
              onClick={() => setGraphLayer('full')}
              title="Kết hợp cả Tài liệu/Chunk và Thực thể với liên kết MENTIONED_IN"
            >
              <Layers size={12} /> Đồ thị đầy đủ ({entityTotal + chunkTotal})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={graphLayer === 'entity'}
              className={graphLayer === 'entity' ? 'on' : ''}
              onClick={() => setGraphLayer('entity')}
              title="Chỉ hiển thị đồ thị thực thể & quan hệ ngữ nghĩa"
            >
              Thực thể ({entityTotal})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={graphLayer === 'lexical'}
              disabled={chunkTotal === 0}
              className={graphLayer === 'lexical' ? 'on' : ''}
              onClick={() => setGraphLayer('lexical')}
              title={
                chunkTotal > 0
                  ? 'Chỉ hiển thị Document → Chunk các trang tài liệu'
                  : 'Chưa có trích dẫn trang nguồn cho đồ thị này'
              }
            >
              <FileText size={12} /> Tài liệu &amp; Chunk ({chunkTotal})
            </button>
          </div>
        )}

        <div className="n4j-search">
          <Search size={13} className="n4j-search-ico" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setQualityHighlight('none');
              setSearchQuery(e.target.value);
            }}
            placeholder="Tìm thực thể, trang nguồn, trích dẫn..."
          />
          {searchQuery && (
            <button
              type="button"
              className="n4j-search-clear"
              onClick={() => setSearchQuery('')}
              title="Xóa tìm kiếm"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="n4j-quality-group">
          {qualityCounts.warnCount > 0 && (
            <button
              type="button"
              className={`n4j-quality-chip warn${qualityHighlight === 'warn' ? ' on' : ''}`}
              onClick={() =>
                setQualityHighlight((prev) => (prev === 'warn' ? 'none' : 'warn'))
              }
              title="Đánh dấu các mục AI cần kiểm tra"
            >
              <Sparkles size={12} /> Cần kiểm tra ({qualityCounts.warnCount})
            </button>
          )}
          {props.mode === 'lessons' && qualityCounts.missingLoCount > 0 && (
            <button
              type="button"
              className={`n4j-quality-chip lo${qualityHighlight === 'missing_lo' ? ' on' : ''}`}
              onClick={() =>
                setQualityHighlight((prev) => (prev === 'missing_lo' ? 'none' : 'missing_lo'))
              }
              title="Đánh dấu bài học chưa gắn chuẩn đầu ra LO"
            >
              Thiếu LO ({qualityCounts.missingLoCount})
            </button>
          )}

          {props.mode === 'lessons' && props.onCreateLesson && (
            <button
              type="button"
              className="n4j-topbar-btn"
              disabled={props.busy || props.locked}
              onClick={openCreateLessonForm}
              title="Thêm một nút bài học / chủ đề mới vào buổi học"
            >
              <Plus size={13} /> Thêm nút
            </button>
          )}

          {props.mode === 'relations' && (
            <button
              type="button"
              className={`n4j-topbar-btn${!hiddenLabels.has('LO') ? ' active' : ''}`}
              onClick={() =>
                setHiddenLabels((prev) => {
                  const next = new Set(prev);
                  if (next.has('LO')) next.delete('LO');
                  else next.add('LO');
                  return next;
                })
              }
              title="Bật/tắt hiển thị các nút Chuẩn đầu ra (:LO)"
            >
              :LO {!hiddenLabels.has('LO') ? 'hiện' : 'ẩn'}
            </button>
          )}

          {props.mode === 'relations' && props.onCreateRelation && (
            <button
              type="button"
              className={`n4j-topbar-btn${connectMode ? ' active' : ''}`}
              disabled={props.busy || props.locked || relActiveWeekLocked}
              onClick={() => {
                setConnectHint(null);
                if (connectMode) {
                  setConnectMode(false);
                  setConnectSourceId(null);
                } else {
                  setConnectSourceId(null);
                  setConnectMode(true);
                }
              }}
              title="Bấm 2 nút trên đồ thị hoặc mở form để nối quan hệ mới"
            >
              <Plus size={13} /> {connectMode ? 'Đang nối quan hệ...' : 'Nối quan hệ'}
            </button>
          )}
        </div>

        {props.mode === 'relations' && (
          <div className="lesson-filter-pills">
            {(
              [
                ['all', `Tất cả (${props.relations.length})`],
                ['pending', `Chờ duyệt (${overviewStats.pending})`],
                ...(overviewStats.warn > 0
                  ? [['warn', `Cần chú ý (${overviewStats.warn})`]]
                  : []),
                ['approved', `Đã duyệt (${overviewStats.approved})`],
                ...(overviewStats.rejected > 0
                  ? [['rejected', `Từ chối (${overviewStats.rejected})`]]
                  : []),
              ] as Array<[StatusFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`lesson-filter-pill${key === 'warn' ? ' warn' : ''}${statusFilter === key ? ' on' : ''}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main NVL Canvas + Right Needle Result/Inspector Drawer */}
      <div className="n4j-body">
        <div className="n4j-stage" ref={stageRef}>
          <svg ref={svgRef} className="n4j-svg" />

          {connectMode && props.mode === 'relations' && (
            <div className="n4j-connect-banner">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>
                  {connectSourceId
                    ? `Đã chọn nguồn: "${visible.nodeMap.get(connectSourceId)?.name ?? connectSourceId}" — hãy bấm nút ĐÍCH trên đồ thị`
                    : 'Chế độ nối quan hệ: Bấm vào nút NGUỒN trên đồ thị để bắt đầu'}
                </span>
                {connectHint && (
                  <small style={{ color: '#b45309', fontWeight: 600 }}>{connectHint}</small>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => openCreateRelationForm(connectSourceId ?? undefined)}
                >
                  Chọn bằng danh sách
                </button>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => {
                    setConnectMode(false);
                    setConnectSourceId(null);
                    setConnectHint(null);
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {visible.nodes.length === 0 && (
            <div className="n4j-empty-overlay">
              {props.mode === 'lessons' && props.lessons.length === 0
                ? 'Chưa có nút kiến thức nào trong chương này. Điền thông tin ở khung bên phải để tạo nút thủ công đầu tiên.'
                : 'Không có nút hoặc quan hệ nào trong lớp hiển thị hiện tại.'}
            </div>
          )}

          {adjustOpen && (
            <div className="n4j-adjust-popover">
              <div className="n4j-adjust-head">
                <b>Điều chỉnh đồ thị Neo4j</b>
                <button
                  type="button"
                  className="n4j-icon-close"
                  onClick={() => setAdjustOpen(false)}
                >
                  <X size={13} />
                </button>
              </div>

              <div className="n4j-field">
                <span>Kiểu bố cục (Layout)</span>
                <div className="n4j-layout-switch">
                  <button
                    type="button"
                    className={layoutMode === 'force' ? 'on' : ''}
                    onClick={() => setLayoutMode('force')}
                  >
                    Lực đàn hồi
                  </button>
                  <button
                    type="button"
                    className={layoutMode === 'hierarchical' ? 'on' : ''}
                    onClick={() => setLayoutMode('hierarchical')}
                  >
                    Phân tầng
                  </button>
                </div>
              </div>

              <label className="n4j-slider-row">
                <div>
                  <span>Khoảng cách cạnh</span>
                  <b>{linkScale.toFixed(1)}x</b>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.1}
                  value={linkScale}
                  onChange={(e) => setLinkScale(Number(e.target.value))}
                />
              </label>

              <label className="n4j-slider-row">
                <div>
                  <span>Lực đẩy giữa nút</span>
                  <b>{Math.abs(chargeStrength)}</b>
                </div>
                <input
                  type="range"
                  min={140}
                  max={700}
                  step={20}
                  value={Math.abs(chargeStrength)}
                  onChange={(e) => setChargeStrength(-Number(e.target.value))}
                />
              </label>

              <label className="n4j-slider-row">
                <div>
                  <span>Kích thước nút</span>
                  <b>{Math.round(nodeScale * 100)}%</b>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={nodeScale}
                  onChange={(e) => setNodeScale(Number(e.target.value))}
                />
              </label>

              <div className="n4j-adjust-actions">
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => {
                    setLayoutMode('force');
                    setLinkScale(1);
                    setChargeStrength(-340);
                    setNodeScale(1);
                  }}
                >
                  Đặt lại mặc định
                </button>
                {pinnedCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline sm"
                    onClick={handleUnpinAll}
                  >
                    Bỏ ghim ({pinnedCount})
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="n4j-controls">
            <button
              type="button"
              className="n4j-ctrl-btn"
              title="Phóng to"
              onClick={() => handleZoomBy(1.25)}
            >
              +
            </button>
            <button
              type="button"
              className="n4j-ctrl-btn"
              title="Thu nhỏ"
              onClick={() => handleZoomBy(0.8)}
            >
              −
            </button>
            <button
              type="button"
              className="n4j-ctrl-btn"
              title="Vừa khung hình"
              onClick={() => {
                autoFitRef.current = true;
                fitView(true);
              }}
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              className="n4j-ctrl-btn"
              title="Sắp xếp lại bố cục đồ thị"
              onClick={handleRelayout}
            >
              <RotateCcw size={13} />
            </button>
            {pinnedCount > 0 && (
              <button
                type="button"
                className="n4j-ctrl-btn"
                title={`Bỏ ghim tất cả (${pinnedCount} nút đang ghim)`}
                onClick={handleUnpinAll}
              >
                <Unlock size={13} />
              </button>
            )}
            <button
              type="button"
              className={`n4j-ctrl-btn${adjustOpen ? ' on' : ''}`}
              title="Điều chỉnh bố cục, kích thước nút & khoảng cách cạnh"
              onClick={() => setAdjustOpen((v) => !v)}
            >
              <SlidersHorizontal size={13} />
            </button>
            <button
              type="button"
              className={`n4j-ctrl-btn${showEdgeLabels ? ' on' : ''}`}
              title={showEdgeLabels ? 'Ẩn nhãn quan hệ trên cạnh' : 'Hiện nhãn quan hệ trên cạnh'}
              onClick={() => setShowEdgeLabels((v) => !v)}
            >
              <Tag size={13} />
            </button>
            <button
              type="button"
              className={`n4j-ctrl-btn${inspectorOpen ? ' on' : ''}`}
              title={inspectorOpen ? 'Thu gọn bảng Neo4j' : 'Mở bảng Neo4j'}
              onClick={() => setInspectorOpen((v) => !v)}
            >
              {inspectorOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            </button>
          </div>

          <div className="n4j-cypher-bar" title={cypherBarText}>
            <code>{cypherBarText}</code>
          </div>
        </div>

        {inspectorOpen && (
          <aside className="n4j-inspector">
            <div className="n4j-drawer-tabs">
              <button
                type="button"
                className={drawerTab === 'overview' ? 'on' : ''}
                onClick={() => {
                  setDrawerCreateMode('none');
                  setDrawerTab('overview');
                }}
              >
                Tổng quan (Result)
              </button>
              <button
                type="button"
                className={drawerTab === 'inspector' ? 'on' : ''}
                onClick={() => setDrawerTab('inspector')}
              >
                Chi tiết &amp; Sửa
              </button>
            </div>

            <div className="n4j-drawer-body">
              {drawerCreateMode === 'lesson'
                ? renderCreateLessonForm()
                : drawerCreateMode === 'relation'
                  ? renderCreateRelationForm()
                  : drawerTab === 'overview'
                    ? renderOverviewTab()
                    : selectedEdge
                      ? renderEdgeInspector(selectedEdge)
                      : selectedNode
                        ? selectedNode.label === 'Chunk'
                          ? renderChunkInspector(selectedNode)
                          : selectedNode.lessonRef
                            ? renderLessonInspector(selectedNode.lessonRef, selectedNode)
                            : renderGenericNodeInspector(selectedNode)
                        : renderOverviewTab()}
            </div>
          </aside>
        )}
      </div>

      {/* Footer status & interaction legend */}
      <div className="n4j-legend">
        {props.mode === 'relations' ? (
          <>
            <span>
              <i className="n4j-legend-week-dot" /> Chương đang nối
            </span>
            <span>
              <i className="n4j-leg-dot master" /> Bản tạm (đã gộp)
            </span>
          </>
        ) : (
          <span>
            <i className="n4j-leg-dot chunk" /> Nguồn trang (:Chunk)
          </span>
        )}
        <span>
          <i className="n4j-leg-dot ok" /> Đã duyệt
        </span>
        <span>
          <i className="n4j-leg-dot warn" /> AI cần kiểm tra
        </span>
        <span>
          <i className="n4j-leg-dot rej" /> Đã từ chối
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Minimize2 size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
          Kéo nút để ghim (nhấp đúp bỏ ghim) · Bấm nút/cạnh để sửa trực tiếp
        </span>
      </div>
    </div>
  );
}
