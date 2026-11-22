import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KnowledgeGraphData } from '../../types';

interface HealthGroup {
  key: string;
  title: string;
  items: Array<{ id: string; text: string }>;
}

interface Props {
  data: KnowledgeGraphData;
  onSelectNode?: (nodeId: string) => void;
  onClose: () => void;
}

function detectPrereqCycles(data: KnowledgeGraphData): string[] {
  const adj = new Map<string, string[]>();
  for (const e of data.edges) {
    if (e.type !== 'PREREQUISITE') continue;
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const color = new Map<string, number>();
  const cycles: string[] = [];

  const dfs = (u: string, path: string[]) => {
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === 1) {
        const idx = path.indexOf(v);
        const cycle = (idx >= 0 ? path.slice(idx) : path).concat(v);
        cycles.push(cycle.join(' → '));
      } else if (!color.get(v)) {
        dfs(v, [...path, v]);
      }
    }
    color.set(u, 2);
  };

  for (const id of adj.keys()) {
    if (!color.get(id)) dfs(id, [id]);
  }
  return cycles;
}

function detectRedundantPrereqs(data: KnowledgeGraphData): Array<{ id: string; text: string }> {
  const prereqs = data.edges.filter((e) => e.type === 'PREREQUISITE');
  const redundant: Array<{ id: string; text: string }> = [];
  const nameOf = new Map(data.nodes.map((n) => [n.id, n.name || n.id]));

  for (const edge of prereqs) {
    const adj = new Map<string, string[]>();
    for (const other of prereqs) {
      if (other === edge) continue;
      const list = adj.get(other.source) ?? [];
      list.push(other.target);
      adj.set(other.source, list);
    }
    const visited = new Set<string>([edge.source]);
    const queue = [edge.source];
    let found = false;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === edge.target) {
        found = true;
        break;
      }
      for (const nxt of adj.get(cur) ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
    if (found) {
      redundant.push({
        id: edge.source,
        text: `${nameOf.get(edge.source) ?? edge.source} → ${nameOf.get(edge.target) ?? edge.target} (đã có đường đi gián tiếp)`,
      });
    }
  }
  return redundant;
}

