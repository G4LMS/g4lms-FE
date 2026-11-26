import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  Layers,
  Lock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
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
  MasterGraphBridge,
  OutlineState,
  ReviewDecision,
  SourceReadinessResponse,
  WorkflowJobResponse,
} from '../../types';

interface Props {
  courseId: string;
  courseName: string;
  hasPublishedGraph?: boolean;
  onPublished?: () => void;
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
  LESSON_APPROVED: { text: 'Đã duyệt chương', tone: 'green' },
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

export function CourseAuthoringWizard({ courseId, courseName, hasPublishedGraph = false, onPublished, onPublishedGraph }: Props) {
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

  // D3 Relations state
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [relations, setRelations] = useState<CourseRelationItem[]>([]);
  const [relationsCursor, setRelationsCursor] = useState<string | null>(null);
  const [relationRevision, setRelationRevision] = useState(1);
  const [relationsStale, setRelationsStale] = useState(false);

  // D4 Review & D5 Publish state
  const [reviewGraph, setReviewGraph] = useState<KnowledgeGraphData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewHealthOpen, setReviewHealthOpen] = useState(false);
  const [d4EditMode, setD4EditMode] = useState(true);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [masterVersion, setMasterVersion] = useState(0);
  const [pendingPublicationId, setPendingPublicationId] = useState<string | null>(null);
  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);
  const [masterBridges, setMasterBridges] = useState<MasterGraphBridge[]>([]);
  const [masterBusy, setMasterBusy] = useState(false);

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
      if (res.outline.chapters.length && !selectedChapterId) {
        setSelectedChapterId(res.outline.chapters[0].id);
      }
      const approvedIds = res.outline.chapters
        .filter((c) => c.state === 'LESSON_APPROVED' || c.state === 'PUBLISHED')
        .map((c) => c.id);
      setSelectedChapterIds(approvedIds);

      const allPublished =
        hasPublishedGraph ||
        (res.outline.chapters.length > 0 && res.outline.chapters.every((c) => c.state === 'PUBLISHED'));
      if (allPublished) {
        setStep(4);
      } else if (res.state === 'OUTLINE_APPROVED') {
        const allChaptersApproved =
          res.outline.chapters.length > 0 && approvedIds.length === res.outline.chapters.length;
        const savedStep = getSavedWizardStep(courseId);
        if (allChaptersApproved) {
          const weekId = approvedIds[0] || res.outline.chapters[0]?.id || 'week_1';
          const relRes = await api.getCourseRelations(courseId, null, 20, weekId).catch(() => null);
          if (relRes) {
            setRelations(relRes.items);
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
  }, [courseId, hasPublishedGraph, selectedChapterId]);

  const loadChapterLessons = useCallback(
    async (cid: string, append = false, cursor?: string | null) => {
      if (!cid) return;
      try {
        const [res, readiness, usageRes] = await Promise.all([
          api.getChapterLessons(courseId, cid, cursor, 20),
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
        setError(reason instanceof Error ? reason.message : 'Không thể tải bài học chương.');
      }
    },
    [courseId],
  );

  const relationWeekId = selectedChapterIds[0] || selectedChapterId || outline.chapters[0]?.id || 'week_1';

  const loadRelations = useCallback(
    async (append = false, cursor?: string | null) => {
      try {
        const res = await api.getCourseRelations(courseId, cursor, 20, relationWeekId);
        setRelations((prev) => (append ? [...prev, ...res.items] : res.items));
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
      const res = await api.discardCourseRelations(courseId, relationRevision);
      setRelationRevision(res.revision);
      setRelations([]);
      setRelationsStale(false);
    } catch {
      // Keep stale warning banner so user knows Step 3 relations must be regenerated
    }
  }, [courseId, relationRevision, relations.length]);

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
            setMessage('AI đã trích xuất xong Khung môn học (Chương & Chuẩn đầu ra). Hãy rà soát và duyệt.');
            await loadOutline();
          } else if (activeJob.kind === 'lesson' && selectedChapterId) {
            await invalidateStep3Relations();
            setMessage('AI đã sinh & kiểm tra xong bài học cho chương. Hãy duyệt từng bài học.');
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
      setMessage('Đã duyệt Khung môn học (OUTLINE_APPROVED). Bây giờ bạn có thể nạp tài liệu từng chương ở Bước 2.');
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
      setError(reason instanceof Error ? reason.message : 'Không thể tải tài liệu chương.');
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
      setMessage(`Đã mở lại chương ${currentChapter.title} về trạng thái ${res.state}.`);
      await loadOutline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể mở lại chương.');
    } finally {
      setBusy(false);
    }
  };

  const handleLessonDecision = async (lessonId: string, decision: ReviewDecision, changes?: Partial<ChapterLessonItem>) => {
    if (!currentChapter) return;
    setError('');
    try {
      const res = await api.reviewChapterLesson(courseId, currentChapter.id, lessonId, {
        decision,
        changes,
        expectedRevision: currentChapter.revision,
      });
      await invalidateStep3Relations();
      setLessons((prev) => prev.map((l) => (l.id === lessonId ? res.lesson : l)));
      setOutline((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === currentChapter.id ? { ...c, revision: res.revision } : c)),
      }));
      setEditingLessonId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật quyết định bài học.');
    }
  };

  const handleBatchApproveLessons = async () => {
    if (!currentChapter || !lessons.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.batchReviewChapterLessons(courseId, currentChapter.id, {
        items: lessons.map((l) => ({
          lessonId: l.id,
          decision: l.decision === 'REJECT' ? 'REJECT' : 'APPROVE',
        })),
        expectedRevision: currentChapter.revision,
      });
      await invalidateStep3Relations();
      setMessage(`Đã duyệt hàng loạt ${res.updatedCount} bài học.`);
      await loadChapterLessons(currentChapter.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt hàng loạt.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveChapter = async () => {
    if (!currentChapter) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.approveChapterLessons(courseId, currentChapter.id, currentChapter.revision);
      await invalidateStep3Relations();
      setMessage(`Chương "${currentChapter.title}" đã được duyệt (${res.state}).`);
      await loadOutline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt chương.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardChapterDraft = async () => {
    if (!currentChapter || !window.confirm('Hủy toàn bộ bản nháp bài học của chương này? (Tài liệu PDF đã tải vẫn được giữ)')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.discardChapterLessons(courseId, currentChapter.id, currentChapter.revision);
      await invalidateStep3Relations();
      setLessons([]);
      setMessage('Đã hủy bản nháp bài học của chương.');
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
  const isPublished =
    hasPublishedGraph ||
    masterVersion > 0 ||
    (outline.chapters.length > 0 && outline.chapters.every((c) => c.state === 'PUBLISHED'));
  const step1Done = outlineState === 'OUTLINE_APPROVED' || isPublished;
  const step2Done =
    isPublished ||
    (step1Done && outline.chapters.length > 0 && approvedChapters.length === outline.chapters.length);
  const step3Done =
    isPublished ||
    (!relationsStale && step2Done && relations.length > 0 && reviewConfirmed);
  const chapterLocked = isPublished || currentChapter?.state === 'PUBLISHED';

  useEffect(() => {
    if (isPublished) {
      setStep(4);
    }
  }, [isPublished]);

  const handleRunRelationJob = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { jobId, status } = await api.createRelationJob(
        courseId,
        selectedChapterIds,
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
      const res = await api.reviewCourseRelation(
        courseId,
        relationId,
        {
          decision,
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

  const handleBatchApproveRelations = async () => {
    if (!relations.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.batchReviewCourseRelations(
        courseId,
        {
          items: relations.map((r) => ({ relationId: r.id, decision: r.decision === 'REJECT' ? 'REJECT' : 'APPROVE' })),
          expectedRevision: relationRevision,
        },
        relationWeekId,
      );
      setRelationRevision(res.revision);
      setMessage(`Đã duyệt hàng loạt ${res.updatedCount} quan hệ liên chương.`);
      await loadRelations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể duyệt hàng loạt quan hệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardRelations = async () => {
    if (!window.confirm('Xác nhận hủy bản nháp quan hệ liên chương?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.discardCourseRelations(courseId, relationRevision);
      setRelationRevision(res.revision);
      setRelations([]);
      setRelationsStale(false);
      setMessage('Đã hủy bản nháp quan hệ liên chương.');
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
      setPendingPublicationId(null);
      try {
        const latestKg = reviewGraph ?? (await api.getKnowledgeGraph(courseId));
        await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(latestKg), {
          title: `D4 Course Graph v${res.masterVersion}`,
          note: 'Final graph JSON synced on D4 publish',
        });
      } catch {
        // Keep publish success even if secondary graph JSON sync fails in offline mock
      }
      setMessage(`Xuất bản Course Graph v${res.masterVersion} thành công!`);
      onPublished?.();
      await loadOutline();
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : 'Không thể xuất bản Course Graph.';
      setError(msg);
      if (msg.includes('503')) {
        setPendingPublicationId(`pub-${courseId}-${Date.now()}`);
      }
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
      setPendingPublicationId(null);
      try {
        const latestKg = reviewGraph ?? (await api.getKnowledgeGraph(courseId));
        await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(latestKg), {
          title: `D4 Course Graph v${res.masterVersion} (Recovered)`,
          note: 'Final graph JSON synced on D4 recover publish',
        });
      } catch {
        // Ignore secondary sync failure
      }
      setMessage(`Đã phục hồi và chốt xuất bản Course Graph v${res.masterVersion}!`);
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
          { num: 1 as Step, title: 'D1. Khung môn học', sub: step > 1 || isPublished ? 'Đã duyệt · Khóa' : (step1Done ? 'Đã duyệt' : 'Đề cương & LO'), locked: step !== 1 },
          { num: 2 as Step, title: 'D2. Bài học theo chương', sub: `${approvedChapters.length}/${outline.chapters.length} chương duyệt${step !== 2 ? ' · Khóa' : ''}`, locked: step !== 2 },
          { num: 3 as Step, title: 'D3. Sinh quan hệ trên toàn bộ đồ thị', sub: step > 3 || isPublished ? 'Đã xác nhận · Khóa' : (relations.length > 0 ? `${relations.length} quan hệ · Đã sinh` : 'Sinh & rà soát đồ thị'), locked: step !== 3 },
          { num: 4 as Step, title: 'D4. Xuất bản Course Graph', sub: isPublished ? `Đã xuất bản${masterVersion > 0 ? ` v${masterVersion}` : ''} · Khóa` : (step === 4 ? 'Sẵn sàng xuất bản' : 'Chưa xuất bản · Khóa'), locked: step !== 4 },
        ].map((item, idx) => (
          <div key={item.num} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <button
              type="button"
              disabled={item.locked}
              onClick={() => setStep(item.num)}
              className={`wizard-step-btn${step === item.num ? ' active' : ''}${item.locked ? ' locked' : ''}`}
            >
              <span className="wizard-step-num">{item.locked ? <Lock size={12} /> : item.num}</span>
              <span className="wizard-step-meta">
                <b>{item.title}</b>
                <small>{item.sub}</small>
              </span>
            </button>
            {idx < 3 && <ChevronRight size={16} className="muted-icon" />}
          </div>
        ))}
      </div>

      {usage && (
        <div className="muted-s" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '6px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--line)', marginBottom: 10 }}>
          <span><b>AI Usage:</b> {usage.totalCalls} lượt gọi</span>
          <span><b>Chi phí ước tính:</b> ${usage.estimatedCostUsd.toFixed(3)} / ${usage.budgetLimitUsd.toFixed(2)}</span>
          <span><b>Ngân sách còn lại:</b> ${usage.remainingBudgetUsd.toFixed(3)}</span>
        </div>
      )}

      {step === 2 && sourceReadiness && (
        <div className={`wizard-banner${sourceReadiness.status === 'blocked' ? ' error' : ''}`} style={{ marginBottom: 10, background: sourceReadiness.status === 'ready' ? '#f0fdf4' : '#fffbeb', color: sourceReadiness.status === 'ready' ? '#166534' : '#92400e', borderColor: sourceReadiness.status === 'ready' ? '#bbf7d0' : '#fde68a' }}>
          <FileText size={14} />
          <span>
            <b>Kiểm tra tài liệu chương (Source Readiness):</b> {sourceReadiness.counts.readablePages}/{sourceReadiness.counts.totalPages} trang có text
            {sourceReadiness.counts.lowTextPages > 0 ? ` · ${sourceReadiness.counts.lowTextPages} trang ít chữ` : ''}
            {sourceReadiness.warnings.length > 0 ? ` — ${sourceReadiness.warnings[0]}` : ''}
          </span>
        </div>
      )}

      {/* Banners */}
      {error && (
        <div className="wizard-banner error" role="alert">
          <AlertTriangle size={15} /> <span>{error}</span>
          <button type="button" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {message && (
        <div className="wizard-banner success" role="status">
          <CheckCircle2 size={15} /> <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}><X size={14} /></button>
        </div>
      )}

      {/* D5 Active Job Tracker */}
      {activeJob && (
        <div className="wizard-job-bar">
          <div className="wizard-job-info">
            <Sparkles size={15} />
            <div>
              <b>
                {activeJob.kind === 'outline' && 'Đang trích xuất Khung môn học (D1 → D5)'}
                {activeJob.kind === 'lesson' && 'Đang sinh & đối chiếu bài học chương (D2 → D5)'}
                {activeJob.kind === 'relation' && 'Đang sinh & kiểm tra quan hệ liên chương (D3 → D5)'}
              </b>
              <span>
                Trạng thái: <code>{activeJob.status}</code> · Tiến độ: {activeJob.progress}% · Resume: {activeJob.resumeCount}/{activeJob.maxResumeAttempts}
              </span>
            </div>
          </div>
          <div className="wizard-job-progress">
            <div className="wizard-job-fill" style={{ width: `${activeJob.progress}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(activeJob.status === 'BLOCKED' || activeJob.status === 'FAILED') && activeJob.canResume && (
              <button type="button" className="btn btn-primary" onClick={handleResumeJob}>
                <RefreshCw size={12} /> Resume từ checkpoint
              </button>
            )}
            {(activeJob.status === 'SUCCEEDED' || activeJob.status === 'FAILED') && (
              <button type="button" className="btn btn-outline" onClick={() => setActiveJob(null)}>Đóng</button>
            )}
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
                Tải đề cương để AI tạo khung Chương & Chuẩn đầu ra (LO). Chỉ sau khi duyệt (<code>OUTLINE_APPROVED</code>) mới được gắn tài liệu chương.
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
                  : 'Chọn một hoặc nhiều tệp đề cương (PDF, Word, Excel)...'}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
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
                <h4>Danh sách Chương</h4>
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
                          title: `Chương ${prev.chapters.length + 1}: Nội dung mới`,
                          loCodes: prev.learningOutcomes[0] ? [prev.learningOutcomes[0].code] : [],
                          state: 'DRAFT',
                          revision: 1,
                          documentCount: 0,
                        },
                      ],
                    }))
                  }
                >
                  <Plus size={12} /> Thêm chương
                </button>
              </div>
              {outline.chapters.length === 0 ? (
                <p className="muted-s">Chưa có Chương nào. Hãy tải đề cương PDF hoặc bấm "Thêm chương".</p>
              ) : (
                <div className="wizard-list">
                  {outline.chapters.map((ch, idx) => (
                    <div key={ch.id} className="wizard-row-edit">
                      <span className="pill-badge muted">{ch.id}</span>
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
                        aria-label="Xóa chương"
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
                Sang Bước 2: Bài học theo chương <ArrowRight size={13} />
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
              <h3>D2. Bài học theo chương (Mỗi lần duyệt ~20 node)</h3>
              <p className="muted-s">Chọn từng chương, tải tài liệu PDF chương đó, sinh bài học và duyệt trước khi chuyển sang Bước 3.</p>
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
                <p className="muted-s">Chọn một chương bên trái để bắt đầu.</p>
              ) : (
                <>
                  <div className="wizard-card-head" style={{ marginBottom: 12 }}>
                    <div>
                      <h4>{currentChapter.title}</h4>
                      <span className="muted-s">
                        Trạng thái: <b>{currentChapter.state}</b> · Revision: {currentChapter.revision}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {currentChapter.state === 'PUBLISHED' && (
                        <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handleReopenChapter}>
                          <RotateCcw size={13} /> Mở lại chương (Reopen)
                        </button>
                      )}
                      {lessons.length > 0 && (
                        <button type="button" className="btn btn-outline" disabled={busy || chapterLocked} onClick={handleDiscardChapterDraft}>
                          <Trash2 size={13} /> Hủy bản nháp (Discard)
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
                          : 'Chọn một hoặc nhiều tệp PDF / Word / Excel / Slide của chương này...'}
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
                      <Upload size={13} /> Tải lên chương{chapterFiles.length > 1 ? ` (${chapterFiles.length})` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || chapterLocked}
                      onClick={handleRunLessonJob}
                    >
                      <Play size={13} /> Sinh bài học (Lesson Job)
                    </button>
                  </div>

                  {/* Paginated Lessons Review List */}
                  {lessons.length === 0 ? (
                    <div className="wizard-empty-box">
                      <BookOpen size={22} />
                      <p>Chưa có bài học nào trong bản nháp của chương này. Hãy tải tài liệu chương và bấm "Sinh bài học".</p>
                    </div>
                  ) : (
                    <>
                      <div className="wizard-review-toolbar">
                        <span>Hiển thị {lessons.length} mục</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn btn-outline" disabled={busy || chapterLocked} onClick={handleBatchApproveLessons}>
                            <Check size={13} /> Duyệt hàng loạt (Batch Review)
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || chapterLocked || lessons.some((l) => l.decision === 'PENDING')}
                            onClick={handleApproveChapter}
                          >
                            <CheckCircle2 size={13} /> Duyệt chương (LESSON_APPROVED)
                          </button>
                        </div>
                      </div>

                      <div className="wizard-items-list">
                        {lessons.map((lesson) => (
                          <div key={lesson.id} className={`wizard-review-card${lesson.hasWarning ? ' warn' : ''}`}>
                            <div className="wizard-review-top">
                              <div>
                                <b>{lesson.title}</b>
                                <div className="wizard-meta-row">
                                  <span>Nguồn: <code>{lesson.sourceRef}</code></span>
                                  <span>LO: {lesson.loCodes.join(', ')}</span>
                                  {lesson.level && <span>Cấp: {lesson.level === 'topic' ? 'Chủ đề' : 'Bài học'}</span>}
                                  {lesson.durationMin != null && <span>{lesson.durationMin} phút</span>}
                                  {lesson.defaultWeek != null && <span>Tuần {lesson.defaultWeek}</span>}
                                  {lesson.confidence != null && <span>Tin cậy: {Math.round(lesson.confidence * 100)}%</span>}
                                </div>
                                {lesson.aliases && lesson.aliases.length > 0 && (
                                  <div className="muted-xs" style={{ marginTop: 2 }}>
                                    Tên khác: {lesson.aliases.join(', ')}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                {lesson.assessment && (
                                  <span
                                    className="pill-badge"
                                    style={{
                                      color: VERDICT_BADGE[lesson.assessment.verdict].color,
                                      borderColor: VERDICT_BADGE[lesson.assessment.verdict].color,
                                    }}
                                  >
                                    {VERDICT_BADGE[lesson.assessment.verdict].text}
                                  </span>
                                )}
                                <span
                                  className="pill-badge"
                                  style={{ color: DECISION_BADGE[lesson.decision].color, borderColor: DECISION_BADGE[lesson.decision].color }}
                                >
                                  {DECISION_BADGE[lesson.decision].text}
                                </span>
                              </div>
                            </div>

                            {editingLessonId === lesson.id ? (
                              <div className="wizard-edit-inline">
                                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                                <textarea rows={2} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => void handleLessonDecision(lesson.id, 'EDIT', { title: editTitle, content: editContent })}
                                  >
                                    Lưu chỉnh sửa
                                  </button>
                                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingLessonId(null)}>
                                    Hủy
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="wizard-item-body">{lesson.content}</p>
                            )}

                            {lesson.aiComment && (
                              <div className={`wizard-ai-note${lesson.hasWarning ? ' warn' : ''}`}>
                                <Sparkles size={12} /> <span>{lesson.aiComment}</span>
                              </div>
                            )}

                            {lesson.outcome && (
                              <div className="muted-s" style={{ marginTop: 6 }}>
                                <b>Mục tiêu đầu ra:</b> {lesson.outcome}
                              </div>
                            )}

                            {lesson.details && lesson.details.length > 0 && (
                              <div className="muted-s" style={{ marginTop: 6 }}>
                                <b>Nội dung chi tiết:</b> {lesson.details.map((d) => d.name).join(' · ')}
                              </div>
                            )}

                            {lesson.assessment?.issue && (
                              <div className="wizard-ai-note warn" style={{ marginTop: 6 }}>
                                <AlertTriangle size={12} /> <span>Kiểm định AI: {lesson.assessment.issue}</span>
                              </div>
                            )}

                            {lesson.assessment?.suggestedReuseId && (
                              <div className="muted-xs" style={{ marginTop: 4, color: 'var(--primary)' }}>
                                Gợi ý tái sử dụng node đã duyệt: <code>{lesson.assessment.suggestedReuseId}</code>
                              </div>
                            )}

                            {lesson.evidence && lesson.evidence.length > 0 && (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {lesson.evidence.map((ev, idx) => (
                                  <div key={idx} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 11 }}>
                                    <b style={{ color: 'var(--primary)' }}>{ev.slideId}:</b> <i>"{ev.quote}"</i>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="wizard-item-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={busy || chapterLocked}
                                onClick={() => void handleLessonDecision(lesson.id, 'APPROVE')}
                              >
                                <Check size={12} /> Duyệt
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={busy || chapterLocked}
                                onClick={() => {
                                  setEditingLessonId(lesson.id);
                                  setEditTitle(lesson.title);
                                  setEditContent(lesson.content);
                                }}
                              >
                                <Pencil size={12} /> Sửa
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={busy || chapterLocked}
                                onClick={() => void handleLessonDecision(lesson.id, 'REJECT')}
                              >
                                <X size={12} /> Từ chối
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {lessonsCursor && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ marginTop: 10 }}
                          onClick={() => void loadChapterLessons(currentChapter.id, true, lessonsCursor)}
                        >
                          Tải thêm bài học
                        </button>
                      )}
                    </>
                  )}
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
                Chọn ít nhất 2 chương đã duyệt để AI suy luận quan hệ, sau đó kiểm tra và chỉnh sửa trực tiếp nút &amp; quan hệ trên toàn bộ đồ thị trước khi xuất bản.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill-badge muted">Rev {relationRevision}</span>
              {relations.length > 0 && !relationsStale && (
                <>
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
                </>
              )}
            </div>
          </div>

          {relationsStale && (
            <div className="wizard-banner error" role="alert" style={{ marginBottom: 12 }}>
              <AlertTriangle size={15} />
              <span>
                Bài học ở Bước 2 đã thay đổi. Vui lòng bấm <b>"Sinh quan hệ liên chương (Relation Job)"</b> để cập nhật lại đồ thị cho khớp trước khi sang Bước 4.
              </span>
            </div>
          )}

          <div className="wizard-card" style={{ marginBottom: 14 }}>
            <h4 style={{ marginBottom: 8 }}>Chọn các chương đã duyệt (tối thiểu 2 chương):</h4>
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
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || isPublished || selectedChapterIds.length < 2}
                onClick={handleRunRelationJob}
              >
                <GitBranch size={13} /> Sinh quan hệ liên chương (Relation Job)
              </button>
              {relations.length > 0 && (
                <button type="button" className="btn btn-outline" disabled={busy || isPublished} onClick={handleDiscardRelations}>
                  <Trash2 size={13} /> Hủy bản nháp quan hệ
                </button>
              )}
            </div>
          </div>

          {relations.length === 0 || relationsStale ? (
            <div className="wizard-empty-box">
              <GitBranch size={22} />
              <p>Chưa có quan hệ liên chương nào. Chọn tối thiểu 2 chương đã duyệt và bấm "Sinh quan hệ liên chương" để hiển thị toàn bộ đồ thị.</p>
            </div>
          ) : (
            <>
              <div className="wizard-summary-grid" style={{ marginBottom: 14 }}>
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
                  <span>Chương đã duyệt</span>
                </div>
                <div className="wizard-stat-box">
                  <Eye size={18} />
                  <b>{relations.filter((r) => r.decision !== 'REJECT').length}</b>
                  <span>Quan hệ giữa các buổi</span>
                </div>
              </div>

              {reviewLoading ? (
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
                  <p>Chưa có dữ liệu đồ thị để xem trước. Hãy duyệt các chương ở D2 trước.</p>
                </div>
              )}
            </>
          )}

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
                      await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(reviewGraph));
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
              <span>Chương đã duyệt</span>
            </div>
            <div className="wizard-stat-box">
              <GitBranch size={18} />
              <b>{relations.filter((r) => r.decision !== 'REJECT' && r.decision !== 'PENDING').length}</b>
              <span>Quan hệ liên chương duyệt</span>
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
              <button type="button" className="btn btn-primary" disabled={busy || isPublished} onClick={handlePublish}>
                <Sparkles size={13} /> {isPublished ? 'Đã xuất bản Course Graph (Đã khóa)' : 'Xuất bản Course Graph'}
              </button>
              {isPublished && (
                <button type="button" className="btn btn-outline" onClick={onPublishedGraph}>
                  Xem Course Graph trực quan <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>

          {isPublished && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div className="wizard-card-head" style={{ marginBottom: 10 }}>
                <div>
                  <h4 style={{ margin: 0 }}>Tích hợp vào Master Graph liên môn (UC-KG-05)</h4>
                  <p className="muted-s" style={{ margin: '2px 0 0' }}>
                    Dùng AI đề xuất cầu nối chuẩn đầu ra giữa học phần này với các học phần khác, rà soát và kiểm tra chu trình trước khi lưu Master Graph.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline sm"
                  disabled={masterBusy}
                  onClick={async () => {
                    setMasterBusy(true);
                    setError('');
                    try {
                      const res = await api.proposeMasterGraphBridges(courseId);
                      setMasterBridges(res.bridges);
                      setMessage(`AI đã đề xuất ${res.bridges.length} cầu nối liên môn để rà soát.`);
                    } catch (reason) {
                      setError(reason instanceof Error ? reason.message : 'Không thể đề xuất cầu nối liên môn.');
                    } finally {
                      setMasterBusy(false);
                    }
                  }}
                >
                  <Sparkles size={13} /> {masterBusy ? 'Đang phân tích...' : 'Đề xuất cầu nối liên môn (AI)'}
                </button>
              </div>

              {masterBridges.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {masterBridges.map((b) => (
                    <div key={b.id} className="wizard-review-card" style={{ padding: 12 }}>
                      <div className="wizard-review-top">
                        <div>
                          <b>[{b.sourceCourseCode}] {b.sourceLoCode} ──({b.relationType})→ [{b.targetCourseCode}] {b.targetLoCode}</b>
                          <p className="muted-s" style={{ margin: '4px 0 0' }}>{b.reason}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="pill-badge muted">{DECISION_BADGE[b.decision].text}</span>
                          <button
                            type="button"
                            className="btn btn-outline sm"
                            onClick={() => setMasterBridges((prev) => prev.map((x) => (x.id === b.id ? { ...x, decision: 'APPROVE' } : x)))}
                          >
                            <Check size={12} /> Chấp nhận
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline sm"
                            onClick={() => setMasterBridges((prev) => prev.map((x) => (x.id === b.id ? { ...x, decision: 'REJECT' } : x)))}
                          >
                            <X size={12} /> Loại bỏ
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-primary sm"
                      disabled={masterBusy || masterBridges.some((b) => b.decision === 'PENDING')}
                      onClick={async () => {
                        setMasterBusy(true);
                        setError('');
                        try {
                          const res = await api.integrateMasterGraph(courseId, masterBridges);
                          setMessage(`Đã tích hợp ${res.integratedCount} cầu nối liên môn vào Master Graph v${res.masterVersion}.`);
                        } catch (reason) {
                          setError(reason instanceof Error ? reason.message : 'Phát hiện lỗi toàn vẹn liên môn.');
                        } finally {
                          setMasterBusy(false);
                        }
                      }}
                    >
                      <CheckCircle2 size={13} /> Kiểm tra toàn vẹn &amp; Lưu Master Graph
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
