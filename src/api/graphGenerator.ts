import type { KnowledgeGraphData } from '../types';

export const GRAPH_GEN_BASE_URL = import.meta.env.VITE_GRAPH_GEN_URL ?? '/graph-gen';

export interface GenCitation {
  slide_id: string;
  quote: string;
}

export interface GenConcept {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  outcome: string;
  lo_ids: string[];
  level: 'topic' | 'lesson';
  duration_min: number | null;
  default_week: number | null;
  confidence: number | null;
  details: Array<{ name: string; evidence: GenCitation[] }>;
  evidence: GenCitation[];
  reuse_id: string | null;
  decision: 'pending' | 'approved' | 'rejected';
  review_note: string;
}

export interface GenRelation {
  id: string;
  source: string;
  target: string;
  type: 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO';
  reason: string;
  required_knowledge: string;
  strength: 'hard' | 'soft' | null;
  confidence: number | null;
  evidence: GenCitation[];
  decision: 'pending' | 'approved' | 'rejected';
  review_note: string;
}

export interface GenOutline {
  title: string;
  description: string;
  los: Array<{ id: string; name: string; bloom_level?: number | null }>;
  chapters: Array<{ id: string; title: string; los: string[]; concept_hints: string[] }>;
}

export interface GenChapterDraft {
  chapter_id: string;
  base_master_version: number;
  source_hash: string;
  concepts: GenConcept[];
  skipped_slide_ids: string[];
  node_assessment: Array<{ concept_id: string; verdict: 'supported' | 'revise' | 'unsupported'; issue: string; suggested_reuse_id?: string | null }>;
  edges: GenRelation[];
  edge_assessment: Array<{ edge_id: string; verdict: 'supported' | 'revise' | 'unsupported'; issue: string }>;
  context_ids: string[];
  phase: 'nodes' | 'nodes_reviewed' | 'relations' | 'ready';
}

export interface GenJobResponse {
  id: string;
  course_id: string;
  chapter_id: string;
  kind: 'outline' | 'nodes' | 'relations' | string;
  state: 'queued' | 'running' | 'quota_wait' | 'completed' | 'failed' | 'budget_stop' | 'cancelled';
  completed_steps?: number;
  total_steps?: number;
  error?: string | null;
  recovery?: Record<string, unknown>;
}

export class GraphGenApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly payload?: unknown) {
    super(message);
    this.name = 'GraphGenApiError';
  }
}

async function ggRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${GRAPH_GEN_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const payload = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const obj = payload && typeof payload === 'object' ? (payload as { detail?: unknown; message?: string }) : null;
    const msg =
      obj?.message ??
      (typeof obj?.detail === 'string' ? obj.detail : obj?.detail ? JSON.stringify(obj.detail) : null) ??
      `Graph Generator API error (${res.status})`;
    throw new GraphGenApiError(msg, res.status, payload);
  }
  return payload as T;
}

