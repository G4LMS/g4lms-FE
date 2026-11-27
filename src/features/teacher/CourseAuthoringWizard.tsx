import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  GitBranch,
  Layers,
  Link2,
  List,
  Lock,
  Maximize2,
  Minimize2,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { GraphHealthPanel } from '../graph/GraphHealthPanel';
import {
  Neo4jDraftGraph,
  type CreateDraftLessonInput,
  type CreateDraftRelationInput,
} from '../graph/Neo4jDraftGraph';
import type {
  AssessmentVerdict,
  ChapterLessonItem,
  ChapterWorkflowState,
  CourseOutlineData,
  CourseRelationItem,
  CourseUsageSummary,
  KnowledgeGraphData,
  OutlineChapter,
  OutlineState,
  PublicationStatusResponse,
  RelationEndpointOption,
  ReviewDecision,
  SourceReadinessResponse,
  Step3SnapshotSummary,
  WorkflowJobResponse,
  WorkflowJobStatus,
} from '../../types';

interface Props {
  courseId: string;
  courseName: string;
  hasPublishedGraph?: boolean;
  onPublishedGraph: () => void;
  onGraphUpdated?: () => void;
  onAuthorConceptContent?: () => void;
}

type Step = 1 | 2 | 3 | 4;

function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSavedWizardStep(courseId: string): Step {
  try {
    const raw = window.sessionStorage.getItem(`g4lms.wizard.step.${courseId}`);
    const parsed = Number(raw);
    if (parsed >= 1 && parsed <= 4) return parsed as Step;
  } catch {
    // Ignore storage errors
  }
  return 1;
}

function saveWizardStep(courseId: string, step: Step): void {
  try {
    window.sessionStorage.setItem(`g4lms.wizard.step.${courseId}`, String(step));
  } catch {
    // Ignore storage errors
  }
}

const CHAPTER_STATE_LABEL: Record<ChapterWorkflowState, { text: string; tone: string }> = {
  DRAFT: { text: 'Bản nháp', tone: 'muted' },
  LESSON_REVIEW: { text: 'Chờ duyệt bài học', tone: 'amber' },
  LESSON_APPROVED: { text: 'Đã duyệt buổi học', tone: 'green' },
  PUBLISHED: { text: 'Đã xuất bản', tone: 'blue' },
};

const OUTLINE_STATE_LABEL: Record<OutlineState, { text: string; tone: string }> = {
  DRAFT: { text: 'Bản nháp', tone: 'muted' },
  OUTLINE_REVIEW: { text: 'Đang kiểm tra khung', tone: 'amber' },
  OUTLINE_APPROVED: { text: 'Đã duyệt khung (OUTLINE_APPROVED)', tone: 'green' },
};

const DECISION_BADGE: Record<ReviewDecision, { text: string; color: string }> = {
  PENDING: { text: 'Chờ quyết định', color: '#b45309' },
  APPROVE: { text: 'Đã duyệt', color: '#15803d' },
  EDIT: { text: 'Đã chỉnh sửa', color: '#1d4ed8' },
  REJECT: { text: 'Đã từ chối', color: '#b91c1c' },
};

const VERDICT_BADGE: Record<AssessmentVerdict, { text: string; color: string }> = {
  supported: { text: 'AI: Đủ bằng chứng', color: '#15803d' },
  revise: { text: 'AI: Cần chỉnh sửa', color: '#b45309' },
  unsupported: { text: 'AI: Thiếu bằng chứng', color: '#b91c1c' },
};

