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
  List,
  Lock,
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
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { GraphHealthPanel } from '../graph/GraphHealthPanel';
import { serializeKnowledgeGraph } from '../graph/graphSerializer';
import { KnowledgeGraphCanvas } from '../graph/KnowledgeGraphCanvas';
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
  KnowledgeEdgeType,
  KnowledgeGraphData,
  KnowledgeNodeType,
  OutlineState,
  PublicationStatusResponse,
  RelationEndpointOption,
  ReviewDecision,
  SourceReadinessResponse,
  WorkflowJobResponse,
  WorkflowJobStatus,
} from '../../types';

interface Props {
  courseId: string;
  courseName: string;
  hasPublishedGraph?: boolean;
  onPublishedGraph: () => void;
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

export function CourseAuthoringWizard({ courseId, courseName, hasPublishedGraph: _hasPublishedGraph = false, onPublishedGraph }: Props) {
  const nav = useNavigate();
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

  useEffect(() => {
    setLessonFilter('all');
    setExpandedLessonIds({});
    setEditingLessonId(null);
  }, [selectedChapterId]);

  // D3 Relations state
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [customRelationWeekId, setCustomRelationWeekId] = useState<string>('');
  const [relations, setRelations] = useState<CourseRelationItem[]>([]);
  const [relationEndpoints, setRelationEndpoints] = useState<RelationEndpointOption[]>([]);
  const [relationsCursor, setRelationsCursor] = useState<string | null>(null);
  const [relationRevision, setRelationRevision] = useState(1);
  const [relationsStale, setRelationsStale] = useState(false);
  const [d3ViewMode, setD3ViewMode] = useState<'neo4j' | 'editor' | 'list'>('neo4j');
  const [manualRelationCanvas, setManualRelationCanvas] = useState(false);

  // D4 Review & D5 Publish state
  const [reviewGraph, setReviewGraph] = useState<KnowledgeGraphData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewHealthOpen, setReviewHealthOpen] = useState(false);
  const [d4EditMode, setD4EditMode] = useState(true);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [masterVersion, setMasterVersion] = useState(0);
  const [justPublished, setJustPublished] = useState(false);
  const [pendingPublicationId, setPendingPublicationId] = useState<string | null>(null);
  const [pubStatus, setPubStatus] = useState<PublicationStatusResponse | null>(null);
  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);

  // D5 Active Job state
  const [activeJob, setActiveJob] = useState<(WorkflowJobResponse & { kind: 'outline' | 'lesson' | 'relation' }) | null>(null);
  const [usage, setUsage] = useState<CourseUsageSummary | null>(null);
  const [sourceReadiness, setSourceReadiness] = useState<SourceReadinessResponse | null>(null);

  const loadOutline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getOutlineDraft(courseId);
      setOutline(res.outline);
      setOutlineState(res.state);
      setOutlineRevision(res.revision);
      setMasterVersion(res.masterVersion ?? 0);
      if (res.outline.chapters.length && !selectedChapterId) {
        setSelectedChapterId(res.outline.chapters[0].id);
      }
      const approvedIds = res.outline.chapters
        .filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED')
        .map((c) => c.id);
      setSelectedChapterIds(approvedIds);

      const allPublished =
        res.state === 'OUTLINE_APPROVED' &&
        res.outline.chapters.length > 0 &&
        res.outline.chapters.every((c) => c.state === 'PUBLISHED');
      if (allPublished) {
        setStep(4);
      } else if (res.state === 'OUTLINE_APPROVED') {
        const allChaptersApproved =
          res.outline.chapters.length > 0 && approvedIds.length === res.outline.chapters.length;
        const savedStep = getSavedWizardStep(courseId);
        if (allChaptersApproved) {
          const weekId = approvedIds[0] || res.outline.chapters[0]?.id || 'week_1';
          const relRes = await api.getCourseRelations(courseId, null, 200, weekId).catch(() => null);
          if (relRes) {
            setRelations(relRes.items);
            setRelationEndpoints(relRes.endpoints ?? []);
            setRelationsCursor(relRes.nextCursor);
            setRelationRevision(relRes.revision);
          }
          const allRelationsReviewed = Boolean(
            relRes && relRes.items.length > 0 && relRes.items.every((r) => r.decision !== 'PENDING'),
          );
          let target: Step = savedStep >= 3 ? 3 : 2;
          if (allRelationsReviewed && savedStep >= 4) {
            setReviewConfirmed(true);
            target = 4;
          }
          setStep((prev) => (prev > target ? prev : target));
        } else {
          setStep((prev) => (prev < 2 ? 2 : prev));
        }
      } else {
        setStep(1);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải khung môn học.');
    } finally {
      setLoading(false);
    }
  }, [courseId, selectedChapterId]);

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
    (customRelationWeekId && selectedChapterIds.includes(customRelationWeekId) ? customRelationWeekId : '') ||
    selectedChapterIds[0] ||
    selectedChapterId ||
    outline.chapters[0]?.id ||
    'week_1';

  const loadRelations = useCallback(
    async (append = false, cursor?: string | null) => {
      try {
        const res = await api.getCourseRelations(courseId, cursor, 200, relationWeekId);
        setRelations((prev) => (append ? [...prev, ...res.items] : res.items));
        if (res.endpoints) setRelationEndpoints(res.endpoints);
        setRelationsCursor(res.nextCursor);
        setRelationRevision(res.revision);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách quan hệ.');
      }
    },
    [courseId, relationWeekId],
  );

  const invalidateStep3Relations = useCallback(async () => {
    setReviewConfirmed(false);
    if (relations.length === 0) return;
    setRelationsStale(true);
    try {
      const res = await api.discardCourseRelations(courseId, relationRevision, relationWeekId);
      setRelationRevision(res.revision);
      setRelations([]);
      setRelationsStale(false);
    } catch {
      // Keep stale warning banner so user knows Step 3 relations must be regenerated
    }
  }, [courseId, relationRevision, relationWeekId, relations.length]);

  useEffect(() => {
    void loadOutline();
  }, [courseId]);

  useEffect(() => {
    if (!loading) {
      saveWizardStep(courseId, step);
    }
  }, [courseId, step, loading]);

  const reloadReviewGraph = useCallback(async (syncDraftToBe = false) => {
    try {
      const kg = await api.getKnowledgeGraph(courseId);
      if (syncDraftToBe) {
        const serialized = serializeKnowledgeGraph(kg);
        const saved = await api.saveKnowledgeGraph(courseId, serialized, {
          title: 'D4 Review Draft',
          note: 'Auto-synced from D4 graph editor',
        });
        setReviewGraph(saved);
      } else {
        setReviewGraph(kg);
      }
    } catch {
      setReviewGraph(null);
    }
  }, [courseId]);

  useEffect(() => {
    if (step === 2 && selectedChapterId) {
      void loadChapterLessons(selectedChapterId);
    }
    if (step === 3) {
      void loadRelations();
      setReviewLoading(true);
      void reloadReviewGraph().finally(() => setReviewLoading(false));
    }
  }, [step, selectedChapterId, loadChapterLessons, loadRelations, reloadReviewGraph]);

  // D5 Job Polling
  useEffect(() => {
    if (!activeJob?.jobId) return;
    if (activeJob.status === 'SUCCEEDED' || activeJob.status === 'BLOCKED' || activeJob.status === 'FAILED') {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const latest = await api.getWorkflowJob(activeJob.jobId!);
        setActiveJob((prev) => (prev ? { ...latest, jobId: prev.jobId, kind: prev.kind } : null));
        if (latest.status === 'SUCCEEDED') {
          if (activeJob.kind === 'outline') {
            setMessage('AI đã trích xuất xong Khung môn học (Buổi học & Chuẩn đầu ra). Hãy rà soát và duyệt.');
            await loadOutline();
          } else if (activeJob.kind === 'lesson' && selectedChapterId) {
            await invalidateStep3Relations();
            setMessage('AI đã sinh & kiểm tra xong bài học cho buổi học. Hãy duyệt từng bài học.');
            await loadOutline();
            await loadChapterLessons(selectedChapterId);
          } else if (activeJob.kind === 'relation') {
            setRelationsStale(false);
            setMessage('AI đã sinh xong quan hệ trên toàn bộ đồ thị. Hãy rà soát và hiệu chỉnh trực tiếp trước khi xuất bản.');
            await loadRelations();
            setReviewLoading(true);
            void reloadReviewGraph().finally(() => setReviewLoading(false));
          }
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Lỗi khi theo dõi tiến độ job.');
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [activeJob, loadOutline, loadChapterLessons, loadRelations, selectedChapterId]);

  const handleResumeJob = async () => {
    if (!activeJob?.jobId) return;
    setError('');
    try {
      const res = await api.resumeWorkflowJob(activeJob.jobId, newIdempotencyKey('resume'));
      setActiveJob((prev) => (prev ? { ...prev, status: res.status } : null));
      setMessage('Đã xếp lại job từ checkpoint gần nhất.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tiếp tục job.');
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
      setActiveJob({
        kind: 'outline',
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 10,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo job trích xuất khung môn học.');
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
      setActiveJob({
        kind: 'lesson',
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 15,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể khởi chạy Lesson Job.');
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
      await invalidateStep3Relations();
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
      await invalidateStep3Relations();
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
      await invalidateStep3Relations();
      setLessons((prev) => (res.lesson ? [...prev, res.lesson] : prev));
      setOutline((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === currentChapter.id ? { ...c, revision: res.revision } : c)),
      }));
      setMessage(`Đã thêm nút "${input.title}" vào ${currentChapter.title}.`);
      if (currentChapter.state === 'LESSON_APPROVED') {
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
      await invalidateStep3Relations();
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
      await invalidateStep3Relations();
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
      await invalidateStep3Relations();
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
  const allChaptersPublished =
    outlineState === 'OUTLINE_APPROVED' &&
    outline.chapters.length > 0 &&
    outline.chapters.every((c) => c.state === 'PUBLISHED');
  const isPublished = justPublished || allChaptersPublished;
  const step1Done = outlineState === 'OUTLINE_APPROVED' || isPublished;
  const step2Done =
    isPublished ||
    (step1Done && outline.chapters.length > 0 && approvedChapters.length === outline.chapters.length);
  const step3Done =
    isPublished ||
    (!relationsStale && step2Done && (relations.length > 0 || reviewConfirmed));
  const chapterLocked = isPublished || currentChapter?.state === 'PUBLISHED';

  useEffect(() => {
    if (isPublished) {
      setStep(4);
    }
  }, [isPublished]);

  // D4b Publication Neo4j Sync Polling
  useEffect(() => {
    if (!pendingPublicationId || isPublished) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await api.getPublicationStatus(courseId, pendingPublicationId);
        if (cancelled) return;
        setPubStatus(st);
        if (st.syncStatus === 'SYNCED') {
          setJustPublished(true);
          setPendingPublicationId(null);
          setMessage(`Xuất bản Course Graph v${st.releaseNo} và đồng bộ Neo4j thành công!`);
          await loadOutline();
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
  }, [pendingPublicationId, isPublished, courseId, loadOutline]);

  const handleRunRelationJob = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const targetIds = [relationWeekId, ...selectedChapterIds.filter((id) => id !== relationWeekId)];
      const { jobId, status } = await api.createRelationJob(
        courseId,
        targetIds,
        relationRevision,
        newIdempotencyKey('relation'),
      );
      setActiveJob({
        kind: 'relation',
        jobId,
        status: (status as WorkflowJobResponse['status']) ?? 'QUEUED',
        progress: 20,
        canResume: true,
        resumeCount: 0,
        maxResumeAttempts: 3,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể khởi chạy Relation Job.');
    } finally {
      setBusy(false);
    }
  };

  const handleRelationDecision = async (relationId: string, decision: ReviewDecision) => {
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quyết định quan hệ.');
    }
  };

  const handleUpdateRelation = async (
    relationId: string,
    changes: Partial<CourseRelationItem>,
    customReviewNote?: string,
  ) => {
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
      void reloadReviewGraph();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRelation = async (input: CreateDraftRelationInput) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.createCourseRelation(
        courseId,
        {
          ...input,
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelations((prev) => (res.relation ? [...prev, res.relation] : prev));
      setRelationRevision(res.revision);
      setManualRelationCanvas(true);
      setMessage('Đã thêm quan hệ mới vào đồ thị.');
      void reloadReviewGraph();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo quan hệ mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRelation = async (relationId: string) => {
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
      setManualRelationCanvas(true);
      setMessage('Đã xóa quan hệ khỏi bản nháp.');
      void reloadReviewGraph();
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
      setMessage(`Đã đồng bộ (Rebase) buổi học theo Master v${res.masterVersion}.`);
      await loadOutline();
      await loadRelations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể Rebase buổi học.');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishWeekToMaster = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.publishWeekToMaster(courseId, relationWeekId, relationRevision);
      setRelationRevision(res.revision);
      setMasterVersion(res.masterVersion);
      setReviewConfirmed(true);
      setMessage(`Đã hợp nhất buổi học vào Master Graph v${res.masterVersion}.`);
      await loadOutline();
      await loadRelations();
      await reloadReviewGraph();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể hợp nhất buổi học vào Master.');
    } finally {
      setBusy(false);
    }
  };

  const handleBatchApproveRelations = async () => {
    if (!relations.length) return;
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
      setMessage(`Đã duyệt hàng loạt ${res.updatedCount} quan hệ giữa các buổi học.`);
      await loadRelations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt hàng loạt quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardRelations = async () => {
    if (!window.confirm('Xác nhận hủy bản nháp quan hệ giữa các buổi học?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.discardCourseRelations(courseId, relationRevision, relationWeekId);
      setRelationRevision(res.revision);
      setRelations([]);
      setRelationsStale(false);
      setMessage('Đã hủy bản nháp quan hệ giữa các buổi học.');
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
      const res = await api.publishCourseGraph(
        courseId,
        relationRevision,
        masterVersion,
        newIdempotencyKey('publish'),
      );
      setMasterVersion(res.masterVersion);
      setRelationRevision(res.revision);
      setPublishWarnings(res.warnings ?? []);
      try {
        const latestKg = reviewGraph ?? (await api.getKnowledgeGraph(courseId));
        await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(latestKg), {
          title: `D4 Course Graph v${res.masterVersion}`,
          note: 'Final graph JSON synced on D4 publish',
        });
      } catch {
        // Keep publish success even if secondary graph JSON sync fails
      }
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
        setMessage(`Xuất bản Course Graph v${res.masterVersion} thành công!`);
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
      } else {
        setPubStatus((prev) => (prev ? { ...prev, syncStatus: 'PENDING', error: null } : null));
      }
      try {
        const latestKg = reviewGraph ?? (await api.getKnowledgeGraph(courseId));
        await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(latestKg), {
          title: `D4 Course Graph v${res.masterVersion} (Recovered)`,
          note: 'Final graph JSON synced on D4 recover publish',
        });
      } catch {
        // Ignore secondary sync failure
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

  return (
    <div className="wizard-shell">
      {/* Stepper Header */}
      <div className="wizard-stepper">
        {[
          { num: 1 as Step, done: step1Done, title: 'D1. Khung môn học', sub: step > 1 || isPublished ? 'Đã duyệt · Khóa' : (step1Done ? 'Đã duyệt' : 'Đề cương & LO'), locked: step !== 1 },
          { num: 2 as Step, done: step2Done, title: 'D2. Bài học theo buổi học', sub: `${approvedChapters.length}/${outline.chapters.length} buổi học duyệt${step !== 2 ? ' · Khóa' : ''}`, locked: step !== 2 },
          { num: 3 as Step, done: step3Done, title: 'D3. Sinh quan hệ trên toàn bộ đồ thị', sub: step > 3 || isPublished ? 'Đã xác nhận · Khóa' : (relations.length > 0 ? `${relations.length} quan hệ · Đã sinh` : 'Sinh & rà soát đồ thị'), locked: step !== 3 },
          { num: 4 as Step, done: isPublished, title: 'D4. Xuất bản Course Graph', sub: isPublished ? `Đã xuất bản${masterVersion > 0 ? ` v${masterVersion}` : ''} · Khóa` : (step === 4 ? 'Sẵn sàng xuất bản' : 'Chưa xuất bản · Khóa'), locked: step !== 4 },
        ].map((item, idx) => (
          <div key={item.num} className="wizard-step-slot">
            <button
              type="button"
              disabled={item.locked}
              onClick={() => setStep(item.num)}
              className={`wizard-step-btn${step === item.num ? ' active' : ''}${item.done ? ' done' : ''}${item.locked ? ' locked' : ''}`}
            >
              <span className="wizard-step-num">
                {item.done ? <Check size={13} /> : item.locked ? <Lock size={12} /> : item.num}
              </span>
              <span className="wizard-step-meta">
                <b>{item.title}</b>
                <small>{item.sub}</small>
              </span>
            </button>
            {idx < 3 && <ChevronRight size={15} className="muted-icon wizard-step-chevron" />}
          </div>
        ))}
      </div>

      {usage && (
        <div className="wizard-usage-bar muted-s">
          <span><b>AI Usage:</b> {usage.totalCalls} lượt gọi</span>
          <span><b>Chi phí ước tính:</b> ${usage.estimatedCostUsd.toFixed(3)} / ${usage.budgetLimitUsd.toFixed(2)}</span>
          <span><b>Ngân sách còn lại:</b> ${usage.remainingBudgetUsd.toFixed(3)}</span>
        </div>
      )}

      {step === 2 && sourceReadiness && (
        <div
          className={`wizard-banner ${sourceReadiness.status === 'blocked' ? 'error' : sourceReadiness.status === 'ready' ? 'success' : 'warn'}`}
        >
          <FileText size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <b>Kiểm tra tài liệu buổi học:</b> {sourceReadiness.counts.readablePages}/{sourceReadiness.counts.totalPages} trang có text
            {sourceReadiness.counts.lowTextPages > 0 ? ` · ${sourceReadiness.counts.lowTextPages} trang ít chữ` : ''}
            {sourceReadiness.warnings.length > 0 ? ` — ${formatReadinessWarning(sourceReadiness.warnings[0])}` : ''}
          </span>
        </div>
      )}

      {/* Banners */}
      {(error || message) && (
        <div className="wizard-feedback-stack">
          {error && (
            <div className="wizard-banner error" role="alert">
              <AlertTriangle size={15} style={{ flexShrink: 0 }} /> <span>{error}</span>
              <button type="button" onClick={() => setError('')}><X size={14} /></button>
            </div>
          )}
          {message && (
            <div className="wizard-banner success" role="status">
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} /> <span>{message}</span>
              <button type="button" onClick={() => setMessage('')}><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      {/* D5 Active Job Tracker */}
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
          <div className={`wizard-job-bar ${barTone}`}>
            <div className="wizard-job-header">
              <div className="wizard-job-title-group">
                <Sparkles size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                <b>
                  {activeJob.kind === 'outline' && 'Đang trích xuất Khung môn học (D1 → D5)'}
                  {activeJob.kind === 'lesson' && 'Đang sinh & đối chiếu bài học buổi học (D2 → D5)'}
                  {activeJob.kind === 'relation' && 'Đang sinh & kiểm tra quan hệ giữa các buổi học (D3 → D5)'}
                </b>
                <span className={`pill-badge ${stInfo.tone}`}>{stInfo.label}</span>
              </div>
              <span className="wizard-job-pct">{activeJob.progress}%</span>
            </div>
            <div className="wizard-job-meta">
              <span>Tiến độ: {activeJob.progress}% · Thử lại: {activeJob.resumeCount}/{activeJob.maxResumeAttempts}</span>
              {activeJob.resumeBlockedReason && <span>({activeJob.resumeBlockedReason})</span>}
            </div>
            {friendlyErr && (
              <div className="wizard-ai-note warn">
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span>{friendlyErr}</span>
              </div>
            )}
            <div className="wizard-job-progress">
              <div className={`wizard-job-fill ${barTone}`} style={{ width: `${activeJob.progress}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(activeJob.status === 'BLOCKED' || activeJob.status === 'FAILED') && activeJob.canResume && (
                <button type="button" className="btn btn-primary sm" onClick={handleResumeJob}>
                  <RefreshCw size={12} /> Resume từ checkpoint
                </button>
              )}
              {(activeJob.status === 'SUCCEEDED' || activeJob.status === 'FAILED') && (
                <button type="button" className="btn btn-outline sm" onClick={() => setActiveJob(null)}>Đóng</button>
              )}
            </div>
          </div>
        );
      })()}

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
            {step1Done && !isPublished && (
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                Sang Bước 2: Bài học theo buổi học <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: D2 CHAPTER LESSONS */}
      {step === 2 && (
        <div className="wizard-panel">
          <div className="wizard-panel-head">
            <div>
              <h3>D2. Bài học theo buổi học (Mỗi lần duyệt ~20 node)</h3>
              <p className="muted-s">Chọn từng buổi học, tải tài liệu PDF buổi học đó, sinh bài học và duyệt trước khi chuyển sang Bước 3.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!step2Done}>
              Sang Bước 3: Sinh quan hệ trên toàn bộ đồ thị <ArrowRight size={13} />
            </button>
          </div>

          <div className="wizard-split">
            {/* Session sidebar */}
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

            {/* Selected Session Workspace */}
            <div className="wizard-chapter-main">
              {!currentChapter ? (
                <p className="muted-s">Chọn một buổi học bên trái để bắt đầu.</p>
              ) : (
                <>
                  <div className="wizard-card-head" style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <h4>{currentChapter.title}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className={`pill-badge ${CHAPTER_STATE_LABEL[currentChapter.state].tone}`}>
                          {CHAPTER_STATE_LABEL[currentChapter.state].text}
                        </span>
                        <span className="pill-badge muted">Rev {currentChapter.revision}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {currentChapter.state === 'PUBLISHED' && (
                        <button type="button" className="btn btn-outline sm" disabled={busy || isPublished} onClick={handleReopenChapter}>
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
                  </div>

                  {/* Paginated Lessons Review List */}
                  {lessons.length === 0 ? (
                    <div className="wizard-empty-box">
                      <BookOpen size={22} />
                      <p>Chưa có bài học nào. Hãy tải tài liệu buổi học và bấm <b>Sinh bài học</b>.</p>
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

                        {visibleLessons.length === 0 ? (
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
            <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={() => setStep(1)}>
              <ArrowLeft size={13} /> Quay lại Bước 1
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!step2Done}>
              Sang Bước 3: Sinh quan hệ trên toàn bộ đồ thị <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: D3 GENERATE RELATIONS & REVIEW FULL GRAPH */}
      {step === 3 && (
        <div className="wizard-panel">
          <div className="wizard-panel-head">
            <div>
              <h3>D3. Sinh quan hệ trên toàn bộ đồ thị</h3>
              <p className="muted-s">
                Chọn ít nhất 2 buổi học đã duyệt để AI suy luận quan hệ, sau đó kiểm tra và chỉnh sửa trực tiếp nút &amp; quan hệ trên toàn bộ đồ thị trước khi xuất bản.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill-badge muted">Rev {relationRevision}</span>
            </div>
          </div>

          {relationsStale && (
            <div className="wizard-banner error" role="alert" style={{ marginBottom: 12 }}>
              <AlertTriangle size={15} />
              <span>
                Bài học ở Bước 2 đã thay đổi. Vui lòng bấm <b>"Sinh quan hệ giữa các buổi học (Relation Job)"</b> để cập nhật lại đồ thị cho khớp trước khi sang Bước 4.
              </span>
            </div>
          )}

          <div className="wizard-card" style={{ marginBottom: 14 }}>
            <h4 style={{ marginBottom: 8 }}>Chọn các buổi học đã duyệt (tối thiểu 1 buổi học):</h4>
            <div className="wizard-checkbox-grid">
              {outline.chapters.map((ch) => {
                const isApproved = ch.state === 'LESSON_APPROVED' || ch.state === 'PUBLISHED';
                const checked = selectedChapterIds.includes(ch.id);
                return (
                  <label key={ch.id} className={`wizard-check-pill${!isApproved || isPublished ? ' disabled' : ''}${checked ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={!isApproved || isPublished}
                      checked={checked}
                      onChange={() =>
                        setSelectedChapterIds((prev) =>
                          prev.includes(ch.id) ? prev.filter((x) => x !== ch.id) : [...prev, ch.id],
                        )
                      }
                    />
                    <span>{ch.title}</span>
                    <small>({CHAPTER_STATE_LABEL[ch.state].text})</small>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {approvedChapters.length > 0 && (
                <select
                  value={relationWeekId}
                  onChange={(e) => setCustomRelationWeekId(e.target.value)}
                  disabled={busy || isPublished}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff' }}
                >
                  {approvedChapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || isPublished || selectedChapterIds.length < 1}
                onClick={handleRunRelationJob}
              >
                <GitBranch size={13} /> Sinh quan hệ giữa các buổi học (Relation Job)
              </button>
              {relations.length > 0 && (
                <>
                  <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handleBatchApproveRelations}>
                    <Check size={13} /> Duyệt hàng loạt quan hệ
                  </button>
                  <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handleRebaseWeek}>
                    <RefreshCw size={13} /> Rebase Master
                  </button>
                  <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handlePublishWeekToMaster}>
                    <CheckCircle2 size={13} /> Hợp nhất vào Master
                  </button>
                  <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handleDiscardRelations}>
                    <Trash2 size={13} /> Hủy bản nháp quan hệ
                  </button>
                </>
              )}
            </div>
          </div>

          {(relations.length === 0 && !manualRelationCanvas) || relationsStale ? (
            <div className="wizard-empty-box">
              <GitBranch size={22} />
              <p>Chưa có quan hệ giữa các buổi học nào. Chọn tối thiểu 1 buổi học đã duyệt và bấm "Sinh quan hệ giữa các buổi học" để hiển thị toàn bộ đồ thị.</p>
              {!relationsStale && relationEndpoints.length >= 2 && approvedChapters.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline sm"
                  onClick={() => setManualRelationCanvas(true)}
                >
                  <Plus size={12} /> Mở đồ thị Neo4j để nối quan hệ thủ công
                </button>
              )}
            </div>
          ) : (() => {
            const approvedRelCount = relations.filter(
              (r) => r.decision === 'APPROVE' || r.decision === 'EDIT',
            ).length;
            const warnRelCount = relations.filter((r) =>
              Boolean(r.hasWarning || (r.assessment && r.assessment.verdict !== 'supported')),
            ).length;

            return (
              <>
                <div className="wizard-summary-grid" style={{ marginBottom: 4 }}>
                  <div className="wizard-stat-box">
                    <Layers size={18} />
                    <b>{reviewGraph?.nodes.filter((n) => n.type !== 'Course').length ?? 0}</b>
                    <span>Tổng số nút đồ thị</span>
                  </div>
                  <div className="wizard-stat-box">
                    <GitBranch size={18} />
                    <b>{reviewGraph?.edges.length ?? 0}</b>
                    <span>Tổng số quan hệ</span>
                  </div>
                  <div className="wizard-stat-box">
                    <BookOpen size={18} />
                    <b>{approvedChapters.length} / {outline.chapters.length}</b>
                    <span>Buổi học đã duyệt</span>
                  </div>
                  <div className="wizard-stat-box">
                    <Eye size={18} />
                    <b>{relations.filter((r) => r.decision !== 'REJECT').length}</b>
                    <span>Quan hệ giữa các buổi</span>
                  </div>
                </div>

                <div className="lesson-review-bar">
                  <div className="lesson-filter-pills">
                    <div className="kg-view-switch" role="tablist" aria-label="Chế độ xem quan hệ">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={d3ViewMode === 'neo4j'}
                        className={d3ViewMode === 'neo4j' ? 'on' : ''}
                        onClick={() => setD3ViewMode('neo4j')}
                      >
                        <Share2 size={12} style={{ marginRight: 5 }} /> Đồ thị quan hệ (Neo4j)
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={d3ViewMode === 'editor'}
                        className={d3ViewMode === 'editor' ? 'on' : ''}
                        onClick={() => setD3ViewMode('editor')}
                      >
                        <Layers size={12} style={{ marginRight: 5 }} /> Đồ thị toàn môn (Hiệu chỉnh)
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={d3ViewMode === 'list'}
                        className={d3ViewMode === 'list' ? 'on' : ''}
                        onClick={() => setD3ViewMode('list')}
                      >
                        <List size={12} style={{ marginRight: 5 }} /> Danh sách ({relations.length})
                      </button>
                    </div>
                    <span className="lesson-progress-pill">
                      {approvedRelCount}/{relations.length} đã duyệt
                    </span>
                    {warnRelCount > 0 && (
                      <span className="lesson-chip warn">
                        {warnRelCount} cần chú ý
                      </span>
                    )}
                  </div>
                  {d3ViewMode === 'editor' && (
                    <div className="lesson-review-actions">
                      <button
                        type="button"
                        className={`btn btn-outline sm${d4EditMode && !isPublished ? ' on' : ''}`}
                        disabled={isPublished}
                        onClick={() => setD4EditMode((v) => !v)}
                      >
                        <Pencil size={13} /> {d4EditMode && !isPublished ? 'Đang bật hiệu chỉnh' : 'Bật hiệu chỉnh'}
                      </button>
                      <button
                        type="button"
                        className={`btn btn-outline sm${reviewHealthOpen ? ' on' : ''}`}
                        onClick={() => setReviewHealthOpen((o) => !o)}
                      >
                        <Activity size={13} /> {reviewHealthOpen ? 'Ẩn kiểm tra tính hoàn thiện' : 'Kiểm tra tính hoàn thiện'}
                      </button>
                    </div>
                  )}
                </div>

                {d3ViewMode === 'neo4j' ? (
                  <Neo4jDraftGraph
                    mode="relations"
                    relations={relations}
                    chapters={outline.chapters}
                    reviewGraph={reviewGraph}
                    endpoints={relationEndpoints}
                    busy={busy}
                    locked={isPublished}
                    onRelationDecision={handleRelationDecision}
                    onUpdateRelation={handleUpdateRelation}
                    onCreateRelation={handleCreateRelation}
                    onDeleteRelation={handleDeleteRelation}
                  />
                ) : d3ViewMode === 'list' ? (
                  <div className="wizard-items-list">
                    {relations.map((r) => (
                      <div key={r.id} className={`wizard-review-card${r.hasWarning ? ' warn' : ''}`} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 13 }}>
                            <b>{r.sourceName}</b> → <b>{r.targetName}</b>{' '}
                            <span className="pill-badge muted">{r.relationType}</span>
                            <span className="pill-badge" style={{ marginLeft: 6, color: DECISION_BADGE[r.decision].color, borderColor: DECISION_BADGE[r.decision].color }}>
                              {DECISION_BADGE[r.decision].text}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button type="button" className={`btn btn-outline btn-sm${r.decision === 'APPROVE' ? ' active-approve' : ''}`} disabled={busy || isPublished} onClick={() => void handleRelationDecision(r.id, 'APPROVE')}>
                              <Check size={12} /> Duyệt
                            </button>
                            <button type="button" className={`btn btn-outline btn-sm${r.decision === 'REJECT' ? ' active-reject' : ''}`} disabled={busy || isPublished} onClick={() => void handleRelationDecision(r.id, 'REJECT')}>
                              <X size={12} /> Từ chối
                            </button>
                          </div>
                        </div>
                        {r.reason && <div className="muted-s" style={{ marginTop: 4 }}>{r.reason}</div>}
                        {r.aiComment && <div className="wizard-ai-note warn" style={{ marginTop: 4 }}>{r.aiComment}</div>}
                      </div>
                    ))}
                  </div>
                ) : reviewLoading ? (
                  <div className="wizard-empty-box">Đang tải toàn bộ đồ thị…</div>
                ) : reviewGraph && reviewGraph.nodes.some((n) => n.type !== 'Course') ? (
                  <div
                    style={{
                      display: 'flex',
                      height: 540,
                      minHeight: 420,
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <KnowledgeGraphCanvas
                      courseId={courseId}
                      data={reviewGraph}
                      role="teacher"
                      editMode={d4EditMode && !isPublished}
                      rightOpen={!reviewHealthOpen}
                      onQuickUpdateNode={async (nodeId, input) => {
                        setError('');
                        try {
                          await api.updateGraphNode(courseId, nodeId, input);
                          setMessage(`Đã cập nhật nút "${input.name}".`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể cập nhật nút.');
                        }
                      }}
                      onAddNode={async (input) => {
                        setError('');
                        try {
                          await api.createGraphNode(courseId, {
                            name: input.name,
                            nodeType: input.nodeType,
                            clusterId: input.parentId ?? null,
                            description: input.description,
                            properties: input.properties,
                          });
                          setMessage(`Đã thêm nút "${input.name}" (${input.nodeType}) kèm nội dung.`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể thêm nút.');
                        }
                      }}
                      onAddEdge={async (input: { fromId: string; toId: string; kind: KnowledgeEdgeType; properties?: Record<string, unknown> }) => {
                        setError('');
                        try {
                          await api.createGraphEdge(courseId, input);
                          setMessage(`Đã nối quan hệ ${input.fromId} → ${input.toId} (${input.kind}).`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          const msg = reason instanceof Error ? reason.message : 'Không thể nối quan hệ.';
                          setError(msg);
                          throw reason;
                        }
                      }}
                      onUpdateEdge={async (input) => {
                        setError('');
                        try {
                          await api.deleteGraphEdge(courseId, {
                            fromId: input.oldFromId,
                            toId: input.oldToId,
                            edgeType: input.oldEdgeType,
                          });
                          await api.createGraphEdge(courseId, {
                            fromId: input.fromId,
                            toId: input.toId,
                            kind: input.kind,
                            properties: input.properties,
                          });
                          setMessage(`Đã cập nhật quan hệ ${input.fromId} → ${input.toId} (${input.kind}).`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          const msg = reason instanceof Error ? reason.message : 'Không thể sửa quan hệ.';
                          setError(msg);
                          throw reason;
                        }
                      }}
                      onMergeNodes={async (input: { keepId: string; mergeId: string }) => {
                        setError('');
                        try {
                          await api.mergeGraphNodes(courseId, input);
                          setMessage(`Đã gộp ${input.mergeId} vào ${input.keepId}.`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể gộp nút.');
                        }
                      }}
                      onDeleteNode={async (nodeId: string) => {
                        setError('');
                        try {
                          await api.deleteGraphNode(courseId, nodeId);
                          setMessage(`Đã xóa nút ${nodeId}.`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể xóa nút.');
                        }
                      }}
                      onDeleteEdge={async (input: { fromId: string; toId: string; edgeType: string }) => {
                        setError('');
                        try {
                          await api.deleteGraphEdge(courseId, input);
                          setMessage(`Đã xóa quan hệ ${input.fromId} → ${input.toId}.`);
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể xóa quan hệ.');
                        }
                      }}
                      onApproveNode={async (nodeId: string) => {
                        setError('');
                        try {
                          await api.updateGraphNode(courseId, nodeId, { approved: true, status: 'approved' });
                          setMessage('Đã duyệt nút kiến thức.');
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể duyệt nút.');
                        }
                      }}
                      onApproveEdge={async (input: { fromId: string; toId: string; edgeType: string }) => {
                        setError('');
                        try {
                          await api.approveGraphEdge(courseId, input);
                          setMessage('Đã duyệt quan hệ kiến thức.');
                          await reloadReviewGraph(true);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Không thể duyệt quan hệ.');
                        }
                      }}
                      onOpenNodeEditor={(id) => nav(`/teacher/courses/${courseId}/nodes/${id}`)}
                    />
                    {reviewHealthOpen && (
                      <GraphHealthPanel
                        data={reviewGraph}
                        onClose={() => setReviewHealthOpen(false)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="wizard-empty-box">
                    <Eye size={22} />
                    <p>Chưa có dữ liệu đồ thị để xem trước. Hãy duyệt các buổi học ở D2 trước.</p>
                  </div>
                )}

                {relationsCursor && (
                  <button
                    type="button"
                    className="btn btn-outline sm"
                    style={{ alignSelf: 'center', marginTop: 6 }}
                    onClick={() => void loadRelations(true, relationsCursor)}
                  >
                    Tải thêm quan hệ
                  </button>
                )}
              </>
            );
          })()}

          <div className="wizard-footer-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={() => setStep(2)}>
              <ArrowLeft size={13} /> Quay lại Bước 2
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || relations.length === 0 || relationsStale}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  if (relations.some((r) => r.decision === 'PENDING')) {
                    const res = await api.batchReviewCourseRelations(
                      courseId,
                      {
                        items: relations.map((r) => ({
                          relationId: r.id,
                          decision: r.decision === 'REJECT' ? 'REJECT' : 'APPROVE',
                          reviewNote: r.reviewNote?.trim() || (r.hasWarning ? 'Giảng viên đã kiểm tra và xác nhận' : undefined),
                        })),
                        expectedRevision: relationRevision,
                      },
                      relationWeekId,
                    );
                    setRelationRevision(res.revision);
                    await loadRelations();
                  }
                  if (reviewGraph) {
                    try {
                      await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(reviewGraph), {
                        title: 'D3 Review Draft',
                        note: 'Final graph JSON synced from D3',
                      });
                    } catch {
                      // Non-blocking draft sync
                    }
                  }
                  setReviewConfirmed(true);
                  setStep(4);
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Không thể xác nhận quan hệ trước khi xuất bản.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Xác nhận đạt &amp; Sang Bước 4: Xuất bản <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: D4 PUBLISH COURSE GRAPH */}
      {step === 4 && (
        <div className="wizard-panel">
          <div className="wizard-panel-head">
            <div>
              <h3>D4. Xuất bản Course Graph theo môn</h3>
              <p className="muted-s">Ghi idempotent sang Neo4j để sinh viên và hệ thống gợi ý học tập sử dụng phiên bản chính thức.</p>
            </div>
            <span className="pill-badge blue">Master v{masterVersion}</span>
          </div>

          <div className="wizard-summary-grid">
            <div className="wizard-stat-box">
              <Layers size={18} />
              <b>{outlineState}</b>
              <span>Trạng thái khung</span>
            </div>
            <div className="wizard-stat-box">
              <BookOpen size={18} />
              <b>{approvedChapters.length} / {outline.chapters.length}</b>
              <span>Buổi học đã duyệt</span>
            </div>
            <div className="wizard-stat-box">
              <GitBranch size={18} />
              <b>{relations.filter((r) => r.decision !== 'REJECT' && r.decision !== 'PENDING').length}</b>
              <span>Quan hệ giữa các buổi học duyệt</span>
            </div>
            <div className="wizard-stat-box">
              <CheckCircle2 size={18} />
              <b>Rev {relationRevision}</b>
              <span>Phiên bản bản nháp</span>
            </div>
          </div>

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

          <div className="wizard-footer-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={() => setStep(3)}>
              <ArrowLeft size={13} /> Quay lại Bước 3
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pendingPublicationId && (
                <button type="button" className="btn btn-outline" disabled={busy} onClick={handleRecoverPublish}>
                  <RefreshCw size={13} /> Phục hồi xuất bản ({pendingPublicationId})
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={busy || isPublished || Boolean(pendingPublicationId)} onClick={handlePublish}>
                <Sparkles size={13} /> {isPublished ? 'Đã xuất bản Course Graph (Đã khóa)' : 'Xuất bản Course Graph'}
              </button>
              {isPublished && (
                <button type="button" className="btn btn-outline" onClick={onPublishedGraph}>
                  Xem Course Graph trực quan <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
