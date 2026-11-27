import type {
  AdminAnnouncementRecord, AdminCourseOption, AdminCourseRecord, AdminEnrollment, AdminStats, AdminStudentOption, AdminUser, Announcement, Assignment, AssignmentSubmissionRecord, AttendanceSession, ChapterLessonItem, ClusterView, ConversationMessage, ConversationSummary,
  CourseFile, CourseGraphDraftSummary, CourseOutlineData, CourseOverallGrade, CourseRecommendation, CourseRelationItem, CourseSection, CreateAnnouncementInput, CreateAssignmentInput, CreateAttendanceSessionInput,
  CreateConversationInput, CreateQuizInput, CreateTeacherCourseInput, DashboardData, HeatSpot, HomeSlide,
  KnowledgeEdgeType, KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeNodeType,
  LearningOutcome, LoginHeroStat, MessageContact, MessagePreview, NodeDetail, NodeEditorData,
  NotificationRecord, OutlineChapter, OutlineDraftResponse, OutlineState, PdfFile, ProfileDetails, PublicationStatusResponse, PublishCourseResponse, QueueSummary, Quiz, QuizAttempt, RelationEndpointOption, ReviewDecision, Role, Step3SnapshotSummary, Step3WorkspaceResponse, StudentAttendanceData,
  StudentCourse, StudentGradeItem, StudentGraph, StudentLearningProfile, SubmitAssignmentInput, SubmitQuizInput, TeacherCourse,
  TeacherCourseTopic, TeacherGradeRow, TeacherGraphData, UpdateAnnouncementInput, UpdateAssignmentInput, UpdateAttendanceSessionInput, UpdateGradebookRowInput, UpdateTeacherCourseInput, User, WorkflowJobResponse,
  ConceptQuiz, ContentHistoryItem, ContentItem, CourseConceptsContentOverview, UpsertConceptQuizInput,
} from '../src/types';
import * as data from './fixtures';
import { resolveRichConceptContent } from './conceptDetails';
import { quizFixtures } from './quizFixtures';
import {
  assignments, attendanceSessions, calendarEvents, conversationMessages, conversations, courseAnnouncements,
  courseOverallGrades, dashboardActivities, dsaTeacherCourseTopics, homepageSlides, loginHeroStats, messageContacts,
  networkCourseSections, notifications, profileDetails, studentCourseSections, studentGradesByCourse,
  teacherCourseTopics, teacherGradebook, teacherRoster,
} from './portalFixtures';

const wait = <T,>(value: T, ms = 100): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

function loadStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or private mode errors
  }
}

const attempts = new Map<string, QuizAttempt>();
const clusterViewStore = new Map<string, ClusterView>();

const rawKg = loadStorage<Record<string, KnowledgeGraphData>>('g4lms.mock.knowledgeGraphs', {});
const knowledgeGraphStore = new Map<string, KnowledgeGraphData>(Object.entries(rawKg));

function persistKnowledgeGraph(): void {
  const obj: Record<string, KnowledgeGraphData> = {};
  for (const [id, kg] of knowledgeGraphStore.entries()) {
    obj[id] = kg;
  }
  saveStorage('g4lms.mock.knowledgeGraphs', obj);
}

const teacherCoursesStore: TeacherCourse[] = loadStorage<TeacherCourse[]>(
  'g4lms.mock.teacherCourses',
  data.teacherCourses.map((c) => ({ ...c })),
);

function persistTeacherCourses(): void {
  saveStorage('g4lms.mock.teacherCourses', teacherCoursesStore);
}

const studentCoursesStore: StudentCourse[] = loadStorage<StudentCourse[]>(
  'g4lms.mock.studentCourses',
  data.studentCourses.map((c) => ({ ...c })),
);

function persistStudentCourses(): void {
  saveStorage('g4lms.mock.studentCourses', studentCoursesStore);
}

const uploadedFiles: CourseFile[] = loadStorage<CourseFile[]>('g4lms.mock.uploadedFiles', []);

function persistUploadedFiles(): void {
  saveStorage('g4lms.mock.uploadedFiles', uploadedFiles);
}

const pdfFilesStore: PdfFile[] = loadStorage<PdfFile[]>(
  'g4lms.mock.pdfFiles',
  data.pdfFiles.map((p) => ({ ...p })),
);

function persistPdfFiles(): void {
  saveStorage('g4lms.mock.pdfFiles', pdfFilesStore);
}

const courseSectionsStore: Record<string, CourseSection[]> = loadStorage<Record<string, CourseSection[]>>(
  'g4lms.mock.courseSections',
  {},
);

function persistCourseSections(): void {
  saveStorage('g4lms.mock.courseSections', courseSectionsStore);
}

const nodeEditorStore: Record<string, NodeEditorData> = loadStorage<Record<string, NodeEditorData>>(
  'g4lms.mock.nodeEditors',
  {},
);

function persistNodeEditors(): void {
  saveStorage('g4lms.mock.nodeEditors', nodeEditorStore);
}

interface AuthoringState {
  outline: CourseOutlineData;
  outlineState: OutlineState;
  outlineRevision: number;
  lessonsByChapter: Record<string, ChapterLessonItem[]>;
  relations: CourseRelationItem[];
  relationsByChapter?: Record<string, CourseRelationItem[]>;
  draftPhaseByChapter?: Record<string, OutlineChapter['draftPhase']>;
  needsRebaseByChapter?: Record<string, boolean>;
  publishedMasterVersionByChapter?: Record<string, number | null>;
  coursePublished?: boolean;
  relationRevision: number;
  masterVersion: number;
  snapshots?: Step3SnapshotSummary[];
  snapshotGraphs?: Record<string, KnowledgeGraphData>;
}

interface MockAuthoringJob {
  kind: 'outline' | 'lesson' | 'relation';
  courseId: string;
  chapterId?: string;
  chapterIds?: string[];
  idempotencyKey: string;
  polls: number;
  status: WorkflowJobResponse['status'];
  progress: number;
  canResume: boolean;
  resumeCount: number;
  maxResumeAttempts: number;
  revision: number;
}

const rawAuthoring = loadStorage<Record<string, AuthoringState>>('g4lms.mock.authoringState', {});
const authoringStore = new Map<string, AuthoringState>(Object.entries(rawAuthoring));
const authoringJobs = new Map<string, MockAuthoringJob>();

function persistAuthoring(): void {
  const obj: Record<string, AuthoringState> = {};
  for (const [id, st] of authoringStore.entries()) {
    obj[id] = st;
  }
  saveStorage('g4lms.mock.authoringState', obj);
}

function ensureAuthoringState(courseId: string): AuthoringState {
  if (!authoringStore.has(courseId)) {
    const course = teacherCoursesStore.find((c) => c.id === courseId || c.code.toLowerCase() === courseId.toLowerCase());
    const hasExistingKg =
      (course?.published && course.totalNodes > 0) ||
      Boolean(knowledgeGraphStore.get(courseId)?.nodes.some((n) => n.type !== 'Course'));

    if (hasExistingKg) {
      const baseSections = (courseId === 'CO3093' ? networkCourseSections : studentCourseSections).filter(
        (s) => !['announcements', 'assignments', 'quizzes', 'materials', 'overview'].includes(s.id),
      );
      authoringStore.set(courseId, {
        outline: {
          chapters: baseSections.map((s) => ({
            id: s.id,
            title: s.titleVi,
            loCodes: ['LO1'],
            state: 'PUBLISHED',
            revision: 1,
            documentCount: 1,
          })),
          learningOutcomes: data.learningOutcomes.map((lo) => ({
            code: lo.id,
            description: lo.title,
          })),
        },
        outlineState: 'OUTLINE_APPROVED',
        outlineRevision: 2,
        lessonsByChapter: {},
        relations: [],
        relationsByChapter: {},
        draftPhaseByChapter: Object.fromEntries(baseSections.map((s) => [s.id, 'ready' as const])),
        needsRebaseByChapter: {},
        publishedMasterVersionByChapter: Object.fromEntries(baseSections.map((s) => [s.id, 1])),
        coursePublished: Boolean(course?.published),
        relationRevision: 2,
        masterVersion: 1,
      });
    } else {
      authoringStore.set(courseId, {
        outline: { chapters: [], learningOutcomes: [] },
        outlineState: 'DRAFT',
        outlineRevision: 1,
        lessonsByChapter: {},
        relations: [],
        relationsByChapter: {},
        draftPhaseByChapter: {},
        needsRebaseByChapter: {},
        publishedMasterVersionByChapter: {},
        coursePublished: false,
        relationRevision: 1,
        masterVersion: 0,
      });
    }
    persistAuthoring();
  }
  const st = authoringStore.get(courseId)!;
  if (!st.relationsByChapter) st.relationsByChapter = {};
  if (!st.draftPhaseByChapter) st.draftPhaseByChapter = {};
  if (!st.needsRebaseByChapter) st.needsRebaseByChapter = {};
  if (!st.publishedMasterVersionByChapter) st.publishedMasterVersionByChapter = {};
  let migrated = false;
  const replaceSessionTerm = (s: string) =>
    s
      .replace(/liên chương/g, 'giữa các buổi học')
      .replace(/Chương(?!\s+trình)/g, 'Buổi học')
      .replace(/chương(?!\s+trình)/g, 'buổi học');

  st.outline.chapters.forEach((ch) => {
    const next = replaceSessionTerm(ch.title);
    if (next !== ch.title) {
      ch.title = next;
      migrated = true;
    }
  });
  st.relations.forEach((rel) => {
    if (rel.reason) {
      const next = replaceSessionTerm(rel.reason);
      if (next !== rel.reason) {
        rel.reason = next;
        migrated = true;
      }
    }
    if (rel.aiComment) {
      const next = replaceSessionTerm(rel.aiComment);
      if (next !== rel.aiComment) {
        rel.aiComment = next;
        migrated = true;
      }
    }
  });
  if (migrated) persistAuthoring();
  return st;
}

function normalizeKnowledgeEdgeType(kind: string): KnowledgeEdgeType {
  if (kind === 'prereq' || kind === 'PREREQUISITE') return 'PREREQUISITE';
  if (kind === 'PART_OF') return 'PART_OF';
  if (kind === 'DEVELOP') return 'DEVELOP';
  if (kind === 'EXPLAIN') return 'EXPLAIN';
  if (kind === 'ASSESS') return 'ASSESS';
  return 'RELATED_TO';
}

function buildFallbackKnowledgeGraph(courseId: string): KnowledgeGraphData {
  const course =
    teacherCoursesStore.find((c) => c.id === courseId) ??
    studentCoursesStore.find((c) => c.id === courseId);
  const courseTitle = course ? `${course.title} (${course.code})` : courseId;
  const base = courseId === 'CO3093' ? data.computerNetworksTeacherGraph : data.teacherGraph;
  const nodes: KnowledgeGraphNode[] = [
    {
      id: courseId,
      name: courseTitle,
      type: 'Course',
      description: `Đồ thị tri thức tổng hợp cho môn ${courseTitle}.`,
      properties: { code: course?.code ?? courseId },
    },
  ];
  const edges: KnowledgeGraphEdge[] = [];
  const nodeIds = new Set<string>([courseId]);

  const addNode = (node: KnowledgeGraphNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  data.learningOutcomes.forEach((lo, loIdx) => {
    const loId = `${courseId}.${lo.id}`;
    addNode({
      id: loId,
      name: lo.title,
      type: 'LO',
      description: `Chuẩn đầu ra ${lo.id} của môn ${courseTitle}.`,
      properties: { code: lo.id, default_week: loIdx + 1, duration_min: 30 },
    });
    edges.push({ source: loId, target: courseId, type: 'DEVELOP', properties: { status: 'approved', confidence: 0.96 } });
  });

  base.clusters.forEach((cluster) => {
    const chapterId = `ch${cluster.index}`;
    const clusterNodeId = `${courseId}_${cluster.id}`;
    const richCluster = resolveRichConceptContent(cluster.name);
    addNode({
      id: clusterNodeId,
      name: cluster.name,
      type: 'Concept',
      description: richCluster.description,
      properties: {
        chapter_id: chapterId,
        default_week: cluster.index,
        duration_min: 40,
        confidence: cluster.approved ? 0.92 : 0.78,
        level: 'topic',
        outcome: richCluster.outcome,
        details: richCluster.details,
        evidence: richCluster.evidence,
        status: cluster.approved ? 'approved' : 'proposed',
        node_count: cluster.nodeCount,
      },
    });
    cluster.lo.forEach((loCode) => {
      const loId = `${courseId}.${loCode}`;
      if (nodeIds.has(loId)) {
        edges.push({
          source: clusterNodeId,
          target: loId,
          type: 'DEVELOP',
          properties: {
            status: cluster.approved ? 'approved' : 'proposed',
            confidence: cluster.approved ? 0.92 : 0.72,
            reason: `Chủ đề ${cluster.name} phát triển trực tiếp chuẩn đầu ra ${loCode}.`,
          },
        });
      }
    });

    const inner =
      cluster.id === 'complexity'
        ? {
            nodes: [
              { id: 'c1', name: 'Khái niệm độ phức tạp', status: 'approved' as const, ghost: false },
              { id: 'c2', name: 'Ký pháp Big-O, Ω, Θ', status: 'approved' as const, ghost: false },
              { id: 'c3', name: 'Phân tích vòng lặp', status: 'approved' as const, ghost: false },
              { id: 'c4', name: 'Độ phức tạp đệ quy', status: 'proposed' as const, ghost: false },
              { id: 'c5', name: 'Độ phức tạp không gian', status: 'proposed' as const, ghost: false },
            ],
            edges: [
              { from: 'c1', to: 'c2', kind: 'prereq' as const },
              { from: 'c2', to: 'c3', kind: 'prereq' as const },
              { from: 'c3', to: 'c4', kind: 'prereq' as const },
              { from: 'c2', to: 'c5', kind: 'prereq' as const },
            ],
          }
        : data.buildClusterView(cluster.id);
    const firstInnerId = inner.nodes.find((n) => !n.ghost)?.id;
    if (firstInnerId) {
      edges.push({
        source: clusterNodeId,
        target: `${courseId}_${firstInnerId}`,
        type: 'PREREQUISITE',
        properties: { status: 'approved', confidence: 0.94, reason: `Nắm tổng quan ${cluster.name} trước khi đi vào chi tiết.` },
      });
    }
    inner.nodes
      .filter((n) => !n.ghost)
      .forEach((innerNode, idx) => {
        const subId = `${courseId}_${innerNode.id}`;
        const rich = resolveRichConceptContent(innerNode.name);
        addNode({
          id: subId,
          name: innerNode.name,
          type: 'Concept',
          description: rich.description,
          properties: {
            chapter_id: chapterId,
            default_week: cluster.index,
            duration_min: 20 + (idx % 4) * 10,
            confidence: innerNode.status === 'approved' ? 0.94 : 0.76,
            level: 'lesson',
            outcome: rich.outcome,
            details: rich.details,
            evidence: rich.evidence,
            status: innerNode.status === 'approved' ? 'approved' : 'proposed',
          },
        });
        edges.push({
          source: subId,
          target: clusterNodeId,
          type: 'PART_OF',
          properties: {
            status: innerNode.status === 'approved' ? 'approved' : 'proposed',
            confidence: innerNode.status === 'approved' ? 0.94 : 0.71,
            reason: `${innerNode.name} là khái niệm con thuộc ${cluster.name}.`,
          },
        });

        const slideId = `${subId}_slide_${idx + 1}`;
        const slideQuote =
          rich.evidence[0]?.quote ??
          rich.details[0]?.evidence?.[0]?.quote ??
          rich.description;
        addNode({
          id: slideId,
          name: `${rich.evidence[0]?.slideId ?? `Slide ${cluster.index}.${idx + 1}`}: ${innerNode.name}`,
          type: 'Content',
          description: slideQuote,
          properties: { chapter_id: chapterId, page: idx + 1 },
        });
        edges.push({
          source: slideId,
          target: subId,
          type: 'EXPLAIN',
          properties: { status: 'approved', confidence: 0.9 },
        });
      });

    inner.edges.forEach((edge) => {
      const s = `${courseId}_${edge.from}`;
      const t = `${courseId}_${edge.to}`;
      if (nodeIds.has(s) && nodeIds.has(t)) {
        edges.push({
          source: s,
          target: t,
          type: edge.kind === 'prereq' ? 'PREREQUISITE' : 'RELATED_TO',
          properties: {
            status: edge.kind === 'prereq' ? 'approved' : 'proposed',
            confidence: edge.kind === 'prereq' ? 0.88 : 0.74,
            reason: 'Quan hệ được AI trích xuất từ giáo trình môn học.',
          },
        });
      }
    });
  });

  base.clusterEdges.forEach((edge, idx) => {
    const s = `${courseId}_${edge.from}`;
    const t = `${courseId}_${edge.to}`;
    if (nodeIds.has(s) && nodeIds.has(t)) {
      edges.push({
        source: s,
        target: t,
        type: edge.kind === 'prereq' ? 'PREREQUISITE' : 'RELATED_TO',
        properties: {
          status: idx % 4 === 0 ? 'proposed' : 'approved',
          confidence: idx % 4 === 0 ? 0.73 : 0.91,
          reason:
            edge.kind === 'prereq'
              ? 'Cần nắm chủ đề trước để tiếp thu hiệu quả chủ đề sau.'
              : 'Hai chủ đề có mối liên hệ chéo trong chương trình.',
        },
      });
    }
  });

  const courseAssignments = assignments.filter((a) => a.courseId === courseId);
  courseAssignments.forEach((asg, idx) => {
    addNode({
      id: asg.id,
      name: asg.title,
      type: 'Assignment',
      description: asg.description,
      properties: { kind: 'assignment', status: asg.status },
    });
    const lo = data.learningOutcomes[idx % data.learningOutcomes.length];
    if (lo) {
      edges.push({
        source: asg.id,
        target: `${courseId}.${lo.id}`,
        type: 'DEVELOP',
        properties: { status: 'approved', confidence: 0.9 },
      });
    }
    const targetCluster = base.clusters[idx % base.clusters.length];
    if (targetCluster) {
      edges.push({
        source: asg.id,
        target: `${courseId}_${targetCluster.id}`,
        type: 'ASSESS',
        properties: { status: 'approved', confidence: 0.89 },
      });
    }
  });

  return { nodes, edges };
}

async function ensureKnowledgeGraph(courseId: string, forceGenerate = false): Promise<KnowledgeGraphData> {
  const normId = courseId.trim();
  if (!forceGenerate && knowledgeGraphStore.has(normId)) {
    const existing = knowledgeGraphStore.get(normId)!;
    if (existing.nodes.some((n) => n.type !== 'Course')) {
      const hasWeekData = existing.nodes.some((n) => n.type === 'Concept' && n.properties?.default_week != null);
      const hasRichDetails = existing.nodes.some(
        (n) => n.type === 'Concept' && (Array.isArray(n.properties?.details) || Array.isArray(n.properties?.aspects)),
      );
      const hasComplexityChain =
        normId !== 'CO2003' ||
        existing.edges.some((e) => e.source === 'CO2003_complexity' && e.target === 'CO2003_c1' && e.type === 'PREREQUISITE');
      if (hasWeekData && hasRichDetails && hasComplexityChain) {
        return existing;
      }
    }
  }

  // Build preview/published graph from D1–D5 authoring state if available for new courses
  if (!forceGenerate && authoringStore.has(normId)) {
    const st = ensureAuthoringState(normId);
    const readyChapters = st.outline.chapters.filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED');
    if (readyChapters.length > 0) {
      const course = teacherCoursesStore.find((c) => c.id === normId || c.code.toLowerCase() === normId.toLowerCase());
      const nodes: KnowledgeGraphNode[] = [
        {
          id: normId,
          name: course ? `${course.title} (${course.code})` : normId,
          type: 'Course',
          description: `Course Graph v${Math.max(1, st.masterVersion)}`,
          properties: { code: course?.code ?? normId },
        },
      ];
      const edges: KnowledgeGraphEdge[] = [];
      for (const lo of st.outline.learningOutcomes) {
        const loId = `${normId}.${lo.code.replace(/\./g, '')}`;
        nodes.push({ id: loId, name: `${lo.code}: ${lo.description}`, type: 'LO', properties: { code: lo.code, status: 'approved' } });
        edges.push({ source: loId, target: normId, type: 'DEVELOP', properties: { status: 'approved' } });
      }
      for (const ch of readyChapters) {
        const lessons = (st.lessonsByChapter[ch.id] ?? []).filter((l) => l.decision !== 'REJECT');
        lessons.forEach((l, idx) => {
          nodes.push({
            id: l.id,
            name: l.title,
            type: 'Concept',
            description: l.content,
            properties: { chapter_id: ch.id, default_week: l.defaultWeek ?? 1, status: 'approved', sourceRef: l.sourceRef },
          });
          const loCode = l.loCodes[0] ?? st.outline.learningOutcomes[0]?.code;
          if (loCode) {
            const loId = `${normId}.${loCode.replace(/\./g, '')}`;
            edges.push({ source: l.id, target: loId, type: 'DEVELOP', properties: { status: 'approved' } });
          }
          if (idx > 0) {
            edges.push({ source: lessons[idx - 1].id, target: l.id, type: 'PREREQUISITE', properties: { status: 'approved' } });
          }
        });
      }
      for (const rel of st.relations.filter((r) => r.decision !== 'REJECT')) {
        edges.push({
          source: rel.sourceId,
          target: rel.targetId,
          type: rel.relationType,
          properties: { status: 'approved', sourceRef: rel.sourceRef },
        });
      }
      const built = { nodes, edges };
      knowledgeGraphStore.set(normId, built);
      persistKnowledgeGraph();
      return built;
    }
  }

  // Pre-configured demo courses
  if (normId === 'CO3093' && typeof fetch === 'function') {
    try {
      const response = await fetch('/mockdata/prototypeGraph.json');
      if (response.ok) {
        const raw = (await response.json()) as KnowledgeGraphData;
        const cloned: KnowledgeGraphData = {
          nodes: raw.nodes.map((n) => {
            const props = { ...(n.properties ?? {}) };
            if (n.type === 'Concept' && !Array.isArray(props.details) && !Array.isArray(props.aspects)) {
              const rich = resolveRichConceptContent(n.name, n.description, typeof props.outcome === 'string' ? props.outcome : undefined);
              props.details = rich.details;
              if (!Array.isArray(props.evidence)) props.evidence = rich.evidence;
            }
            return { ...n, properties: props };
          }),
          edges: raw.edges.map((e) => ({ ...e, properties: { ...(e.properties ?? {}) } })),
        };
        knowledgeGraphStore.set(normId, cloned);
        persistKnowledgeGraph();
        return cloned;
      }
    } catch {
      // Fallback
    }
  }

  if (normId === 'CO2003') {
    const built = buildFallbackKnowledgeGraph(normId);
    knowledgeGraphStore.set(normId, built);
    persistKnowledgeGraph();
    return built;
  }

  // If AI generation is explicitly triggered from PDF upload
  if (forceGenerate) {
    const built = buildFallbackKnowledgeGraph(normId);
    knowledgeGraphStore.set(normId, built);
    persistKnowledgeGraph();
    return built;
  }

  // ALL other newly created courses start EMPTY
  const empty: KnowledgeGraphData = { nodes: [], edges: [] };
  knowledgeGraphStore.set(normId, empty);
  persistKnowledgeGraph();
  return empty;
}

const adminUsers: AdminUser[] = [
  { id: 'usr-admin-demo', email: 'admin@hcmut.edu.vn', name: 'Quản trị G4LMS', role: 'admin', createdAt: '2026-01-01T00:00:00Z', active: true },
  { id: 'usr-student-demo', email: 'sinhvien@hcmut.edu.vn', name: 'Nguyễn Anh', role: 'student', createdAt: '2026-01-02T00:00:00Z', active: true },
  { id: 'usr-teacher-demo', email: 'giangvien@hcmut.edu.vn', name: 'Nguyễn Văn Hùng', role: 'teacher', createdAt: '2026-01-03T00:00:00Z', active: true },
];
const adminEnrollments: AdminEnrollment[] = [
  {
    id: 'enr-demo-1',
    studentId: 'usr-student-demo',
    studentName: 'Nguyễn Anh',
    studentEmail: 'sinhvien@hcmut.edu.vn',
    courseId: 'CO3093',
    courseCode: 'CO3093',
    courseTitle: 'Mạng máy tính',
    enrolledAt: '2026-09-01T08:00:00Z',
    progress: 62,
  },
];
const adminAnnouncements: AdminAnnouncementRecord[] = [
  {
    id: 'ann_global_1',
    courseId: null,
    courseName: 'Toàn trường',
    title: 'Tuyển sinh sau đại học 2026',
    body: 'Phòng Đào tạo Sau đại học thông báo kế hoạch tuyển sinh đợt 1 năm 2026 cho các ngành Kỹ thuật Máy tính và Khoa học Máy tính.',
    status: 'published',
    isGlobal: true,
    authorName: 'Phòng Đào tạo',
    createdAt: '2026-11-10T08:00:00Z',
    publishedAt: '2026-11-10T08:00:00Z',
  },
  {
    id: 'ann_global_2',
    courseId: null,
    courseName: 'Toàn trường',
    title: 'Lịch thi cuối kỳ học kỳ 1 đã được công bố',
    body: 'Sinh viên kiểm tra lịch thi cuối kỳ chính thức và phòng thi trên cổng thông tin đào tạo.',
    status: 'published',
    isGlobal: true,
    authorName: 'Phòng Khảo thí & ĐBCL',
    createdAt: '2026-11-08T09:30:00Z',
    publishedAt: '2026-11-08T09:30:00Z',
  },
  {
    id: 'ann_global_3',
    courseId: null,
    courseName: 'Toàn trường',
    title: 'Hội thảo Công nghệ Phần mềm & AI trong Giáo dục',
    body: 'Khoa KH&KT Máy tính tổ chức hội thảo chuyên đề về ứng dụng Knowledge Graph và Microlearning trong đào tạo đại học.',
    status: 'published',
    isGlobal: true,
    authorName: 'Khoa KH&KT Máy tính',
    createdAt: '2026-11-05T14:00:00Z',
    publishedAt: '2026-11-05T14:00:00Z',
  },
];
const assignmentSubmissions: Record<string, AssignmentSubmissionRecord[]> = {
  'asg-1': [
    {
      id: 'sub-demo-1',
      studentId: '2252001',
      studentName: 'Nguyễn Anh',
      text: 'Báo cáo phân tích phiên bắt tay TCP 3 bước và cửa sổ tắc nghẽn cwnd trên Wireshark.',
      submittedAt: '2026-11-14T15:20:00+07:00',
      status: 'submitted',
      score: null,
      feedback: null,
    },
  ],
  'asg-2': [
    {
      id: 'sub-demo-2',
      studentId: '2252001',
      studentName: 'Nguyễn Anh',
      text: 'Đã nộp báo cáo phân tích HTTP/2, DNS caching và độ trễ truy vấn.',
      submittedAt: '2026-11-09T20:10:00+07:00',
      status: 'graded',
      score: 8.5,
      feedback: 'Phân tích tốt, cần bổ sung nguồn tham khảo.',
    },
  ],
};


function toMessagePreview(conversation: ConversationSummary): MessagePreview {
  return {
    id: conversation.id,
    initials: conversation.initials,
    sender: conversation.participantName,
    time: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(conversation.lastMessageAt)),
    preview: conversation.lastMessage,
    unread: conversation.unreadCount > 0,
  };
}