export function GraphHealthPanel({ data, onSelectNode, onClose }: Props) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const analysis = useMemo(() => {
    const concepts = data.nodes.filter((n) => n.type === 'Concept');
    const degree = new Map<string, number>();
    const hasExplain = new Set<string>();
    const hasAssess = new Set<string>();

    for (const e of data.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      if (e.type === 'EXPLAIN') hasExplain.add(e.target);
      if (e.type === 'ASSESS') hasAssess.add(e.target);
    }

    const cycles = detectPrereqCycles(data);
    const orphans = concepts.filter((n) => (degree.get(n.id) ?? 0) === 0);
    const redundant = detectRedundantPrereqs(data);
    const missingContent = concepts.filter((n) => !hasExplain.has(n.id) && !n.description?.trim());
    const missingQuiz = concepts.filter((n) => !hasAssess.has(n.id));
    const pendingReview = data.nodes.filter((n) => {
      const st = String(n.properties?.status ?? '');
      return st === 'proposed' || st === 'draft' || st === 'pending_review';
    });

    const groups: HealthGroup[] = [
      {
        key: 'cycle',
        title: 'Vòng lặp tiên quyết (PREREQUISITE)',
        items: cycles.map((c) => ({ id: c.split(' → ')[0], text: c })),
      },
      {
        key: 'orphan',
        title: 'Khái niệm cô lập (chưa có cạnh)',
        items: orphans.map((n) => ({ id: n.id, text: `${n.name} (${n.id})` })),
      },
      {
        key: 'redundant',
        title: 'Cạnh tiên quyết dư thừa',
        items: redundant,
      },
      {
        key: 'pending',
        title: 'Nút AI đề xuất chờ duyệt',
        items: pendingReview.map((n) => ({ id: n.id, text: `${n.name} (${n.type})` })),
      },
      {
        key: 'content',
        title: 'Khái niệm thiếu mô tả / tài liệu',
        items: missingContent.map((n) => ({ id: n.id, text: n.name })),
      },
      {
        key: 'quiz',
        title: 'Khái niệm chưa có câu hỏi (ASSESS)',
        items: missingQuiz.map((n) => ({ id: n.id, text: n.name })),
      },
    ];

    const totalConcepts = Math.max(1, concepts.length);
    const contentPct = Math.round(((concepts.length - missingContent.length) / totalConcepts) * 100);
    const quizPct = Math.round(((concepts.length - missingQuiz.length) / totalConcepts) * 100);
    const issueGroups = groups.filter((g) => g.items.length > 0).length;
    const status = cycles.length > 0 ? 'bad' : issueGroups > 0 ? 'warn' : 'ok';

    return { groups, conceptsCount: concepts.length, contentPct, quizPct, issueGroups, status };
  }, [data]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside className="kg-panel" aria-label="Sức khỏe đồ thị">
      <div className="kg-panel-head">
        <h2>Sức khỏe Graph</h2>
        <button type="button" className="kg-btn sm" onClick={onClose} aria-label="Đóng sức khỏe graph">
          <X size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700 }}>
        {analysis.status === 'ok' ? (
          <CheckCircle2 size={15} color="#16a34a" />
        ) : (
          <AlertTriangle size={15} color={analysis.status === 'bad' ? '#dc2626' : '#d97706'} />
        )}
        <span>
          {analysis.status === 'ok'
            ? 'Tốt — không có cảnh báo'
            : analysis.status === 'bad'
              ? 'Có lỗi chu trình cần xử lý'
              : `${analysis.issueGroups}/${analysis.groups.length} nhóm cần xem xét`}
        </span>
      </div>

      <div style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', marginBottom: 12 }}>
        <div className="muted-s" style={{ marginBottom: 6 }}>
          Độ phủ trên {analysis.conceptsCount} khái niệm
        </div>
        <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
          <span>Có mô tả / tài liệu</span>
          <b>{analysis.contentPct}%</b>
        </div>
        <div className="progress-track" style={{ height: 6, margin: '4px 0 8px' }}>
          <div className="progress-fill" style={{ width: `${analysis.contentPct}%` }} />
        </div>
        <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
          <span>Có câu hỏi kiểm tra</span>
          <b>{analysis.quizPct}%</b>
        </div>
        <div className="progress-track" style={{ height: 6, marginTop: 4 }}>
          <div className="progress-fill" style={{ width: `${analysis.quizPct}%`, background: '#16a34a' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {analysis.groups.map((group) => {
          const open = !!openGroups[group.key] && group.items.length > 0;
          return (
            <div key={group.key} style={{ border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}>
              <button
                type="button"
                disabled={group.items.length === 0}
                onClick={() => toggleGroup(group.key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  border: 0,
                  background: 'none',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                {group.items.length > 0 ? (
                  open ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                ) : (
                  <CheckCircle2 size={13} color="#16a34a" />
                )}
                <span style={{ flex: 1, fontWeight: 600 }}>{group.title}</span>
                <span
                  className="pill-badge"
                  style={{
                    color: group.items.length ? '#b45309' : '#15803d',
                    borderColor: group.items.length ? '#f59e0b' : '#86efac',
                  }}
                >
                  {group.items.length}
                </span>
              </button>
              {open && (
                <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.slice(0, 20).map((item, idx) => (
                    <button
                      key={`${item.id}-${idx}`}
                      type="button"
                      className="kg-rel"
                      onClick={() => onSelectNode?.(item.id)}
                    >
                      <span>{item.text}</span>
                    </button>
                  ))}
                  {group.items.length > 20 && (
                    <span className="muted-xs">… và {group.items.length - 20} mục khác</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