function formatReadinessWarning(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const msgMatch =
    trimmed.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/) ??
    trimmed.match(/message\s*[:=]\s*([^\n}]+)/);
  if (!msgMatch) return trimmed;
  const msg = msgMatch[1].trim();
  const slidesMatch = trimmed.match(/['"](?:slide_ids|page_ids)['"]\s*:\s*\[([^\]]*)\]/);
  if (slidesMatch) {
    const count = slidesMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length;
    if (count > 0) return `${msg} (${count} trang)`;
  }
  return msg;
}

function formatSlidePage(slideId?: string): string {
  if (!slideId) return '';
  const pageMatch = slideId.match(/:p(\d+)$/i);
  if (pageMatch) return `Tr. ${pageMatch[1]}`;
  const tail = slideId.split(':').pop();
  return tail || slideId;
}

function shortReuseId(reuseId?: string | null): string {
  if (!reuseId) return '';
  return reuseId.split(':').pop() || reuseId;
}

const JOB_STATUS_INFO: Record<WorkflowJobStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'red' | 'muted' }> = {
  QUEUED: { label: 'Đang xếp hàng', tone: 'blue' },
  RUNNING: { label: 'Đang xử lý', tone: 'blue' },
  SUCCEEDED: { label: 'Hoàn tất', tone: 'green' },
  BLOCKED: { label: 'Tạm dừng', tone: 'amber' },
  FAILED: { label: 'Thất bại', tone: 'red' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
};

function formatJobError(err?: string): string {
  if (!err) return '';
  const code = err.trim();
  if (code === 'provider_quota') {
    return 'Giới hạn hạn mức / tín dụng OpenRouter — hệ thống sẽ tự thử lại sau khi hết thời gian chờ.';
  }
  if (code === 'budget_exceeded') {
    return 'Đã chạm giới hạn ngân sách AI của môn học.';
  }
  return code;
}

export function CourseAuthoringWizard({ courseId, courseName, hasPublishedGraph: _hasPublishedGraph = false, onPublishedGraph, onGraphUpdated, onAuthorConceptContent }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // D1 Outline state
  const [outline, setOutline] = useState<CourseOutlineData>({ chapters: [], learningOutcomes: [] });
  const [outlineState, setOutlineState] = useState<OutlineState>('DRAFT');
  const [outlineRevision, setOutlineRevision] = useState(1);
  const [syllabusFiles, setSyllabusFiles] = useState<File[]>([]);

  // D2 Session lessons state
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [chapterFiles, setChapterFiles] = useState<File[]>([]);
  const [lessons, setLessons] = useState<ChapterLessonItem[]>([]);
  const [lessonsCursor, setLessonsCursor] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [lessonFilter, setLessonFilter] = useState<'all' | 'pending' | 'warn' | 'approved' | 'rejected'>('all');
  const [expandedLessonIds, setExpandedLessonIds] = useState<Record<string, boolean>>({});
  const [d2ViewMode, setD2ViewMode] = useState<'graph' | 'list'>('graph');
  const [d2SidebarCollapsed, setD2SidebarCollapsed] = useState(false);
  const [manualLessonCanvas, setManualLessonCanvas] = useState(false);
  const [d2CreateTrigger, setD2CreateTrigger] = useState(0);

  useEffect(() => {
    setLessonFilter('all');
    setExpandedLessonIds({});
    setEditingLessonId(null);
    setManualLessonCanvas(false);
    setD2CreateTrigger(0);
  }, [selectedChapterId]);

  // Maximize / Focus layout state
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  // D3 Incremental Relations state
  const [activeRelationWeekId, setActiveRelationWeekId] = useState<string>('');
  const [relations, setRelations] = useState<CourseRelationItem[]>([]);
  const [relationEndpoints, setRelationEndpoints] = useState<RelationEndpointOption[]>([]);
  const [relationsCursor, setRelationsCursor] = useState<string | null>(null);
  const [relationRevision, setRelationRevision] = useState(1);
  const [relationsStale, setRelationsStale] = useState(false);
  const [d3ViewMode, setD3ViewMode] = useState<'neo4j' | 'list'>('neo4j');
  const [d3ListFilter, setD3ListFilter] = useState<
    'all' | 'cross' | 'intra' | 'pending' | 'warn' | 'approved' | 'rejected'
  >('all');
  const [d3SidebarCollapsed, setD3SidebarCollapsed] = useState(false);
  const [d3ConnectTrigger, setD3ConnectTrigger] = useState(0);
  const [d3FocusEdgeRequest, setD3FocusEdgeRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [step3Snapshots, setStep3Snapshots] = useState<Step3SnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null | '__latest__'>('__latest__');
  const [selectedStep3WeekIds, setSelectedStep3WeekIds] = useState<string[]>([]);
  const [activeBaseSnapshot, setActiveBaseSnapshot] = useState<Step3SnapshotSummary | null>(null);
  const [publishSnapshotId, setPublishSnapshotId] = useState<string>('');

  // D4 Review & D5 Publish state
  const [reviewGraph, setReviewGraph] = useState<KnowledgeGraphData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewHealthOpen, setReviewHealthOpen] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [masterVersion, setMasterVersion] = useState(0);
  const [latestReleaseNo, setLatestReleaseNo] = useState(0);
  const [coursePublishedFromBe, setCoursePublishedFromBe] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [unlockedForRevision, setUnlockedForRevision] = useState(false);
  const hasInitializedStepRef = useRef(false);
  const [pendingPublicationId, setPendingPublicationId] = useState<string | null>(null);
  const [pubStatus, setPubStatus] = useState<PublicationStatusResponse | null>(null);
  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);

  useEffect(() => {
    hasInitializedStepRef.current = false;
    setUnlockedForRevision(false);
    setJustPublished(false);
    setStep3Snapshots([]);
    setSelectedSnapshotId('__latest__');
    setSelectedStep3WeekIds([]);
    setActiveBaseSnapshot(null);
    setPublishSnapshotId('');
  }, [courseId]);

  // D5 Active Job state
  const [activeJob, setActiveJob] = useState<(WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }) | null>(null);
  const [pendingJobs, setPendingJobs] = useState<Array<WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }>>([]);
  const [cancellingJob, setCancellingJob] = useState(false);
  const [usage, setUsage] = useState<CourseUsageSummary | null>(null);
  const [sourceReadiness, setSourceReadiness] = useState<SourceReadinessResponse | null>(null);
  const [d3SourceReadiness, setD3SourceReadiness] = useState<SourceReadinessResponse | null>(null);

  const refreshPendingJobs = useCallback(async () => {
    try {
      const jobs = await api.listActiveWorkflowJobs(courseId);
      setPendingJobs(jobs);
      setActiveJob((prev) => prev ?? jobs[0] ?? null);
    } catch {
      // Ignore transient refresh error
    }
  }, [courseId]);

  const loadOutline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getOutlineDraft(courseId);
      setOutline(res.outline);
      setOutlineState(res.state);
      setOutlineRevision(res.revision);
      setMasterVersion(res.masterVersion ?? 0);
      setLatestReleaseNo(res.latestReleaseNo ?? 0);
      setCoursePublishedFromBe(Boolean(res.coursePublished));
      const initialPending =
        res.activeJobs ??
        (res.activeJob && (res.activeJob.status === 'QUEUED' || res.activeJob.status === 'RUNNING')
          ? [res.activeJob]
          : []);
      setPendingJobs(initialPending);
      if (res.activeJob && res.activeJob.status !== 'SUCCEEDED') {
        setActiveJob({
          kind: res.activeJob.kind,
          jobId: res.activeJob.jobId,
          status: res.activeJob.status,
          progress: res.activeJob.progress ?? 0,
          weekId: res.activeJob.weekId,
          stageLabel: res.activeJob.stageLabel,
          canResume: res.activeJob.canResume ?? (res.activeJob.status === 'BLOCKED' || res.activeJob.status === 'FAILED'),
          resumeCount: res.activeJob.resumeCount ?? 0,
          maxResumeAttempts: res.activeJob.maxResumeAttempts ?? 3,
          cancelRequested: res.activeJob.cancelRequested,
        });
      }
      if (res.outline.chapters.length && !selectedChapterId) {
        setSelectedChapterId(res.outline.chapters[0].id);
      }
      const approvedIds = res.outline.chapters
        .filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED')
        .map((c) => c.id);
      const firstUnmerged =
        res.outline.chapters.find((c) => c.state !== 'PUBLISHED' && c.state === 'LESSON_APPROVED') ||
        res.outline.chapters.find((c) => c.state !== 'PUBLISHED') ||
        res.outline.chapters[res.outline.chapters.length - 1];
      setActiveRelationWeekId((prev) =>
        prev && res.outline.chapters.some((c) => c.id === prev) ? prev : (firstUnmerged?.id ?? ''),
      );

      const allWeeksMergedInOutline =
        res.state === 'OUTLINE_APPROVED' &&
        res.outline.chapters.length > 0 &&
        res.outline.chapters.every((c) => c.state === 'PUBLISHED');
      const courseAlreadyPublished = Boolean(res.coursePublished) || _hasPublishedGraph;

      if (!hasInitializedStepRef.current) {
        hasInitializedStepRef.current = true;
        if (res.state !== 'OUTLINE_APPROVED') {
          setStep(1);
        } else {
          const allChaptersApproved =
            res.outline.chapters.length > 0 && approvedIds.length === res.outline.chapters.length;
          const savedStep = getSavedWizardStep(courseId);
          if (!allChaptersApproved) {
            setStep(2);
          } else if (!allWeeksMergedInOutline) {
            setStep(3);
          } else if (savedStep >= 4 || courseAlreadyPublished) {
            setReviewConfirmed(true);
            setStep(4);
          } else {
            setStep(3);
          }
        }
      }
      return res;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải khung môn học.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId, selectedChapterId, _hasPublishedGraph]);

  const loadChapterLessons = useCallback(
    async (cid: string, append = false, cursor?: string | null) => {
      if (!cid) return;
      try {
        const [res, readiness, usageRes] = await Promise.all([
          api.getChapterLessons(courseId, cid, cursor, 100),
          api.getChapterSourceReadiness(courseId, cid).catch(() => null),
          api.getCourseUsage(courseId).catch(() => null),
        ]);
        if (readiness) setSourceReadiness(readiness);
        if (usageRes) setUsage(usageRes);
        setLessons((prev) => (append ? [...prev, ...res.items] : res.items));
        setLessonsCursor(res.nextCursor);
        setOutline((prev) => ({
          ...prev,
          chapters: prev.chapters.map((c) => (c.id === cid ? { ...c, revision: res.revision } : c)),
        }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Không thể tải bài học buổi học.');
      }
    },
    [courseId],
  );

  const relationWeekId =
    (activeRelationWeekId && outline.chapters.some((c) => c.id === activeRelationWeekId)
      ? activeRelationWeekId
      : '') ||
    outline.chapters.find((c) => c.state !== 'PUBLISHED' && c.state === 'LESSON_APPROVED')?.id ||
    outline.chapters.find((c) => c.state !== 'PUBLISHED')?.id ||
    outline.chapters[0]?.id ||
    'week_1';

  const effectiveSelectedWeekIds = Array.from(
    new Set([relationWeekId, ...selectedStep3WeekIds].filter((id) => Boolean(id) && outline.chapters.some((c) => c.id === id))),
  );
  const selectedWeeksKey = effectiveSelectedWeekIds.join(',');

  const loadRelations = useCallback(
    async (append = false, cursor?: string | null, overrideWeekId?: string) => {
      const targetWeekId = overrideWeekId || relationWeekId;
      if (!targetWeekId) return;
      try {
        const res = await api.getCourseRelations(courseId, cursor, 200, targetWeekId);
        setRelations((prev) => (append ? [...prev, ...res.items] : res.items));
        if (res.endpoints) setRelationEndpoints(res.endpoints);
        setRelationsCursor(res.nextCursor);
        setRelationRevision(res.revision);
        setRelationsStale(false);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách quan hệ.');
      }
    },
    [courseId, relationWeekId],
  );

  const loadStep3Workspace = useCallback(
    async (overrideFocusId?: string, overrideWeekIds?: string[], overrideSnapshotId?: string | null) => {
      const focusId = overrideFocusId || relationWeekId;
      if (!focusId) return;
      const weekList = overrideWeekIds ?? (selectedWeeksKey ? selectedWeeksKey.split(',') : [focusId]);
      const snapArg =
        overrideSnapshotId !== undefined
          ? overrideSnapshotId
          : selectedSnapshotId === '__latest__'
            ? undefined
            : selectedSnapshotId;
      try {
        const ws = await api.getStep3Workspace(courseId, {
          focusWeekId: focusId,
          weekIds: weekList,
          snapshotId: snapArg,
        });
        setStep3Snapshots(ws.snapshots);
        setActiveBaseSnapshot(ws.baseSnapshot);
        setReviewGraph(ws.graph);
        setRelationEndpoints(ws.endpoints);
        setRelations(ws.relations);
        setRelationsCursor(null);
        setRelationRevision(ws.revision);
        setRelationsStale(false);
        if (ws.snapshots.length > 0) {
          setMasterVersion((prev) => Math.max(prev, ws.snapshots[0].draftRevision));
          setPublishSnapshotId((prev) =>
            prev && ws.snapshots.some((s) => s.draftId === prev) ? prev : ws.snapshots[0].draftId,
          );
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Không thể tải không gian Bước 3.');
      }
    },
    [courseId, relationWeekId, selectedWeeksKey, selectedSnapshotId],
  );

  const invalidateStep3Relations = useCallback(
    async (targetChapterId?: string, targetRevision?: number) => {
      const cid = targetChapterId || relationWeekId;
      setReviewConfirmed(false);
      if (!cid) return;
      const targetCh = outline.chapters.find((c) => c.id === cid);
      const isActiveWeek = cid === relationWeekId;
      if (isActiveWeek && relations.length === 0 && targetCh?.state !== 'PUBLISHED') {
        return;
      }
      try {
        const rev = targetRevision ?? targetCh?.revision ?? relationRevision;
        const res = await api.discardCourseRelations(courseId, rev, cid);
        if (isActiveWeek) {
          setRelationRevision(res.revision);
          setRelations([]);
          setRelationsStale(false);
        }
      } catch {
        if (isActiveWeek) setRelationsStale(true);
      }
    },
    [courseId, outline.chapters, relationRevision, relationWeekId, relations.length],
  );

  useEffect(() => {
    void loadOutline();
  }, [courseId]);

  useEffect(() => {
    if (!loading) {
      saveWizardStep(courseId, step);
    }
  }, [courseId, step, loading]);

  const reloadReviewGraph = useCallback(async () => {
    try {
      const kg = await api.getAuthoringGraph(courseId);
      setReviewGraph(kg);
    } catch {
      setReviewGraph(null);
    }
  }, [courseId]);

  useEffect(() => {
    if (step === 2 && selectedChapterId) {
      void loadChapterLessons(selectedChapterId);
    }
    if (step === 3 && relationWeekId) {
      void api
        .getChapterSourceReadiness(courseId, relationWeekId)
        .then(setD3SourceReadiness)
        .catch(() => setD3SourceReadiness(null));
      setReviewLoading(true);
      void loadStep3Workspace().finally(() => setReviewLoading(false));
    }
    if (step === 4) {
      void reloadReviewGraph();
      void api
        .listStep3Snapshots(courseId)
        .then((snaps) => {
          setStep3Snapshots(snaps);
          if (snaps.length > 0) {
            setPublishSnapshotId((prev) => (prev && snaps.some((s) => s.draftId === prev) ? prev : snaps[0].draftId));
          }
        })
        .catch(() => undefined);
    }
  }, [step, courseId, selectedChapterId, relationWeekId, loadChapterLessons, loadStep3Workspace, reloadReviewGraph]);

  // D5 Job Polling
  useEffect(() => {
    if (!activeJob?.jobId) return;
    if (
      activeJob.status === 'SUCCEEDED' ||
      activeJob.status === 'BLOCKED' ||
      activeJob.status === 'FAILED' ||
      activeJob.status === 'CANCELLED'
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const latest = await api.getWorkflowJob(activeJob.jobId!);
        setActiveJob((prev) => (prev ? { ...latest, jobId: prev.jobId, kind: prev.kind } : null));
        if (
          latest.status === 'SUCCEEDED' ||
          latest.status === 'BLOCKED' ||
          latest.status === 'FAILED' ||
          latest.status === 'CANCELLED'
        ) {
          setPendingJobs((prev) => prev.filter((j) => j.jobId !== activeJob.jobId));
        }
        if (latest.status === 'SUCCEEDED') {
          if (activeJob.kind === 'outline') {
            setMessage('AI đã trích xuất xong Khung môn học (Chương & Chuẩn đầu ra). Hãy rà soát và duyệt.');
            await loadOutline();
          } else if (activeJob.kind === 'lesson' && selectedChapterId) {
            await invalidateStep3Relations(selectedChapterId);
            setMessage('AI đã sinh & kiểm tra xong bài học cho chương. Hãy duyệt từng bài học.');
            await loadOutline();
            await loadChapterLessons(selectedChapterId);
          } else if (activeJob.kind === 'relation') {
            setRelationsStale(false);
            setMessage('AI đã sinh xong quan hệ cho tổ hợp chương/snapshot đang chọn. Hãy rà soát, chỉnh sửa rồi Lưu Bản tạm.');
            await loadOutline();
            setReviewLoading(true);
            void loadStep3Workspace().finally(() => setReviewLoading(false));
          }
        } else if (latest.status === 'CANCELLED') {
          setMessage('Tác vụ AI đang chờ đã được hủy.');
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Lỗi khi theo dõi tiến độ job.');
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [activeJob, loadOutline, loadChapterLessons, loadStep3Workspace, selectedChapterId, invalidateStep3Relations]);

  const handleResumeJob = async () => {
    if (!activeJob?.jobId) return;
    setError('');
    try {
      const res = await api.resumeWorkflowJob(activeJob.jobId, newIdempotencyKey('resume'));
      setActiveJob((prev) => (prev ? { ...prev, status: res.status, cancelRequested: false } : null));
      setMessage('Đã xếp lại job từ checkpoint gần nhất.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tiếp tục job.');
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob?.jobId) return;
    setCancellingJob(true);
    setError('');
    try {
      const res = await api.cancelWorkflowJob(activeJob.jobId);
      setActiveJob((prev) => (prev ? { ...prev, ...res, jobId: prev.jobId, kind: prev.kind } : null));
      if (res.status === 'CANCELLED') {
        setPendingJobs((prev) => prev.filter((j) => j.jobId !== activeJob.jobId));
        setMessage('Đã hủy tác vụ AI đang chờ.');
      } else {
        setMessage('Đã gửi yêu cầu hủy. Tác vụ sẽ dừng ngay sau bước hiện tại.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hủy tác vụ đang chờ.');
      await refreshPendingJobs();
    } finally {
      setCancellingJob(false);
    }
  };

  const handleCancelAllPendingJobs = async () => {
    setCancellingJob(true);
    setError('');
    try {
      const res = await api.cancelPendingWorkflowJobs(courseId);
      const stillRunning = res.jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED');
      setPendingJobs(stillRunning);
      setActiveJob((prev) => {
        if (!prev?.jobId) return stillRunning[0] ?? null;
        const matched = res.jobs.find((j) => j.jobId === prev.jobId);
        if (matched) return { ...prev, ...matched };
        return stillRunning[0] ?? prev;
      });
      if (res.cancelledCount === 0) {
        setMessage('Không còn tác vụ AI nào đang chờ xử lý.');
      } else if (stillRunning.length > 0) {
        setMessage(
          `Đã gửi yêu cầu hủy ${res.cancelledCount} tác vụ (${stillRunning.length} tác vụ đang xử lý sẽ dừng sau bước hiện tại).`,
        );
      } else {
        setMessage(`Đã hủy toàn bộ ${res.cancelledCount} tác vụ AI đang chờ.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hủy các tác vụ đang chờ.');
    } finally {
      setCancellingJob(false);
    }
  };

  /* -------------------- D1 Handlers -------------------- */
  const handleRunOutlineJob = async () => {
    if (syllabusFiles.length === 0) {
      setError('Vui lòng chọn ít nhất 1 tệp đề cương PDF trước.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let primarySyllabusId = '';
      for (const file of syllabusFiles) {
        const res = await api.uploadCourseSyllabus(courseId, file);
        if (!primarySyllabusId) primarySyllabusId = res.syllabusId;
      }
      const { jobId, status } = await api.createOutlineJob(courseId, primarySyllabusId, newIdempotencyKey('outline'));
      const nextJob = {
        kind: 'outline' as const,
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 10,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      };
      setActiveJob(nextJob);
      setPendingJobs((prev) => (prev.some((j) => j.jobId === jobId) ? prev : [nextJob, ...prev]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo job trích xuất khung môn học.');
      void refreshPendingJobs();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOutlineDraft = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.saveOutlineDraft(courseId, outline, outlineRevision);
      setOutline(saved.outline);
      setOutlineState(saved.state);
      setOutlineRevision(saved.revision);
      setMessage(`Đã lưu bản nháp khung môn học (Revision ${saved.revision}).`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu bản nháp.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveOutline = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      // Save latest edits first if needed, then approve
      const saved = await api.saveOutlineDraft(courseId, outline, outlineRevision);
      const approved = await api.approveOutline(courseId, saved.revision);
      setOutlineState(approved.state);
      setOutlineRevision(approved.revision);
      setMessage('Đã duyệt Khung môn học (OUTLINE_APPROVED). Bây giờ bạn có thể nạp tài liệu từng buổi học ở Bước 2.');
      if (saved.outline.chapters.length && !selectedChapterId) {
        setSelectedChapterId(saved.outline.chapters[0].id);
      }
      setStep(2);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt khung môn học.');
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- D2 Handlers -------------------- */
  const currentChapter = outline.chapters.find((c) => c.id === selectedChapterId);

  const handleUploadChapterDoc = async () => {
    if (!currentChapter || chapterFiles.length === 0) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let latestRevision = currentChapter.revision;
      for (const file of chapterFiles) {
        const res = await api.uploadChapterDocument(courseId, currentChapter.id, file);
        latestRevision = res.revision;
      }
      const uploadedCount = chapterFiles.length;
      setChapterFiles([]);
      setMessage(`Đã tải ${uploadedCount} tài liệu lên ${currentChapter.title} (Revision ${latestRevision}). Bấm "Sinh bài học (Lesson Job)" để AI tạo bài học.`);
      await loadOutline();
      await loadChapterLessons(currentChapter.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải tài liệu buổi học.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunLessonJob = async () => {
    if (!currentChapter) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { jobId, status } = await api.createLessonJob(
        courseId,
        currentChapter.id,
        currentChapter.revision,
        newIdempotencyKey('lesson'),
      );
      const nextJob = {
        kind: 'lesson' as const,
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 15,
        weekId: currentChapter.id,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      };
      setActiveJob(nextJob);
      setPendingJobs((prev) => (prev.some((j) => j.jobId === jobId) ? prev : [nextJob, ...prev]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể khởi chạy Lesson Job.');
      void refreshPendingJobs();
    } finally {
      setBusy(false);
    }
  };

  const handleReopenChapter = async () => {
    if (!currentChapter) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.reopenChapter(courseId, currentChapter.id, currentChapter.revision);
      await invalidateStep3Relations(currentChapter.id, currentChapter.revision);
      setMessage(`Đã mở lại buổi học ${currentChapter.title} về trạng thái ${res.state}.`);
      await loadOutline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể mở lại buổi học.');
    } finally {
      setBusy(false);
    }
  };

  const handleLessonDecision = async (
    lessonId: string,
    decision: ReviewDecision,
    changes?: Partial<ChapterLessonItem>,
    customReviewNote?: string,
  ) => {
    if (!currentChapter) return;
    setError('');
    try {
      const target = lessons.find((l) => l.id === lessonId);
      const needsNote = !target?.assessment || target.assessment.verdict !== 'supported';
      const reviewNote =
        decision === 'APPROVE' || decision === 'EDIT'
          ? customReviewNote?.trim() ||
            target?.reviewNote?.trim() ||
            (needsNote ? 'Giảng viên đã kiểm tra và xác nhận' : undefined)
          : undefined;
      const res = await api.reviewChapterLesson(courseId, currentChapter.id, lessonId, {
        decision,
        changes,
        ...(reviewNote ? { reviewNote } : {}),
        expectedRevision: currentChapter.revision,
      });
      await invalidateStep3Relations(currentChapter.id, res.revision);
      setLessons((prev) => prev.map((l) => (l.id === lessonId ? res.lesson : l)));
      setOutline((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === currentChapter.id ? { ...c, revision: res.revision } : c)),
      }));
      setEditingLessonId(null);
      if (currentChapter.state === 'LESSON_APPROVED') {
        await loadOutline();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quyết định bài học.');
    }
  };

  const handleCreateLesson = async (input: CreateDraftLessonInput) => {
    if (!currentChapter) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.createChapterLesson(courseId, currentChapter.id, {
        ...input,
        expectedRevision: currentChapter.revision,
      });
      await invalidateStep3Relations(currentChapter.id, res.revision);
      setLessons((prev) => (res.lesson ? [...prev, res.lesson] : prev));
      setOutline((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === currentChapter.id ? { ...c, revision: res.revision } : c)),
      }));
      setMessage(`Đã thêm nút "${input.title}" vào ${currentChapter.title}.`);
      if (currentChapter.state === 'DRAFT' || currentChapter.state === 'LESSON_APPROVED') {
        await loadOutline();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể thêm nút bài học mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!currentChapter) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.deleteChapterLesson(courseId, currentChapter.id, lessonId, currentChapter.revision);
      await invalidateStep3Relations(currentChapter.id);
      await loadChapterLessons(currentChapter.id);
      await loadOutline();
      setMessage(
        res.mode === 'rejected'
          ? 'Nút là trích dẫn duy nhất của trang nên đã chuyển sang Từ chối để giữ độ phủ tài liệu.'
          : 'Đã xóa nút bài học khỏi bản nháp.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa nút bài học.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveAllAndCompleteChapter = async () => {
    if (!currentChapter || !lessons.length) return;
    if (lessons.every((l) => l.decision === 'REJECT')) {
      setError('Cần duyệt ít nhất 1 bài học trước khi hoàn tất buổi học.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let latestRevision = currentChapter.revision;
      const needsReviewPass = lessons.some((l) => {
        if (l.decision === 'PENDING') return true;
        const flagged = !l.assessment || l.assessment.verdict !== 'supported';
        return (l.decision === 'APPROVE' || l.decision === 'EDIT') && flagged && !l.reviewNote?.trim();
      });
      if (needsReviewPass) {
        const batchRes = await api.batchReviewChapterLessons(courseId, currentChapter.id, {
          items: lessons.map((l) => {
            const flagged = !l.assessment || l.assessment.verdict !== 'supported';
            const decision: ReviewDecision = l.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
            const reviewNote =
              decision === 'APPROVE'
                ? l.reviewNote?.trim() || (flagged ? 'Giảng viên đã kiểm tra và xác nhận' : undefined)
                : undefined;
            return {
              lessonId: l.id,
              decision,
              ...(reviewNote ? { reviewNote } : {}),
            };
          }),
          expectedRevision: latestRevision,
        });
        latestRevision = batchRes.revision;
      }
      const approveRes = await api.approveChapterLessons(courseId, currentChapter.id, latestRevision);
      await invalidateStep3Relations(currentChapter.id, latestRevision);
      setMessage(`Đã duyệt tất cả bài học và hoàn tất "${currentChapter.title}" (${approveRes.state}).`);
      await loadOutline();
      await loadChapterLessons(currentChapter.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt buổi học.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardChapterDraft = async () => {
    if (!currentChapter || !window.confirm('Hủy toàn bộ bản nháp bài học của buổi học này? (Tài liệu PDF đã tải vẫn được giữ)')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.discardChapterLessons(courseId, currentChapter.id, currentChapter.revision);
      await invalidateStep3Relations(currentChapter.id);
      setLessons([]);
      setMessage('Đã hủy bản nháp bài học của buổi học.');
      await loadOutline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hủy bản nháp.');
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- D3 Handlers -------------------- */
  const approvedChapters = outline.chapters.filter(
    (c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED',
  );
  const mergedChapters = outline.chapters.filter((c) => c.state === 'PUBLISHED');
  const allWeeksMerged =
    outlineState === 'OUTLINE_APPROVED' &&
    outline.chapters.length > 0 &&
    outline.chapters.every((c) => c.state === 'PUBLISHED');
  const hasPublishedRelease = justPublished || Boolean(_hasPublishedGraph) || coursePublishedFromBe || latestReleaseNo > 0;
  const isEditLocked = (justPublished || (allWeeksMerged && coursePublishedFromBe)) && !unlockedForRevision;
  const activeRelationChapter = outline.chapters.find((c) => c.id === relationWeekId) ?? null;
  const activeChapterMerged = activeRelationChapter?.state === 'PUBLISHED';
  const activeChapterReady =
    activeRelationChapter?.state === 'LESSON_APPROVED' || activeRelationChapter?.state === 'PUBLISHED';

  const step1Done = outlineState === 'OUTLINE_APPROVED' || hasPublishedRelease;
  const step2Done =
    (step1Done && outline.chapters.length > 0 && approvedChapters.length === outline.chapters.length) ||
    (hasPublishedRelease && outline.chapters.length === 0);
  const step3Done = step2Done && allWeeksMerged;
  const chapterLocked = isEditLocked || currentChapter?.state === 'PUBLISHED';

  // D4b Publication Neo4j Sync Polling
  useEffect(() => {
    if (!pendingPublicationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await api.getPublicationStatus(courseId, pendingPublicationId);
        if (cancelled) return;
        setPubStatus(st);
        if (st.syncStatus === 'SYNCED') {
          setJustPublished(true);
          setUnlockedForRevision(false);
          setPendingPublicationId(null);
          setLatestReleaseNo(st.releaseNo);
          setMessage(`Xuất bản Course Graph v${st.releaseNo} và đồng bộ Neo4j thành công!`);
          await loadOutline();
          onGraphUpdated?.();
        } else if (st.syncStatus === 'FAILED' || st.syncStatus === 'BLOCKED') {
          setError(st.error || 'Đồng bộ Neo4j tạm thời thất bại. Bạn có thể bấm Phục hồi xuất bản.');
        }
      } catch {
        // Ignore transient poll error
      }
    };
    const interval = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pendingPublicationId, courseId, loadOutline, onGraphUpdated]);

  const handleRunRelationJob = async (targetWeekId?: string) => {
    const wid = targetWeekId || relationWeekId;
    if (!wid) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const targetCh = outline.chapters.find((c) => c.id === wid);
      const expectedRev = targetWeekId && wid !== relationWeekId
        ? (targetCh?.revision ?? relationRevision)
        : relationRevision;
      const extraContextWeekIds = effectiveSelectedWeekIds.filter((id) => id !== wid);
      const { jobId, status } = await api.createRelationJob(
        courseId,
        [wid],
        expectedRev,
        newIdempotencyKey('relation'),
        {
          useExplicitContext: true,
          contextWeekIds: extraContextWeekIds,
          baseSnapshotId: activeBaseSnapshot?.draftId ?? null,
        },
      );
      const nextJob = {
        kind: 'relation' as const,
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 20,
        weekId: wid,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      };
      setActiveJob(nextJob);
      setPendingJobs((prev) => (prev.some((j) => j.jobId === jobId) ? prev : [nextJob, ...prev]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể khởi chạy AI nối chương.');
      void refreshPendingJobs();
    } finally {
      setBusy(false);
    }
  };

  const handleRelationDecision = async (relationId: string, decision: ReviewDecision) => {
    if (activeChapterMerged) return;
    setError('');
    try {
      const target = relations.find((r) => r.id === relationId);
      const flagged = Boolean(
        target?.hasWarning || !target?.assessment || target.assessment.verdict !== 'supported',
      );
      const reviewNote =
        decision === 'APPROVE' || decision === 'EDIT'
          ? target?.reviewNote?.trim() || (flagged ? 'Giảng viên đã kiểm tra và xác nhận' : undefined)
          : undefined;
      const res = await api.reviewCourseRelation(
        courseId,
        relationId,
        {
          decision,
          ...(reviewNote ? { reviewNote } : {}),
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelations((prev) => prev.map((r) => (r.id === relationId ? res.relation : r)));
      setRelationRevision(res.revision);
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quyết định quan hệ.');
    }
  };

  const handleUpdateRelation = async (
    relationId: string,
    changes: Partial<CourseRelationItem>,
    customReviewNote?: string,
  ) => {
    if (activeChapterMerged) return;
    setBusy(true);
    setError('');
    try {
      const target = relations.find((r) => r.id === relationId);
      const reviewNote =
        customReviewNote?.trim() ||
        target?.reviewNote?.trim() ||
        'Giảng viên đã điều chỉnh quan hệ';
      const res = await api.reviewCourseRelation(
        courseId,
        relationId,
        {
          decision: 'EDIT',
          changes,
          reviewNote,
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelations((prev) => prev.map((r) => (r.id === relationId ? res.relation : r)));
      setRelationRevision(res.revision);
      setMessage('Đã cập nhật quan hệ trên đồ thị.');
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRelation = async (input: CreateDraftRelationInput) => {
    if (!relationWeekId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.createCourseRelation(
        courseId,
        {
          ...input,
          contextWeekIds: effectiveSelectedWeekIds.filter((id) => id !== relationWeekId),
          baseSnapshotId: activeBaseSnapshot?.draftId ?? null,
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelations((prev) => (res.relation ? [...prev, res.relation] : prev));
      setRelationRevision(res.revision);
      setMessage('Đã thêm quan hệ mới vào đồ thị.');
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo quan hệ mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRelation = async (relationId: string) => {
    if (!relationWeekId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.deleteCourseRelation(
        courseId,
        relationId,
        relationRevision,
        relationWeekId,
      );
      setRelations((prev) => prev.filter((r) => r.id !== relationId));
      setRelationRevision(res.revision);
      setMessage('Đã xóa quan hệ khỏi bản nháp.');
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleRebaseWeek = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.rebaseWeek(courseId, relationWeekId, relationRevision);
      setRelationRevision(res.revision);
      setMasterVersion(res.masterVersion);
      setMessage(`Đã đồng bộ (Rebase) chương đang nối theo Bản tạm v${res.masterVersion}.`);
      await loadOutline();
      await loadRelations(false, null, relationWeekId);
      await reloadReviewGraph();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể Rebase chương.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveAndMergeWeek = async (overrideRevision?: number) => {
    if (!relationWeekId) return;
    const pendingRels = relations.filter((r) => r.decision === 'PENDING');
    if (
      pendingRels.length > 0 &&
      !window.confirm(
        `Còn ${pendingRels.length} quan hệ chưa bấm duyệt riêng. Hệ thống sẽ tự động duyệt các quan hệ hợp lệ còn lại và lưu thành một phiên bản Bản tạm (Snapshot) mới. Tiếp tục?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      let latestRevision = overrideRevision ?? relationRevision;
      const needsReviewPass = relations.some((r) => {
        if (r.decision === 'PENDING') return true;
        const flagged = Boolean(
          r.hasWarning || !r.assessment || r.assessment.verdict !== 'supported',
        );
        return (r.decision === 'APPROVE' || r.decision === 'EDIT') && flagged && !r.reviewNote?.trim();
      });

      if (needsReviewPass && relations.length > 0) {
        const batchRes = await api.batchReviewCourseRelations(
          courseId,
          {
            items: relations.map((r) => {
              const flagged = Boolean(
                r.hasWarning || !r.assessment || r.assessment.verdict !== 'supported',
              );
              const decision: ReviewDecision = r.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
              const reviewNote =
                decision === 'APPROVE'
                  ? r.reviewNote?.trim() || (flagged ? 'Giảng viên đã kiểm tra và xác nhận' : undefined)
                  : undefined;
              return {
                relationId: r.id,
                decision,
                ...(reviewNote ? { reviewNote } : {}),
              };
            }),
            expectedRevision: latestRevision,
          },
          relationWeekId,
        );
        latestRevision = batchRes.revision;
      }

      const snapRes = await api.saveStep3Snapshot(courseId, {
        focusWeekId: relationWeekId,
        selectedWeekIds: effectiveSelectedWeekIds,
        baseSnapshotId: activeBaseSnapshot?.draftId ?? null,
        expectedRevision: latestRevision,
      });
      setStep3Snapshots(snapRes.snapshots);
      setSelectedSnapshotId(snapRes.snapshot.draftId);
      setPublishSnapshotId(snapRes.snapshot.draftId);
      setActiveBaseSnapshot(snapRes.snapshot);
      setRelationRevision(snapRes.revision);
      setMasterVersion(snapRes.snapshot.draftRevision);
      setReviewConfirmed(true);
      setMessage(
        `Đã lưu Bản tạm v${snapRes.snapshot.draftRevision} (${snapRes.snapshot.nodeCount} nút · ${snapRes.snapshot.edgeCount} cạnh) vào course_graph_draft!`,
      );
      await loadOutline();
      await loadStep3Workspace(relationWeekId, effectiveSelectedWeekIds, snapRes.snapshot.draftId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu phiên bản Bản tạm.');
    } finally {
      setBusy(false);
    }
  };

  const handleExcludeOcrPages = async (
    targetWeekId: string,
    expectedRev: number,
    slideIds?: string[],
    andMergeAfter = false,
  ) => {
    if (!targetWeekId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.excludeChapterOcrPages(courseId, targetWeekId, {
        expectedRevision: expectedRev,
        ...(slideIds && slideIds.length > 0 ? { slideIds } : {}),
        reason: 'Giảng viên xác nhận loại trang ảnh/không có văn bản khỏi phạm vi',
      });
      if (targetWeekId === relationWeekId) {
        setRelationRevision(res.revision);
        const freshReadiness = await api.getChapterSourceReadiness(courseId, targetWeekId).catch(() => null);
        setD3SourceReadiness(freshReadiness);
      }
      if (targetWeekId === selectedChapterId) {
        const freshReadiness = await api.getChapterSourceReadiness(courseId, targetWeekId).catch(() => null);
        if (freshReadiness) setSourceReadiness(freshReadiness);
      }
      setOutline((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === targetWeekId ? { ...c, revision: res.revision } : c)),
      }));
      setMessage(`Đã xác nhận loại ${res.excludedCount} trang ảnh/không có văn bản khỏi phạm vi của chương.`);
      if (andMergeAfter) {
        await handleApproveAndMergeWeek(res.revision);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xác nhận loại trang OCR.');
    } finally {
      setBusy(false);
    }
  };

  const handleReconnectMergedWeek = async (weekId: string) => {
    setActiveRelationWeekId(weekId);
    await handleRunRelationJob(weekId);
  };

  const handleBatchApproveRelations = async () => {
    if (!relations.length || activeChapterMerged) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.batchReviewCourseRelations(
        courseId,
        {
          items: relations.map((r) => {
            const flagged = Boolean(
              r.hasWarning || !r.assessment || r.assessment.verdict !== 'supported',
            );
            const decision: ReviewDecision = r.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
            const reviewNote =
              decision === 'APPROVE'
                ? r.reviewNote?.trim() || (flagged ? 'Giảng viên đã kiểm tra và xác nhận' : undefined)
                : undefined;
            return {
              relationId: r.id,
              decision,
              ...(reviewNote ? { reviewNote } : {}),
            };
          }),
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelationRevision(res.revision);
      setMessage(`Đã duyệt nhanh ${res.updatedCount} quan hệ của chương đang nối.`);
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt hàng loạt quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardRelations = async () => {
    if (!window.confirm('Xác nhận hủy bản nháp quan hệ của chương đang chọn?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.discardCourseRelations(courseId, relationRevision, relationWeekId);
      setRelationRevision(res.revision);
      setRelations([]);
      setRelationsStale(false);
      setMessage('Đã hủy bản nháp quan hệ của chương.');
      void loadStep3Workspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hủy bản nháp quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- D4 Handlers -------------------- */
  const handlePublish = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const targetDraftId = publishSnapshotId || step3Snapshots[0]?.draftId || undefined;
      const res = await api.publishCourseGraph(
        courseId,
        relationRevision,
        masterVersion,
        newIdempotencyKey('publish'),
        targetDraftId,
      );
      setMasterVersion(res.masterVersion);
      setRelationRevision(res.revision);
      setPublishWarnings(res.warnings ?? []);
      if (res.publicationId && res.state === 'PUBLISHING') {
        setPendingPublicationId(res.publicationId);
        setPubStatus({
          publicationId: res.publicationId,
          releaseNo: res.masterVersion,
          releaseStatus: 'PUBLISHED',
          syncStatus: 'PENDING',
          canRecover: false,
        });
        setMessage(`Đã tạo bản phát hành Course Graph v${res.masterVersion}; đang đồng bộ Neo4j...`);
      } else {
        setPendingPublicationId(null);
        setPubStatus(null);
        setJustPublished(true);
        setUnlockedForRevision(false);
        setLatestReleaseNo(res.masterVersion);
        setMessage(`Xuất bản Course Graph v${res.masterVersion} thành công!`);
        onGraphUpdated?.();
      }
      await loadOutline();
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : 'Không thể xuất bản Course Graph.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverPublish = async () => {
    if (!pendingPublicationId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.recoverCoursePublish(courseId, pendingPublicationId);
      setMasterVersion(res.masterVersion);
      setRelationRevision(res.revision);
      if (res.state === 'PUBLISHED') {
        setPendingPublicationId(null);
        setPubStatus(null);
        setJustPublished(true);
        setUnlockedForRevision(false);
        setLatestReleaseNo(res.masterVersion);
        onGraphUpdated?.();
      } else {
        setPubStatus((prev) => (prev ? { ...prev, syncStatus: 'PENDING', error: null } : null));
      }
      setMessage(`Đã kích hoạt phục hồi xuất bản Course Graph v${res.masterVersion}!`);
      await loadOutline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa thể phục hồi xuất bản.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="wizard-shell" style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
        Đang tải quy trình dựng đồ thị môn học…
      </div>
    );
  }

  const isGraphStep = step === 2 || step === 3;

  return (
    <div className={`wizard-shell${isGraphStep ? ' is-graph-step' : ''}${isExpanded ? ' is-expanded' : ''}`}>
      {/* Compact Stepper Header + Focus Toggle + Inline Usage */}
      <div className="wizard-stepper-compact">
        <div className="wizard-stepper-track">
          {[
            { num: 1 as Step, done: step1Done, title: 'D1. Khung môn học', sub: step1Done ? 'Đã duyệt · Xem lại' : 'Đề cương & LO', locked: false },
            { num: 2 as Step, done: step2Done, title: 'D2. Bài học theo chương', sub: `${approvedChapters.length}/${outline.chapters.length} chương`, locked: !step1Done },
            { num: 3 as Step, done: step3Done, title: 'D3. Nối Bản tạm từng chương', sub: `${mergedChapters.length}/${outline.chapters.length} đã gộp${masterVersion > 0 ? ` · v${masterVersion}` : ''}`, locked: !step2Done },
            { num: 4 as Step, done: hasPublishedRelease && allWeeksMerged, title: 'D4. Xuất bản', sub: justPublished ? `v${latestReleaseNo || masterVersion} · Đã xuất bản` : allWeeksMerged ? 'Sẵn sàng xuất bản' : hasPublishedRelease ? `Đang dùng v${latestReleaseNo || 1}` : 'Chờ nối đủ', locked: !allWeeksMerged && !hasPublishedRelease },
          ].map((item, idx) => (
            <div key={item.num} className="wizard-step-slot compact">
              <button
                type="button"
                disabled={item.locked && step !== item.num}
                onClick={() => setStep(item.num)}
                className={`wizard-step-btn compact${step === item.num ? ' active' : ''}${item.done ? ' done' : ''}${item.locked && step !== item.num ? ' locked' : ''}`}
              >
                <span className="wizard-step-num">
                  {item.done ? <Check size={12} /> : item.locked && step !== item.num ? <Lock size={11} /> : item.num}
                </span>
                <span className="wizard-step-meta">
                  <b>{item.title}</b>
                  <small>{item.sub}</small>
                </span>
              </button>
              {idx < 3 && <ChevronRight size={13} className="muted-icon wizard-step-chevron" />}
            </div>
          ))}
        </div>

        <div className="wizard-stepper-tools">
          {usage && (
            <span className="wizard-usage-pill" title={`AI Usage: ${usage.totalCalls} lượt · Còn lại $${usage.remainingBudgetUsd.toFixed(3)} / $${usage.budgetLimitUsd.toFixed(2)}`}>
              <Sparkles size={11} />
              <b>{usage.totalCalls}</b> lượt · ${usage.estimatedCostUsd.toFixed(3)}
            </span>
          )}
          {isGraphStep && (
            <button
              type="button"
              className={`btn btn-outline sm${isExpanded ? ' on' : ''}`}
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? 'Thu gọn khỏi chế độ toàn màn hình (Esc)' : 'Mở rộng đồ thị toàn màn hình'}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isExpanded ? 'Thu gọn' : 'Toàn màn hình'}</span>
            </button>
          )}
        </div>
      </div>

      {isEditLocked && step !== 4 && (
        <div className="wizard-banner warn compact" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            <Lock size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            Đang xem lại các bước đã xuất bản ở chế độ chỉ đọc.
          </span>
          <button
            type="button"
            className="btn btn-outline sm"
            onClick={() => {
              setUnlockedForRevision(true);
              setJustPublished(false);
            }}
          >
            <Pencil size={12} /> Mở khóa để cập nhật phiên bản mới
          </button>
        </div>
      )}

      {step === 2 && sourceReadiness && (
        <div
          className={`wizard-banner compact ${sourceReadiness.status === 'blocked' ? 'error' : sourceReadiness.status === 'ready' ? 'success' : 'warn'}`}
          style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} style={{ flexShrink: 0 }} />
            <span>
              <b>Tài liệu chương:</b> {sourceReadiness.counts.readablePages}/{sourceReadiness.counts.totalPages} trang có text
              {sourceReadiness.counts.lowTextPages > 0 ? ` · ${sourceReadiness.counts.lowTextPages} trang ít chữ` : ''}
              {sourceReadiness.warnings.length > 0 ? ` — ${formatReadinessWarning(sourceReadiness.warnings[0])}` : ''}
            </span>
          </span>
          {sourceReadiness.ocrPages && sourceReadiness.ocrPages.length > 0 && currentChapter && !chapterLocked && (
            <button
              type="button"
              className="btn btn-outline sm"
              disabled={busy}
              onClick={() =>
                void handleExcludeOcrPages(
                  currentChapter.id,
                  currentChapter.revision,
                  sourceReadiness.ocrPages?.map((p) => p.slideId),
                  false,
                )
              }
            >
              Loại {sourceReadiness.ocrPages.length} trang ảnh khỏi phạm vi
            </button>
          )}
        </div>
      )}

      {/* Banners */}
      {(error || message) && (
        <div className="wizard-feedback-stack">
          {error && (
            <div className="wizard-banner error compact" role="alert">
              <AlertTriangle size={14} style={{ flexShrink: 0 }} /> <span>{error}</span>
              <button type="button" onClick={() => setError('')}><X size={13} /></button>
            </div>
          )}
          {message && (
            <div className="wizard-banner success compact" role="status">
              <CheckCircle2 size={14} style={{ flexShrink: 0 }} /> <span>{message}</span>
              <button type="button" onClick={() => setMessage('')}><X size={13} /></button>
            </div>
          )}
        </div>
      )}

      {/* Slim D5 Active Job Strip */}
      {activeJob && (() => {
        const stInfo = JOB_STATUS_INFO[activeJob.status] ?? { label: activeJob.status, tone: 'muted' as const };
        const friendlyErr = formatJobError(activeJob.error);
        const barTone =
          activeJob.status === 'SUCCEEDED'
            ? 'success'
            : activeJob.status === 'FAILED'
              ? 'error'
              : activeJob.status === 'BLOCKED' || Boolean(activeJob.error)
                ? 'warn'
                : 'active';
        return (
          <div className={`wizard-job-strip ${barTone}`}>
            <div className="wizard-job-strip-left">
              <Sparkles size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
              <b>
                {activeJob.kind === 'outline' && 'Trích xuất Khung môn học'}
                {activeJob.kind === 'lesson' && 'Sinh & đối chiếu bài học chương'}
                {activeJob.kind === 'relation' && 'AI đang sinh & nối quan hệ vào Bản tạm'}
              </b>
              <span className={`pill-badge ${stInfo.tone}`}>{stInfo.label}</span>
              <span className="muted-s">
                {activeJob.progress}% · Thử lại {activeJob.resumeCount}/{activeJob.maxResumeAttempts}
              </span>
              {friendlyErr && <span className="wizard-job-strip-err">{friendlyErr}</span>}
              {activeJob.resumeBlockedReason && <span className="muted-s">({activeJob.resumeBlockedReason})</span>}
            </div>
            <div className="wizard-job-strip-right">
              <div className="wizard-job-progress mini">
                <div className={`wizard-job-fill ${barTone}`} style={{ width: `${activeJob.progress}%` }} />
              </div>
              {(activeJob.status === 'QUEUED' || activeJob.status === 'RUNNING') && (
                <button
                  type="button"
                  className="btn btn-outline sm"
                  style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff5f5' }}
                  disabled={cancellingJob || Boolean(activeJob.cancelRequested)}
                  onClick={() => void handleCancelJob()}
                >
                  <XCircle size={12} />{' '}
                  {activeJob.cancelRequested || cancellingJob ? 'Đang dừng...' : 'Hủy tác vụ'}
                </button>
              )}
              {pendingJobs.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline sm"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                  disabled={cancellingJob}
                  onClick={() => void handleCancelAllPendingJobs()}
                >
                  <XCircle size={12} /> Hủy tất cả ({pendingJobs.length})
                </button>
              )}
              {(activeJob.status === 'BLOCKED' || activeJob.status === 'FAILED' || activeJob.status === 'CANCELLED') && activeJob.canResume && (
                <button type="button" className="btn btn-primary sm" onClick={handleResumeJob}>
                  <RefreshCw size={12} /> Resume
                </button>
              )}
              {(activeJob.status === 'SUCCEEDED' || activeJob.status === 'FAILED' || activeJob.status === 'CANCELLED') && (
                <button type="button" className="btn btn-outline sm" onClick={() => setActiveJob(null)}>Đóng</button>
              )}
            </div>
          </div>
        );
      })()}

      {!activeJob && pendingJobs.length > 0 && (
        <div className="wizard-job-strip active">
          <div className="wizard-job-strip-left">
            <Sparkles size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
            <b>Đang có {pendingJobs.length} tác vụ AI đang chờ xử lý</b>
          </div>
          <div className="wizard-job-strip-right">
            <button
              type="button"
              className="btn btn-outline sm"
              style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff5f5' }}
              disabled={cancellingJob}
              onClick={() => void handleCancelAllPendingJobs()}
            >
              <XCircle size={12} /> {cancellingJob ? 'Đang hủy...' : 'Hủy các tác vụ đang chờ'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: D1 OUTLINE */}
      {step === 1 && (
        <div className="wizard-panel">
          <div className="wizard-panel-head">
            <div>
              <h3>D1. Khung môn học — {courseName}</h3>
              <p className="muted-s">
                Tải đề cương để AI tạo khung Buổi học & Chuẩn đầu ra (LO). Chỉ sau khi duyệt (<code>OUTLINE_APPROVED</code>) mới được gắn tài liệu buổi học.
              </p>
            </div>
            <div className="wizard-badges">
              <span className={`pill-badge ${OUTLINE_STATE_LABEL[outlineState].tone}`}>
                {OUTLINE_STATE_LABEL[outlineState].text}
              </span>
              <span className="pill-badge muted">Rev {outlineRevision}</span>
            </div>
          </div>

          <div className="wizard-upload-row">
            <label className="wizard-file-box">
              <Upload size={15} />
              <span>
                {syllabusFiles.length > 0
                  ? (syllabusFiles.length === 1
                    ? syllabusFiles[0].name
                    : `Đã chọn ${syllabusFiles.length} tệp: ${syllabusFiles.map((f) => f.name).join(', ')}`)
                  : 'Chọn một hoặc nhiều tệp đề cương (PDF)...'}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                hidden
                disabled={busy || step1Done}
                onChange={(e) => setSyllabusFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || syllabusFiles.length === 0 || step1Done} onClick={handleRunOutlineJob}>
              <Sparkles size={13} /> Trích xuất khung bằng AI
            </button>
          </div>

          <div className="wizard-grid-2">
            {/* Learning Outcomes */}
            <div className="wizard-card">
              <div className="wizard-card-head">
                <h4>Chuẩn đầu ra (Learning Outcomes)</h4>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy || step1Done}
                  onClick={() =>
                    setOutline((prev) => ({
                      ...prev,
                      learningOutcomes: [
                        ...prev.learningOutcomes,
                        { code: `L.O.${prev.learningOutcomes.length + 1}`, description: 'Mô tả chuẩn đầu ra mới' },
                      ],
                    }))
                  }
                >
                  <Plus size={12} /> Thêm LO
                </button>
              </div>
              {outline.learningOutcomes.length === 0 ? (
                <p className="muted-s">Chưa có Chuẩn đầu ra. Hãy tải đề cương PDF hoặc bấm "Thêm LO".</p>
              ) : (
                <div className="wizard-list">
                  {outline.learningOutcomes.map((lo, idx) => (
                    <div key={idx} className="wizard-row-edit">
                      <input
                        style={{ width: 84 }}
                        disabled={busy || step1Done}
                        value={lo.code}
                        onChange={(e) =>
                          setOutline((prev) => ({
                            ...prev,
                            learningOutcomes: prev.learningOutcomes.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)),
                          }))
                        }
                      />
                      <input
                        style={{ flex: 1 }}
                        disabled={busy || step1Done}
                        value={lo.description}
                        onChange={(e) =>
                          setOutline((prev) => ({
                            ...prev,
                            learningOutcomes: prev.learningOutcomes.map((x, i) =>
                              i === idx ? { ...x, description: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Xóa LO"
                        disabled={busy || step1Done}
                        onClick={() =>
                          setOutline((prev) => ({
                            ...prev,
                            learningOutcomes: prev.learningOutcomes.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chapters */}
            <div className="wizard-card">
              <div className="wizard-card-head">
                <h4>Danh sách Buổi học</h4>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy || step1Done}
                  onClick={() =>
                    setOutline((prev) => ({
                      ...prev,
                      chapters: [
                        ...prev.chapters,
                        {
                          id: `ch${prev.chapters.length + 1}`,
                          title: `Buổi học ${prev.chapters.length + 1}: Nội dung mới`,
                          loCodes: prev.learningOutcomes[0] ? [prev.learningOutcomes[0].code] : [],
                          state: 'DRAFT',
                          revision: 1,
                          documentCount: 0,
                        },
                      ],
                    }))
                  }
                >
                  <Plus size={12} /> Thêm buổi học
                </button>
              </div>
              {outline.chapters.length === 0 ? (
                <p className="muted-s">Chưa có Buổi học nào. Hãy tải đề cương PDF hoặc bấm "Thêm buổi học".</p>
              ) : (
                <div className="wizard-list">
                  {outline.chapters.map((ch, idx) => (
                    <div key={ch.id} className="wizard-row-edit">
                      <span className="pill-badge muted" title={ch.id} style={{ flexShrink: 0 }}>
                        {ch.sessionLabel ? `Buổi ${ch.sessionLabel}` : `Buổi ${idx + 1}`}
                      </span>
                      <input
                        style={{ flex: 1 }}
                        disabled={busy || step1Done}
                        value={ch.title}
                        onChange={(e) =>
                          setOutline((prev) => ({
                            ...prev,
                            chapters: prev.chapters.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Xóa buổi học"
                        disabled={busy || step1Done}
                        onClick={() =>
                          setOutline((prev) => ({
                            ...prev,
                            chapters: prev.chapters.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="wizard-footer-actions">
            <button type="button" className="btn btn-outline" disabled={busy || step1Done} onClick={handleSaveOutlineDraft}>
              <Save size={13} /> Lưu bản nháp
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || step1Done || outline.chapters.length === 0 || outline.learningOutcomes.length === 0}
              onClick={handleApproveOutline}
            >
              <CheckCircle2 size={13} /> Duyệt khung môn học (OUTLINE_APPROVED)
            </button>
            {step1Done && (
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                Sang Bước 2: Bài học theo buổi học <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: D2 CHAPTER LESSONS */}
      {step === 2 && (
        <div className="wizard-panel d2-workspace-full">
          <div className="d2-compact-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-outline sm"
                onClick={() => setD2SidebarCollapsed((c) => !c)}
                title={d2SidebarCollapsed ? 'Hiện danh sách chương' : 'Thu gọn danh sách chương để mở rộng đồ thị'}
              >
                <PanelLeft size={13} /> {d2SidebarCollapsed ? `Chương (${approvedChapters.length}/${outline.chapters.length})` : ''}
              </button>
              <h3 style={{ margin: 0, fontSize: 15 }}>D2. Bài học theo chương</h3>
              <span className="pill-badge muted">{approvedChapters.length}/{outline.chapters.length} đã duyệt</span>
            </div>
            <button type="button" className="btn btn-primary sm" onClick={() => setStep(3)} disabled={!step2Done}>
              Sang Bước 3: Nối Bản tạm từng chương <ArrowRight size={13} />
            </button>
          </div>

          <div className={`wizard-split full-height${d2SidebarCollapsed ? ' rail-collapsed' : ''}`}>
            {/* Session sidebar */}
            {!d2SidebarCollapsed && (
              <aside className="wizard-chapter-list">
                {outline.chapters.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedChapterId(ch.id);
                      setChapterFiles([]);
                    }}
                    className={`wizard-chapter-item${selectedChapterId === ch.id ? ' on' : ''}`}
                  >
                    <div>
                      <b>{ch.title}</b>
                      <small>Rev {ch.revision} · {ch.documentCount ?? 0} tài liệu</small>
                    </div>
                    <span className={`pill-badge ${CHAPTER_STATE_LABEL[ch.state].tone}`}>
                      {CHAPTER_STATE_LABEL[ch.state].text}
                    </span>
                  </button>
                ))}
              </aside>
            )}

            {/* Selected Session Workspace */}
            <div className="wizard-chapter-main full-height">
              {!currentChapter ? (
                <p className="muted-s">Chọn một chương bên trái để bắt đầu.</p>
              ) : (
                <>
                  <div className="wizard-card-head compact">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0 }}>{currentChapter.title}</h4>
                      <span className={`pill-badge ${CHAPTER_STATE_LABEL[currentChapter.state].tone}`}>
                        {CHAPTER_STATE_LABEL[currentChapter.state].text}
                      </span>
                      <span className="pill-badge muted">Rev {currentChapter.revision}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {currentChapter.state === 'PUBLISHED' && (
                        <button type="button" className="btn btn-outline sm" disabled={busy || isEditLocked} onClick={handleReopenChapter}>
                          <RotateCcw size={13} /> Mở lại
                        </button>
                      )}
                      {lessons.length > 0 && (
                        <button type="button" className="btn btn-danger sm" disabled={busy || chapterLocked} onClick={handleDiscardChapterDraft}>
                          <Trash2 size={13} /> Hủy nháp
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upload & Generate Lesson Job */}
                  <div className="wizard-upload-row">
                    <label className="wizard-file-box">
                      <FileText size={15} />
                      <span>
                        {chapterFiles.length > 0
                          ? (chapterFiles.length === 1
                            ? chapterFiles[0].name
                            : `Đã chọn ${chapterFiles.length} tệp: ${chapterFiles.map((f) => f.name).join(', ')}`)
                          : 'Chọn tệp tài liệu buổi học (PDF, Slide, Word)...'}
                      </span>
                      <input
                        key={currentChapter.id}
                        type="file"
                        accept="application/pdf,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                        multiple
                        hidden
                        disabled={busy || chapterLocked}
                        onChange={(e) => setChapterFiles(Array.from(e.target.files ?? []))}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || chapterFiles.length === 0 || chapterLocked}
                      onClick={handleUploadChapterDoc}
                    >
                      <Upload size={13} /> Tải lên{chapterFiles.length > 1 ? ` (${chapterFiles.length})` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || chapterLocked}
                      onClick={handleRunLessonJob}
                    >
                      <Play size={13} /> Sinh bài học
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || chapterLocked}
                      onClick={() => {
                        setLessonFilter('all');
                        setD2ViewMode('graph');
                        setManualLessonCanvas(true);
                        setD2CreateTrigger((c) => c + 1);
                      }}
                      title="Tạo nút bài học thủ công không cần AI hoặc PDF"
                    >
                      <Plus size={13} /> Thêm nút thủ công
                    </button>
                  </div>

                  {/* Paginated Lessons Review List */}
                  {lessons.length === 0 && !manualLessonCanvas ? (
                    <div className="wizard-empty-box">
                      <BookOpen size={22} />
                      <p>
                        Chưa có bài học nào. Hãy tải tài liệu buổi học và bấm <b>Sinh bài học</b>, hoặc tự tạo nút kiến thức khi AI chưa khả dụng.
                      </p>
                      {!chapterLocked && (
                        <button
                          type="button"
                          className="btn btn-outline sm"
                          disabled={busy}
                          onClick={() => {
                            setLessonFilter('all');
                            setD2ViewMode('graph');
                            setManualLessonCanvas(true);
                            setD2CreateTrigger((c) => c + 1);
                          }}
                        >
                          <Plus size={13} /> Tạo nút kiến thức thủ công (không cần AI)
                        </button>
                      )}
                    </div>
                  ) : (() => {
                    const hasWarn = (l: ChapterLessonItem) =>
                      Boolean(l.hasWarning || (l.assessment && l.assessment.verdict !== 'supported'));
                    const pendingCount = lessons.filter((l) => l.decision === 'PENDING').length;
                    const warnCount = lessons.filter(hasWarn).length;
                    const approvedCount = lessons.filter((l) => l.decision === 'APPROVE' || l.decision === 'EDIT').length;
                    const rejectedCount = lessons.filter((l) => l.decision === 'REJECT').length;
                    const reviewedCount = lessons.length - pendingCount;
                    const visibleLessons = lessons.filter((l) => {
                      if (lessonFilter === 'pending') return l.decision === 'PENDING';
                      if (lessonFilter === 'warn') return hasWarn(l);
                      if (lessonFilter === 'approved') return l.decision === 'APPROVE' || l.decision === 'EDIT';
                      if (lessonFilter === 'rejected') return l.decision === 'REJECT';
                      return true;
                    });
                    const anyExpanded = visibleLessons.some((l) => expandedLessonIds[l.id]);
                    const toggleAllVisible = () => {
                      if (anyExpanded) {
                        setExpandedLessonIds({});
                      } else {
                        const next: Record<string, boolean> = {};
                        visibleLessons.forEach((l) => {
                          next[l.id] = true;
                        });
                        setExpandedLessonIds(next);
                      }
                    };

                    return (
                      <>
                        <div className="lesson-review-bar">
                          <div className="lesson-filter-pills">
                            <span className="lesson-progress-pill">
                              {reviewedCount}/{lessons.length} đã xử lý
                            </span>
                            <button
                              type="button"
                              className={`lesson-filter-pill${lessonFilter === 'all' ? ' on' : ''}`}
                              onClick={() => setLessonFilter('all')}
                            >
                              Tất cả ({lessons.length})
                            </button>
                            <button
                              type="button"
                              className={`lesson-filter-pill${lessonFilter === 'pending' ? ' on' : ''}`}
                              onClick={() => setLessonFilter('pending')}
                            >
                              Chờ duyệt ({pendingCount})
                            </button>
                            {warnCount > 0 && (
                              <button
                                type="button"
                                className={`lesson-filter-pill warn${lessonFilter === 'warn' ? ' on' : ''}`}
                                onClick={() => setLessonFilter('warn')}
                              >
                                Cần chú ý ({warnCount})
                              </button>
                            )}
                            <button
                              type="button"
                              className={`lesson-filter-pill${lessonFilter === 'approved' ? ' on' : ''}`}
                              onClick={() => setLessonFilter('approved')}
                            >
                              Đã duyệt ({approvedCount})
                            </button>
                            {rejectedCount > 0 && (
                              <button
                                type="button"
                                className={`lesson-filter-pill${lessonFilter === 'rejected' ? ' on' : ''}`}
                                onClick={() => setLessonFilter('rejected')}
                              >
                                Từ chối ({rejectedCount})
                              </button>
                            )}
                          </div>
                          <div className="lesson-review-actions">
                            <div className="kg-view-switch" role="tablist" aria-label="Chế độ xem bài học">
                              <button
                                type="button"
                                role="tab"
                                aria-selected={d2ViewMode === 'graph'}
                                className={d2ViewMode === 'graph' ? 'on' : ''}
                                onClick={() => setD2ViewMode('graph')}
                              >
                                <Share2 size={12} style={{ marginRight: 5 }} /> Đồ thị Neo4j
                              </button>
                              <button
                                type="button"
                                role="tab"
                                aria-selected={d2ViewMode === 'list'}
                                className={d2ViewMode === 'list' ? 'on' : ''}
                                onClick={() => setD2ViewMode('list')}
                              >
                                <List size={12} style={{ marginRight: 5 }} /> Danh sách
                              </button>
                            </div>
                            {d2ViewMode === 'list' && (
                              <button type="button" className="btn btn-outline sm" onClick={toggleAllVisible}>
                                {anyExpanded ? 'Thu gọn' : 'Mở chi tiết'}
                              </button>
                            )}
                            {currentChapter.state === 'LESSON_APPROVED' ? (
                              <>
                                <span className="pill-badge green">
                                  <CheckCircle2 size={12} /> Đã duyệt buổi học
                                </span>
                                {(() => {
                                  const nextPendingChapter = outline.chapters.find(
                                    (c) => c.id !== currentChapter.id && c.state !== 'LESSON_APPROVED' && c.state !== 'PUBLISHED',
                                  );
                                  if (nextPendingChapter) {
                                    return (
                                      <button
                                        type="button"
                                        className="btn btn-primary sm"
                                        onClick={() => {
                                          setSelectedChapterId(nextPendingChapter.id);
                                          setChapterFiles([]);
                                        }}
                                      >
                                        Buổi tiếp theo <ArrowRight size={12} />
                                      </button>
                                    );
                                  }
                                  if (step2Done) {
                                    return (
                                      <button type="button" className="btn btn-primary sm" onClick={() => setStep(3)}>
                                        Sang Bước 3 <ArrowRight size={12} />
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary sm"
                                disabled={busy || chapterLocked || lessons.every((l) => l.decision === 'REJECT')}
                                title={
                                  chapterLocked
                                    ? 'Buổi học đã được xuất bản và khóa chỉnh sửa.'
                                    : 'Duyệt toàn bộ bài học hợp lệ và hoàn tất buổi học này trong 1 lần bấm'
                                }
                                onClick={() => void handleApproveAllAndCompleteChapter()}
                              >
                                <CheckCircle2 size={13} /> {busy ? 'Đang xử lý...' : 'Duyệt tất cả & Hoàn tất'}
                              </button>
                            )}
                          </div>
                        </div>

                        {visibleLessons.length === 0 && !(lessons.length === 0 && manualLessonCanvas && d2ViewMode === 'graph') ? (
                          <div className="wizard-empty-box" style={{ padding: '22px 16px' }}>
                            <p>Không có bài học nào trong mục lọc này.</p>
                            <button type="button" className="btn btn-outline sm" onClick={() => setLessonFilter('all')}>
                              Xem tất cả ({lessons.length})
                            </button>
                          </div>
                        ) : d2ViewMode === 'graph' ? (
                          <Neo4jDraftGraph
                            mode="lessons"
                            chapter={currentChapter}
                            lessons={visibleLessons}
                            learningOutcomes={outline.learningOutcomes}
                            busy={busy}
                            locked={chapterLocked}
                            onLessonDecision={handleLessonDecision}
                            onCreateLesson={handleCreateLesson}
                            onDeleteLesson={handleDeleteLesson}
                            createTrigger={d2CreateTrigger}
                          />
                        ) : (
                          <div className="wizard-items-list">
                            {visibleLessons.map((lesson, idx) => {
                              const isExpanded = Boolean(expandedLessonIds[lesson.id]) || editingLessonId === lesson.id;
                              const isWarn = hasWarn(lesson);
                              const stateClass =
                                lesson.decision === 'APPROVE' || lesson.decision === 'EDIT'
                                  ? 'state-approved'
                                  : lesson.decision === 'REJECT'
                                    ? 'state-rejected'
                                    : isWarn
                                      ? 'state-warn'
                                      : 'state-pending';
                              const warningText = lesson.assessment?.issue || lesson.aiComment || '';
                              const firstPageLabel =
                                formatSlidePage(lesson.sourceRef) ||
                                formatSlidePage(lesson.evidence?.[0]?.slideId);
                              const toggleExpand = () =>
                                setExpandedLessonIds((prev) => ({ ...prev, [lesson.id]: !prev[lesson.id] }));

                              return (
                                <div key={lesson.id} className={`lesson-card ${stateClass}`}>
                                  <div className="lesson-card-head">
                                    <div className="lesson-card-title-wrap" onClick={toggleExpand}>
                                      <div className="lesson-title-line">
                                        <span className="lesson-index">#{idx + 1}</span>
                                        <b>{lesson.title}</b>
                                      </div>
                                      <div className="lesson-chips">
                                        {lesson.level && (
                                          <span className="lesson-chip">
                                            {lesson.level === 'topic' ? 'Chủ đề' : 'Bài học'}
                                          </span>
                                        )}
                                        {lesson.loCodes.slice(0, 2).map((code) => (
                                          <span key={code} className="lesson-chip lo">{code}</span>
                                        ))}
                                        {lesson.loCodes.length > 2 && (
                                          <span className="lesson-chip">+{lesson.loCodes.length - 2} LO</span>
                                        )}
                                        {lesson.durationMin != null && (
                                          <span className="lesson-chip">
                                            <Clock size={10} /> {lesson.durationMin}p
                                          </span>
                                        )}
                                        {firstPageLabel && (
                                          <span className="lesson-chip page" title={lesson.sourceRef || lesson.evidence?.[0]?.slideId}>
                                            {firstPageLabel}
                                          </span>
                                        )}
                                        {lesson.assessment && lesson.assessment.verdict !== 'supported' && (
                                          <span className={`lesson-chip ${lesson.assessment.verdict === 'unsupported' ? 'err' : 'warn'}`}>
                                            {VERDICT_BADGE[lesson.assessment.verdict].text}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="lesson-card-actions">
                                      <button
                                        type="button"
                                        className={`lesson-act-btn approve${lesson.decision === 'APPROVE' || lesson.decision === 'EDIT' ? ' on' : ''}`}
                                        disabled={busy || chapterLocked}
                                        title="Duyệt bài học"
                                        onClick={() => void handleLessonDecision(lesson.id, 'APPROVE')}
                                      >
                                        <Check size={13} />
                                        <span>{lesson.decision === 'APPROVE' || lesson.decision === 'EDIT' ? 'Đã duyệt' : 'Duyệt'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="lesson-act-btn icon-only"
                                        disabled={busy || chapterLocked}
                                        title="Chỉnh sửa"
                                        aria-label="Chỉnh sửa"
                                        onClick={() => {
                                          setEditingLessonId(lesson.id);
                                          setEditTitle(lesson.title);
                                          setEditContent(lesson.content);
                                          setExpandedLessonIds((prev) => ({ ...prev, [lesson.id]: true }));
                                        }}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className={`lesson-act-btn icon-only reject${lesson.decision === 'REJECT' ? ' on' : ''}`}
                                        disabled={busy || chapterLocked}
                                        title="Từ chối"
                                        aria-label="Từ chối"
                                        onClick={() => void handleLessonDecision(lesson.id, 'REJECT')}
                                      >
                                        <X size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        className="lesson-act-btn icon-only"
                                        title={isExpanded ? 'Thu gọn chi tiết' : 'Xem chi tiết & trích dẫn'}
                                        aria-expanded={isExpanded}
                                        onClick={toggleExpand}
                                      >
                                        <ChevronDown size={14} className={`rot${isExpanded ? ' open' : ''}`} />
                                      </button>
                                    </div>
                                  </div>

                                  {editingLessonId === lesson.id ? (
                                    <div className="wizard-edit-inline">
                                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                                      <textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm"
                                          onClick={() => void handleLessonDecision(lesson.id, 'EDIT', { title: editTitle, content: editContent })}
                                        >
                                          Lưu &amp; Duyệt
                                        </button>
                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingLessonId(null)}>
                                          Hủy
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p
                                      className={`lesson-card-summary${isExpanded ? ' expanded' : ''}`}
                                      onClick={isExpanded ? undefined : toggleExpand}
                                    >
                                      {lesson.content}
                                    </p>
                                  )}

                                  {warningText && (
                                    <div className={`lesson-warn-inline${isExpanded ? '' : ' compact'}`}>
                                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                      <span>{warningText}</span>
                                    </div>
                                  )}

                                  {isExpanded && (
                                    <div className="lesson-card-details">
                                      {lesson.outcome && (
                                        <div className="lesson-detail-row">
                                          <b>Mục tiêu:</b>
                                          <span>{lesson.outcome}</span>
                                        </div>
                                      )}
                                      {lesson.details && lesson.details.length > 0 && (
                                        <div className="lesson-detail-row">
                                          <b>Ý chính:</b>
                                          <div className="lesson-detail-tags">
                                            {lesson.details.map((d, i) => (
                                              <span key={i} className="lesson-detail-tag">{d.name}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {(lesson.aliases?.length || lesson.confidence != null || lesson.assessment?.suggestedReuseId) && (
                                        <div className="wizard-meta-row" style={{ marginTop: 0 }}>
                                          {lesson.confidence != null && <span>Độ tin cậy: {Math.round(lesson.confidence * 100)}%</span>}
                                          {lesson.aliases && lesson.aliases.length > 0 && <span>Tên khác: {lesson.aliases.join(', ')}</span>}
                                          {lesson.assessment?.suggestedReuseId && (
                                            <span style={{ color: 'var(--primary)' }} title={lesson.assessment.suggestedReuseId}>
                                              Gợi ý gộp: <code>{shortReuseId(lesson.assessment.suggestedReuseId)}</code>
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {lesson.evidence && lesson.evidence.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          <b style={{ fontSize: 11.5, color: 'var(--ink)' }}>
                                            Trích dẫn nguồn ({lesson.evidence.length}):
                                          </b>
                                          {lesson.evidence.map((ev, eIdx) => (
                                            <div key={eIdx} className="wizard-evidence-item">
                                              <b style={{ color: 'var(--primary)' }} title={ev.slideId}>
                                                {formatSlidePage(ev.slideId)}:
                                              </b>{' '}
                                              <i>"{ev.quote}"</i>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {lessonsCursor && (
                          <button
                            type="button"
                            className="btn btn-outline sm"
                            style={{ alignSelf: 'center', marginTop: 6 }}
                            onClick={() => void loadChapterLessons(currentChapter.id, true, lessonsCursor)}
                          >
                            Tải thêm bài học
                          </button>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          <div className="wizard-footer-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setStep(1)}>
              <ArrowLeft size={13} /> Quay lại Bước 1
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!step2Done}>
              Sang Bước 3: Sinh quan hệ trên toàn bộ đồ thị <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: D3 INCREMENTAL CHAPTER-BY-CHAPTER RELATIONS & BẢN TẠM */}
      {step === 3 && (() => {
        const chapterTitleById = new Map(outline.chapters.map((c) => [c.id, c.title]));
        const epChapterById = new Map<string, string>();
        for (const ep of relationEndpoints) {
          if (ep.weekId) {
            epChapterById.set(ep.id, ep.weekId);
            if (ep.canonicalId) epChapterById.set(ep.canonicalId, ep.weekId);
          }
        }
        const nextUnmergedChapter =
          outline.chapters.find((c) => c.id !== relationWeekId && c.state !== 'PUBLISHED' && c.state === 'LESSON_APPROVED') ||
          outline.chapters.find((c) => c.id !== relationWeekId && c.state !== 'PUBLISHED');

        const isCrossChapterRel = (r: CourseRelationItem) => {
          const sCh = r.sourceChapterId || epChapterById.get(r.sourceId);
          const tCh = r.targetChapterId || epChapterById.get(r.targetId);
          return Boolean(sCh && tCh && sCh !== tCh);
        };

        const approvedRelCount = relations.filter(
          (r) => r.decision === 'APPROVE' || r.decision === 'EDIT',
        ).length;
        const pendingRelCount = relations.filter((r) => r.decision === 'PENDING').length;
        const warnRelCount = relations.filter((r) =>
          Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported')),
        ).length;
        const crossRelCount = relations.filter(isCrossChapterRel).length;
        const intraRelCount = relations.length - crossRelCount;

        const filteredListRelations = relations.filter((r) => {
          if (d3ListFilter === 'cross') return isCrossChapterRel(r);
          if (d3ListFilter === 'intra') return !isCrossChapterRel(r);
          if (d3ListFilter === 'pending') return r.decision === 'PENDING';
          if (d3ListFilter === 'warn') return Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported'));
          if (d3ListFilter === 'approved') return r.decision === 'APPROVE' || r.decision === 'EDIT';
          if (d3ListFilter === 'rejected') return r.decision === 'REJECT';
          return true;
        });

        const totalGraphNodes = reviewGraph?.nodes.filter((n) => n.type !== 'Course').length ?? 0;
        const totalGraphEdges = reviewGraph?.edges.length ?? 0;
        const latestSnapshot = step3Snapshots[0] ?? null;
        const snapshotCoveredCount = activeBaseSnapshot
          ? Array.from(new Set([...activeBaseSnapshot.includedWeekIds, ...effectiveSelectedWeekIds])).length
          : effectiveSelectedWeekIds.length;
        const selectedWeekTitles = effectiveSelectedWeekIds
          .map((wid) => chapterTitleById.get(wid) ?? wid);
        const contextHeading = activeBaseSnapshot
          ? `Snapshot v${activeBaseSnapshot.draftRevision} + ${selectedWeekTitles.length} chương (${selectedWeekTitles.join(', ')})`
          : selectedWeekTitles.length > 1
            ? `Gộp ${selectedWeekTitles.length} chương (${selectedWeekTitles.join(', ')})`
            : `Đồ thị thô · ${selectedWeekTitles[0] ?? ''}`;
        const snapshotSelectValue =
          selectedSnapshotId === '__latest__'
            ? (activeBaseSnapshot?.draftId ?? '')
            : (selectedSnapshotId ?? '');

        return (
          <div className={`wizard-panel d3-workspace-full${d3SidebarCollapsed ? ' rail-collapsed' : ''}`}>
            {/* Left Collapsible Incremental Chain Rail */}
            {!d3SidebarCollapsed && (
              <aside className="d3-chain-rail">
                <div className="d3-chain-rail-head">
                  <div>
                    <b>Đầu vào tạo cạnh (D3)</b>
                    <small>
                      {activeBaseSnapshot
                        ? `Nền Snapshot v${activeBaseSnapshot.draftRevision}`
                        : 'Chỉ dùng chương thô'}{' '}
                      · +{effectiveSelectedWeekIds.length} chương
                    </small>
                  </div>
                  <button
                    type="button"
                    className="n4j-icon-close"
                    onClick={() => setD3SidebarCollapsed(true)}
                    title="Thu gọn thanh cấu hình đầu vào để tối đa đồ thị"
                  >
                    <PanelLeft size={14} />
                  </button>
                </div>

                {/* Version Snapshot Selector (course_graph_draft) */}
                <div className="d3-snapshot-box">
                  <label htmlFor="d3-snap-select">Version Snapshot (Bản tạm)</label>
                  <select
                    id="d3-snap-select"
                    className="d3-snapshot-select"
                    disabled={busy}
                    value={snapshotSelectValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSnapshotId(val ? val : null);
                    }}
                  >
                    <option value="">Không dùng snapshot (chỉ chương chọn)</option>
                    {step3Snapshots.map((s, sIdx) => (
                      <option key={s.draftId} value={s.draftId}>
                        v{s.draftRevision} · {s.title} ({s.nodeCount} nút, {s.edgeCount} cạnh){sIdx === 0 ? ' · Mới nhất' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="d3-snapshot-meta">
                    {activeBaseSnapshot ? (
                      <>
                        Bao gồm <b>{activeBaseSnapshot.includedWeekIds.length} chương</b> · {activeBaseSnapshot.nodeCount} nút · {activeBaseSnapshot.edgeCount} cạnh
                      </>
                    ) : step3Snapshots.length === 0 ? (
                      <>Chưa có snapshot đã lưu. Chọn các chương bên dưới để tạo Bản tạm v1.</>
                    ) : (
                      <>Đang dùng graph thô của {effectiveSelectedWeekIds.length} chương đã chọn.</>
                    )}
                  </div>
                </div>

                <div className="d3-quick-actions">
                  <span>Chọn chương ({effectiveSelectedWeekIds.length}/{outline.chapters.length})</span>
                  <div className="d3-quick-links">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const readyIds = outline.chapters
                          .filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED')
                          .map((c) => c.id);
                        if (readyIds.length > 0) {
                          setSelectedStep3WeekIds(readyIds);
                          if (!readyIds.includes(relationWeekId)) setActiveRelationWeekId(readyIds[0]);
                        }
                      }}
                    >
                      Chọn hết
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSelectedStep3WeekIds([relationWeekId])}
                    >
                      Chỉ 1 chương
                    </button>
                  </div>
                </div>

                <div className="d3-chain-timeline">
                  {outline.chapters.map((ch, idx) => {
                    const inSnap = Boolean(activeBaseSnapshot?.includedWeekIds.includes(ch.id));
                    const isChecked = effectiveSelectedWeekIds.includes(ch.id);
                    const isFocus = ch.id === relationWeekId;
                    const needsD2 = ch.state !== 'LESSON_APPROVED' && ch.state !== 'PUBLISHED';
                    return (
                      <div
                        key={ch.id}
                        className={`d3-chain-step${inSnap ? ' merged' : ''}${isFocus ? ' active' : ''}${needsD2 ? ' blocked' : ''}`}
                      >
                        <div className="d3-chapter-row">
                          <input
                            type="checkbox"
                            className="d3-chapter-check"
                            disabled={busy || needsD2}
                            checked={isChecked}
                            title={
                              needsD2
                                ? 'Chương này chưa duyệt bài học ở Bước 2'
                                : 'Tích để gộp đồ thị chương này vào không gian tạo cạnh'
                            }
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (checked) {
                                setSelectedStep3WeekIds((prev) =>
                                  prev.includes(ch.id) ? prev : [...prev, ch.id],
                                );
                              } else {
                                const next = effectiveSelectedWeekIds.filter((id) => id !== ch.id);
                                if (next.length === 0) return;
                                setSelectedStep3WeekIds(next);
                                if (isFocus) setActiveRelationWeekId(next[0]);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="d3-chain-step-btn"
                            onClick={() => {
                              setActiveRelationWeekId(ch.id);
                              setSelectedStep3WeekIds((prev) =>
                                prev.includes(ch.id) ? prev : [...prev, ch.id],
                              );
                            }}
                          >
                            <span className="d3-chain-marker">
                              {inSnap ? <Check size={11} /> : isFocus ? <GitBranch size={11} /> : idx + 1}
                            </span>
                            <span className="d3-chain-meta">
                              <b>{ch.title}</b>
                              <small>
                                {needsD2
                                  ? 'Chưa duyệt bài học D2'
                                  : isFocus
                                    ? `● Chương chính${inSnap ? ` · ✓ v${activeBaseSnapshot?.draftRevision}` : ''}`
                                    : isChecked
                                      ? `● Đang chọn${inSnap ? ` · ✓ v${activeBaseSnapshot?.draftRevision}` : ''}`
                                      : inSnap
                                        ? `✓ Có trong Snapshot v${activeBaseSnapshot?.draftRevision}`
                                        : '○ Chưa chọn'}
                              </small>
                            </span>
                          </button>
                        </div>
                        {needsD2 && (
                          <button
                            type="button"
                            className="d3-chain-fix-link"
                            onClick={() => {
                              setSelectedChapterId(ch.id);
                              setStep(2);
                            }}
                          >
                            Duyệt ở D2
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className={`d3-chain-master-card${latestSnapshot ? ' complete' : ''}`}>
                  <div className="d3-chain-master-row">
                    <Layers size={14} />
                    <b>
                      {latestSnapshot
                        ? `Bản tạm mới nhất v${latestSnapshot.draftRevision}`
                        : 'Chưa lưu Bản tạm (Snapshot)'}
                    </b>
                  </div>
                  <small>
                    {latestSnapshot
                      ? `${latestSnapshot.includedWeekIds.length}/${outline.chapters.length} chương · ${latestSnapshot.nodeCount} nút · ${latestSnapshot.edgeCount} cạnh`
                      : `Đang xem ${totalGraphNodes} nút · ${totalGraphEdges} cạnh (${snapshotCoveredCount}/${outline.chapters.length} chương)`}
                  </small>
                  {(step3Snapshots.length > 0 || allWeeksMerged) && (
                    <button
                      type="button"
                      className="btn btn-primary sm"
                      style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
                      disabled={busy}
                      onClick={() => {
                        setReviewConfirmed(true);
                        setStep(4);
                      }}
                    >
                      Sang Bước 4: Xuất bản <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </aside>
            )}

            {/* Main Incremental Workspace */}
            <div className="d3-workspace-main">
              {/* Single Compact Action Toolbar */}
              <div className="d3-toolbar">
                <div className="d3-toolbar-left">
                  {d3SidebarCollapsed && (
                    <button
                      type="button"
                      className="btn btn-outline sm"
                      onClick={() => setD3SidebarCollapsed(false)}
                      title="Hiện thanh chuỗi nối Bản tạm"
                    >
                      <PanelLeft size={13} /> Chuỗi nối ({mergedChapters.length}/{outline.chapters.length})
                    </button>
                  )}
                  <div className="d3-context-title">
                    <b>{contextHeading}</b>
                    <div className="d3-context-pills">
                      <span className="pill-badge muted">Rev {relationRevision}</span>
                      {activeChapterReady && (
                        <span className="lesson-progress-pill">
                          {approvedRelCount}/{relations.length} duyệt
                          {crossRelCount > 0 ? ` · ${crossRelCount} liên chương` : ''}
                        </span>
                      )}
                      {warnRelCount > 0 && (
                        <span className="lesson-chip warn">{warnRelCount} cần chú ý</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="d3-toolbar-actions">
                  <div className="kg-view-switch" role="tablist" aria-label="Chế độ xem D3">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={d3ViewMode === 'neo4j'}
                      className={d3ViewMode === 'neo4j' ? 'on' : ''}
                      onClick={() => setD3ViewMode('neo4j')}
                    >
                      <Share2 size={12} style={{ marginRight: 4 }} /> Đồ thị
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={d3ViewMode === 'list'}
                      className={d3ViewMode === 'list' ? 'on' : ''}
                      onClick={() => setD3ViewMode('list')}
                    >
                      <List size={12} style={{ marginRight: 4 }} /> Danh sách ({relations.length})
                    </button>
                  </div>

                  {totalGraphNodes > 0 && (
                    <button
                      type="button"
                      className={`btn btn-outline sm${reviewHealthOpen ? ' on' : ''}`}
                      onClick={() => setReviewHealthOpen((o) => !o)}
                      title="Kiểm tra nút mồ côi, thành phần liên thông và độ phủ Bản tạm"
                    >
                      <Activity size={13} /> Kiểm tra đồ thị
                    </button>
                  )}

                  {activeChapterReady && !isEditLocked && (
                    <button
                      type="button"
                      className="btn btn-outline sm"
                      disabled={busy}
                      onClick={() => {
                        setD3ViewMode('neo4j');
                        setD3ConnectTrigger((c) => c + 1);
                      }}
                      title="Bấm 2 nút trên đồ thị để nối quan hệ mới giữa các chương đang chọn hoặc với Snapshot"
                    >
                      <Plus size={13} /> Nối thủ công
                    </button>
                  )}

                  {!activeChapterReady ? (
                    <button
                      type="button"
                      className="btn btn-primary sm"
                      onClick={() => {
                        if (activeRelationChapter) {
                          setSelectedChapterId(activeRelationChapter.id);
                        }
                        setStep(2);
                      }}
                    >
                      <BookOpen size={13} /> Về Bước 2 duyệt chương này
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline sm"
                        disabled={busy || isEditLocked}
                        onClick={() => void handleRunRelationJob()}
                        title="AI phân tích và đề xuất quan hệ giữa các chương đang chọn và phiên bản Snapshot"
                      >
                        <Sparkles size={12} />{' '}
                        {relations.length > 0 ? 'AI Gợi ý lại' : 'AI Sinh quan hệ'}
                      </button>
                      {relations.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-outline sm"
                          disabled={busy || isEditLocked}
                          onClick={handleDiscardRelations}
                          title="Hủy các cạnh nháp của chương chính đang chọn"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      {!relationsStale && (
                        <button
                          type="button"
                          className="btn btn-primary sm"
                          disabled={busy || isEditLocked}
                          onClick={() => void handleApproveAndMergeWeek()}
                          title="Chốt review và lưu tổ hợp graph hiện tại thành phiên bản Snapshot mới vào course_graph_draft"
                        >
                          <Save size={13} /> Lưu Bản tạm (Snapshot) <ArrowRight size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {relationsStale && (
                <div className="wizard-banner error compact" role="alert">
                  <AlertTriangle size={14} />
                  <span>
                    Bài học ở Bước 2 vừa thay đổi. Bấm <b>AI Nối lại</b> để đồng bộ quan hệ cho chương này.
                  </span>
                </div>
              )}

              {!activeChapterMerged &&
                activeChapterReady &&
                ((d3SourceReadiness?.ocrPages?.length ?? 0) > 0 || error.includes('Cần OCR hoặc xác nhận loại khỏi phạm vi')) && (
                  <div
                    className="wizard-banner warn compact"
                    style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                  >
                    <span>
                      <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                      {(d3SourceReadiness?.ocrPages?.length ?? 0) > 0
                        ? `Trang ${d3SourceReadiness!.ocrPages!.map((p) => `p${p.page}`).join(', ')} là trang ảnh/không đọc được chữ nên chưa thể gộp vào Bản tạm.`
                        : 'Chương này có trang ảnh/chưa đọc được chữ cần xác nhận loại khỏi phạm vi trước khi gộp vào Bản tạm.'}
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-outline sm"
                        disabled={busy || isEditLocked}
                        onClick={() =>
                          void handleExcludeOcrPages(
                            relationWeekId,
                            relationRevision,
                            d3SourceReadiness?.ocrPages?.map((p) => p.slideId),
                            false,
                          )
                        }
                      >
                        Xác nhận loại khỏi phạm vi
                      </button>
                      {!relationsStale && (
                        <button
                          type="button"
                          className="btn btn-primary sm"
                          disabled={busy || isEditLocked}
                          onClick={() =>
                            void handleExcludeOcrPages(
                              relationWeekId,
                              relationRevision,
                              d3SourceReadiness?.ocrPages?.map((p) => p.slideId),
                              true,
                            )
                          }
                        >
                          Loại trang ảnh &amp; Gộp vào Bản tạm <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Graph / List Main Stage */}
              <div className="d3-stage-wrap">
                {!activeChapterReady ? (
                  <div className="wizard-empty-box" style={{ margin: 'auto' }}>
                    <BookOpen size={24} />
                    <p>
                      <b>{activeRelationChapter?.title ?? 'Chương này'}</b> chưa hoàn tất duyệt bài học ở Bước 2 nên chưa thể nối vào Bản tạm.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary sm"
                      onClick={() => {
                        if (activeRelationChapter) setSelectedChapterId(activeRelationChapter.id);
                        setStep(2);
                      }}
                    >
                      Mở Bước 2 để duyệt chương này <ArrowRight size={13} />
                    </button>
                  </div>
                ) : d3ViewMode === 'neo4j' ? (
                  <div className="d3-neo4j-host">
                    {reviewLoading && !reviewGraph ? (
                      <div className="wizard-empty-box" style={{ margin: 'auto' }}>
                        Đang tải đồ thị Bản tạm…
                      </div>
                    ) : (
                      <Neo4jDraftGraph
                        mode="relations"
                        relations={relations}
                        chapters={outline.chapters}
                        reviewGraph={reviewGraph}
                        endpoints={relationEndpoints}
                        activeWeekId={relationWeekId}
                        activeWeekIds={effectiveSelectedWeekIds}
                        snapshotLabel={activeBaseSnapshot ? `Snapshot v${activeBaseSnapshot.draftRevision}` : 'Graph thô'}
                        activeWeekLocked={false}
                        allMerged={allWeeksMerged}
                        connectTrigger={d3ConnectTrigger}
                        focusEdgeRequest={d3FocusEdgeRequest}
                        busy={busy}
                        locked={isEditLocked}
                        onRelationDecision={handleRelationDecision}
                        onUpdateRelation={handleUpdateRelation}
                        onCreateRelation={handleCreateRelation}
                        onDeleteRelation={handleDeleteRelation}
                      />
                    )}
                  </div>
                ) : (
                  <div className="d3-list-host">
                    <div className="lesson-review-bar" style={{ marginBottom: 8 }}>
                      <div className="lesson-filter-pills">
                        {(
                          [
                            ['all', `Tất cả (${relations.length})`],
                            ['cross', `Liên chương (${crossRelCount})`],
                            ['intra', `Nội chương (${intraRelCount})`],
                            ['pending', `Chờ duyệt (${pendingRelCount})`],
                            ...(warnRelCount > 0 ? [['warn', `Cần chú ý (${warnRelCount})`]] : []),
                            ['approved', `Đã duyệt (${approvedRelCount})`],
                            ['rejected', `Từ chối (${relations.filter((r) => r.decision === 'REJECT').length})`],
                          ] as Array<[typeof d3ListFilter, string]>
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            className={`lesson-filter-pill${key === 'warn' ? ' warn' : ''}${d3ListFilter === key ? ' on' : ''}`}
                            onClick={() => setD3ListFilter(key)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredListRelations.length === 0 ? (
                      <div className="wizard-empty-box">
                        <GitBranch size={20} />
                        <p>Không có quan hệ nào khớp bộ lọc hiện tại.</p>
                      </div>
                    ) : (
                      <div className="wizard-items-list">
                        {filteredListRelations.map((r) => {
                          const sChId = r.sourceChapterId || epChapterById.get(r.sourceId);
                          const tChId = r.targetChapterId || epChapterById.get(r.targetId);
                          const cross = isCrossChapterRel(r);
                          const sChTitle = sChId ? chapterTitleById.get(sChId) : undefined;
                          const tChTitle = tChId ? chapterTitleById.get(tChId) : undefined;
                          return (
                            <div key={r.id} className={`wizard-review-card${r.hasWarning ? ' warn' : ''}`} style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <b>{r.sourceName}</b>
                                  {sChTitle && <small className="muted-s">({sChTitle})</small>}
                                  <span>→</span>
                                  <b>{r.targetName}</b>
                                  {tChTitle && <small className="muted-s">({tChTitle})</small>}
                                  <span className="pill-badge muted">{r.relationType}</span>
                                  {r.relationType === 'PREREQUISITE' && r.strength && (
                                    <span className="pill-badge blue">
                                      {r.strength === 'hard' ? 'Bắt buộc' : 'Gợi ý'}
                                    </span>
                                  )}
                                  <span className={`pill-badge ${cross ? 'amber' : 'muted'}`}>
                                    <Link2 size={10} /> {cross ? 'Liên chương' : 'Nội chương'}
                                  </span>
                                  <span
                                    className="pill-badge"
                                    style={{ color: DECISION_BADGE[r.decision].color, borderColor: DECISION_BADGE[r.decision].color }}
                                  >
                                    {DECISION_BADGE[r.decision].text}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                      setD3ViewMode('neo4j');
                                      setD3FocusEdgeRequest({ id: r.id, nonce: Date.now() });
                                    }}
                                  >
                                    <Eye size={12} /> Xem trên đồ thị
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-outline btn-sm${r.decision === 'APPROVE' ? ' active-approve' : ''}`}
                                    disabled={busy || isEditLocked || activeChapterMerged}
                                    onClick={() => void handleRelationDecision(r.id, 'APPROVE')}
                                  >
                                    <Check size={12} /> Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-outline btn-sm${r.decision === 'REJECT' ? ' active-reject' : ''}`}
                                    disabled={busy || isEditLocked || activeChapterMerged}
                                    onClick={() => void handleRelationDecision(r.id, 'REJECT')}
                                  >
                                    <X size={12} /> Từ chối
                                  </button>
                                </div>
                              </div>
                              {r.reason && <div className="muted-s" style={{ marginTop: 4 }}>{r.reason}</div>}
                              {r.aiComment && <div className="wizard-ai-note warn" style={{ marginTop: 4 }}>{r.aiComment}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {reviewHealthOpen && reviewGraph && (
                  <GraphHealthPanel
                    data={reviewGraph}
                    onClose={() => setReviewHealthOpen(false)}
                  />
                )}
              </div>

              {relationsCursor && (
                <button
                  type="button"
                  className="btn btn-outline sm"
                  style={{ alignSelf: 'center' }}
                  onClick={() => void loadRelations(true, relationsCursor, relationWeekId)}
                >
                  Tải thêm quan hệ
                </button>
              )}

              {/* Slim Incremental Footer Bar */}
              <div className="d3-footer-bar">
                <button
                  type="button"
                  className="btn btn-outline sm"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={13} /> Quay lại Bước 2
                </button>
                <span className="d3-footer-stats">
                  <b>
                    {activeBaseSnapshot
                      ? `Snapshot v${activeBaseSnapshot.draftRevision}`
                      : 'Graph thô chưa snapshot'}
                  </b>{' '}
                  · +{effectiveSelectedWeekIds.length} chương chọn · {totalGraphNodes} nút · {totalGraphEdges} cạnh
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {pendingRelCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline sm"
                      disabled={busy || isEditLocked}
                      onClick={handleBatchApproveRelations}
                    >
                      <Check size={12} /> Duyệt nhanh ({pendingRelCount})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary sm"
                    disabled={busy || (step3Snapshots.length === 0 && !allWeeksMerged)}
                    title={
                      step3Snapshots.length > 0
                        ? `Chuyển sang Bước 4 để xuất bản Bản tạm (${step3Snapshots.length} snapshot sẵn sàng)`
                        : 'Cần bấm Lưu Bản tạm (Snapshot) ít nhất 1 lần trước khi xuất bản'
                    }
                    onClick={() => {
                      setReviewConfirmed(true);
                      setStep(4);
                    }}
                  >
                    Sang Bước 4: Xuất bản <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* STEP 4: D4 PUBLISH COURSE GRAPH */}
      {step === 4 && (() => {
        const chosenPublishSnap =
          step3Snapshots.find((s) => s.draftId === publishSnapshotId) ?? step3Snapshots[0] ?? null;
        const statVer = chosenPublishSnap?.draftRevision ?? masterVersion;
        const statChapters = chosenPublishSnap
          ? chosenPublishSnap.includedWeekIds.length
          : mergedChapters.length;
        const statNodes = chosenPublishSnap
          ? chosenPublishSnap.nodeCount
          : (reviewGraph?.nodes.filter((n) => n.type !== 'Course').length ?? 0);
        const statEdges = chosenPublishSnap
          ? chosenPublishSnap.edgeCount
          : (reviewGraph?.edges.length ?? 0);
        const snapMissingChapters = chosenPublishSnap
          ? chosenPublishSnap.includedWeekIds.length < outline.chapters.length
          : !allWeeksMerged;

        return (
        <div className="wizard-panel">
          <div className="wizard-panel-head">
            <div>
              <h3>D4. Xuất bản Course Graph chính thức</h3>
              <p className="muted-s">
                Chọn phiên bản Bản tạm (Snapshot trong <code>course_graph_draft</code>) để xuất bản chính thức sang Neo4j.
              </p>
            </div>
            <span className="pill-badge blue">Bản tạm v{statVer}</span>
          </div>

          {step3Snapshots.length > 0 && (
            <div className="d3-snapshot-box" style={{ marginBottom: 12 }}>
              <label htmlFor="d4-snap-select">Chọn phiên bản Snapshot xuất bản</label>
              <select
                id="d4-snap-select"
                className="d3-snapshot-select"
                disabled={busy || isEditLocked}
                value={chosenPublishSnap?.draftId ?? ''}
                onChange={(e) => setPublishSnapshotId(e.target.value)}
              >
                {step3Snapshots.map((s, sIdx) => (
                  <option key={s.draftId} value={s.draftId}>
                    v{s.draftRevision} · {s.title} ({s.includedWeekIds.length}/{outline.chapters.length} chương · {s.nodeCount} nút · {s.edgeCount} cạnh){sIdx === 0 ? ' · Mới nhất' : ''}
                  </option>
                ))}
              </select>
              {chosenPublishSnap?.note && (
                <div className="d3-snapshot-meta">{chosenPublishSnap.note}</div>
              )}
            </div>
          )}

          <div className="wizard-summary-grid">
            <div className="wizard-stat-box">
              <Layers size={18} />
              <b>v{statVer}</b>
              <span>Phiên bản Bản tạm</span>
            </div>
            <div className="wizard-stat-box">
              <BookOpen size={18} />
              <b>{statChapters} / {outline.chapters.length}</b>
              <span>Chương trong Snapshot</span>
            </div>
            <div className="wizard-stat-box">
              <Layers size={18} />
              <b>{statNodes}</b>
              <span>Tổng số nút kiến thức</span>
            </div>
            <div className="wizard-stat-box">
              <GitBranch size={18} />
              <b>{statEdges}</b>
              <span>Tổng số quan hệ</span>
            </div>
          </div>

          {snapMissingChapters && (
            <div className="wizard-banner warn" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                Bản tạm đang chọn gồm <b>{statChapters}/{outline.chapters.length}</b> chương.
                {hasPublishedRelease
                  ? ` Đồ thị môn học hiện vẫn đang hiển thị bản phát hành cũ v${latestReleaseNo || 1}.`
                  : ''}{' '}
                Bạn vẫn có thể xuất bản ngay phiên bản này hoặc quay lại Bước 3 để gộp thêm chương.
              </span>
              <button type="button" className="btn btn-primary sm" onClick={() => setStep(3)}>
                Quay lại Bước 3 gộp thêm <ArrowRight size={12} />
              </button>
            </div>
          )}

          {publishWarnings.length > 0 && (
            <div className="wizard-banner error">
              <AlertTriangle size={14} />
              <span>Cảnh báo khi xuất bản: {publishWarnings.join('; ')}</span>
            </div>
          )}

          {pubStatus && (
            <div className={`wizard-banner ${pubStatus.syncStatus === 'FAILED' || pubStatus.syncStatus === 'BLOCKED' ? 'error' : 'success'}`}>
              <RefreshCw size={14} />
              <span>
                Trạng thái đồng bộ Neo4j (Release v{pubStatus.releaseNo}): <b>{pubStatus.syncStatus}</b>
                {pubStatus.error ? ` — ${pubStatus.error}` : ''}
              </span>
            </div>
          )}

          {hasPublishedRelease && (
            <div className="wizard-banner success" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span>
                <BookOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                Đồ thị môn học đã được xuất bản. <b>Bước tiếp theo:</b> cập nhật nội dung bài học và bài kiểm tra cho từng nút Concept.
              </span>
              {onAuthorConceptContent && (
                <button type="button" className="btn btn-primary sm" onClick={onAuthorConceptContent}>
                  <BookOpen size={13} /> Cập nhật nội dung &amp; bài kiểm tra từng Concept <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}

          <div className="wizard-footer-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setStep(3)}>
              <ArrowLeft size={13} /> Quay lại Bước 3 rà soát
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pendingPublicationId && (
                <button type="button" className="btn btn-outline" disabled={busy} onClick={handleRecoverPublish}>
                  <RefreshCw size={13} /> Phục hồi xuất bản ({pendingPublicationId})
                </button>
              )}
              {isEditLocked && (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => {
                    setUnlockedForRevision(true);
                    setJustPublished(false);
                    setStep(3);
                  }}
                >
                  <Pencil size={13} /> Tạo phiên bản cập nhật (Mở khóa D1–D3)
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || isEditLocked || Boolean(pendingPublicationId) || (!allWeeksMerged && step3Snapshots.length === 0)}
                onClick={handlePublish}
              >
                <Sparkles size={13} />{' '}
                {isEditLocked
                  ? 'Đã xuất bản phiên bản mới nhất'
                  : hasPublishedRelease
                    ? `Xuất bản Snapshot v${statVer} (Release v${(latestReleaseNo || 1) + 1})`
                    : `Xuất bản Course Graph (v${statVer})`}
              </button>
              {hasPublishedRelease && (
                <button type="button" className="btn btn-outline" onClick={onPublishedGraph}>
                  Xem Course Graph trực quan <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