export const mockApi = {
  login(identity: string, _password: string, role: Role): Promise<User> {
    const teacher = role === 'teacher';
    const admin = role === 'admin';
    const email = identity || (admin ? 'admin@hcmut.edu.vn' : teacher ? 'giangvien@hcmut.edu.vn' : 'sinhvien@hcmut.edu.vn');
    const name = admin ? 'Quản trị G4LMS' : teacher ? 'Nguyễn Văn Hùng' : 'Nguyễn Anh';
    return wait({ id: admin ? 'usr-admin-demo' : 'usr-demo', name, initials: admin ? 'QT' : teacher ? 'NH' : 'NA', email, role, accessToken: 'demo-access-token' });
  },
  getAdminUsers: (): Promise<AdminUser[]> => wait(adminUsers.map((user) => ({ ...user }))),
  createAdminUser(input: { email: string; fullName: string; role: Role }): Promise<AdminUser> {
    if (adminUsers.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
      return Promise.reject(new Error('Email đã được sử dụng.'));
    }
    const user: AdminUser = {
      id: `usr-${Date.now()}`,
      email: input.email,
      name: input.fullName,
      role: input.role,
      createdAt: new Date().toISOString(),
      active: true,
    };
    adminUsers.unshift(user);
    return wait({ ...user });
  },
  updateAdminUser(
    userId: string,
    input: { fullName?: string; email?: string; role?: Role; active?: boolean },
  ): Promise<AdminUser> {
    const target = adminUsers.find((user) => user.id === userId);
    if (!target) return Promise.reject(new Error('Không tìm thấy tài khoản.'));
    if (input.email !== undefined) {
      const nextEmail = input.email.trim();
      if (!nextEmail || !nextEmail.includes('@')) {
        return Promise.reject(new Error('Email không hợp lệ.'));
      }
      if (adminUsers.some((u) => u.id !== userId && u.email.toLowerCase() === nextEmail.toLowerCase())) {
        return Promise.reject(new Error('Email đã được sử dụng bởi tài khoản khác.'));
      }
      target.email = nextEmail;
    }
    if (input.fullName !== undefined) {
      const nextName = input.fullName.trim();
      if (!nextName) return Promise.reject(new Error('Họ tên không được để trống.'));
      target.name = nextName;
    }
    if (input.role !== undefined && target.role !== 'admin') {
      target.role = input.role;
    }
    if (input.active !== undefined && target.role !== 'admin') {
      target.active = input.active;
    }
    return wait({ ...target });
  },
  resetAdminUserPassword(userId: string): Promise<void> {
    if (!adminUsers.some((user) => user.id === userId && user.active)) {
      return Promise.reject(new Error('Không tìm thấy tài khoản.'));
    }
    return wait(undefined);
  },
  deleteAdminUser(userId: string): Promise<void> {
    const target = adminUsers.find((user) => user.id === userId);
    if (!target || target.role === 'admin') return Promise.reject(new Error('Không thể xóa tài khoản này.'));
    target.active = false;
    return wait(undefined);
  },
  getAdminEnrollments(): Promise<{
    students: AdminStudentOption[];
    courses: AdminCourseOption[];
    enrollments: AdminEnrollment[];
  }> {
    const students = adminUsers.filter((user) => user.active && user.role === 'student')
      .map(({ id, name, email }) => ({ id, name, email }));
    const courses = teacherCoursesStore.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      semester: 'HK261',
      year: 2026,
    }));
    return wait({ students, courses, enrollments: adminEnrollments.map((enrollment) => ({ ...enrollment })) });
  },
  createAdminEnrollment(input: { studentId: string; courseId: string }): Promise<AdminEnrollment> {
    const student = adminUsers.find((user) => user.id === input.studentId && user.role === 'student' && user.active);
    const course = teacherCoursesStore.find((item) => item.id === input.courseId);
    if (!student || !course) return Promise.reject(new Error('Không tìm thấy sinh viên hoặc khóa học.'));
    if (adminEnrollments.some((item) => item.studentId === input.studentId && item.courseId === input.courseId)) {
      return Promise.reject(new Error('Sinh viên đã được ghi danh khóa học này.'));
    }
    const enrollment: AdminEnrollment = {
      id: `enr-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      courseId: course.id,
      courseCode: course.code,
      courseTitle: course.title,
      enrolledAt: new Date().toISOString(),
      progress: 0,
    };
    adminEnrollments.unshift(enrollment);
    return wait({ ...enrollment });
  },
  deleteAdminEnrollment(enrollmentId: string): Promise<void> {
    const index = adminEnrollments.findIndex((item) => item.id === enrollmentId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy bản ghi ghi danh.'));
    adminEnrollments.splice(index, 1);
    return wait(undefined);
  },
  getAdminStats(): Promise<AdminStats> {
    const activeUsers = adminUsers.filter((u) => u.active);
    const teachersList = activeUsers
      .filter((u) => u.role === 'teacher')
      .map(({ id, name, email }) => ({ id, name, email }));
    return wait({
      students: activeUsers.filter((u) => u.role === 'student').length + teacherRoster.length,
      teachers: teachersList.length,
      admins: activeUsers.filter((u) => u.role === 'admin').length,
      courses: teacherCoursesStore.length,
      enrollments: adminEnrollments.length + teacherRoster.length,
      assignments: assignments.length,
      announcements: adminAnnouncements.length + courseAnnouncements.length,
      teachersList,
    });
  },
  getAdminCourses(): Promise<AdminCourseRecord[]> {
    const defaultTeacher = adminUsers.find((u) => u.role === 'teacher' && u.active);
    return wait(
      teacherCoursesStore.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description ?? 'Học phần thuộc chương trình đào tạo chuẩn G4LMS.',
        faculty: course.faculty,
        semester: course.semester ?? 'HK261',
        year: course.year ?? 2026,
        theme: course.theme,
        published: course.published,
        lecturerId: defaultTeacher?.id ?? 'usr-teacher-demo',
        lecturerName: defaultTeacher?.name ?? 'Nguyễn Văn Hùng',
        students: course.students,
      })),
    );
  },
  createAdminCourse(input: {
    code: string;
    title: string;
    description?: string;
    faculty: string;
    semester?: string;
    year?: number;
    theme?: TeacherCourse['theme'];
    published?: boolean;
    lecturerId?: string | null;
  }): Promise<AdminCourseRecord> {
    if (teacherCoursesStore.some((item) => item.code.toLowerCase() === input.code.toLowerCase())) {
      return Promise.reject(new Error('Khóa học với mã này đã tồn tại.'));
    }
    const teacher = adminUsers.find((u) => u.id === input.lecturerId && u.role === 'teacher');
    const created: TeacherCourse = {
      id: input.code.toUpperCase(),
      code: input.code.toUpperCase(),
      title: input.title,
      description: input.description ?? '',
      faculty: input.faculty,
      semester: input.semester ?? 'HK261',
      year: input.year ?? 2026,
      theme: input.theme ?? 'blue',
      students: 0,
      published: input.published ?? true,
      nodesWithContent: 0,
      totalNodes: 0,
    };
    teacherCoursesStore.unshift(created);
    persistTeacherCourses();
    return wait({
      id: created.id,
      code: created.code,
      title: created.title,
      description: created.description ?? '',
      faculty: created.faculty,
      semester: created.semester ?? 'HK261',
      year: created.year ?? 2026,
      theme: created.theme,
      published: created.published,
      lecturerId: teacher?.id ?? null,
      lecturerName: teacher?.name ?? '',
      students: 0,
      createdAt: new Date().toISOString(),
    });
  },
  updateAdminCourse(courseId: string, input: UpdateTeacherCourseInput): Promise<AdminCourseRecord> {
    const course = teacherCoursesStore.find((item) => item.id === courseId);
    if (!course) return Promise.reject(new Error('Không tìm thấy khóa học.'));
    if (input.code !== undefined) course.code = input.code;
    if (input.title !== undefined) course.title = input.title;
    if (input.description !== undefined) course.description = input.description;
    if (input.faculty !== undefined) course.faculty = input.faculty;
    if (input.semester !== undefined) course.semester = input.semester;
    if (input.year !== undefined) course.year = input.year;
    if (input.theme !== undefined) course.theme = input.theme;
    if (input.published !== undefined) course.published = input.published;
    persistTeacherCourses();
    const teacher = adminUsers.find((u) => u.id === input.lecturerId && u.role === 'teacher');
    return wait({
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.description ?? '',
      faculty: course.faculty,
      semester: course.semester ?? 'HK261',
      year: course.year ?? 2026,
      theme: course.theme,
      published: course.published,
      lecturerId: teacher?.id ?? input.lecturerId ?? 'usr-teacher-demo',
      lecturerName: teacher?.name ?? 'Nguyễn Văn Hùng',
      students: course.students,
    });
  },
  deleteAdminCourse(courseId: string): Promise<void> {
    const index = teacherCoursesStore.findIndex((item) => item.id === courseId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy khóa học.'));
    teacherCoursesStore.splice(index, 1);
    persistTeacherCourses();
    return wait(undefined);
  },
  getAdminAnnouncements(): Promise<AdminAnnouncementRecord[]> {
    const courseItems: AdminAnnouncementRecord[] = courseAnnouncements.map((item) => ({
      id: item.id,
      courseId: item.courseId,
      courseName: item.courseId,
      title: item.title,
      body: item.body,
      status: item.status,
      isGlobal: false,
      authorName: 'Giảng viên',
      createdAt: item.createdAt,
      publishedAt: item.publishedAt ?? null,
    }));
    return wait([...adminAnnouncements, ...courseItems]);
  },
  createAdminAnnouncement(input: {
    title: string;
    body: string;
    courseId?: string | null;
    isGlobal?: boolean;
    status?: 'draft' | 'published';
  }): Promise<AdminAnnouncementRecord> {
    const now = new Date().toISOString();
    const isGlobal = input.isGlobal ?? !input.courseId;
    const course = teacherCoursesStore.find((c) => c.id === input.courseId);
    const record: AdminAnnouncementRecord = {
      id: `ann-admin-${Date.now()}`,
      courseId: isGlobal ? null : (input.courseId ?? null),
      courseName: isGlobal ? 'Toàn trường' : (course ? `${course.code} - ${course.title}` : (input.courseId ?? 'Khóa học')),
      title: input.title.trim(),
      body: input.body.trim(),
      status: input.status ?? 'published',
      isGlobal,
      authorName: 'Quản trị G4LMS',
      createdAt: now,
      publishedAt: (input.status ?? 'published') === 'published' ? now : null,
    };
    adminAnnouncements.unshift(record);
    return wait({ ...record });
  },
  updateAdminAnnouncement(
    announcementId: string,
    input: { title?: string; body?: string; status?: 'draft' | 'published'; isGlobal?: boolean },
  ): Promise<AdminAnnouncementRecord> {
    const target = adminAnnouncements.find((item) => item.id === announcementId);
    if (!target) return Promise.reject(new Error('Không tìm thấy thông báo.'));
    if (input.title !== undefined) target.title = input.title.trim();
    if (input.body !== undefined) target.body = input.body.trim();
    if (input.status !== undefined) {
      target.status = input.status;
      target.publishedAt = input.status === 'published' ? new Date().toISOString() : null;
    }
    if (input.isGlobal !== undefined) target.isGlobal = input.isGlobal;
    return wait({ ...target });
  },
  deleteAdminAnnouncement(announcementId: string): Promise<void> {
    const index = adminAnnouncements.findIndex((item) => item.id === announcementId);
    if (index >= 0) {
      adminAnnouncements.splice(index, 1);
      return wait(undefined);
    }
    const courseIdx = courseAnnouncements.findIndex((item) => item.id === announcementId);
    if (courseIdx >= 0) {
      courseAnnouncements.splice(courseIdx, 1);
      return wait(undefined);
    }
    return Promise.reject(new Error('Không tìm thấy thông báo.'));
  },
  getHomeAnnouncements(): Promise<AdminAnnouncementRecord[]> {
    return wait(adminAnnouncements.filter((item) => item.status === 'published').map((item) => ({ ...item })));
  },

  getDashboard: (): Promise<DashboardData> => wait({
    activities: dashboardActivities,
    calendarEvents,
  }),
  getHomeSlides: (): Promise<HomeSlide[]> => wait(homepageSlides),
  getLoginHeroStats: (): Promise<LoginHeroStat[]> => wait(loginHeroStats),
  getProfileDetails: (role: Role): Promise<ProfileDetails> =>
    wait(role === 'teacher' ? profileDetails.teacher : profileDetails.student),
  getNotifications: (): Promise<NotificationRecord[]> => wait(notifications),
  markNotificationsRead: (): Promise<void> => {
    notifications.forEach((notification) => { notification.read = true; });
    return wait(undefined);
  },
  getMessages: (): Promise<MessagePreview[]> => wait(conversations.map(toMessagePreview)),
  getConversations: (): Promise<ConversationSummary[]> => wait([...conversations]),
  getMessageContacts: (): Promise<MessageContact[]> => wait([...messageContacts]),
  getConversationMessages: (conversationId: string): Promise<ConversationMessage[]> => {
    if (!conversations.some((conversation) => conversation.id === conversationId)) {
      return Promise.reject(new Error('Không tìm thấy cuộc trò chuyện.'));
    }
    return wait([...(conversationMessages[conversationId] ?? [])]);
  },
  createConversation(input: CreateConversationInput): Promise<ConversationSummary> {
    const contact = messageContacts.find((item) => item.id === input.recipientId);
    if (!contact) return Promise.reject(new Error('Người nhận không khả dụng.'));
    if (!input.message.trim()) return Promise.reject(new Error('Tin nhắn không được để trống.'));
    const now = new Date().toISOString();
    const existing = conversations.find((item) => item.participantId === contact.id);
    const conversation: ConversationSummary = existing ?? {
      id: `conv-${Date.now()}`,
      participantId: contact.id,
      participantName: contact.name,
      initials: contact.initials,
      courseCode: contact.courseCode,
      lastMessage: '',
      lastMessageAt: now,
      unreadCount: 0,
    };
    if (!existing) conversations.unshift(conversation);
    const message: ConversationMessage = {
      id: `msg-${Date.now()}`,
      conversationId: conversation.id,
      senderId: 'usr-demo',
      senderName: 'Nguyễn Anh',
      body: input.message.trim(),
      sentAt: now,
    };
    conversationMessages[conversation.id] = [...(conversationMessages[conversation.id] ?? []), message];
    conversation.lastMessage = message.body;
    conversation.lastMessageAt = now;
    conversation.unreadCount = 0;
    return wait(conversation);
  },
  sendMessage(conversationId: string, body: string): Promise<ConversationMessage> {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return Promise.reject(new Error('Không tìm thấy cuộc trò chuyện.'));
    if (!body.trim()) return Promise.reject(new Error('Tin nhắn không được để trống.'));
    const message: ConversationMessage = {
      id: `msg-${Date.now()}`,
      conversationId,
      senderId: 'usr-demo',
      senderName: 'Nguyễn Anh',
      body: body.trim(),
      sentAt: new Date().toISOString(),
    };
    conversationMessages[conversationId] = [...(conversationMessages[conversationId] ?? []), message];
    conversation.lastMessage = message.body;
    conversation.lastMessageAt = message.sentAt;
    return wait(message);
  },
  markConversationRead(conversationId: string): Promise<void> {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return Promise.reject(new Error('Không tìm thấy cuộc trò chuyện.'));
    conversation.unreadCount = 0;
    return wait(undefined);
  },
  getStudentCourses: (): Promise<StudentCourse[]> => wait(studentCoursesStore.map((c) => ({ ...c }))),
  getTeacherCourses: (): Promise<TeacherCourse[]> => wait(teacherCoursesStore.map((c) => ({ ...c }))),
  createTeacherCourse(input: CreateTeacherCourseInput): Promise<TeacherCourse> {
    const code = input.code.trim().toUpperCase();
    if (teacherCoursesStore.some((item) => item.code.toUpperCase() === code || item.id === code)) {
      return Promise.reject(new Error('Khóa học với mã này đã tồn tại.'));
    }
    const course: TeacherCourse = {
      ...input,
      id: code,
      code,
      theme: input.theme ?? 'orange',
      students: 0,
      published: false,
      nodesWithContent: 0,
      totalNodes: 0,
    };
    teacherCoursesStore.unshift(course);
    persistTeacherCourses();

    const studentCourse: StudentCourse = {
      id: code,
      code,
      title: input.title,
      description: input.description ?? '',
      lecturer: 'Nguyễn Văn Hùng',
      semester: input.semester ?? 'HK1',
      year: input.year ?? 2026,
      theme: input.theme ?? 'orange',
      faculty: input.faculty,
      progress: 0,
      gap: 'Chưa có dữ liệu',
      deadline: 'Tuần này',
    };
    if (!studentCoursesStore.some((s) => s.id === code)) {
      studentCoursesStore.unshift(studentCourse);
      persistStudentCourses();
    }

    return wait({ ...course });
  },
  updateTeacherCourse(courseId: string, input: UpdateTeacherCourseInput): Promise<TeacherCourse> {
    const course = teacherCoursesStore.find((item) => item.id === courseId);
    if (!course) return Promise.reject(new Error('Không tìm thấy khóa học.'));
    if (input.code !== undefined) course.code = input.code;
    if (input.title !== undefined) course.title = input.title;
    if (input.description !== undefined) course.description = input.description;
    if (input.faculty !== undefined) course.faculty = input.faculty;
    if (input.semester !== undefined) course.semester = input.semester;
    if (input.year !== undefined) course.year = input.year;
    if (input.theme !== undefined) course.theme = input.theme;
    if (input.published !== undefined) course.published = input.published;
    persistTeacherCourses();

    const sc = studentCoursesStore.find((s) => s.id === courseId);
    if (sc) {
      if (input.code !== undefined) sc.code = input.code;
      if (input.title !== undefined) sc.title = input.title;
      if (input.theme !== undefined) sc.theme = input.theme;
      persistStudentCourses();
    }

    return wait({ ...course });
  },
  deleteTeacherCourse(courseId: string): Promise<void> {
    const index = teacherCoursesStore.findIndex((item) => item.id === courseId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy khóa học.'));
    teacherCoursesStore.splice(index, 1);
    persistTeacherCourses();

    const sIndex = studentCoursesStore.findIndex((s) => s.id === courseId);
    if (sIndex >= 0) {
      studentCoursesStore.splice(sIndex, 1);
      persistStudentCourses();
    }

    return wait(undefined);
  },
  getCourseSections: (courseId: string): Promise<CourseSection[]> => {
    const base =
      courseId === 'CO3093'
        ? networkCourseSections
        : courseId === 'CO2003'
          ? studentCourseSections
          : [];
    return wait(courseSectionsStore[courseId] ?? base);
  },
  createCourseSection: (courseId: string, input: { titleVi: string; titleEn?: string }): Promise<CourseSection> => {
    const base =
      courseId === 'CO3093'
        ? networkCourseSections
        : courseId === 'CO2003'
          ? studentCourseSections
          : [];
    if (!courseSectionsStore[courseId]) {
      courseSectionsStore[courseId] = base.map((s) => ({ ...s, items: [...s.items] }));
    }
    const titleVi = input.titleVi.trim();
    const titleEn = (input.titleEn ?? input.titleVi).trim();
    const created: CourseSection = {
      id: `ch-custom-${Date.now()}`,
      titleVi,
      titleEn,
      items: [],
    };
    courseSectionsStore[courseId].push(created);
    persistCourseSections();
    return wait(created);
  },
  getStudentGrades: (courseId: string): Promise<StudentGradeItem[]> => wait(studentGradesByCourse[courseId] ?? []),
  getStudentGradeSummary: (): Promise<CourseOverallGrade[]> => wait(courseOverallGrades),
  getStudentAttendance(courseId: string): Promise<StudentAttendanceData> {
    const studentId = '2252001';
    const records = attendanceSessions
      .filter((session) => session.courseId === courseId && session.status === 'published')
      .flatMap((session) => {
        const entry = session.records.find((record) => record.studentId === studentId);
        return entry && entry.status !== 'unmarked'
          ? [{ sessionId: session.id, title: session.title, date: session.date, status: entry.status }]
          : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const counts = {
      present: records.filter((record) => record.status === 'present').length,
      absent: records.filter((record) => record.status === 'absent').length,
      late: records.filter((record) => record.status === 'late').length,
      excused: records.filter((record) => record.status === 'excused').length,
    };
    const totalSessions = records.length;
    const attended = counts.present + counts.late + counts.excused;
    return wait({
      totalSessions,
      ...counts,
      attendanceRate: totalSessions ? Math.round(attended / totalSessions * 100) : 0,
      records,
    });
  },
  getTeacherAttendance(courseId: string): Promise<AttendanceSession[]> {
    return wait(attendanceSessions.filter((session) => session.courseId === courseId));
  },
  createAttendanceSession(courseId: string, input: CreateAttendanceSessionInput): Promise<AttendanceSession> {
    if (!input.title.trim()) return Promise.reject(new Error('Tên buổi học không được để trống.'));
    if (attendanceSessions.some((session) => session.courseId === courseId && session.date === input.date)) {
      return Promise.reject(new Error('Đã có buổi điểm danh vào ngày này.'));
    }
    const session: AttendanceSession = {
      id: `attendance-${Date.now()}`,
      courseId,
      title: input.title.trim(),
      date: input.date,
      status: 'draft',
      records: teacherRoster.map((student) => ({
        studentId: student.id, name: student.name, status: 'unmarked',
      })),
    };
    attendanceSessions.unshift(session);
    return wait(session);
  },
  updateAttendanceSession(
    courseId: string,
    sessionId: string,
    input: UpdateAttendanceSessionInput,
  ): Promise<AttendanceSession> {
    const session = attendanceSessions.find((item) => item.courseId === courseId && item.id === sessionId);
    if (!session) return Promise.reject(new Error('Không tìm thấy buổi điểm danh.'));
    const rosterIds = new Set(teacherRoster.map((student) => student.id));
    const submittedIds = new Set(input.records.map((record) => record.studentId));
    if (submittedIds.size !== rosterIds.size || [...rosterIds].some((id) => !submittedIds.has(id))) {
      return Promise.reject(new Error('Danh sách điểm danh không khớp với danh sách học viên.'));
    }
    if (input.status === 'published' && input.records.some((record) => record.status === 'unmarked')) {
      return Promise.reject(new Error('Cần điểm danh đầy đủ trước khi công bố.'));
    }
    session.records = input.records.map((record) => ({
      ...record,
      name: teacherRoster.find((student) => student.id === record.studentId)?.name ?? record.name,
    }));
    session.status = input.status;
    return wait(session);
  },
  deleteAttendanceSession(courseId: string, sessionId: string): Promise<void> {
    const index = attendanceSessions.findIndex((item) => item.courseId === courseId && item.id === sessionId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy buổi điểm danh.'));
    attendanceSessions.splice(index, 1);
    return wait(undefined);
  },
  getTeacherRoster: (_courseId: string) =>
    wait(
      teacherRoster.map((student) => ({
        ...student,
        email: student.email ?? `${student.id}@hcmut.edu.vn`,
        enrolledAt: student.enrolledAt ?? '2026-09-01T08:00:00Z',
      })),
    ),
  getTeacherGradebook: (_courseId: string): Promise<TeacherGradeRow[]> => wait(teacherGradebook),
  updateTeacherGradebookRow(
    _courseId: string,
    studentId: string,
    input: UpdateGradebookRowInput,
  ): Promise<TeacherGradeRow> {
    const row = teacherGradebook.find((item) => item.id === studentId);
    if (!row) return Promise.reject(new Error('Không tìm thấy sinh viên trong bảng điểm.'));
    row.midterm = input.midterm;
    row.project = input.project;
    row.final = input.final;
    row.attendance = input.attendance;
    row.totalScore =
      row.midterm !== null && row.project !== null && row.final !== null && row.attendance !== null
        ? Number((row.midterm * 0.3 + row.project * 0.25 + row.final * 0.35 + (row.attendance / 10) * 0.1).toFixed(1))
        : null;
    return wait({ ...row });
  },
  getTeacherCourseTopics: (courseId: string): Promise<TeacherCourseTopic[]> =>
    wait(courseId === 'CO3093' ? teacherCourseTopics : dsaTeacherCourseTopics),
  getAssignments(courseId: string, role: Role): Promise<Assignment[]> {
    const rows = assignments
      .filter((item) => item.courseId === courseId && (role === 'teacher' || item.status === 'published'))
      .map((item) => {
        const subs = assignmentSubmissions[item.id] ?? [];
        return {
          ...item,
          submissionCount: subs.length,
          gradedCount: subs.filter((s) => s.score !== null).length,
        };
      });
    return wait(rows);
  },
  getAnnouncements(courseId: string, role: Role): Promise<Announcement[]> {
    return wait(courseAnnouncements.filter((item) => item.courseId === courseId && (role === 'teacher' || item.status === 'published')));
  },
  createAnnouncement(courseId: string, input: CreateAnnouncementInput): Promise<Announcement> {
    const now = new Date().toISOString();
    const item: Announcement = {
      ...input,
      id: `ann-${Date.now()}`,
      courseId,
      status: 'draft',
      authorName: 'Nguyễn Văn Hùng',
      createdAt: now,
    };
    courseAnnouncements.unshift(item);
    return wait(item);
  },
  updateAnnouncementStatus(courseId: string, announcementId: string, status: Announcement['status']): Promise<Announcement> {
    const item = courseAnnouncements.find((entry) => entry.courseId === courseId && entry.id === announcementId);
    if (!item) return Promise.reject(new Error('Không tìm thấy thông báo.'));
    item.status = status;
    item.publishedAt = status === 'published' ? new Date().toISOString() : undefined;
    return wait({ ...item });
  },
  updateAnnouncement(courseId: string, announcementId: string, input: UpdateAnnouncementInput): Promise<Announcement> {
    const item = courseAnnouncements.find((entry) => entry.courseId === courseId && entry.id === announcementId);
    if (!item) return Promise.reject(new Error('Không tìm thấy thông báo.'));
    if (input.title !== undefined) item.title = input.title.trim();
    if (input.body !== undefined) item.body = input.body.trim();
    if (input.status !== undefined) {
      item.status = input.status;
      item.publishedAt = input.status === 'published' ? (item.publishedAt ?? new Date().toISOString()) : undefined;
    }
    return wait({ ...item });
  },
  deleteAnnouncement(courseId: string, announcementId: string): Promise<void> {
    const index = courseAnnouncements.findIndex((entry) => entry.courseId === courseId && entry.id === announcementId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy thông báo.'));
    courseAnnouncements.splice(index, 1);
    return wait(undefined);
  },
  createAssignment(courseId: string, input: CreateAssignmentInput): Promise<Assignment> {
    const assignment: Assignment = {
      ...input,
      id: `asg-${Date.now()}`,
      courseId,
      status: 'draft',
      submissionCount: 0,
      gradedCount: 0,
    };
    assignments.unshift(assignment);
    return wait(assignment);
  },
  updateAssignmentStatus(courseId: string, assignmentId: string, status: Assignment['status']): Promise<Assignment> {
    const assignment = assignments.find((item) => item.courseId === courseId && item.id === assignmentId);
    if (!assignment) return Promise.reject(new Error('Không tìm thấy bài tập.'));
    assignment.status = status;
    return wait({ ...assignment });
  },
  updateAssignment(courseId: string, assignmentId: string, input: UpdateAssignmentInput): Promise<Assignment> {
    const assignment = assignments.find((item) => item.courseId === courseId && item.id === assignmentId);
    if (!assignment) return Promise.reject(new Error('Không tìm thấy bài tập.'));
    if (input.title !== undefined) assignment.title = input.title.trim();
    if (input.description !== undefined) assignment.description = input.description.trim();
    if (input.dueAt !== undefined) assignment.dueAt = input.dueAt;
    if (input.maxScore !== undefined) assignment.maxScore = input.maxScore;
    if (input.status !== undefined) assignment.status = input.status;
    return wait({ ...assignment });
  },
  deleteAssignment(courseId: string, assignmentId: string): Promise<void> {
    const index = assignments.findIndex((item) => item.courseId === courseId && item.id === assignmentId);
    if (index < 0) return Promise.reject(new Error('Không tìm thấy bài tập.'));
    assignments.splice(index, 1);
    return wait(undefined);
  },
  submitAssignment(courseId: string, assignmentId: string, input: SubmitAssignmentInput): Promise<Assignment> {
    const assignment = assignments.find((item) => item.courseId === courseId && item.id === assignmentId);
    if (!assignment || assignment.status !== 'published') return Promise.reject(new Error('Bài tập không khả dụng.'));
    const now = new Date().toISOString();
    assignment.submissionText = input.text;
    assignment.submissionStatus = 'submitted';
    assignment.submittedAt = now;
    const existingList = assignmentSubmissions[assignmentId] ?? [];
    const existing = existingList.find((item) => item.studentId === '2252001');
    if (existing) {
      existing.text = input.text;
      existing.submittedAt = now;
      existing.status = 'submitted';
    } else {
      existingList.unshift({
        id: `sub-${Date.now()}`,
        studentId: '2252001',
        studentName: 'Nguyễn Anh',
        text: input.text,
        submittedAt: now,
        status: 'submitted',
        score: null,
        feedback: null,
      });
    }
    assignmentSubmissions[assignmentId] = existingList;
    return wait({ ...assignment });
  },
  getAssignmentSubmissions(_courseId: string, assignmentId: string): Promise<AssignmentSubmissionRecord[]> {
    return wait((assignmentSubmissions[assignmentId] ?? []).map((item) => ({ ...item })));
  },
  gradeSubmission(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    input: { score: number; feedback?: string | null },
  ): Promise<AssignmentSubmissionRecord> {
    const assignment = assignments.find((item) => item.courseId === courseId && item.id === assignmentId);
    if (!assignment) return Promise.reject(new Error('Không tìm thấy bài tập.'));
    if (input.score < 0 || input.score > assignment.maxScore) {
      return Promise.reject(new Error('Điểm không hợp lệ.'));
    }
    const list = assignmentSubmissions[assignmentId] ?? [];
    const target = list.find((item) => item.id === submissionId);
    if (!target) return Promise.reject(new Error('Không tìm thấy bài nộp.'));
    target.score = input.score;
    target.feedback = input.feedback ?? null;
    target.status = 'graded';
    if (target.studentId === '2252001') {
      assignment.score = input.score;
      assignment.feedback = input.feedback ?? null;
      assignment.submissionStatus = 'graded';
    }
    return wait({ ...target });
  },
  getStudentLearningProfile(courseId?: string): Promise<StudentLearningProfile> {
    const courses = data.studentCourses
      .filter((c) => !courseId || c.id === courseId)
      .map((c) => ({
        courseId: c.id,
        courseCode: c.code,
        courseTitle: c.title,
        progress: c.progress,
        gap: c.gap,
        totalNodes: 12,
        masteredNodes: Math.round((c.progress / 100) * 12),
        inProgressNodes: 3,
        averageMastery: c.progress,
      }));
    const graph = courseId === 'CO3093' ? data.computerNetworksOverview : data.studentOverview;
    const knowledgeGaps = graph.nodes
      .filter((n) => (n.mastery ?? 0) < 80)
      .slice(0, 6)
      .map((n) => ({
        id: n.id,
        title: n.label,
        courseId: courseId ?? 'CO3093',
        courseCode: courseId ?? 'CO3093',
        cluster: n.sub ?? 'Trọng tâm',
        mastery: n.mastery ?? 40,
        lo: n.lo ?? 'LO1',
      }));
    return wait({
      studentId: '2252001',
      overallProgress: courses.length ? Math.round(courses.reduce((s, c) => s + c.progress, 0) / courses.length) : 0,
      courses,
      knowledgeGaps,
    });
  },
  getCourseRecommendations(courseId: string): Promise<CourseRecommendation[]> {
    const graph = courseId === 'CO3093' ? data.computerNetworksOverview : data.studentOverview;
    const items: CourseRecommendation[] = graph.nodes
      .filter((n) => (n.mastery ?? 0) < 80)
      .slice(0, 5)
      .map((n, index) => ({
        nodeId: n.id,
        title: n.label,
        subtitle: n.sub,
        clusterName: n.tag ?? 'Cụm kiến thức trọng tâm',
        learningOutcomeId: n.lo ?? 'LO2',
        currentMastery: n.mastery ?? 35,
        aiHint: `Ôn tập khái niệm ${n.label} và hoàn thành bài quiz ngắn để nâng mức thành thạo lên trên 80%.`,
        score: Number((0.92 - index * 0.08).toFixed(2)),
        reason: (n.mastery ?? 0) === 0
          ? 'Sẵn sàng học mới — đã hoàn thành các kiến thức tiền đề.'
          : `Độ thành thạo hiện tại ${n.mastery ?? 35}% — cần củng cố để mở khóa chủ đề tiếp theo.`,
      }));
    return wait(items);
  },

  getQuizzes(courseId: string, role: Role): Promise<Quiz[]> {
    return wait(quizFixtures
      .filter(({ quiz }) => quiz.courseId === courseId && (role === 'teacher' || quiz.status === 'published'))
      .map(({ quiz }) => quiz));
  },
  createQuiz(courseId: string, input: CreateQuizInput): Promise<Quiz> {
    if (!input.title.trim() || input.questions.length === 0) {
      return Promise.reject(new Error('Quiz cần có tiêu đề và ít nhất một câu hỏi.'));
    }
    const id = `quiz-${Date.now()}`;
    const answerKey: Record<string, string> = {};
    const questions = input.questions.map(({ correctOptionId, ...question }) => {
      if (!question.options.some((option) => option.id === correctOptionId)) {
        throw new Error('Đáp án đúng phải thuộc một lựa chọn của câu hỏi.');
      }
      answerKey[question.id] = correctOptionId;
      return question;
    });
    const quiz: Quiz = {
      id,
      courseId,
      title: input.title.trim(),
      description: input.description.trim(),
      timeLimitMinutes: input.timeLimitMinutes,
      attemptsAllowed: input.attemptsAllowed,
      attemptsUsed: 0,
      status: 'draft',
      questions,
    };
    quizFixtures.unshift({ quiz, answerKey });
    return wait(quiz);
  },
  updateQuizStatus(courseId: string, quizId: string, status: Quiz['status']): Promise<Quiz> {
    const fixture = quizFixtures.find(({ quiz }) => quiz.id === quizId && quiz.courseId === courseId);
    if (!fixture) return Promise.reject(new Error('Không tìm thấy quiz.'));
    fixture.quiz.status = status;
    return wait(fixture.quiz);
  },
  getQuiz(courseId: string, quizId: string): Promise<Quiz> {
    const fixture = quizFixtures.find(({ quiz }) => quiz.id === quizId && quiz.courseId === courseId);
    if (!fixture || fixture.quiz.status !== 'published') return Promise.reject(new Error('Không tìm thấy bài kiểm tra.'));
    return wait(fixture.quiz);
  },
  startQuizAttempt(courseId: string, quizId: string, unlimited = false): Promise<QuizAttempt> {
    const fixture = quizFixtures.find(({ quiz }) => quiz.id === quizId && quiz.courseId === courseId);
    if (!fixture || fixture.quiz.status !== 'published') return Promise.reject(new Error('Bài kiểm tra không khả dụng.'));
    if (!unlimited && fixture.quiz.attemptsUsed >= fixture.quiz.attemptsAllowed) {
      return Promise.reject(new Error('Bạn đã sử dụng hết số lần làm bài.'));
    }
    if (!unlimited) fixture.quiz.attemptsUsed += 1;
    const startedAt = new Date();
    const attempt: QuizAttempt = {
      id: `attempt-${Date.now()}`,
      quizId,
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + fixture.quiz.timeLimitMinutes * 60_000).toISOString(),
      maxScore: 10,
      totalQuestions: fixture.quiz.questions.length,
    };
    attempts.set(attempt.id, attempt);
    return wait(attempt);
  },
  async submitQuizAttempt(quizId: string, attemptId: string, input: SubmitQuizInput): Promise<QuizAttempt> {
    const fixture = quizFixtures.find(({ quiz }) => quiz.id === quizId);
    const attempt = attempts.get(attemptId);
    if (!fixture || !attempt || attempt.quizId !== quizId || attempt.submittedAt) {
      return Promise.reject(new Error('Lần làm bài không hợp lệ hoặc đã được nộp.'));
    }
    const correctCount = Object.entries(fixture.answerKey)
      .filter(([questionId, answer]) => input.answers[questionId] === answer).length;
    const pct = attempt.totalQuestions > 0 ? Math.round((correctCount / attempt.totalQuestions) * 100) : 0;
    const submitted: QuizAttempt = {
      ...attempt,
      submittedAt: new Date().toISOString(),
      correctCount,
      score: correctCount / attempt.totalQuestions * attempt.maxScore,
    };
    attempts.set(attemptId, submitted);

    if (pct >= 70) {
      const courseId = fixture.quiz.courseId;
      const kg = await ensureKnowledgeGraph(courseId);
      const chMatch = quizId.match(/ch(\d+)/i);
      const targetChapter = chMatch ? `ch${chMatch[1]}` : null;
      let updated = false;

      if (input.nodeId) {
        const targetNode = kg.nodes.find((n) => n.id === input.nodeId);
        if (targetNode) {
          targetNode.properties = {
            ...(targetNode.properties ?? {}),
            learning_state: 'mastered',
            mastery: pct,
          };
          updated = true;
        }
      }

      if (targetChapter) {
        kg.nodes.forEach((n) => {
          const ch = String(n.properties?.chapter_id ?? n.properties?.chapterId ?? '');
          if (ch === targetChapter && n.type !== 'Content' && n.type !== 'Course' && n.type !== 'LO') {
            if (!input.nodeId || n.id === input.nodeId || n.properties?.learning_state === 'learning') {
              n.properties = { ...(n.properties ?? {}), learning_state: 'mastered', mastery: pct };
              updated = true;
            }
          }
        });
      }

      if (updated) persistKnowledgeGraph();
    }
    return wait(submitted);
  },
  getLearningOutcomes: (_courseId: string): Promise<LearningOutcome[]> => wait(data.learningOutcomes),
  getStudentGraph: (courseId: string, clusterId?: string): Promise<StudentGraph> =>
    wait(courseId === 'CO3093'
      ? data.computerNetworksOverview
      : clusterId === 'pointer' ? data.studentPointerCluster : data.studentOverview),
  getNodeDetail: (nodeId: string): Promise<NodeDetail> => wait(data.buildNodeDetail(nodeId), 60),
  async getKnowledgeGraph(courseId: string): Promise<KnowledgeGraphData> {
    const kg = await ensureKnowledgeGraph(courseId);
    return wait({
      nodes: kg.nodes.map((n) => ({ ...n, properties: { ...(n.properties ?? {}) } })),
      edges: kg.edges.map((e) => ({ ...e, properties: { ...(e.properties ?? {}) } })),
    }, 60);
  },
  async saveKnowledgeGraph(courseId: string, graph: KnowledgeGraphData): Promise<KnowledgeGraphData> {
    const cloned: KnowledgeGraphData = {
      nodes: (graph.nodes ?? []).map((n) => ({ ...n, properties: { ...(n.properties ?? {}) } })),
      edges: (graph.edges ?? []).map((e) => ({ ...e, properties: { ...(e.properties ?? {}) } })),
    };
    knowledgeGraphStore.set(courseId, cloned);
    persistKnowledgeGraph();
    return wait({
      nodes: cloned.nodes.map((n) => ({ ...n, properties: { ...(n.properties ?? {}) } })),
      edges: cloned.edges.map((e) => ({ ...e, properties: { ...(e.properties ?? {}) } })),
    }, 60);
  },
  listGraphDrafts(_courseId: string): Promise<CourseGraphDraftSummary[]> {
    return wait([], 40);
  },
  async generateKnowledgeGraph(courseId: string): Promise<KnowledgeGraphData> {
    const generated = await ensureKnowledgeGraph(courseId, true);
    // Mark nodes and edges as proposed/draft as per FR01 / Bảng 2.2.7
    generated.nodes.forEach((n) => {
      if (n.type !== 'Course') {
        n.properties = { ...(n.properties ?? {}), status: 'proposed' };
      }
    });
    generated.edges.forEach((e) => {
      e.properties = { ...(e.properties ?? {}), status: 'proposed' };
    });
    knowledgeGraphStore.set(courseId, generated);
    persistKnowledgeGraph();
    const course = teacherCoursesStore.find((c) => c.id === courseId);
    if (course) {
      course.totalNodes = generated.nodes.length;
      course.nodesWithContent = Math.floor(generated.nodes.length * 0.75);
      course.pending = generated.edges.filter((e) => e.properties?.status === 'proposed').length;
      persistTeacherCourses();
    }
    return wait({
      nodes: generated.nodes.map((n) => ({ ...n, properties: { ...(n.properties ?? {}) } })),
      edges: generated.edges.map((e) => ({ ...e, properties: { ...(e.properties ?? {}) } })),
    }, 150);
  },
  getCourseGraph(courseId: string): Promise<TeacherGraphData> {
    const base = courseId === 'CO3093' ? data.computerNetworksTeacherGraph : data.teacherGraph;
    return wait({
      stats: { ...base.stats },
      clusters: base.clusters.map((c) => ({ ...c, lo: [...c.lo] })),
      clusterEdges: base.clusterEdges.map((e) => ({ ...e })),
    });
  },
  getTeacherGraph(courseId: string): Promise<TeacherGraphData> {
    return this.getCourseGraph(courseId);
  },
  getCourseClusterView(_courseId: string, clusterId: string): Promise<ClusterView> {
    return this.getClusterView(clusterId);
  },
  getClusterView(clusterId: string): Promise<ClusterView> {
    if (!clusterViewStore.has(clusterId)) {
      const built = data.buildClusterView(clusterId);
      clusterViewStore.set(clusterId, {
        nodes: built.nodes.map((n) => ({ ...n, lo: n.lo ? [...n.lo] : undefined })),
        edges: built.edges.map((e) => ({ ...e })),
      });
    }
    const view = clusterViewStore.get(clusterId)!;
    return wait({
      nodes: view.nodes.map((n) => ({ ...n, lo: n.lo ? [...n.lo] : undefined })),
      edges: view.edges.map((e) => ({ ...e })),
    });
  },
  async createGraphNode(
    courseId: string,
    input: {
      name: string;
      nodeType?: KnowledgeNodeType;
      clusterId?: string | null;
      description?: string;
      x?: number;
      y?: number;
      lo?: string[];
      properties?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    const kg = await ensureKnowledgeGraph(courseId);
    const nodeType: KnowledgeNodeType = input.nodeType ?? 'Concept';
    const id = `${String(nodeType).toLowerCase()}_${Date.now()}`;
    const defaultKind =
      nodeType === 'Assignment' || nodeType === 'Item'
        ? 'assessment'
        : nodeType === 'LO'
          ? 'outcome'
          : 'structure';
    const newKgNode: KnowledgeGraphNode = {
      id,
      name: input.name.trim(),
      type: nodeType,
      description: input.description?.trim() ?? '',
      properties: {
        kind: defaultKind,
        level: 'lesson',
        status: 'approved',
        confidence: 1,
        custom: true,
        ...(input.properties ?? {}),
      },
    };
    kg.nodes.push(newKgNode);
    if (nodeType === 'LO') {
      const courseRoot = kg.nodes.find((n) => n.type === 'Course');
      if (courseRoot) {
        kg.edges.push({
          source: id,
          source_type: nodeType,
          target: courseRoot.id,
          target_type: courseRoot.type,
          type: 'DEVELOP',
          properties: { basis: 'manual', status: 'approved', confidence: 1 },
        });
      }
    } else if (input.clusterId && kg.nodes.some((n) => n.id === input.clusterId)) {
      const parent = kg.nodes.find((n) => n.id === input.clusterId);
      const rel: KnowledgeEdgeType = parent?.type === 'LO' ? 'DEVELOP' : 'PART_OF';
      kg.edges.push({
        source: id,
        source_type: nodeType,
        target: input.clusterId,
        target_type: parent?.type,
        type: rel,
        properties: { basis: 'manual', status: 'approved', confidence: 1 },
      });
    }
    persistKnowledgeGraph();
    return wait({ ...newKgNode });
  },
  async updateGraphNode(
    courseId: string,
    nodeId: string,
    input: {
      name?: string;
      description?: string;
      status?: 'approved' | 'draft' | 'pending_review' | 'outside_cluster' | 'proposed';
      approved?: boolean;
      lo?: string[];
      properties?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    const kg = await ensureKnowledgeGraph(courseId);
    const kgNode = kg.nodes.find((n) => n.id === nodeId);
    if (kgNode) {
      if (input.name !== undefined) kgNode.name = input.name.trim();
      if (input.description !== undefined) kgNode.description = input.description.trim();
      kgNode.properties = { ...(kgNode.properties ?? {}), ...(input.properties ?? {}) };
      if (input.status !== undefined) kgNode.properties.status = input.status;
      if (input.approved !== undefined) {
        kgNode.properties.approved = input.approved;
        if (input.approved) kgNode.properties.status = 'approved';
      }
      persistKnowledgeGraph();
      return wait({ ...kgNode });
    }
    const graph = courseId === 'CO3093' ? data.computerNetworksTeacherGraph : data.teacherGraph;
    const cluster = graph.clusters.find((c) => c.id === nodeId);
    if (cluster) {
      if (input.name !== undefined) cluster.name = input.name;
      if (input.approved !== undefined) cluster.approved = input.approved;
      if (input.lo !== undefined) cluster.lo = [...input.lo];
      return wait({ ...cluster });
    }
    for (const view of clusterViewStore.values()) {
      const node = view.nodes.find((n) => n.id === nodeId);
      if (node) {
        if (input.name !== undefined) node.name = input.name;
        if (input.status !== undefined && input.status !== 'proposed') node.status = input.status;
        if (input.lo !== undefined) node.lo = [...input.lo];
        return wait({ ...node });
      }
    }
    return Promise.reject(new Error('Không tìm thấy node hoặc cụm.'));
  },
  async deleteGraphNode(courseId: string, nodeId: string): Promise<void> {
    const kg = await ensureKnowledgeGraph(courseId);
    const target = kg.nodes.find((n) => n.id === nodeId);
    if (target?.type === 'Course') {
      return Promise.reject(new Error('Không thể xóa node gốc của khóa học.'));
    }
    kg.nodes = kg.nodes.filter((n) => n.id !== nodeId);
    kg.edges = kg.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    persistKnowledgeGraph();
    return wait(undefined);
  },
  async createGraphEdge(
    courseId: string,
    input: { fromId: string; toId: string; kind: string; clusterId?: string | null; properties?: Record<string, unknown> },
  ): Promise<{ from: string; to: string; kind: string; source: string; target: string; type: KnowledgeEdgeType }> {
    if (input.fromId === input.toId) return Promise.reject(new Error('Không thể nối cạnh tới chính node đó.'));
    const kg = await ensureKnowledgeGraph(courseId);
    if (!kg.nodes.some((n) => n.id === input.fromId) || !kg.nodes.some((n) => n.id === input.toId)) {
      return Promise.reject(new Error('Không tìm thấy node nguồn hoặc node đích trong đồ thị.'));
    }
    const edgeType = normalizeKnowledgeEdgeType(input.kind);
    if (edgeType === 'PREREQUISITE') {
      // Validate Graph Integrity (Bảng 2.2.10): forbid cycles on PREREQUISITE edges
      const visited = new Set<string>([input.toId]);
      const stack = [input.toId];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === input.fromId) {
          return Promise.reject(
            new Error('Lỗi toàn vẹn đồ thị (Validate Graph Integrity): Cạnh PREREQUISITE này tạo chu trình vòng!'),
          );
        }
        for (const e of kg.edges) {
          if (e.type === 'PREREQUISITE' && e.source === cur && !visited.has(e.target)) {
            visited.add(e.target);
            stack.push(e.target);
          }
        }
      }
    }
    const sourceNode = kg.nodes.find((n) => n.id === input.fromId);
    const targetNode = kg.nodes.find((n) => n.id === input.toId);
    if (!kg.edges.some((e) => e.source === input.fromId && e.target === input.toId && e.type === edgeType)) {
      kg.edges.push({
        source: input.fromId,
        source_type: sourceNode?.type,
        target: input.toId,
        target_type: targetNode?.type,
        type: edgeType,
        properties: {
          basis: 'manual',
          confidence: 1,
          strength: edgeType === 'PREREQUISITE' ? 'hard' : undefined,
          status: 'approved',
          custom: true,
          ...(input.properties ?? {}),
        },
      });
    }
    persistKnowledgeGraph();
    return wait({
      from: input.fromId,
      to: input.toId,
      kind: input.kind,
      source: input.fromId,
      target: input.toId,
      type: edgeType,
    });
  },
  async deleteGraphEdge(
    courseId: string,
    input: { fromId: string; toId: string; edgeType?: string | null; clusterId?: string | null },
  ): Promise<void> {
    const kg = await ensureKnowledgeGraph(courseId);
    kg.edges = kg.edges.filter(
      (e) => !(e.source === input.fromId && e.target === input.toId && (!input.edgeType || e.type === input.edgeType)),
    );
    persistKnowledgeGraph();
    return wait(undefined);
  },
  async approveGraphEdge(
    courseId: string,
    input: { fromId: string; toId: string; edgeType?: string | null },
  ): Promise<void> {
    const kg = await ensureKnowledgeGraph(courseId);
    kg.edges.forEach((e) => {
      if (e.source === input.fromId && e.target === input.toId && (!input.edgeType || e.type === input.edgeType)) {
        e.properties = { ...(e.properties ?? {}), status: 'approved', confidence: 1 };
      }
    });
    persistKnowledgeGraph();
    return wait(undefined);
  },
  async mergeGraphNodes(
    courseId: string,
    input: { keepId: string; mergeId: string; clusterId?: string | null },
  ): Promise<{ id: string }> {
    if (input.keepId === input.mergeId) return Promise.reject(new Error('Hai node cần gộp phải khác nhau.'));
    const kg = await ensureKnowledgeGraph(courseId);
    const keepNode = kg.nodes.find((n) => n.id === input.keepId);
    const dupNode = kg.nodes.find((n) => n.id === input.mergeId);
    if (!keepNode || !dupNode) {
      return Promise.reject(new Error('Không tìm thấy node để gộp.'));
    }
    if (dupNode.type === 'Course') {
      return Promise.reject(new Error('Không thể gộp node gốc của khóa học.'));
    }
    const existingMerged = Array.isArray(keepNode.properties?.merged_from)
      ? (keepNode.properties?.merged_from as string[])
      : [];
    keepNode.properties = {
      ...(keepNode.properties ?? {}),
      merged_from: Array.from(new Set([...existingMerged, dupNode.name])),
    };
    const dedup = new Set<string>();
    kg.edges = kg.edges
      .map((e) => ({
        ...e,
        source: e.source === input.mergeId ? input.keepId : e.source,
        target: e.target === input.mergeId ? input.keepId : e.target,
      }))
      .filter((e) => {
        if (e.source === e.target) return false;
        const key = `${e.source}|${e.target}|${e.type}`;
        if (dedup.has(key)) return false;
        dedup.add(key);
        return true;
      });
    kg.nodes = kg.nodes.filter((n) => n.id !== input.mergeId);
    persistKnowledgeGraph();
    return wait({ id: input.keepId });
  },

  getReviewQueue: (_courseId: string): Promise<QueueSummary> => wait(data.reviewQueue),
  getHeatSpot: (clusterId?: string): Promise<HeatSpot> => wait(data.heatSpots[clusterId ?? ''] ?? data.heatSpots.pointer, 60),
  getCourseFiles(courseId: string): Promise<CourseFile[]> {
    const seen = new Set<string>();
    const result: CourseFile[] = [];
    for (const file of uploadedFiles) {
      if (file.courseId !== courseId) continue;
      const key = `${file.name}:${file.sizeBytes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(file);
    }
    for (const file of pdfFilesStore) {
      if (file.courseId !== courseId) continue;
      const key = `${file.name}:${file.sizeBytes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: file.id,
        courseId,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        uploadedAt: file.uploadedAt,
      });
    }
    return wait(result);
  },
  uploadCourseFile(courseId: string, file: File): Promise<CourseFile> {
    const allowed = /\.(pdf|ppt|pptx|doc|docx|mp4|mov|zip)$/i.test(file.name);
    if (!allowed) return Promise.reject(new Error('Định dạng tệp không được hỗ trợ.'));
    if (file.size === 0) {
      return Promise.reject(new Error('Tệp không được để trống (0 byte).'));
    }
    const uploadedAt = new Date().toISOString();
    const item: CourseFile = {
      id: `file-${Date.now()}`,
      courseId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      uploadedAt,
    };
    uploadedFiles.unshift(item);
    persistUploadedFiles();
    if (item.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const pdfItem: PdfFile = {
        ...item,
        pages: 0,
        sizeMb: Number((file.size / 1048576).toFixed(1)),
        date: new Intl.DateTimeFormat('vi-VN').format(new Date(uploadedAt)),
      };
      pdfFilesStore.unshift(pdfItem);
      persistPdfFiles();
    }
    return wait(item);
  },
  getCoursePdfs: (courseId: string): Promise<PdfFile[]> =>
    wait(pdfFilesStore.filter((file) => file.courseId === courseId)),
  getLoChains: (_courseId: string) => wait(data.loChains),
  getNodeEditor: (nodeId: string): Promise<NodeEditorData> => {
    if (nodeEditorStore[nodeId]) {
      return wait({
        ...nodeEditorStore[nodeId],
        chapterTitle: nodeEditorStore[nodeId].chapterTitle ?? `Chương ${nodeEditorStore[nodeId].week ?? 1}`,
        contents: nodeEditorStore[nodeId].contents.map((c) => ({ ...c })),
        questions: nodeEditorStore[nodeId].questions.map((q) => ({ ...q })),
      });
    }
    const built = data.buildNodeEditor(nodeId);
    for (const kg of knowledgeGraphStore.values()) {
      const found = kg.nodes.find((n) => n.id === nodeId);
      if (found) {
        built.name = found.name || built.name;
        if (found.description) built.description = found.description;
        const props = (found.properties ?? {}) as Record<string, unknown>;
        const wk = Number(props.week ?? props.default_week ?? 1);
        const chT = typeof props.chapter_title === 'string' && props.chapter_title.trim() ? props.chapter_title.trim() : `Chương ${wk}`;
        built.week = wk;
        built.chapterTitle = chT;
        built.cluster = chT;
        built.parentNode = chT;
        break;
      }
    }
    return wait(built);
  },
  async saveNodeEditor(
    courseId: string,
    nodeId: string,
    input: {
      name?: string;
      description?: string;
      contents?: NodeEditorData['contents'];
      questions?: NodeEditorData['questions'];
      passThreshold?: number;
      unlockRule?: NodeEditorData['unlockRule'];
    },
  ): Promise<NodeEditorData> {
    const current = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    const updated: NodeEditorData = {
      ...current,
      name: input.name !== undefined ? input.name.trim() || current.name : current.name,
      description: input.description !== undefined ? input.description : current.description,
      contents: input.contents ? input.contents.map((c) => ({ ...c })) : current.contents,
      questions: input.questions ? input.questions.map((q) => ({ ...q })) : current.questions,
      passThreshold: input.passThreshold !== undefined ? input.passThreshold : current.passThreshold,
      unlockRule: input.unlockRule !== undefined ? input.unlockRule : current.unlockRule,
    };
    nodeEditorStore[nodeId] = updated;
    persistNodeEditors();

    const kg = await ensureKnowledgeGraph(courseId);
    const kgNode = kg.nodes.find((n) => n.id === nodeId);
    if (kgNode) {
      kgNode.name = updated.name;
      kgNode.description = updated.description;
      persistKnowledgeGraph();
    }
    return wait(updated);
  },
  async getCourseConceptsContentOverview(courseId: string): Promise<CourseConceptsContentOverview> {
    const kg = await ensureKnowledgeGraph(courseId);
    const conceptNodes = kg.nodes.filter((n) => n.type === 'Concept');
    const items = conceptNodes.map((n) => {
      const editor = nodeEditorStore[n.id];
      const contents = editor?.contents ?? [];
      const approvedCnt = contents.filter((c) => c.status === 'approved').length;
      const quizzes = quizFixtures
        .map((f) => f.quiz)
        .filter((q) => q.courseId === courseId && q.conceptId === n.id);
      const pubQuiz = quizzes.find((q) => q.status === 'published');
      const primary = pubQuiz ?? quizzes[0];
      const props = (n.properties ?? {}) as Record<string, unknown>;
      const week = Number(props.week ?? props.default_week ?? 1);
      const rawChTitle = typeof props.chapter_title === 'string' && props.chapter_title.trim() ? props.chapter_title.trim() : '';
      const chapterTitle = rawChTitle && !/^Tuần\s+\d+$/i.test(rawChTitle) ? rawChTitle : `Chương ${week}`;
      const durationMin = Number(props.duration_min ?? 6);
      const hasContent = approvedCnt > 0 || Boolean(props.has_content);
      const hasQuiz = (Boolean(pubQuiz) && (pubQuiz?.questions.length ?? 0) > 0) || Boolean(props.has_quiz);
      return {
        id: n.id,
        code: String(props.code ?? n.id),
        name: editor?.name ?? n.name,
        week,
        chapterTitle,
        durationMin,
        contentVersion: editor?.contentVersion ?? 1,
        learningOutcomes: [] as string[],
        contentCount: contents.length,
        approvedContentCount: approvedCnt,
        itemCount: primary?.questions.length ?? 0,
        approvedItemCount: primary?.questions.length ?? 0,
        quizCount: quizzes.length,
        publishedQuizCount: quizzes.filter((q) => q.status === 'published').length,
        primaryQuizId: primary?.id ?? null,
        primaryQuizTitle: primary?.title ?? null,
        primaryQuizStatus: primary?.status ?? ('none' as const),
        primaryQuizQuestionCount: primary?.questions.length ?? 0,
        hasContent,
        hasQuiz,
        isComplete: hasContent && hasQuiz,
      };
    });
    return wait({
      courseId,
      totalConcepts: items.length,
      conceptsWithContent: items.filter((i) => i.contentCount > 0).length,
      conceptsWithApprovedContent: items.filter((i) => i.hasContent).length,
      conceptsWithQuiz: items.filter((i) => i.quizCount > 0).length,
      conceptsWithPublishedQuiz: items.filter((i) => i.hasQuiz).length,
      completedConcepts: items.filter((i) => i.isComplete).length,
      concepts: items,
    });
  },
  updateConceptMetadata(nodeId: string, input: { title?: string; durationMin?: number }): Promise<NodeEditorData> {
    const current = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    const updated: NodeEditorData = {
      ...current,
      name: input.title?.trim() || current.name,
      durationMin: input.durationMin ?? current.durationMin ?? 6,
    };
    nodeEditorStore[nodeId] = updated;
    persistNodeEditors();
    return wait(updated);
  },
  upsertNodeContent(
    nodeId: string,
    input: {
      id?: string | null;
      title: string;
      role: 'definition' | 'example';
      bodyText?: string | null;
      url?: string | null;
      pageFrom?: number | null;
      pageTo?: number | null;
      status: 'draft' | 'approved';
    },
  ): Promise<ContentItem> {
    const current = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    const existing = input.id ? current.contents.find((c) => c.id === input.id) : undefined;
    const item: ContentItem = {
      id: existing?.id ?? `cnt-${Date.now()}`,
      kind: input.role === 'example' ? 'Example' : 'Definition',
      role: input.role,
      status: input.status,
      title: input.title.trim(),
      bodyText: input.bodyText ?? '',
      url: input.url ?? null,
      pageFrom: input.pageFrom ?? null,
      pageTo: input.pageFrom != null ? (input.pageTo ?? input.pageFrom) : null,
      contentVersion: (existing?.contentVersion ?? 0) + 1,
      source: input.url?.trim() || (input.pageFrom ? `Trang ${input.pageFrom}-${input.pageTo ?? input.pageFrom}` : 'Giảng viên'),
    };
    current.contents = existing
      ? current.contents.map((c) => (c.id === existing.id ? item : c))
      : [...current.contents, item];
    nodeEditorStore[nodeId] = current;
    persistNodeEditors();
    return wait(item);
  },
  deleteNodeContent(nodeId: string, contentId: string): Promise<void> {
    const current = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    current.contents = current.contents.filter((c) => c.id !== contentId);
    nodeEditorStore[nodeId] = current;
    persistNodeEditors();
    return wait(undefined);
  },
  getContentHistory(contentId: string): Promise<ContentHistoryItem[]> {
    for (const ed of Object.values(nodeEditorStore)) {
      const found = ed.contents.find((c) => c.id === contentId);
      if (found) {
        return wait([
          {
            contentId: found.id,
            title: found.title,
            role: found.role ?? 'definition',
            bodyText: found.bodyText ?? '',
            contentVersion: found.contentVersion ?? 1,
            status: found.status,
            isArchived: false,
            archivedAt: null,
          },
        ]);
      }
    }
    return wait([]);
  },
  deleteNodeItem(nodeId: string, itemId: string): Promise<void> {
    const current = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    current.questions = current.questions.filter((q) => q.id !== itemId);
    nodeEditorStore[nodeId] = current;
    persistNodeEditors();
    return wait(undefined);
  },
  upsertConceptQuiz(nodeId: string, input: UpsertConceptQuizInput): Promise<ConceptQuiz> {
    const ed = nodeEditorStore[nodeId] ?? data.buildNodeEditor(nodeId);
    let courseId = ed.courseId ?? '';
    if (!courseId) {
      for (const [cid, kg] of knowledgeGraphStore.entries()) {
        if (kg.nodes.some((n) => n.id === nodeId)) {
          courseId = cid;
          break;
        }
      }
    }
    const existingFixture = input.quizId
      ? quizFixtures.find((f) => f.quiz.id === input.quizId)
      : quizFixtures.find((f) => f.quiz.conceptId === nodeId);
    const quizId = existingFixture?.quiz.id ?? `quiz-concept-${Date.now()}`;
    const mappedQuestions = input.questions.map((q, idx) => ({
      id: q.id || `q-${quizId}-${idx + 1}`,
      prompt: q.prompt,
      options: q.options,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation ?? '',
      bloomLevel: q.bloomLevel,
      points: q.points,
      status: q.status,
      itemVersion: 1,
    }));
    const answerKey = Object.fromEntries(mappedQuestions.map((q) => [q.id, q.correctOptionId]));
    const quiz: Quiz = {
      id: quizId,
      courseId: courseId || 'CS101',
      conceptId: nodeId,
      title: input.title,
      description: input.description,
      quizType: 'micro_lesson',
      timeLimitMinutes: input.timeLimitMinutes,
      attemptsAllowed: input.attemptsAllowed,
      attemptsUsed: existingFixture?.quiz.attemptsUsed ?? 0,
      passScorePct: input.passScorePct,
      status: input.status,
      questions: mappedQuestions.map(({ id, prompt, options }) => ({ id, prompt, options })),
    };
    if (existingFixture) {
      existingFixture.quiz = quiz;
      existingFixture.answerKey = answerKey;
    } else {
      quizFixtures.unshift({ quiz, answerKey });
    }
    const result: ConceptQuiz = {
      id: quiz.id,
      courseId: quiz.courseId,
      conceptId: nodeId,
      title: quiz.title,
      description: quiz.description,
      quizType: quiz.quizType,
      timeLimitMinutes: quiz.timeLimitMinutes,
      attemptsAllowed: quiz.attemptsAllowed,
      passScorePct: input.passScorePct,
      status: quiz.status,
      questions: mappedQuestions,
    };
    ed.quizzes = [result, ...(ed.quizzes ?? []).filter((qz) => qz.id !== result.id)];
    nodeEditorStore[nodeId] = ed;
    persistNodeEditors();
    return wait(result);
  },
  deleteConceptQuiz(nodeId: string, quizId: string): Promise<void> {
    const idx = quizFixtures.findIndex((f) => f.quiz.id === quizId && f.quiz.conceptId === nodeId);
    if (idx >= 0) quizFixtures.splice(idx, 1);
    const ed = nodeEditorStore[nodeId];
    if (ed?.quizzes) {
      ed.quizzes = ed.quizzes.filter((qz) => qz.id !== quizId);
      persistNodeEditors();
    }
    return wait(undefined);
  },

  /* ==================== D1–D5 Authoring Workflow Mock ==================== */
  async uploadCourseSyllabus(courseId: string, file: File): Promise<{ syllabusId: string }> {
    if (file.size === 0) return Promise.reject(new Error('Tệp không được để trống (0 byte).'));
    return wait({ syllabusId: `syl-${courseId}-${Date.now()}` }, 120);
  },
  createOutlineJob(courseId: string, _syllabusId: string, idempotencyKey: string): Promise<{ jobId: string; status: string }> {
    const jobId = `job-outline-${courseId}-${Date.now()}`;
    const state = ensureAuthoringState(courseId);
    authoringJobs.set(jobId, {
      kind: 'outline',
      courseId,
      idempotencyKey,
      polls: 0,
      status: 'QUEUED',
      progress: 10,
      canResume: true,
      resumeCount: 0,
      maxResumeAttempts: 3,
      revision: state.outlineRevision,
    });
    persistAuthoring();
    return wait({ jobId, status: 'QUEUED' }, 80);
  },
  getOutlineDraft(courseId: string): Promise<OutlineDraftResponse> {
    const state = ensureAuthoringState(courseId);
    const outline: CourseOutlineData = JSON.parse(JSON.stringify(state.outline));
    const weekRelations = (chId: string): CourseRelationItem[] => {
      if (state.relationsByChapter && state.relationsByChapter[chId]) {
        return state.relationsByChapter[chId];
      }
      return state.relations.filter((r) => r.sourceChapterId === chId || r.targetChapterId === chId);
    };
    outline.chapters = outline.chapters.map((ch) => {
      const lessons = (state.lessonsByChapter[ch.id] ?? []).filter((l) => l.decision !== 'REJECT');
      const weekRels = weekRelations(ch.id);
      const draftPhase =
        state.draftPhaseByChapter?.[ch.id] ??
        (ch.state === 'PUBLISHED'
          ? 'ready'
          : weekRels.length > 0
            ? 'ready'
            : ch.state === 'LESSON_APPROVED'
              ? 'nodes_reviewed'
              : lessons.length > 0
                ? 'nodes'
                : null);
      return {
        ...ch,
        rawState: ch.state === 'PUBLISHED' ? 'approved' : undefined,
        mergedInMaster: ch.state === 'PUBLISHED',
        draftPhase,
        needsRebase: Boolean(state.needsRebaseByChapter?.[ch.id]),
        publishedMasterVersion: state.publishedMasterVersionByChapter?.[ch.id] ?? (ch.state === 'PUBLISHED' ? state.masterVersion : null),
        conceptCount: lessons.length,
        relationCount: weekRels.length,
        relationApprovedCount: weekRels.filter((r) => r.decision === 'APPROVE' || r.decision === 'EDIT').length,
        relationPendingCount: weekRels.filter((r) => r.decision === 'PENDING').length,
        relationWarnCount: weekRels.filter((r) => r.hasWarning).length,
      };
    });
    const publishedWeekCount = outline.chapters.filter((c) => c.mergedInMaster).length;
    return wait({
      outline,
      state: state.outlineState,
      revision: state.outlineRevision,
      masterVersion: state.masterVersion,
      publishedWeekCount,
      coursePublished: Boolean(state.coursePublished),
      latestReleaseNo: state.coursePublished ? Math.max(1, state.masterVersion) : 0,
      activeJob: null,
    });
  },
  async getAuthoringGraph(courseId: string): Promise<KnowledgeGraphData> {
    const state = ensureAuthoringState(courseId);
    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    for (const lo of state.outline.learningOutcomes) {
      const loId = `${courseId}:lo:${lo.code}`;
      seenNodes.add(loId);
      nodes.push({ id: loId, name: `${lo.code}: ${lo.description}`, type: 'LO', properties: { code: lo.code, scope: 'master' } });
    }
    for (const ch of state.outline.chapters) {
      const lessons = (state.lessonsByChapter[ch.id] ?? []).filter((l) => l.decision !== 'REJECT');
      const isMerged = ch.state === 'PUBLISHED';
      for (const l of lessons) {
        if (!seenNodes.has(l.id)) {
          seenNodes.add(l.id);
          nodes.push({
            id: l.id,
            name: l.title,
            type: 'Concept',
            description: l.content,
            properties: {
              week_id: ch.id,
              chapter_id: ch.id,
              chapter_title: ch.title,
              level: l.level ?? 'lesson',
              scope: isMerged ? 'master' : 'draft',
              status: l.decision === 'APPROVE' || l.decision === 'EDIT' ? 'approved' : 'proposed',
            },
          });
        }
        for (const loCode of l.loCodes) {
          const loId = `${courseId}:lo:${loCode}`;
          const devKey = `${l.id}|${loId}|DEVELOP`;
          if (seenNodes.has(loId) && !seenEdges.has(devKey)) {
            seenEdges.add(devKey);
            edges.push({ source: l.id, target: loId, type: 'DEVELOP', properties: { scope: isMerged ? 'master' : 'draft', week_id: ch.id } });
          }
        }
      }
    }
    const allRels = [
      ...Object.entries(state.relationsByChapter ?? {}).flatMap(([wk, list]) =>
        list.map((r) => ({ rel: r, wk })),
      ),
      ...state.relations.map((r) => ({ rel: r, wk: r.sourceChapterId })),
    ];
    const mergedIds = new Set(state.outline.chapters.filter((c) => c.state === 'PUBLISHED').map((c) => c.id));
    for (const { rel: r, wk } of allRels) {
      if (r.decision === 'REJECT') continue;
      const eKey = `${r.sourceId}|${r.targetId}|${r.relationType}`;
      if (seenEdges.has(eKey)) continue;
      seenEdges.add(eKey);
      const isMaster = mergedIds.has(wk);
      edges.push({
        source: r.sourceId,
        target: r.targetId,
        type: r.relationType,
        properties: {
          scope: isMaster ? 'master' : 'draft',
          week_id: wk,
          reason: r.reason ?? '',
          required_knowledge: r.requiredKnowledge ?? '',
          strength: r.strength ?? null,
          status: r.decision === 'APPROVE' || r.decision === 'EDIT' ? 'approved' : 'proposed',
        },
      });
    }
    if (nodes.length === 0) {
      return this.getKnowledgeGraph(courseId);
    }
    return wait({ nodes, edges }, 40);
  },
  saveOutlineDraft(courseId: string, outline: CourseOutlineData, expectedRevision: number): Promise<OutlineDraftResponse> {
    const state = ensureAuthoringState(courseId);
    if (state.outlineRevision !== expectedRevision) {
      return Promise.reject(new Error(`409: Xung đột phiên bản khung môn học (expected ${expectedRevision}, current ${state.outlineRevision}).`));
    }
    state.outline = JSON.parse(JSON.stringify(outline)) as CourseOutlineData;
    state.outlineRevision += 1;
    persistAuthoring();
    return wait({
      outline: JSON.parse(JSON.stringify(state.outline)) as CourseOutlineData,
      state: state.outlineState,
      revision: state.outlineRevision,
    });
  },
  approveOutline(courseId: string, expectedRevision: number): Promise<{ state: 'OUTLINE_APPROVED'; revision: number }> {
    const state = ensureAuthoringState(courseId);
    if (state.outlineRevision !== expectedRevision) {
      return Promise.reject(new Error('409: Phiên bản khung môn học đã thay đổi, vui lòng tải lại.'));
    }
    if (!state.outline.chapters.length || !state.outline.learningOutcomes.length) {
      return Promise.reject(new Error('422: Khung môn học phải có ít nhất 1 buổi học và 1 chuẩn đầu ra (LO).'));
    }
    state.outlineState = 'OUTLINE_APPROVED';
    state.outlineRevision += 1;
    persistAuthoring();
    return wait({ state: 'OUTLINE_APPROVED', revision: state.outlineRevision });
  },

  reopenChapter(courseId: string, chapterId: string, expectedRevision: number): Promise<{ draftId: string; state: 'DRAFT'; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== expectedRevision) {
      return Promise.reject(new Error('409: Xung đột phiên bản buổi học.'));
    }
    ch.state = 'DRAFT';
    ch.revision += 1;
    persistAuthoring();
    return wait({ draftId: `draft-${chapterId}-${ch.revision}`, state: 'DRAFT', revision: ch.revision });
  },
  async uploadChapterDocument(courseId: string, chapterId: string, file: File): Promise<{ documentId: string; revision: number }> {
    const state = ensureAuthoringState(courseId);
    if (state.outlineState !== 'OUTLINE_APPROVED') {
      return Promise.reject(new Error('409 OUTLINE_NOT_APPROVED: Cần duyệt Khung môn học (D1) trước khi gắn tài liệu buổi học.'));
    }
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.state === 'PUBLISHED') {
      return Promise.reject(new Error('409 REOPEN_REQUIRED: Buổi học đã xuất bản, cần Mở lại (Reopen) trước khi tải tài liệu mới.'));
    }
    const uploaded = await this.uploadCourseFile(courseId, file);
    ch.documentCount = (ch.documentCount ?? 0) + 1;
    ch.revision += 1;
    persistAuthoring();
    return wait({ documentId: uploaded.id, revision: ch.revision }, 80);
  },
  createLessonJob(courseId: string, chapterId: string, expectedRevision: number, idempotencyKey: string): Promise<{ jobId: string; status: string }> {
    const state = ensureAuthoringState(courseId);
    if (state.outlineState !== 'OUTLINE_APPROVED') {
      return Promise.reject(new Error('409 OUTLINE_NOT_APPROVED: Khung môn học chưa được duyệt.'));
    }
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== expectedRevision) {
      return Promise.reject(new Error('409: Revision của buổi học đã lệch, vui lòng làm mới.'));
    }
    const jobId = `job-lesson-${courseId}-${chapterId}-${Date.now()}`;
    authoringJobs.set(jobId, {
      kind: 'lesson',
      courseId,
      chapterId,
      idempotencyKey,
      polls: 0,
      status: 'QUEUED',
      progress: 15,
      canResume: true,
      resumeCount: 0,
      maxResumeAttempts: 3,
      revision: ch.revision,
    });
    persistAuthoring();
    return wait({ jobId, status: 'QUEUED' }, 80);
  },
  getChapterLessons(
    courseId: string,
    chapterId: string,
    cursor?: string | null,
    limit = 20,
  ): Promise<{ items: ChapterLessonItem[]; nextCursor: string | null; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    const list = state.lessonsByChapter[chapterId] ?? [];
    const offset = cursor ? Number(cursor) || 0 : 0;
    const slice = list.slice(offset, offset + limit);
    const nextCursor = offset + limit < list.length ? String(offset + limit) : null;
    return wait({ items: slice.map((item) => ({ ...item })), nextCursor, revision: ch?.revision ?? 1 }, 60);
  },
  reviewChapterLesson(
    courseId: string,
    chapterId: string,
    lessonId: string,
    input: { decision: ReviewDecision; changes?: Partial<ChapterLessonItem>; reviewNote?: string; expectedRevision: number },
  ): Promise<{ lesson: ChapterLessonItem; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== input.expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    const list = state.lessonsByChapter[chapterId] ?? [];
    const target = list.find((l) => l.id === lessonId);
    if (!target) return Promise.reject(new Error('Không tìm thấy bài học.'));
    if (!['APPROVE', 'EDIT', 'REJECT', 'PENDING'].includes(input.decision)) {
      return Promise.reject(new Error('422: Quyết định duyệt không hợp lệ.'));
    }
    target.decision = input.decision;
    if (input.reviewNote !== undefined) target.reviewNote = input.reviewNote;
    if (input.changes) {
      if (input.changes.title !== undefined) target.title = input.changes.title;
      if (input.changes.content !== undefined) target.content = input.changes.content;
      if (input.changes.outcome !== undefined) target.outcome = input.changes.outcome;
      if (input.changes.loCodes !== undefined) target.loCodes = input.changes.loCodes;
      if (input.changes.level !== undefined) target.level = input.changes.level;
      if (input.changes.durationMin !== undefined) target.durationMin = input.changes.durationMin;
      if (input.changes.aliases !== undefined) target.aliases = input.changes.aliases;
    }
    ch.revision += 1;
    persistAuthoring();
    return wait({ lesson: { ...target }, revision: ch.revision }, 50);
  },
  createChapterLesson(
    courseId: string,
    chapterId: string,
    input: {
      title: string;
      content: string;
      level?: 'topic' | 'lesson';
      loCodes?: string[];
      outcome?: string;
      durationMin?: number;
      aliases?: string[];
      slideId?: string;
      reviewNote?: string;
      expectedRevision: number;
    },
  ): Promise<{ lesson: ChapterLessonItem; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== input.expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    const list = state.lessonsByChapter[chapterId] ?? [];
    const fallbackSlide = input.slideId || list[0]?.sourceRef || ((ch.documentCount ?? 0) > 0 ? `${chapterId}_p1` : '');
    const created: ChapterLessonItem = {
      id: `manual_${Date.now()}`,
      title: input.title.trim(),
      content: input.content.trim() || input.title.trim(),
      sourceRef: fallbackSlide,
      loCodes: input.loCodes ?? [],
      aliases: input.aliases ?? [],
      outcome: input.outcome?.trim() || input.title.trim(),
      level: input.level ?? 'lesson',
      durationMin: input.durationMin,
      confidence: 1,
      evidence: fallbackSlide
        ? [{ slideId: fallbackSlide, quote: input.content.trim() || input.title.trim() }]
        : [],
      reuseId: null,
      decision: 'APPROVE',
      reviewNote: input.reviewNote ?? 'Giảng viên bổ sung thủ công',
    };
    state.lessonsByChapter[chapterId] = [...list, created];
    if (ch.state === 'DRAFT') ch.state = 'LESSON_REVIEW';
    ch.revision += 1;
    persistAuthoring();
    return wait({ lesson: { ...created }, revision: ch.revision }, 50);
  },
  deleteChapterLesson(
    courseId: string,
    chapterId: string,
    lessonId: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean; mode?: 'removed' | 'rejected'; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    const list = state.lessonsByChapter[chapterId] ?? [];
    state.lessonsByChapter[chapterId] = list.filter((l) => l.id !== lessonId);
    ch.revision += 1;
    persistAuthoring();
    return wait({ deleted: true, mode: 'removed', revision: ch.revision }, 50);
  },
  batchReviewChapterLessons(
    courseId: string,
    chapterId: string,
    input: {
      items: Array<{ lessonId: string; decision: ReviewDecision; changes?: Partial<ChapterLessonItem>; reviewNote?: string }>;
      expectedRevision: number;
    },
  ): Promise<{ updatedCount: number; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== input.expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    const list = state.lessonsByChapter[chapterId] ?? [];
    let updatedCount = 0;
    for (const item of input.items) {
      const target = list.find((l) => l.id === item.lessonId);
      if (target) {
        target.decision = item.decision;
        if (item.reviewNote !== undefined) target.reviewNote = item.reviewNote;
        updatedCount += 1;
      }
    }
    ch.revision += 1;
    persistAuthoring();
    return wait({ updatedCount, revision: ch.revision }, 60);
  },
  approveChapterLessons(courseId: string, chapterId: string, expectedRevision: number): Promise<{ state: 'LESSON_APPROVED'; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    const list = state.lessonsByChapter[chapterId] ?? [];
    if (!list.length || list.some((l) => l.decision === 'PENDING')) {
      return Promise.reject(new Error('422: Mọi bài học trong buổi học phải có quyết định (APPROVE / EDIT / REJECT) trước khi duyệt.'));
    }
    ch.state = 'LESSON_APPROVED';
    if (!state.draftPhaseByChapter) state.draftPhaseByChapter = {};
    state.draftPhaseByChapter[chapterId] = 'nodes_reviewed';
    ch.revision += 1;
    persistAuthoring();
    return wait({ state: 'LESSON_APPROVED', revision: ch.revision });
  },
  discardChapterLessons(courseId: string, chapterId: string, expectedRevision: number): Promise<{ state: 'DRAFT'; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học.'));
    if (ch.revision !== expectedRevision) {
      return Promise.reject(new Error('409: Revision buổi học đã thay đổi.'));
    }
    state.lessonsByChapter[chapterId] = [];
    if (state.relationsByChapter) delete state.relationsByChapter[chapterId];
    if (state.draftPhaseByChapter) state.draftPhaseByChapter[chapterId] = null;
    ch.state = 'DRAFT';
    ch.revision += 1;
    persistAuthoring();
    return wait({ state: 'DRAFT', revision: ch.revision });
  },

  createRelationJob(
    courseId: string,
    chapterIds: string[],
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<{ jobId: string; status: string }> {
    const state = ensureAuthoringState(courseId);
    const uniqueIds = Array.from(new Set(chapterIds));
    if (uniqueIds.length < 1) {
      return Promise.reject(new Error('422: Cần chọn ít nhất 1 buổi học đã duyệt để sinh quan hệ.'));
    }
    const unapproved = uniqueIds.filter((cid) => {
      const ch = state.outline.chapters.find((c) => c.id === cid);
      return !ch || (ch.state !== 'LESSON_APPROVED' && ch.state !== 'PUBLISHED');
    });
    if (unapproved.length) {
      return Promise.reject(new Error('409: Buổi học được chọn phải ở trạng thái LESSON_APPROVED.'));
    }
    if (state.relationRevision !== expectedRevision && !state.outline.chapters.some((c) => c.id === uniqueIds[0] && c.revision === expectedRevision)) {
      // Keep mock resilient to per-chapter or course-level revision tracking
    }
    const jobId = `job-relation-${courseId}-${uniqueIds[0]}-${Date.now()}`;
    authoringJobs.set(jobId, {
      kind: 'relation',
      courseId,
      chapterId: uniqueIds[0],
      chapterIds: uniqueIds,
      idempotencyKey,
      polls: 0,
      status: 'QUEUED',
      progress: 20,
      canResume: true,
      resumeCount: 0,
      maxResumeAttempts: 3,
      revision: state.relationRevision,
    });
    persistAuthoring();
    return wait({ jobId, status: 'QUEUED' }, 80);
  },
  getCourseRelations(
    courseId: string,
    cursor?: string | null,
    limit = 20,
    weekId?: string,
  ): Promise<{
    items: CourseRelationItem[];
    nextCursor: string | null;
    revision: number;
    endpoints?: RelationEndpointOption[];
  }> {
    const state = ensureAuthoringState(courseId);
    const targetWeek = weekId || state.outline.chapters[0]?.id || '1';
    const list = state.relationsByChapter?.[targetWeek] ?? state.relations.filter((r) => r.sourceChapterId === targetWeek || r.targetChapterId === targetWeek);
    const offset = cursor ? Number(cursor) || 0 : 0;
    const slice = list.slice(offset, offset + limit);
    const nextCursor = offset + limit < list.length ? String(offset + limit) : null;
    const endpoints: RelationEndpointOption[] = [];
    for (const ch of state.outline.chapters) {
      const isTarget = ch.id === targetWeek;
      const isMerged = ch.state === 'PUBLISHED';
      if (!isTarget && !isMerged) continue;
      for (const l of (state.lessonsByChapter[ch.id] ?? []).filter((x) => x.decision !== 'REJECT')) {
        endpoints.push({
          id: l.id,
          name: l.title,
          inDraft: isTarget,
          level: l.level ?? 'lesson',
          canonicalId: l.id,
          weekId: ch.id,
        });
      }
    }
    return wait(
      { items: slice.map((r) => ({ ...r })), nextCursor, revision: state.relationRevision, endpoints },
      60,
    );
  },
  reviewCourseRelation(
    courseId: string,
    relationId: string,
    input: { decision: ReviewDecision; changes?: Partial<CourseRelationItem>; reviewNote?: string; expectedRevision: number },
    weekId?: string,
  ): Promise<{ relation: CourseRelationItem; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const targetWeek = weekId || state.outline.chapters[0]?.id || '1';
    const weekList = state.relationsByChapter?.[targetWeek] ?? state.relations;
    const target = weekList.find((r) => r.id === relationId) ?? state.relations.find((r) => r.id === relationId);
    if (!target) return Promise.reject(new Error('Không tìm thấy quan hệ.'));
    target.decision = input.decision;
    if (input.reviewNote !== undefined) target.reviewNote = input.reviewNote;
    const allLessonsByCh = Object.entries(state.lessonsByChapter).flatMap(([chId, arr]) =>
      arr.map((l) => ({ ...l, chId })),
    );
    if (input.changes?.sourceId) {
      target.sourceId = input.changes.sourceId;
      const found = allLessonsByCh.find((l) => l.id === input.changes?.sourceId);
      if (found) {
        target.sourceName = found.title;
        target.sourceChapterId = found.chId;
      }
    }
    if (input.changes?.targetId) {
      target.targetId = input.changes.targetId;
      const found = allLessonsByCh.find((l) => l.id === input.changes?.targetId);
      if (found) {
        target.targetName = found.title;
        target.targetChapterId = found.chId;
      }
    }
    if (input.changes?.relationType) target.relationType = input.changes.relationType;
    if (input.changes?.strength !== undefined) {
      target.strength = target.relationType === 'PREREQUISITE' ? input.changes.strength : null;
    }
    if (input.changes?.reason !== undefined) target.reason = input.changes.reason;
    if (input.changes?.requiredKnowledge !== undefined) {
      target.requiredKnowledge = input.changes.requiredKnowledge;
    }
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ relation: { ...target }, revision: state.relationRevision }, 50);
  },
  createCourseRelation(
    courseId: string,
    input: {
      sourceId: string;
      targetId: string;
      relationType: 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO';
      strength?: 'hard' | 'soft' | null;
      reason: string;
      requiredKnowledge?: string;
      reviewNote?: string;
      expectedRevision: number;
    },
    weekId?: string,
  ): Promise<{ relation: CourseRelationItem; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const targetWeek = weekId || state.outline.chapters[0]?.id || '1';
    const allLessonsByCh = Object.entries(state.lessonsByChapter).flatMap(([chId, arr]) =>
      arr.map((l) => ({ ...l, chId })),
    );
    const srcNode = allLessonsByCh.find((l) => l.id === input.sourceId);
    const tgtNode = allLessonsByCh.find((l) => l.id === input.targetId);
    const created: CourseRelationItem = {
      id: `manual_rel_${Date.now()}`,
      sourceId: input.sourceId,
      sourceName: srcNode?.title ?? input.sourceId,
      sourceChapterId: srcNode?.chId ?? targetWeek,
      targetId: input.targetId,
      targetName: tgtNode?.title ?? input.targetId,
      targetChapterId: tgtNode?.chId ?? targetWeek,
      relationType: input.relationType,
      strength: input.relationType === 'PREREQUISITE' ? (input.strength ?? 'hard') : null,
      sourceRef: '',
      reason: input.reason || 'Giảng viên bổ sung thủ công',
      requiredKnowledge:
        input.relationType === 'PREREQUISITE' ? input.requiredKnowledge || input.reason : '',
      confidence: 1,
      decision: 'APPROVE',
      reviewNote: input.reviewNote ?? 'Giảng viên thêm quan hệ thủ công',
    };
    if (!state.relationsByChapter) state.relationsByChapter = {};
    state.relationsByChapter[targetWeek] = [...(state.relationsByChapter[targetWeek] ?? []), created];
    state.relations.push(created);
    if (!state.draftPhaseByChapter) state.draftPhaseByChapter = {};
    state.draftPhaseByChapter[targetWeek] = 'ready';
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ relation: { ...created }, revision: state.relationRevision }, 50);
  },
  deleteCourseRelation(
    courseId: string,
    relationId: string,
    _expectedRevision: number,
    weekId?: string,
  ): Promise<{ deleted: boolean; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const targetWeek = weekId || state.outline.chapters[0]?.id || '1';
    if (state.relationsByChapter?.[targetWeek]) {
      state.relationsByChapter[targetWeek] = state.relationsByChapter[targetWeek].filter((r) => r.id !== relationId);
    }
    state.relations = state.relations.filter((r) => r.id !== relationId);
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ deleted: true, revision: state.relationRevision }, 50);
  },
  batchReviewCourseRelations(
    courseId: string,
    input: {
      items: Array<{ relationId: string; decision: ReviewDecision; changes?: Partial<CourseRelationItem>; reviewNote?: string }>;
      expectedRevision: number;
    },
    weekId?: string,
  ): Promise<{ updatedCount: number; revision: number }> {
    const state = ensureAuthoringState(courseId);
    const targetWeek = weekId || state.outline.chapters[0]?.id || '1';
    const weekList = state.relationsByChapter?.[targetWeek] ?? state.relations;
    let updatedCount = 0;
    for (const item of input.items) {
      const target = weekList.find((r) => r.id === item.relationId) ?? state.relations.find((r) => r.id === item.relationId);
      if (target) {
        target.decision = item.decision;
        if (item.reviewNote !== undefined) target.reviewNote = item.reviewNote;
        updatedCount += 1;
      }
    }
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ updatedCount, revision: state.relationRevision }, 60);
  },
  discardCourseRelations(courseId: string, _expectedRevision: number, weekId?: string): Promise<{ revision: number }> {
    const state = ensureAuthoringState(courseId);
    if (weekId) {
      if (state.relationsByChapter) state.relationsByChapter[weekId] = [];
      if (state.draftPhaseByChapter) state.draftPhaseByChapter[weekId] = 'nodes_reviewed';
      state.relations = state.relations.filter((r) => r.sourceChapterId !== weekId && r.targetChapterId !== weekId);
    } else {
      state.relationsByChapter = {};
      state.relations = [];
    }
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ revision: state.relationRevision });
  },
  rebaseWeek(
    courseId: string,
    weekId: string,
    _expectedRevision: number,
  ): Promise<{ weekId: string; revision: number; masterVersion: number }> {
    const state = ensureAuthoringState(courseId);
    if (!state.needsRebaseByChapter) state.needsRebaseByChapter = {};
    state.needsRebaseByChapter[weekId] = false;
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ weekId, revision: state.relationRevision, masterVersion: state.masterVersion }, 60);
  },
  publishWeekToMaster(
    courseId: string,
    weekId: string,
    _expectedRevision: number,
  ): Promise<{ state: 'PUBLISHED'; weekId: string; revision: number; masterVersion: number }> {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === weekId);
    if (!ch) return Promise.reject(new Error('Không tìm thấy buổi học để hợp nhất vào Bản tạm.'));
    const weekRels = state.relationsByChapter?.[weekId] ?? [];
    if (weekRels.some((r) => r.decision === 'PENDING')) {
      return Promise.reject(new Error('422: Vẫn còn quan hệ ở trạng thái Chờ duyệt (PENDING).'));
    }
    ch.state = 'PUBLISHED';
    if (!state.draftPhaseByChapter) state.draftPhaseByChapter = {};
    state.draftPhaseByChapter[weekId] = 'ready';
    if (!state.needsRebaseByChapter) state.needsRebaseByChapter = {};
    state.needsRebaseByChapter[weekId] = false;
    state.masterVersion = Math.max(1, state.masterVersion) + 1;
    if (!state.publishedMasterVersionByChapter) state.publishedMasterVersionByChapter = {};
    state.publishedMasterVersionByChapter[weekId] = state.masterVersion;
    for (const other of state.outline.chapters) {
      if (other.id !== weekId && other.state !== 'PUBLISHED' && (state.lessonsByChapter[other.id]?.length ?? 0) > 0) {
        state.needsRebaseByChapter[other.id] = true;
      }
    }
    state.relationRevision += 1;
    ch.revision = state.relationRevision;
    persistAuthoring();
    return wait({ state: 'PUBLISHED', weekId, revision: state.relationRevision, masterVersion: state.masterVersion }, 80);
  },
  listStep3Snapshots(courseId: string): Promise<Step3SnapshotSummary[]> {
    const state = ensureAuthoringState(courseId);
    return wait([...(state.snapshots ?? [])], 40);
  },
  getStep3Workspace(
    courseId: string,
    params: { focusWeekId: string; weekIds: string[]; snapshotId?: string | null },
  ): Promise<Step3WorkspaceResponse> {
    const state = ensureAuthoringState(courseId);
    const snapshots = state.snapshots ?? [];
    const selectedSnap =
      params.snapshotId === null || params.snapshotId === 'none'
        ? null
        : params.snapshotId && params.snapshotId !== 'latest'
          ? (snapshots.find((s) => s.draftId === params.snapshotId) ?? null)
          : (snapshots[0] ?? null);

    const validIds = new Set(state.outline.chapters.map((c) => c.id));
    const selectedWeekIds = Array.from(
      new Set([params.focusWeekId, ...(params.weekIds ?? [])].filter((id) => validIds.has(id))),
    );
    const nodes: KnowledgeGraphNode[] = [];
    const nodeIds = new Set<string>();
    const edges: KnowledgeGraphEdge[] = [];
    const endpoints: RelationEndpointOption[] = [];

    if (selectedSnap && state.snapshotGraphs?.[selectedSnap.draftId]) {
      const sg = state.snapshotGraphs[selectedSnap.draftId];
      for (const n of sg.nodes) {
        if (!nodeIds.has(n.id)) {
          nodeIds.add(n.id);
          nodes.push({ ...n, properties: { ...(n.properties ?? {}), scope: 'master' } });
          if (n.type === 'Concept') {
            endpoints.push({
              id: n.id,
              name: n.name,
              inDraft: false,
              level: (n.properties?.level as 'topic' | 'lesson') ?? 'lesson',
              canonicalId: n.id,
              weekId: String(n.properties?.week_id ?? ''),
            });
          }
        }
      }
      for (const e of sg.edges) {
        edges.push({ ...e, properties: { ...(e.properties ?? {}), scope: 'master' } });
      }
    }

    const relations: CourseRelationItem[] = [];
    for (const wid of selectedWeekIds) {
      const ch = state.outline.chapters.find((c) => c.id === wid);
      for (const l of (state.lessonsByChapter[wid] ?? []).filter((x) => x.decision !== 'REJECT')) {
        nodeIds.add(l.id);
        const existingIdx = nodes.findIndex((x) => x.id === l.id);
        const activeNode: KnowledgeGraphNode = {
          id: l.id,
          name: l.title,
          type: 'Concept',
          description: l.content,
          properties: {
            scope: 'active',
            week_id: wid,
            chapter_id: wid,
            chapter_title: ch?.title ?? wid,
            level: l.level ?? 'lesson',
          },
        };
        if (existingIdx >= 0) nodes[existingIdx] = activeNode;
        else nodes.push(activeNode);
        const epIdx = endpoints.findIndex((x) => x.id === l.id);
        const epObj: RelationEndpointOption = {
          id: l.id,
          name: l.title,
          inDraft: true,
          level: l.level ?? 'lesson',
          canonicalId: l.id,
          weekId: wid,
        };
        if (epIdx >= 0) endpoints[epIdx] = epObj;
        else endpoints.push(epObj);
      }
      for (const r of state.relationsByChapter?.[wid] ?? []) {
        if (nodeIds.has(r.sourceId) && nodeIds.has(r.targetId)) {
          relations.push({ ...r });
        }
      }
    }
    return wait(
      {
        focusWeekId: params.focusWeekId,
        selectedWeekIds,
        baseSnapshot: selectedSnap,
        snapshots: [...snapshots],
        revision: state.relationRevision,
        graph: { nodes, edges },
        endpoints,
        relations,
      },
      50,
    );
  },
  saveStep3Snapshot(
    courseId: string,
    body: {
      focusWeekId: string;
      selectedWeekIds: string[];
      baseSnapshotId?: string | null;
      title?: string;
      note?: string;
      expectedRevision: number;
    },
  ): Promise<{ snapshot: Step3SnapshotSummary; snapshots: Step3SnapshotSummary[]; revision: number }> {
    const state = ensureAuthoringState(courseId);
    if (!state.snapshots) state.snapshots = [];
    if (!state.snapshotGraphs) state.snapshotGraphs = {};
    const baseSnap = body.baseSnapshotId
      ? state.snapshots.find((s) => s.draftId === body.baseSnapshotId)
      : undefined;
    const baseGraph = baseSnap ? state.snapshotGraphs[baseSnap.draftId] : undefined;
    const nodeMap = new Map<string, KnowledgeGraphNode>();
    const edgeList: KnowledgeGraphEdge[] = [];
    const seenEdge = new Set<string>();
    (baseGraph?.nodes ?? []).forEach((n) => nodeMap.set(n.id, { ...n }));
    (baseGraph?.edges ?? []).forEach((e) => {
      const k = `${e.source}|${e.target}|${e.type}`;
      if (!seenEdge.has(k)) {
        seenEdge.add(k);
        edgeList.push({ ...e });
      }
    });

    const weekIds = Array.from(new Set([body.focusWeekId, ...(body.selectedWeekIds ?? [])]));
    const includedSet = new Set<string>([...(baseSnap?.includedWeekIds ?? []), ...weekIds]);
    for (const wid of weekIds) {
      const ch = state.outline.chapters.find((c) => c.id === wid);
      for (const l of (state.lessonsByChapter[wid] ?? []).filter((x) => x.decision !== 'REJECT')) {
        nodeMap.set(l.id, {
          id: l.id,
          name: l.title,
          type: 'Concept',
          description: l.content,
          properties: {
            week_id: wid,
            chapter_id: wid,
            chapter_title: ch?.title ?? wid,
            level: l.level ?? 'lesson',
            scope: 'master',
          },
        });
      }
      for (const r of state.relationsByChapter?.[wid] ?? []) {
        if (r.decision === 'REJECT') continue;
        const k = `${r.sourceId}|${r.targetId}|${r.relationType}`;
        if (nodeMap.has(r.sourceId) && nodeMap.has(r.targetId) && !seenEdge.has(k)) {
          seenEdge.add(k);
          edgeList.push({
            source: r.sourceId,
            target: r.targetId,
            type: r.relationType,
            properties: { scope: 'master', reason: r.reason ?? '' },
          });
        }
      }
    }

    const nextRev = (state.snapshots[0]?.draftRevision ?? 0) + 1;
    const draftId = `snap-${courseId}-${nextRev}-${Date.now()}`;
    const includedWeekIds = state.outline.chapters
      .map((c) => c.id)
      .filter((id) => includedSet.has(id));
    const snap: Step3SnapshotSummary = {
      draftId,
      courseId,
      effectiveTermNo: 251,
      draftRevision: nextRev,
      baseRevision: state.snapshots[0]?.draftRevision ?? null,
      status: 'approved',
      title: body.title?.trim() || `Bản tạm v${nextRev} (${includedWeekIds.length} chương)`,
      note: body.note ?? '',
      createdAt: new Date().toISOString(),
      includedWeekIds,
      sourceWeekIds: weekIds,
      baseSnapshotId: body.baseSnapshotId ?? null,
      baseSnapshotRevision: baseSnap?.draftRevision ?? null,
      nodeCount: nodeMap.size,
      edgeCount: edgeList.length,
      isStep3Snapshot: true,
    };
    state.snapshotGraphs[draftId] = { nodes: Array.from(nodeMap.values()), edges: edgeList };
    state.snapshots.unshift(snap);
    state.masterVersion = nextRev;
    state.relationRevision += 1;
    persistAuthoring();
    return wait({ snapshot: snap, snapshots: [...state.snapshots], revision: state.relationRevision }, 60);
  },
  getPublicationStatus(courseId: string, publicationId: string): Promise<PublicationStatusResponse> {
    const state = ensureAuthoringState(courseId);
    return wait({
      publicationId,
      releaseNo: Math.max(1, state.masterVersion),
      releaseStatus: 'PUBLISHED',
      syncStatus: 'SYNCED',
      canRecover: false,
    }, 60);
  },

  publishCourseGraph(
    courseId: string,
    expectedRevision: number,
    expectedMasterVersion: number,
    _idempotencyKey: string,
    draftId?: string,
  ): Promise<PublishCourseResponse> {
    const state = ensureAuthoringState(courseId);
    if (!draftId && (state.relationRevision !== expectedRevision || state.masterVersion !== expectedMasterVersion)) {
      return Promise.reject(new Error('409: Phiên bản đồ thị hoặc masterVersion đã thay đổi.'));
    }
    const approvedChapters = state.outline.chapters.filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED');
    if (!draftId && (state.outlineState !== 'OUTLINE_APPROVED' || approvedChapters.length === 0)) {
      return Promise.reject(new Error('422: Cần duyệt khung môn học và ít nhất 1 buổi học trước khi xuất bản Course Graph.'));
    }
    const allChapterRelations: CourseRelationItem[] = [];
    const seenRelKeys = new Set<string>();
    const addRel = (r: CourseRelationItem) => {
      const k = `${r.sourceId}|${r.targetId}|${r.relationType}`;
      if (!seenRelKeys.has(k)) {
        seenRelKeys.add(k);
        allChapterRelations.push(r);
      }
    };
    for (const ch of approvedChapters) {
      for (const r of state.relationsByChapter?.[ch.id] ?? []) addRel(r);
    }
    for (const r of state.relations) addRel(r);

    if (!draftId && allChapterRelations.some((r) => r.decision === 'PENDING')) {
      return Promise.reject(new Error('422: Còn quan hệ giữa các buổi học chưa được duyệt (PENDING).'));
    }

    const course = teacherCoursesStore.find((c) => c.id === courseId);
    if (draftId) {
      state.masterVersion += 1;
      state.coursePublished = true;
      persistAuthoring();
      const publicationId = `pub-${courseId}-${state.masterVersion}`;
      return wait({
        state: 'PUBLISHED',
        revision: expectedRevision,
        masterVersion: state.masterVersion,
        warnings: [],
        publicationId,
      });
    }

    const nodes: KnowledgeGraphNode[] = [
      {
        id: courseId,
        name: course ? `${course.title} (${course.code})` : courseId,
        type: 'Course',
        description: `Course Graph v${state.masterVersion + 1}`,
        properties: { code: course?.code ?? courseId },
      },
    ];
    const edges: KnowledgeGraphEdge[] = [];

    for (const lo of state.outline.learningOutcomes) {
      const loId = `${courseId}.${lo.code.replace(/\./g, '')}`;
      nodes.push({ id: loId, name: `${lo.code}: ${lo.description}`, type: 'LO', properties: { code: lo.code, status: 'approved' } });
      edges.push({ source: loId, target: courseId, type: 'DEVELOP', properties: { status: 'approved' } });
    }

    for (const ch of approvedChapters) {
      ch.state = 'PUBLISHED';
      const lessons = (state.lessonsByChapter[ch.id] ?? []).filter((l) => l.decision !== 'REJECT');
      lessons.forEach((l, idx) => {
        nodes.push({
          id: l.id,
          name: l.title,
          type: 'Concept',
          description: l.content,
          properties: { chapter_id: ch.id, status: 'approved', sourceRef: l.sourceRef },
        });
        const loCode = l.loCodes[0] ?? state.outline.learningOutcomes[0]?.code;
        if (loCode) {
          const loId = `${courseId}.${loCode.replace(/\./g, '')}`;
          edges.push({ source: l.id, target: loId, type: 'DEVELOP', properties: { status: 'approved' } });
        }
        if (idx > 0) {
          edges.push({ source: lessons[idx - 1].id, target: l.id, type: 'PREREQUISITE', properties: { status: 'approved' } });
        }
      });
    }

    for (const rel of allChapterRelations.filter((r) => r.decision !== 'REJECT')) {
      edges.push({
        source: rel.sourceId,
        target: rel.targetId,
        type: rel.relationType,
        properties: { status: 'approved', sourceRef: rel.sourceRef, strength: rel.strength ?? undefined },
      });
    }
    state.relations = allChapterRelations;

    knowledgeGraphStore.set(courseId, { nodes, edges });
    persistKnowledgeGraph();
    if (course) {
      course.totalNodes = nodes.length;
      course.nodesWithContent = nodes.length;
      course.published = true;
      course.pending = 0;
      persistTeacherCourses();
    }

    state.masterVersion += 1;
    state.relationRevision += 1;
    state.coursePublished = true;
    persistAuthoring();
    const publicationId = `pub-${courseId}-${state.masterVersion}`;
    return wait({
      state: 'PUBLISHED',
      revision: state.relationRevision,
      masterVersion: state.masterVersion,
      warnings: [],
      publicationId,
    });
  },
  recoverCoursePublish(courseId: string, publicationId: string): Promise<PublishCourseResponse> {
    const state = ensureAuthoringState(courseId);
    return wait({
      state: 'PUBLISHED',
      revision: state.relationRevision,
      masterVersion: state.masterVersion,
      warnings: [],
      publicationId,
    });
  },

  getWorkflowJob(jobId: string): Promise<WorkflowJobResponse> {
    const job = authoringJobs.get(jobId);
    if (!job) return Promise.reject(new Error('Không tìm thấy job.'));
    job.polls += 1;
    if (job.polls === 1) {
      job.status = 'RUNNING';
      job.progress = 55;
    } else if (job.status !== 'SUCCEEDED') {
      job.status = 'SUCCEEDED';
      job.progress = 100;
      const state = ensureAuthoringState(job.courseId);
      if (job.kind === 'outline') {
        const course = teacherCoursesStore.find((c) => c.id === job.courseId);
        const title = course?.title ?? job.courseId;
        state.outline = {
          learningOutcomes: [
            { code: 'L.O.1', description: `Nắm vững nền tảng lý thuyết của ${title}` },
            { code: 'L.O.2', description: `Phân tích và vận dụng mô hình trong ${title}` },
          ],
          chapters: [
            { id: '1', title: 'Buổi học 1: Tổng quan & Kiến trúc cơ bản', description: '', loCodes: ['L.O.1'], state: 'DRAFT', revision: 1, documentCount: 0 },
            { id: '2', title: 'Buổi học 2: Nguyên lý & Thuật toán cốt lõi', description: '', loCodes: ['L.O.1', 'L.O.2'], state: 'DRAFT', revision: 1, documentCount: 0 },
            { id: '3', title: 'Buổi học 3: Ứng dụng & Đánh giá hệ thống', description: '', loCodes: ['L.O.2'], state: 'DRAFT', revision: 1, documentCount: 0 },
          ],
          sessions: [
            { label: '1', title: 'Buổi học 1: Tổng quan & Kiến trúc cơ bản', topics: [{ chapter_id: '1', title: 'Buổi học 1: Tổng quan & Kiến trúc cơ bản' }], lo_ids: ['L.O.1'], references: [] },
            { label: '2', title: 'Buổi học 2: Nguyên lý & Thuật toán cốt lõi', topics: [{ chapter_id: '2', title: 'Buổi học 2: Nguyên lý & Thuật toán cốt lõi' }], lo_ids: ['L.O.1', 'L.O.2'], references: [] },
            { label: '3', title: 'Buổi học 3: Ứng dụng & Đánh giá hệ thống', topics: [{ chapter_id: '3', title: 'Buổi học 3: Ứng dụng & Đánh giá hệ thống' }], lo_ids: ['L.O.2'], references: [] },
          ],
        };
        state.outlineState = 'OUTLINE_REVIEW';
        state.outlineRevision += 1;
        job.revision = state.outlineRevision;
      } else if (job.kind === 'lesson' && job.chapterId) {
        const ch = state.outline.chapters.find((c) => c.id === job.chapterId);
        const chTitle = ch?.title ?? job.chapterId;
        const weekNum = Number(job.chapterId) || 1;
        state.lessonsByChapter[job.chapterId] = [
          {
            id: `${job.courseId}_${job.chapterId}_l1`,
            title: `Khái niệm nhập môn - ${chTitle}`,
            content: `Định nghĩa cốt lõi, mô hình và ví dụ minh họa trích xuất từ tài liệu ${chTitle}.`,
            sourceRef: `${job.chapterId}_p3`,
            loCodes: ch?.loCodes ?? ['L.O.1'],
            aliases: ['Khái niệm cơ bản'],
            outcome: `Trình bày được định nghĩa và vai trò của ${chTitle}.`,
            level: 'topic',
            durationMin: 10,
            defaultWeek: weekNum,
            confidence: 0.96,
            details: [{ name: 'Định nghĩa & mô hình', evidence: [{ slideId: `${job.chapterId}_p4`, quote: `Khái niệm nền tảng của ${chTitle}.` }] }],
            evidence: [{ slideId: `${job.chapterId}_p3`, quote: `Giới thiệu tổng quan và các thành phần chính trong ${chTitle}.` }],
            reuseId: null,
            assessment: { verdict: 'supported', issue: '' },
            aiComment: 'AI đã kiểm tra lại: khớp 96% với tài liệu buổi học và L.O.1.',
            hasWarning: false,
            decision: 'PENDING',
            reviewNote: '',
          },
          {
            id: `${job.courseId}_${job.chapterId}_l2`,
            title: `Cơ chế hoạt động & Phân tích - ${chTitle}`,
            content: `Phân tích cơ chế vận hành, độ phức tạp và các trường hợp biên trong ${chTitle}.`,
            sourceRef: `${job.chapterId}_p9`,
            loCodes: ch?.loCodes ?? ['L.O.1'],
            aliases: ['Phân tích cơ chế'],
            outcome: `Phân tích được cơ chế hoạt động và đánh giá độ phức tạp trong ${chTitle}.`,
            level: 'lesson',
            durationMin: 15,
            defaultWeek: weekNum,
            confidence: 0.78,
            details: [{ name: 'Trường hợp biên & độ phức tạp', evidence: [{ slideId: `${job.chapterId}_p12`, quote: `Đánh giá chi phí thực thi trong ${chTitle}.` }] }],
            evidence: [{ slideId: `${job.chapterId}_p9`, quote: `Quy trình xử lý từng bước và ví dụ minh họa.` }],
            reuseId: null,
            assessment: { verdict: 'revise', issue: 'Phần ví dụ thực nghiệm cần giảng viên rà soát thêm.' },
            aiComment: 'AI nghi ngờ: Phần ví dụ thực nghiệm cần giảng viên rà soát thêm.',
            hasWarning: true,
            decision: 'PENDING',
            reviewNote: '',
          },
          {
            id: `${job.courseId}_${job.chapterId}_l3`,
            title: `Bài tập vận dụng - ${chTitle}`,
            content: `Tổng hợp câu hỏi ôn tập và tình huống áp dụng cho ${chTitle}.`,
            sourceRef: `${job.chapterId}_p17`,
            loCodes: ch?.loCodes ?? ['L.O.2'],
            aliases: ['Thực hành vận dụng'],
            outcome: `Vận dụng được kiến thức ${chTitle} để giải quyết bài tập mẫu.`,
            level: 'lesson',
            durationMin: 12,
            defaultWeek: weekNum,
            confidence: 0.92,
            details: [{ name: 'Bài tập tình huống', evidence: [{ slideId: `${job.chapterId}_p18`, quote: `Bài tập áp dụng thực tế cho ${chTitle}.` }] }],
            evidence: [{ slideId: `${job.chapterId}_p17`, quote: `Tổng kết các dạng bài tập trọng tâm.` }],
            reuseId: null,
            assessment: { verdict: 'supported', issue: '' },
            aiComment: 'AI đã đối chiếu chuẩn đầu ra: đạt yêu cầu.',
            hasWarning: false,
            decision: 'PENDING',
            reviewNote: '',
          },
        ];
        if (ch) {
          ch.state = 'LESSON_REVIEW';
          ch.revision += 1;
          job.revision = ch.revision;
        }
      } else if (job.kind === 'relation' && job.chapterIds) {
        const activeWeekId = job.chapterId ?? job.chapterIds[0];
        const activeLessons = (state.lessonsByChapter[activeWeekId] ?? []).filter((l) => l.decision !== 'REJECT');
        const generated: CourseRelationItem[] = [];
        // 1. Intra-chapter relations within the active chapter
        for (let i = 0; i < activeLessons.length - 1; i += 1) {
          generated.push({
            id: `rel-${activeWeekId}-intra-${i + 1}`,
            sourceId: activeLessons[i].id,
            sourceName: activeLessons[i].title,
            sourceChapterId: activeWeekId,
            targetId: activeLessons[i + 1].id,
            targetName: activeLessons[i + 1].title,
            targetChapterId: activeWeekId,
            relationType: activeLessons[i].level === 'lesson' && activeLessons[i + 1].level === 'topic' ? 'PART_OF' : 'PREREQUISITE',
            strength: activeLessons[i].level === 'lesson' && activeLessons[i + 1].level === 'topic' ? null : 'hard',
            sourceRef: activeLessons[i].sourceRef,
            reason: `Kiến thức "${activeLessons[i].title}" làm cơ sở trực tiếp cho "${activeLessons[i + 1].title}".`,
            requiredKnowledge: `Nắm vững ${activeLessons[i].title}`,
            confidence: 0.92,
            evidence: activeLessons[i].evidence ?? [],
            assessment: { verdict: 'supported', issue: '' },
            aiComment: 'AI đề xuất liên kết nội chương.',
            hasWarning: false,
            decision: 'PENDING',
            reviewNote: '',
          });
        }
        // 2. Cross-chapter relations connecting already-merged (Bản tạm) chapters to active chapter
        const mergedChapters = state.outline.chapters.filter((c) => c.id !== activeWeekId && c.state === 'PUBLISHED');
        mergedChapters.forEach((mCh, mIdx) => {
          const mLessons = (state.lessonsByChapter[mCh.id] ?? []).filter((l) => l.decision !== 'REJECT');
          if (mLessons.length && activeLessons.length) {
            const src = mLessons[mLessons.length - 1];
            const tgt = activeLessons[0];
            generated.push({
              id: `rel-${mCh.id}-to-${activeWeekId}-${mIdx + 1}`,
              sourceId: src.id,
              sourceName: src.title,
              sourceChapterId: mCh.id,
              targetId: tgt.id,
              targetName: tgt.title,
              targetChapterId: activeWeekId,
              relationType: mIdx === mergedChapters.length - 1 ? 'PREREQUISITE' : 'RELATED_TO',
              strength: mIdx === mergedChapters.length - 1 ? 'hard' : null,
              sourceRef: tgt.sourceRef,
              reason: `Nối "${src.title}" (${mCh.title}) từ Bản tạm sang "${tgt.title}" của chương đang xử lý.`,
              requiredKnowledge: mIdx === mergedChapters.length - 1 ? `Nắm vững ${src.title}` : '',
              confidence: 0.88,
              evidence: tgt.evidence ?? [],
              assessment: mIdx === 0 ? { verdict: 'supported', issue: '' } : { verdict: 'revise', issue: 'Kiểm tra lại độ mạnh tiên quyết liên chương.' },
              aiComment: mIdx === 0 ? 'AI đề xuất liên kết với Bản tạm.' : 'AI gợi ý kiểm tra độ mạnh liên kết.',
              hasWarning: mIdx !== 0,
              decision: 'PENDING',
              reviewNote: '',
            });
          }
        });
        if (!state.relationsByChapter) state.relationsByChapter = {};
        state.relationsByChapter[activeWeekId] = generated;
        if (!state.draftPhaseByChapter) state.draftPhaseByChapter = {};
        state.draftPhaseByChapter[activeWeekId] = 'ready';
        if (!state.needsRebaseByChapter) state.needsRebaseByChapter = {};
        state.needsRebaseByChapter[activeWeekId] = false;
        state.relations = [
          ...state.relations.filter((r) => r.sourceChapterId !== activeWeekId && r.targetChapterId !== activeWeekId),
          ...generated,
        ];
        state.relationRevision += 1;
        job.revision = state.relationRevision;
      }
      persistAuthoring();
    }
    return wait({
      jobId,
      status: job.status,
      progress: job.progress,
      result: job.status === 'SUCCEEDED'
        ? { revision: job.revision, weekId: job.chapterId ?? job.chapterIds?.[0] }
        : undefined,
      error: undefined,
      canResume: job.canResume,
      resumeCount: job.resumeCount,
      maxResumeAttempts: job.maxResumeAttempts,
      resumeBlockedReason: job.resumeCount >= job.maxResumeAttempts ? 'RESUME_LIMIT_REACHED' : undefined,
    }, 150);
  },
  listActiveWorkflowJobs(
    courseId: string,
  ): Promise<Array<WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }>> {
    const out: Array<WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }> = [];
    for (const [jobId, job] of authoringJobs.entries()) {
      if (job.courseId !== courseId) continue;
      if (job.status !== 'QUEUED' && job.status !== 'RUNNING') continue;
      out.push({
        jobId,
        kind: job.kind,
        status: job.status,
        progress: job.progress,
        weekId: job.chapterId ?? job.chapterIds?.[0] ?? null,
        canResume: false,
        resumeCount: job.resumeCount,
        maxResumeAttempts: job.maxResumeAttempts,
      });
    }
    return wait(out, 60);
  },
  cancelWorkflowJob(jobId: string): Promise<WorkflowJobResponse> {
    const job = authoringJobs.get(jobId);
    if (!job) return Promise.reject(new Error('Không tìm thấy job.'));
    job.status = 'CANCELLED';
    job.canResume = job.resumeCount < job.maxResumeAttempts;
    return wait({
      jobId,
      status: 'CANCELLED',
      progress: job.progress,
      weekId: job.chapterId ?? job.chapterIds?.[0] ?? null,
      canResume: job.canResume,
      resumeCount: job.resumeCount,
      maxResumeAttempts: job.maxResumeAttempts,
      cancelRequested: true,
      rawState: 'cancelled',
    }, 80);
  },
  cancelPendingWorkflowJobs(courseId: string): Promise<{
    cancelledCount: number;
    cancelledJobIds: string[];
    jobs: Array<WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }>;
  }> {
    const cancelled: Array<WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }> = [];
    for (const [jobId, job] of authoringJobs.entries()) {
      if (job.courseId !== courseId) continue;
      if (job.status !== 'QUEUED' && job.status !== 'RUNNING') continue;
      job.status = 'CANCELLED';
      job.canResume = job.resumeCount < job.maxResumeAttempts;
      cancelled.push({
        jobId,
        kind: job.kind,
        status: 'CANCELLED',
        progress: job.progress,
        weekId: job.chapterId ?? job.chapterIds?.[0] ?? null,
        canResume: job.canResume,
        resumeCount: job.resumeCount,
        maxResumeAttempts: job.maxResumeAttempts,
        cancelRequested: true,
        rawState: 'cancelled',
      });
    }
    return wait({
      cancelledCount: cancelled.length,
      cancelledJobIds: cancelled.map((j) => j.jobId!).filter(Boolean),
      jobs: cancelled,
    }, 80);
  },
  resumeWorkflowJob(jobId: string, _idempotencyKey: string): Promise<{ jobId: string; status: 'QUEUED' }> {
    const job = authoringJobs.get(jobId);
    if (!job) return Promise.reject(new Error('Không tìm thấy job.'));
    if (job.resumeCount >= job.maxResumeAttempts) {
      return Promise.reject(new Error('409: Đã vượt quá số lần resume tối đa (3 lần).'));
    }
    job.resumeCount += 1;
    job.status = 'QUEUED';
    job.polls = 0;
    return wait({ jobId, status: 'QUEUED' }, 80);
  },
  getChapterSourceReadiness(courseId: string, chapterId: string) {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    const hasDocs = (ch?.documentCount ?? 0) > 0;
    return wait({
      status: hasDocs ? ('ready' as const) : ('warning' as const),
      canGenerate: hasDocs,
      counts: {
        totalPages: hasDocs ? 24 : 0,
        readablePages: hasDocs ? 22 : 0,
        lowTextPages: hasDocs ? 2 : 0,
      },
      warnings: hasDocs
        ? ['2 trang có ít văn bản (chủ yếu là sơ đồ/hình ảnh), hệ thống chỉ trích xuất phần text layer.']
        : ['Chưa có tài liệu buổi học nào được tải lên.'],
      ocrPages: [],
      excludedOcrCount: 0,
      revision: ch?.revision ?? 1,
    }, 60);
  },
  excludeChapterOcrPages(
    courseId: string,
    chapterId: string,
    body: { expectedRevision: number; slideIds?: string[]; reason?: string },
  ) {
    const state = ensureAuthoringState(courseId);
    const ch = state.outline.chapters.find((c) => c.id === chapterId);
    const nextRev = (ch?.revision ?? body.expectedRevision) + 1;
    if (ch) ch.revision = nextRev;
    state.relationRevision = nextRev;
    persistAuthoring();
    return wait({
      revision: nextRev,
      remainingOcrPages: [] as Array<{ slideId: string; file: string; page: number }>,
      excludedCount: body.slideIds?.length ?? 0,
    }, 60);
  },
  getCourseUsage(courseId: string) {
    const state = ensureAuthoringState(courseId);
    const lessonCount = Object.values(state.lessonsByChapter).reduce((s, arr) => s + arr.length, 0);
    const calls = Math.max(1, lessonCount + state.relations.length);
    const est = Number((calls * 0.015).toFixed(3));
    return wait({
      totalCalls: calls,
      providerReportedCostUsd: est,
      estimatedCostUsd: est,
      budgetLimitUsd: 5.0,
      remainingBudgetUsd: Number(Math.max(0, 5.0 - est).toFixed(3)),
    }, 50);
  },
  getAdaptiveSettings(courseId: string) {
    try {
      const raw = localStorage.getItem(`g4lms.adaptive.${courseId}`);
      if (raw) return wait(JSON.parse(raw), 40);
    } catch { /* ignore */ }
    return wait({
      masteryThreshold: 80,
      hardPrereqStrict: true,
      softPrereqWeight: 40,
      quizWeight: 60,
      assignmentWeight: 40,
      remedialTriggerScore: 55,
      allowSkipMastered: true,
      maxWeeklyMinutes: 180,
    }, 40);
  },
  saveAdaptiveSettings(courseId: string, settings: import('../src/types').AdaptiveCourseSettings) {
    try {
      localStorage.setItem(`g4lms.adaptive.${courseId}`, JSON.stringify(settings));
    } catch { /* ignore */ }
    return wait(settings, 60);
  },
  getCourseOnboardingConfig(courseId: string): Promise<import('../src/types').CourseOnboardingConfig> {
    try {
      const raw = localStorage.getItem(`g4lms.onboardingConfig.${courseId}`);
      if (raw) return wait(JSON.parse(raw), 50);
    } catch { /* ignore */ }
    return wait({
      surveyEnabled: true,
      surveyTitle: `Khảo sát đầu vào môn ${courseId}`,
      collectBackground: true,
      collectGoal: true,
      collectWeeklyHours: true,
      diagnosticEnabled: true,
      diagnosticPassScore: 60,
      diagnosticQuestions: [
        {
          id: `${courseId}-diag-1`,
          prompt: `Bạn đã nắm vững khái niệm nền tảng trước khi học ${courseId} ở mức nào?`,
          options: ['Khái niệm cơ bản về biến và hàm', 'Cấu trúc dữ liệu tuyến tính cơ bản', 'Giải thuật đệ quy và độ phức tạp', 'Chưa từng tiếp xúc'],
          correctIndex: 2,
          conceptTag: 'Nền tảng đầu vào',
        },
        {
          id: `${courseId}-diag-2`,
          prompt: 'Độ phức tạp thời gian của thao tác truy cập phần tử theo chỉ số trong mảng (Array) là bao nhiêu?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
          correctIndex: 0,
          conceptTag: 'Độ phức tạp',
        },
      ],
    }, 50);
  },
  saveCourseOnboardingConfig(courseId: string, config: import('../src/types').CourseOnboardingConfig) {
    try {
      localStorage.setItem(`g4lms.onboardingConfig.${courseId}`, JSON.stringify(config));
    } catch { /* ignore */ }
    return wait(config, 60);
  },
  getStudentOnboardingResult(courseId: string): Promise<import('../src/types').StudentOnboardingResult> {
    try {
      const raw = localStorage.getItem(`g4lms.onboardingResult.${courseId}`);
      if (raw) return wait(JSON.parse(raw), 50);
    } catch { /* ignore */ }
    return wait({ completed: false }, 50);
  },
  async submitStudentOnboarding(
    courseId: string,
    input: { survey?: import('../src/types').StudentOnboardingResult['survey']; diagnosticAnswers: Record<string, number> },
  ): Promise<import('../src/types').StudentOnboardingResult> {
    const cfg = await this.getCourseOnboardingConfig(courseId);
    const total = cfg.diagnosticQuestions.length;
    const correct = cfg.diagnosticQuestions.filter((q) => input.diagnosticAnswers[q.id] === q.correctIndex).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 100;
    const passed = score >= cfg.diagnosticPassScore;
    const transcriptGpa = 3.2;
    const result: import('../src/types').StudentOnboardingResult = {
      completed: true,
      completedAt: new Date().toISOString(),
      survey: input.survey,
      diagnosticScore: score,
      diagnosticPassed: passed,
      transcriptGpa,
      summary: passed
        ? `Đạt chẩn đoán (${score}%), GPA tham chiếu ${transcriptGpa}. Sẵn sàng vào lộ trình chuẩn.`
        : `Chẩn đoán ${score}% (< ${cfg.diagnosticPassScore}%). Hệ thống đề xuất bổ trợ kiến thức nền ở đầu lộ trình.`,
    };
    try {
      localStorage.setItem(`g4lms.onboardingResult.${courseId}`, JSON.stringify(result));
    } catch { /* ignore */ }
    return wait(result, 80);
  },
  proposeMasterGraphBridges(courseId: string): Promise<{ bridges: import('../src/types').MasterGraphBridge[] }> {
    const current = teacherCoursesStore.find((c) => c.id === courseId);
    const others = teacherCoursesStore.filter((c) => c.id !== courseId && c.published);
    const target = others[0] ?? { id: 'CO1007', code: 'CO1007' };
    const bridges: import('../src/types').MasterGraphBridge[] = [
      {
        id: `bridge-${courseId}-${target.id}-1`,
        sourceCourseId: target.id,
        sourceCourseCode: target.code,
        sourceLoCode: 'LO1',
        targetCourseId: courseId,
        targetCourseCode: current?.code ?? courseId,
        targetLoCode: 'LO1',
        relationType: 'PREREQUISITE',
        reason: `Chuẩn đầu ra nền tảng của ${target.code} là kiến thức tiên quyết giúp tiếp thu tốt học phần ${current?.code ?? courseId}.`,
        decision: 'PENDING',
      },
      {
        id: `bridge-${courseId}-${target.id}-2`,
        sourceCourseId: courseId,
        sourceCourseCode: current?.code ?? courseId,
        sourceLoCode: 'LO2',
        targetCourseId: others[1]?.id ?? 'CO3093',
        targetCourseCode: others[1]?.code ?? 'CO3093',
        targetLoCode: 'LO1',
        relationType: 'RELATED_TO',
        reason: 'Liên kết khái niệm thuật toán và cấu trúc dữ liệu ứng dụng sang học phần tiếp theo.',
        decision: 'PENDING',
      },
    ];
    return wait({ bridges }, 120);
  },
  integrateMasterGraph(
    _courseId: string,
    bridges: import('../src/types').MasterGraphBridge[],
  ): Promise<{ integratedCount: number; masterVersion: number; warnings: string[] }> {
    const approved = bridges.filter((b) => b.decision === 'APPROVE');
    // Check simple inter-course prerequisite cycle (A -> B and B -> A)
    const prereqs = approved.filter((b) => b.relationType === 'PREREQUISITE');
    for (const a of prereqs) {
      const reverse = prereqs.find((b) => b.sourceCourseId === a.targetCourseId && b.targetCourseId === a.sourceCourseId);
      if (reverse) {
        return Promise.reject(
          new Error(`Phát hiện chu trình tiên quyết liên môn giữa ${a.sourceCourseCode} và ${a.targetCourseCode}. Vui lòng điều chỉnh trước khi lưu.`),
        );
      }
    }
    return wait({ integratedCount: approved.length, masterVersion: 1, warnings: [] }, 100);
  },
};