const ggJson = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const graphGenApi = {
  health: () => ggRequest<{ status: string }>('/health'),
  getProviders: () => ggRequest<Record<string, unknown>>('/providers'),

  listCourses: () => ggRequest<Array<Record<string, unknown>>>('/courses'),
  createCourse: (input: { id: string; outline?: GenOutline; syllabus_text?: string }) =>
    ggRequest<Record<string, unknown>>('/courses', ggJson('POST', input)),
  getCourse: (courseId: string) =>
    ggRequest<Record<string, unknown>>(`/courses/${encodeURIComponent(courseId)}`),

  /** Upload raw PDF bytes (max 32 MB) for syllabus extraction */
  uploadSyllabusPdf: async (courseId: string, expectedRevision: number, file: File) => {
    const buffer = await file.arrayBuffer();
    return ggRequest<{ revision: number; next_action: string; message: string }>(
      `/courses/${encodeURIComponent(courseId)}/syllabus/pdf?expected_revision=${expectedRevision}`,
      { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: buffer },
    );
  },

  updateOutline: (
    courseId: string,
    input: { expected_revision: number; outline: GenOutline; approve: boolean; actor: string },
  ) => ggRequest<Record<string, unknown>>(`/courses/${encodeURIComponent(courseId)}/outline`, ggJson('PUT', input)),

  getChapter: (courseId: string, chapterId: string) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}`,
    ),
  getSourceReadiness: (courseId: string, chapterId: string) =>
    ggRequest<{ status: string; can_generate: boolean; counts: Record<string, number>; warnings: string[]; revision: number }>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/source-readiness`,
    ),
  getSourceRevisions: (courseId: string, chapterId: string) =>
    ggRequest<{ items: Array<Record<string, unknown>> }>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/source-revisions`,
    ),
  getChapterWorkflow: (courseId: string, chapterId: string) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/workflow`,
    ),

  attachChapterSources: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; source_id: string; slides: Array<{ page: number; text: string }> },
  ) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/sources`,
      ggJson('POST', input),
    ),

  /** Upload raw PDF bytes (max 32 MB / 2000 pages) for a chapter source */
  uploadChapterPdf: async (
    courseId: string,
    chapterId: string,
    sourceId: string,
    expectedRevision: number,
    file: File,
  ) => {
    const buffer = await file.arrayBuffer();
    return ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/pdf/${encodeURIComponent(sourceId)}?expected_revision=${expectedRevision}`,
      { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: buffer },
    );
  },

  generateChapter: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; kind: 'outline' | 'nodes' | 'relations'; budget_usd?: number },
  ) => {
    const path =
      input.kind === 'outline'
        ? `/courses/${encodeURIComponent(courseId)}/outline/generate`
        : `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/generate`;
    return ggRequest<GenJobResponse>(path, ggJson('POST', { budget_usd: 1, ...input }));
  },

  saveChapterDraft: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; draft: GenChapterDraft; actor: string },
  ) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/draft`,
      ggJson('PUT', input),
    ),

  approveChapterNodes: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; actor: string },
  ) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/approve-nodes`,
      ggJson('POST', input),
    ),

  rebaseChapter: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; actor: string },
  ) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/rebase`,
      ggJson('POST', input),
    ),

  publishChapter: (
    courseId: string,
    chapterId: string,
    input: { expected_revision: number; actor: string },
  ) =>
    ggRequest<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/publish`,
      ggJson('POST', input),
    ),

  getMasterGraph: (courseId: string, version?: number) => {
    const q = version != null ? `?version=${version}` : '';
    return ggRequest<{
      course_id: string;
      version: number;
      outline?: GenOutline;
      concepts?: GenConcept[];
      edges?: GenRelation[];
      nodes?: KnowledgeGraphData['nodes'];
    }>(`/courses/${encodeURIComponent(courseId)}/master${q}`);
  },

  /** Convert a Master snapshot from g4lms-graph-generator-service into KnowledgeGraphData */
  toKnowledgeGraphData: (
    courseId: string,
    master: {
      outline?: GenOutline;
      concepts?: GenConcept[];
      edges?: GenRelation[];
      nodes?: KnowledgeGraphData['nodes'];
    },
  ): KnowledgeGraphData => {
    if (Array.isArray(master.nodes) && Array.isArray(master.edges)) {
      return { nodes: master.nodes, edges: master.edges };
    }
    const nodes: KnowledgeGraphData['nodes'] = [
      {
        id: courseId,
        name: master.outline?.title ?? courseId,
        type: 'Course',
        description: master.outline?.description,
        properties: { code: courseId, status: 'approved' },
      },
    ];
    for (const lo of master.outline?.los ?? []) {
      nodes.push({
        id: lo.id,
        name: lo.name,
        type: 'LO',
        properties: { code: lo.id, bloom_level: lo.bloom_level, status: 'approved' },
      });
    }
    for (const c of master.concepts ?? []) {
      nodes.push({
        id: c.id,
        name: c.name,
        type: 'Concept',
        description: c.description,
        properties: {
          aliases: c.aliases,
          outcome: c.outcome,
          level: c.level,
          duration_min: c.duration_min,
          default_week: c.default_week,
          confidence: c.confidence,
          details: c.details,
          evidence: c.evidence,
          reuse_id: c.reuse_id,
          status: c.decision === 'approved' ? 'approved' : 'proposed',
        },
      });
    }
    const edges: KnowledgeGraphData['edges'] = (master.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      properties: {
        reason: e.reason,
        required_knowledge: e.required_knowledge,
        strength: e.strength,
        confidence: e.confidence,
        evidence: e.evidence,
        status: e.decision === 'approved' ? 'approved' : 'proposed',
      },
    }));
    return { nodes, edges };
  },

  getUsage: (courseId: string) =>
    ggRequest<Record<string, unknown>>(`/courses/${encodeURIComponent(courseId)}/usage`),
  getEvents: (courseId: string) =>
    ggRequest<Array<Record<string, unknown>>>(`/courses/${encodeURIComponent(courseId)}/events`),

  listJobs: (courseId?: string) =>
    ggRequest<GenJobResponse[]>(courseId ? `/jobs?course_id=${encodeURIComponent(courseId)}` : '/jobs'),
  getJob: (jobId: string) =>
    ggRequest<GenJobResponse>(`/jobs/${encodeURIComponent(jobId)}`),
  cancelJob: (jobId: string) =>
    ggRequest<GenJobResponse>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
  resumeJob: (jobId: string, body?: { budget_usd?: number; expected_revision?: number; actor?: string }) =>
    ggRequest<GenJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}/resume`,
      body ? ggJson('POST', body) : { method: 'POST' },
    ),

  pollJobUntilDone: async (
    jobId: string,
    onProgress?: (job: GenJobResponse) => void,
    intervalMs = 1500,
    maxAttempts = 120,
  ): Promise<GenJobResponse> => {
    for (let i = 0; i < maxAttempts; i += 1) {
      const job = await graphGenApi.getJob(jobId);
      onProgress?.(job);
      if (['completed', 'failed', 'budget_stop', 'cancelled'].includes(job.state)) {
        return job;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new GraphGenApiError('Tác vụ sinh đồ thị vượt quá thời gian chờ.', 408);
  },
};
