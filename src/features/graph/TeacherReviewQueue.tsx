import { AlertTriangle, Check, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KnowledgeGraphData } from '../../types';
import { REVIEW_THRESHOLD } from './graphHierarchy';

interface PendingItem {
  kind: 'node' | 'edge';
  id: string;
  label: string;
  sub: string;
  confidence: number | null;
  lowConf: boolean;
  fromId?: string;
  toId?: string;
  edgeType?: string;
}

interface Props {
  data: KnowledgeGraphData;
  busy?: boolean;
  onFocusNode?: (nodeId: string) => void;
  onApproveNode: (nodeId: string) => Promise<void>;
  onRejectNode: (nodeId: string) => Promise<void>;
  onApproveEdge: (input: { fromId: string; toId: string; edgeType: string }) => Promise<void>;
  onRejectEdge: (input: { fromId: string; toId: string; edgeType: string }) => Promise<void>;
  onApproveAll: (items: PendingItem[]) => Promise<void>;
}

export function TeacherReviewQueue({
  data,
  busy,
  onFocusNode,
  onApproveNode,
  onRejectNode,
  onApproveEdge,
  onRejectEdge,
  onApproveAll,
}: Props) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<'all' | 'low'>('all');

  const pendingItems = useMemo<PendingItem[]>(() => {
    const nameById = new Map(data.nodes.map((n) => [n.id, n.name || n.id]));
    const items: PendingItem[] = [];

    for (const n of data.nodes) {
      if (n.type === 'Course' || n.type === 'Content') continue;
      const st = String(n.properties?.status ?? '');
      const conf = typeof n.properties?.confidence === 'number' ? n.properties.confidence : null;
      if (st === 'proposed' || st === 'draft' || st === 'pending_review') {
        items.push({
          kind: 'node',
          id: n.id,
          label: n.name || n.id,
          sub: `${n.type}${n.properties?.chapter_id ? ` · ${String(n.properties.chapter_id)}` : ''}`,
          confidence: conf,
          lowConf: conf !== null && conf < REVIEW_THRESHOLD,
        });
      }
    }

    for (const e of data.edges) {
      if (e.type === 'EXPLAIN') continue;
      const st = String(e.properties?.status ?? '');
      const conf = typeof e.properties?.confidence === 'number' ? e.properties.confidence : null;
      if (st === 'proposed' || (conf !== null && conf < REVIEW_THRESHOLD)) {
        items.push({
          kind: 'edge',
          id: `${e.source}->${e.target}:${e.type}`,
          label: `${nameById.get(e.source) ?? e.source} → ${nameById.get(e.target) ?? e.target}`,
          sub: e.type,
          confidence: conf,
          lowConf: conf !== null && conf < REVIEW_THRESHOLD,
          fromId: e.source,
          toId: e.target,
          edgeType: e.type,
        });
      }
    }

    return items.sort((a, b) => Number(b.lowConf) - Number(a.lowConf));
  }, [data]);

  const visibleItems = filter === 'low' ? pendingItems.filter((i) => i.lowConf) : pendingItems;

  if (!open) {
    return (
      <div
        style={{
          width: 44,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 10,
          gap: 8,
        }}
      >
        <button
          type="button"
          className="kg-btn sm"
          onClick={() => setOpen(true)}
          aria-label="Mở hàng đợi duyệt"
          title="Mở hàng đợi duyệt"
        >
          <ChevronRight size={15} />
        </button>
        <span
          className="pill-badge"
          style={{ color: '#b45309', borderColor: '#f59e0b', padding: '2px 6px', fontSize: 11 }}
          title={`${pendingItems.length} mục chờ duyệt`}
        >
          {pendingItems.length}
        </span>
      </div>
    );
  }

  return (
    <aside
      aria-label="Hàng đợi duyệt"
      style={{
        width: 290,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRight: '1px solid var(--line)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '10px 12px',
          borderBottom: '1px solid var(--line)',
          background: '#f8fafc',
        }}
      >
        <strong style={{ fontSize: 13 }}>Chờ duyệt ({pendingItems.length})</strong>
        <button type="button" className="kg-btn sm" onClick={() => setOpen(false)} aria-label="Thu gọn hàng đợi">
          <ChevronLeft size={14} />
        </button>
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('all')}
          >
            Tất cả ({pendingItems.length})
          </button>
          <button
            type="button"
            className={`btn sm ${filter === 'low' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter('low')}
          >
            Tin cậy thấp ({pendingItems.filter((i) => i.lowConf).length})
          </button>
        </div>
        <button
          type="button"
          className="btn btn-outline sm"
          disabled={busy || pendingItems.length === 0}
          onClick={() => void onApproveAll(pendingItems.slice(0, 25))}
          style={{ width: '100%' }}
        >
          <Check size={13} /> Chấp nhận nhanh ({Math.min(25, pendingItems.length)})
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visibleItems.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }} className="muted-s">
            <Sparkles size={18} style={{ marginBottom: 4 }} />
            <div>Đã duyệt hết các mục do AI đề xuất.</div>
          </div>
        ) : (
          visibleItems.slice(0, 80).map((item) => (
            <div
              key={item.id}
              style={{
                padding: '8px 10px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: item.kind === 'node' ? '#e0f2fe' : '#f3e8ff',
                      color: item.kind === 'node' ? '#0369a1' : '#7e22ce',
                    }}
                  >
                    {item.kind === 'node' ? 'NODE' : 'CẠNH'}
                  </span>
                  {item.lowConf && (
                    <span style={{ fontSize: 10, color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <AlertTriangle size={10} /> Thấp
                    </span>
                  )}
                  {item.confidence !== null && !item.lowConf && (
                    <span className="muted-xs">{Math.round(item.confidence * 100)}%</span>
                  )}
                </div>
                <div
                  onClick={() => onFocusNode?.(item.kind === 'node' ? item.id : (item.fromId ?? item.id))}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                    cursor: 'pointer',
                  }}
                  title={item.label}
                >
                  {item.label}
                </div>
                <div className="muted-xs">{item.sub}</div>
              </div>
              <button
                type="button"
                disabled={busy}
                title="Duyệt"
                aria-label={`Duyệt ${item.label}`}
                onClick={() => {
                  if (item.kind === 'node') void onApproveNode(item.id);
                  else if (item.fromId && item.toId && item.edgeType) {
                    void onApproveEdge({ fromId: item.fromId, toId: item.toId, edgeType: item.edgeType });
                  }
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                disabled={busy}
                title="Từ chối"
                aria-label={`Từ chối ${item.label}`}
                onClick={() => {
                  if (item.kind === 'node') void onRejectNode(item.id);
                  else if (item.fromId && item.toId && item.edgeType) {
                    void onRejectEdge({ fromId: item.fromId, toId: item.toId, edgeType: item.edgeType });
                  }
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  border: '1px solid #fecdd3',
                  background: '#fff1f2',
                  color: '#dc2626',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
