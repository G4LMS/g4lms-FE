import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from '../../types';

interface EvidenceItem {
  quote?: string;
  slide_id?: string;
  slideId?: string;
  source?: string;
}

const UI_ONLY_NODE_PROP_KEYS = new Set(['x', 'y', 'vx', 'vy', 'fx', 'fy', 'index', 'isVirtualMore']);

function normalizeEvidenceList(raw: unknown): Array<{ quote: string; slide_id: string; source: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const normalized = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const ev = item as EvidenceItem;
      const slideId = String(ev.slide_id ?? ev.slideId ?? '').trim();
      const quote = String(ev.quote ?? '').trim();
      if (!slideId && !quote) return null;
      return {
        quote,
        slide_id: slideId || 'Tài liệu bổ sung',
        source: String(ev.source ?? 'slide_text').trim() || 'slide_text',
      };
    })
    .filter((x): x is { quote: string; slide_id: string; source: string } => Boolean(x));

  return normalized.length > 0 ? normalized : undefined;
}

function cleanProperties(raw?: Record<string, unknown>): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (UI_ONLY_NODE_PROP_KEYS.has(key) || value === undefined) continue;
    if (key === 'evidence') {
      const ev = normalizeEvidenceList(value);
      if (ev) out.evidence = ev;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function resolveEndpointId(endpoint: unknown): string {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint && typeof endpoint === 'object' && 'id' in endpoint) {
    return String((endpoint as { id: unknown }).id ?? '');
  }
  return '';
}

/**
 * Serialize UI graph state back to the exact backend KnowledgeGraphData JSON format
 * matching prototypeGraph.json (no D3 simulation fields, normalized evidence.slide_id,
 * and preserved source_type / target_type on edges).
 */
export function serializeKnowledgeGraph(data: KnowledgeGraphData): KnowledgeGraphData {
  const realNodes = (data.nodes ?? []).filter(
    (n) => !(n as KnowledgeGraphNode & { isVirtualMore?: boolean }).isVirtualMore && !String(n.id).startsWith('more:'),
  );

  const nodeTypeById = new Map<string, KnowledgeGraphNode['type']>();
  const nodes: KnowledgeGraphNode[] = realNodes.map((n) => {
    nodeTypeById.set(n.id, n.type);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      description: n.description ?? '',
      properties: cleanProperties(n.properties),
    };
  });

  const edges: KnowledgeGraphEdge[] = (data.edges ?? [])
    .map((e) => {
      const source = resolveEndpointId(e.source);
      const target = resolveEndpointId(e.target);
      if (!source || !target) return null;
      if (!nodeTypeById.has(source) || !nodeTypeById.has(target)) return null;
      const edge: KnowledgeGraphEdge = {
        source,
        source_type: e.source_type ?? nodeTypeById.get(source),
        target,
        target_type: e.target_type ?? nodeTypeById.get(target),
        type: e.type,
        properties: cleanProperties(e.properties),
      };
      return edge;
    })
    .filter((e): e is KnowledgeGraphEdge => Boolean(e));

  return { nodes, edges };
}

export function downloadKnowledgeGraphJson(data: KnowledgeGraphData, filename = 'knowledge-graph.json'): void {
  const serialized = serializeKnowledgeGraph(data);
  const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
