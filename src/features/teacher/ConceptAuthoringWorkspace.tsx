import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock,
  Eye,
  FileText,
  History,
  Layers,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type {
  ConceptContentOverviewItem,
  ConceptQuiz,
  ContentHistoryItem,
  ContentItem,
  CourseConceptsContentOverview,
  NodeEditorData,
  QuizOption,
  QuizStatus,
} from '../../types';

interface Props {
  courseId: string;
  courseName?: string;
  initialConceptId?: string | null;
  onSelectConceptId?: (conceptId: string) => void;
  onContentUpdated?: () => void;
  onBackToGraph?: () => void;
  onOpenAuthoringWizard?: () => void;
}

type FilterMode = 'all' | 'missing_content' | 'missing_quiz' | 'complete';
type RightTab = 'content' | 'quiz' | 'info';

interface ContentDraftState {
  key: string;
  id?: string | null;
  title: string;
  role: 'definition' | 'example';
  status: 'approved' | 'draft';
  bodyText: string;
  url: string;
  pageFrom: string;
  pageTo: string;
  contentVersion?: number;
}

interface QuizQuestionDraft {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  bloomLevel: number;
  points: number;
  status: 'approved' | 'draft';
}

const BLOOM_LEVELS = [
  { value: 1, label: '1 · Nhớ' },
  { value: 2, label: '2 · Hiểu' },
  { value: 3, label: '3 · Áp dụng' },
  { value: 4, label: '4 · Phân tích' },
  { value: 5, label: '5 · Đánh giá' },
  { value: 6, label: '6 · Sáng tạo' },
];

function makeOptionId(seed: string, idx: number): string {
  const letter = String.fromCharCode(97 + idx);
  return `${seed}-${letter}`;
}

function createEmptyQuestion(index: number): QuizQuestionDraft {
  const seed = `q-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
  const options = ['A', 'B', 'C', 'D'].map((_, idx) => ({
    id: makeOptionId(seed, idx),
    text: '',
  }));
  return {
    id: seed,
    prompt: '',
    options,
    correctOptionId: options[0].id,
    explanation: '',
    bloomLevel: 2,
    points: 1,
    status: 'approved',
  };
}

function createEmptyContentDraft(role: 'definition' | 'example', customTitle?: string): ContentDraftState {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    id: null,
    title: customTitle ?? (role === 'definition' ? 'Nội dung lý thuyết chính' : 'Ví dụ minh họa'),
    role,
    status: 'approved',
    bodyText: '',
    url: '',
    pageFrom: '',
    pageTo: '',
  };
}

function toContentDraft(item: ContentItem): ContentDraftState {
  const inferredRole: 'definition' | 'example' =
    item.role === 'example' || item.kind === 'Example' ? 'example' : 'definition';
  return {
    key: item.id,
    id: item.id,
    title: item.title,
    role: inferredRole,
    status: item.status === 'approved' ? 'approved' : 'draft',
    bodyText: item.bodyText ?? '',
    url: item.url ?? '',
    pageFrom: item.pageFrom != null ? String(item.pageFrom) : '',
    pageTo: item.pageTo != null ? String(item.pageTo) : '',
    contentVersion: item.contentVersion,
  };
}

function quizStatusLabel(status: QuizStatus | 'none'): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (status === 'published') return { text: 'Đã xuất bản', tone: 'ok' };
  if (status === 'draft') return { text: 'Bản nháp', tone: 'warn' };
  if (status === 'closed') return { text: 'Đã đóng', tone: 'muted' };
  return { text: 'Chưa có', tone: 'muted' };
}

function formatChapterLabel(weekNum: number, raw?: string | null): string {
  const clean = (raw ?? '').trim();
  if (!clean || /^(Tuần|Week)\s+\d+$/i.test(clean)) return `Chương ${weekNum}`;
  if (/^(Tuần|Week)\s+\d+/i.test(clean)) {
    return clean.replace(/^(Tuần|Week)\s+(\d+)/i, 'Chương $2');
  }
  return clean;
}

export function ConceptAuthoringWorkspace({
  courseId,
  courseName,
  initialConceptId,
  onSelectConceptId,
  onContentUpdated,
  onBackToGraph,
  onOpenAuthoringWizard,
}: Props) {
  const [overview, setOverview] = useState<CourseConceptsContentOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState('');

  const [selectedId, setSelectedId] = useState<string>(initialConceptId ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openChapters, setOpenChapters] = useState<Record<number, boolean>>({});

  const [nodeData, setNodeData] = useState<NodeEditorData | null>(null);
  const [loadingNode, setLoadingNode] = useState(false);
  const [nodeError, setNodeError] = useState('');
  const [rightTab, setRightTab] = useState<RightTab>('content');
  const [contentViewMode, setContentViewMode] = useState<'edit' | 'preview'>('edit');

  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Content editor drafts + dirty tracking + reference drawer + history
  const [contentDrafts, setContentDrafts] = useState<ContentDraftState[]>([]);
  const [dirtyContentKeys, setDirtyContentKeys] = useState<Record<string, boolean>>({});
  const [openRefsByKey, setOpenRefsByKey] = useState<Record<string, boolean>>({});
  const [historyByContentId, setHistoryByContentId] = useState<Record<string, ContentHistoryItem[]>>({});
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  // Concept quiz editor state
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [quizTimeLimit, setQuizTimeLimit] = useState(10);
  const [quizAttempts, setQuizAttempts] = useState(3);
  const [quizPassPct, setQuizPassPct] = useState(70);
  const [quizStatus, setQuizStatus] = useState<QuizStatus>('published');
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false);
  const [openExplanationByQid, setOpenExplanationByQid] = useState<Record<string, boolean>>({});
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([createEmptyQuestion(1)]);

  // Concept metadata state
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDuration, setMetaDuration] = useState(6);

  const loadOverview = useCallback(async () => {
    if (!courseId) return null;
    setLoadingOverview(true);
    setOverviewError('');
    try {
      const data = await api.getCourseConceptsContentOverview(courseId);
      setOverview(data);
      return data;
    } catch (reason) {
      setOverviewError(reason instanceof Error ? reason.message : 'Không thể tải danh sách khái niệm.');
      return null;
    } finally {
      setLoadingOverview(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadOverview().then((data) => {
      if (!data?.concepts.length) return;
      setSelectedId((prev) => {
        if (initialConceptId && data.concepts.some((c) => c.id === initialConceptId)) {
          return initialConceptId;
        }
        if (prev && data.concepts.some((c) => c.id === prev)) {
          return prev;
        }
        const firstIncomplete = data.concepts.find((c) => !c.isComplete);
        return (firstIncomplete ?? data.concepts[0]).id;
      });
    });
  }, [courseId, initialConceptId, loadOverview]);

  useEffect(() => {
    if (initialConceptId && overview?.concepts.some((c) => c.id === initialConceptId)) {
      setSelectedId(initialConceptId);
    }
  }, [initialConceptId, overview]);

  // Auto-expand the chapter containing the active concept
  useEffect(() => {
    const active = overview?.concepts.find((c) => c.id === selectedId);
    if (active) {
      setOpenChapters((prev) => ({ ...prev, [active.week]: true }));
    }
  }, [selectedId, overview]);

  const hydrateQuizForm = useCallback((quiz: ConceptQuiz | null, conceptName: string) => {
    if (quiz) {
      setEditingQuizId(quiz.id);
      setQuizTitle(quiz.title);
      setQuizDesc(quiz.description ?? '');
      setQuizTimeLimit(quiz.timeLimitMinutes || 10);
      setQuizAttempts(quiz.attemptsAllowed || 3);
      setQuizPassPct(quiz.passScorePct ?? 70);
      setQuizStatus(quiz.status);
      setQuizSettingsOpen(false);
      if (quiz.questions.length > 0) {
        const mapped = quiz.questions.map((q) => {
          const opts = Array.isArray(q.options) && q.options.length >= 2
            ? q.options
            : createEmptyQuestion(1).options;
          const validCorrect = opts.some((o) => o.id === q.correctOptionId)
            ? q.correctOptionId
            : opts[0].id;
          return {
            id: q.id,
            prompt: q.prompt,
            options: opts,
            correctOptionId: validCorrect,
            explanation: q.explanation ?? '',
            bloomLevel: q.bloomLevel || 2,
            points: q.points || 1,
            status: q.status === 'draft' ? 'draft' : 'approved',
          } satisfies QuizQuestionDraft;
        });
        setQuizQuestions(mapped);
        setOpenExplanationByQid(
          Object.fromEntries(mapped.filter((m) => Boolean(m.explanation.trim())).map((m) => [m.id, true])),
        );
      } else {
        setQuizQuestions([createEmptyQuestion(1)]);
        setOpenExplanationByQid({});
      }
      return;
    }

    setEditingQuizId(null);
    setQuizTitle(`Kiểm tra: ${conceptName}`);
    setQuizDesc(`Đánh giá mức độ nắm vững khái niệm "${conceptName}".`);
    setQuizTimeLimit(10);
    setQuizAttempts(3);
    setQuizPassPct(70);
    setQuizStatus('published');
    setQuizSettingsOpen(false);
    setQuizQuestions([createEmptyQuestion(1)]);
    setOpenExplanationByQid({});
  }, []);

  const loadNodeDetail = useCallback(
    async (conceptId: string) => {
      if (!conceptId) {
        setNodeData(null);
        return;
      }
      setLoadingNode(true);
      setNodeError('');
      setActionError('');
      try {
        const detail = await api.getNodeEditor(conceptId);
        setNodeData(detail);
        setMetaTitle(detail.name);
        setMetaDuration(detail.durationMin ?? 6);
        const mappedDrafts = detail.contents.map(toContentDraft);
        setContentDrafts(mappedDrafts);
        setDirtyContentKeys({});
        setOpenRefsByKey(
          Object.fromEntries(
            mappedDrafts
              .filter((d) => Boolean(d.url.trim() || d.pageFrom.trim()))
              .map((d) => [d.key, true]),
          ),
        );
        setOpenHistoryId(null);
        const existingQuizzes = detail.quizzes ?? [];
        const preferred =
          existingQuizzes.find((q) => q.status === 'published') ?? existingQuizzes[0] ?? null;
        hydrateQuizForm(preferred, detail.name);
      } catch (reason) {
        setNodeData(null);
        setNodeError(
          reason instanceof Error
            ? reason.message
            : 'Không thể tải dữ liệu khái niệm. Hãy đảm bảo Đồ thị môn học đã được xuất bản chính thức.',
        );
      } finally {
        setLoadingNode(false);
      }
    },
    [hydrateQuizForm],
  );

  useEffect(() => {
    if (selectedId) {
      void loadNodeDetail(selectedId);
    }
  }, [selectedId, loadNodeDetail]);

  const selectConcept = (id: string) => {
    setActionError('');
    setActionMessage('');
    setSelectedId(id);
    onSelectConceptId?.(id);
  };

  const filteredConcepts = useMemo(() => {
    const list = overview?.concepts ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((c) => {
      if (filterMode === 'missing_content' && c.hasContent) return false;
      if (filterMode === 'missing_quiz' && c.hasQuiz) return false;
      if (filterMode === 'complete' && !c.isComplete) return false;
      if (!q) return true;
      const chTitle = formatChapterLabel(c.week, c.chapterTitle);
      return `${c.name} ${c.code} ${chTitle} chương ${c.week}`.toLowerCase().includes(q);
    });
  }, [overview, filterMode, searchQuery]);

  const groupedByChapter = useMemo(() => {
    const map = new Map<number, { week: number; title: string; items: ConceptContentOverviewItem[] }>();
    for (const c of filteredConcepts) {
      const existing = map.get(c.week);
      const label = formatChapterLabel(c.week, c.chapterTitle);
      if (existing) {
        existing.items.push(c);
        if (label.length > existing.title.length && !/^Chương \d+$/i.test(label)) {
          existing.title = label;
        }
      } else {
        map.set(c.week, { week: c.week, title: label, items: [c] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.week - b.week);
  }, [filteredConcepts]);

  const allConcepts = overview?.concepts ?? [];
  const currentIdx = allConcepts.findIndex((c) => c.id === selectedId);
  const prevConcept = currentIdx > 0 ? allConcepts[currentIdx - 1] : null;
  const nextConcept = currentIdx >= 0 && currentIdx < allConcepts.length - 1 ? allConcepts[currentIdx + 1] : null;
  const nextIncompleteConcept = useMemo(() => {
    if (!allConcepts.length) return null;
    for (let offset = 1; offset <= allConcepts.length; offset += 1) {
      const cand = allConcepts[(Math.max(0, currentIdx) + offset) % allConcepts.length];
      if (cand.id !== selectedId && !cand.isComplete) return cand;
    }
    return null;
  }, [allConcepts, currentIdx, selectedId]);

  const refreshAllAfterMutation = async (conceptId: string) => {
    await Promise.all([loadOverview(), loadNodeDetail(conceptId)]);
    onContentUpdated?.();
  };

  /* -------------------- Content Handlers -------------------- */
  const updateDraftField = (key: string, patch: Partial<ContentDraftState>) => {
    setContentDrafts((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setDirtyContentKeys((prev) => ({ ...prev, [key]: true }));
  };

  const appendNewDraft = (role: 'definition' | 'example', title?: string) => {
    const next = createEmptyContentDraft(role, title);
    setContentDrafts((prev) => [...prev, next]);
    setDirtyContentKeys((prev) => ({ ...prev, [next.key]: true }));
    setContentViewMode('edit');
  };

  const validateSingleContentDraft = (draft: ContentDraftState): { ok: true; pageFrom: number | null; pageTo: number | null } | { ok: false; error: string } => {
    if (!draft.title.trim()) {
      return { ok: false, error: 'Tiêu đề mục nội dung không được để trống.' };
    }
    if (!draft.bodyText.trim() && !draft.url.trim() && !draft.pageFrom.trim()) {
      return { ok: false, error: `Mục "${draft.title}" cần nhập nội dung chi tiết, URL tham khảo hoặc số trang tài liệu.` };
    }
    const pageFromNum = draft.pageFrom.trim() ? Number(draft.pageFrom) : null;
    const pageToNum = draft.pageTo.trim() ? Number(draft.pageTo) : null;
    if (pageFromNum != null && (!Number.isInteger(pageFromNum) || pageFromNum < 1)) {
      return { ok: false, error: `Mục "${draft.title}": Trang bắt đầu phải là số nguyên >= 1.` };
    }
    if (pageFromNum != null && pageToNum != null && (!Number.isInteger(pageToNum) || pageToNum < pageFromNum)) {
      return { ok: false, error: `Mục "${draft.title}": Trang kết thúc phải lớn hơn hoặc bằng trang bắt đầu.` };
    }
    return { ok: true, pageFrom: pageFromNum, pageTo: pageFromNum != null ? (pageToNum ?? pageFromNum) : null };
  };

  const handleSaveContent = async (draft: ContentDraftState) => {
    if (!nodeData) return;
    const check = validateSingleContentDraft(draft);
    if (!check.ok) {
      setActionError(check.error);
      return;
    }
    setSavingKey(`content-${draft.key}`);
    setActionError('');
    setActionMessage('');
    try {
      await api.upsertNodeContent(nodeData.id, {
        id: draft.id ?? null,
        title: draft.title.trim(),
        role: draft.role,
        bodyText: draft.bodyText.trim() || null,
        url: draft.url.trim() || null,
        pageFrom: check.pageFrom,
        pageTo: check.pageTo,
        status: draft.status,
      });
      await refreshAllAfterMutation(nodeData.id);
      setActionMessage(`Đã lưu nội dung "${draft.title.trim()}" cho khái niệm ${nodeData.name}.`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể lưu nội dung bài học.');
    } finally {
      setSavingKey(null);
    }
  };

  const dirtyDrafts = contentDrafts.filter((d) => Boolean(dirtyContentKeys[d.key]));

  const handleSaveAllDirtyContents = async () => {
    if (!nodeData || dirtyDrafts.length === 0) return;
    const validated: Array<{ draft: ContentDraftState; pageFrom: number | null; pageTo: number | null }> = [];
    for (const d of dirtyDrafts) {
      const check = validateSingleContentDraft(d);
      if (!check.ok) {
        setActionError(check.error);
        return;
      }
      validated.push({ draft: d, pageFrom: check.pageFrom, pageTo: check.pageTo });
    }
    setSavingKey('content-all');
    setActionError('');
    setActionMessage('');
    try {
      for (const { draft, pageFrom, pageTo } of validated) {
        await api.upsertNodeContent(nodeData.id, {
          id: draft.id ?? null,
          title: draft.title.trim(),
          role: draft.role,
          bodyText: draft.bodyText.trim() || null,
          url: draft.url.trim() || null,
          pageFrom,
          pageTo,
          status: draft.status,
        });
      }
      await refreshAllAfterMutation(nodeData.id);
      setActionMessage(`Đã lưu ${validated.length} mục nội dung cho khái niệm ${nodeData.name}.`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể lưu hàng loạt nội dung.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteContent = async (draft: ContentDraftState) => {
    if (!nodeData) return;
    if (!draft.id) {
      setContentDrafts((prev) => prev.filter((item) => item.key !== draft.key));
      setDirtyContentKeys((prev) => {
        const next = { ...prev };
        delete next[draft.key];
        return next;
      });
      return;
    }
    if (!window.confirm(`Xóa mục nội dung "${draft.title}"?`)) return;
    setSavingKey(`content-del-${draft.key}`);
    setActionError('');
    setActionMessage('');
    try {
      await api.deleteNodeContent(nodeData.id, draft.id);
      await refreshAllAfterMutation(nodeData.id);
      setActionMessage(`Đã xóa mục nội dung "${draft.title}".`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xóa mục nội dung.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleContentHistory = async (contentId: string) => {
    if (openHistoryId === contentId) {
      setOpenHistoryId(null);
      return;
    }
    setOpenHistoryId(contentId);
    if (!historyByContentId[contentId]) {
      try {
        const history = await api.getContentHistory(contentId);
        setHistoryByContentId((prev) => ({ ...prev, [contentId]: history }));
      } catch {
        setHistoryByContentId((prev) => ({ ...prev, [contentId]: [] }));
      }
    }
  };

  /* -------------------- Concept Quiz Handlers -------------------- */
  const updateQuestion = (qId: string, patch: Partial<QuizQuestionDraft>) => {
    setQuizQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, ...patch } : q)));
  };

  const updateQuestionOption = (qId: string, optId: string, text: string) => {
    setQuizQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: q.options.map((opt) => (opt.id === optId ? { ...opt, text } : opt)) }
          : q,
      ),
    );
  };

  const moveQuestion = (idx: number, delta: -1 | 1) => {
    setQuizQuestions((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const handleSaveQuiz = async (targetStatus: QuizStatus) => {
    if (!nodeData) return;
    if (!quizTitle.trim()) {
      setActionError('Vui lòng nhập tiêu đề bài kiểm tra.');
      return;
    }
    if (quizQuestions.length === 0) {
      setActionError('Bài kiểm tra cần ít nhất 1 câu hỏi.');
      return;
    }
    for (let i = 0; i < quizQuestions.length; i += 1) {
      const q = quizQuestions[i];
      if (!q.prompt.trim()) {
        setActionError(`Câu hỏi ${i + 1} chưa có nội dung.`);
        return;
      }
      if (q.options.length < 2 || q.options.some((o) => !o.text.trim())) {
        setActionError(`Câu hỏi ${i + 1} cần điền đầy đủ nội dung các phương án trả lời.`);
        return;
      }
      if (!q.options.some((o) => o.id === q.correctOptionId)) {
        setActionError(`Câu hỏi ${i + 1} chưa chọn đáp án đúng.`);
        return;
      }
    }

    setSavingKey(`quiz-${targetStatus}`);
    setActionError('');
    setActionMessage('');
    try {
      const saved = await api.upsertConceptQuiz(nodeData.id, {
        quizId: editingQuizId,
        title: quizTitle.trim(),
        description: quizDesc.trim(),
        timeLimitMinutes: Math.max(1, Number(quizTimeLimit) || 10),
        attemptsAllowed: Math.max(1, Number(quizAttempts) || 3),
        passScorePct: Math.max(0, Math.min(100, Number(quizPassPct) || 70)),
        status: targetStatus,
        questions: quizQuestions.map((q) => ({
          id: q.id,
          prompt: q.prompt.trim(),
          options: q.options.map((o) => ({ id: o.id, text: o.text.trim() })),
          correctOptionId: q.correctOptionId,
          explanation: q.explanation.trim(),
          bloomLevel: q.bloomLevel,
          points: q.points > 0 ? q.points : 1,
          status: q.status,
        })),
      });
      await refreshAllAfterMutation(nodeData.id);
      setEditingQuizId(saved.id);
      setQuizStatus(saved.status);
      setActionMessage(
        targetStatus === 'published'
          ? `Đã lưu & xuất bản bài kiểm tra "${saved.title}" (${saved.questions.length} câu) cho ${nodeData.name}.`
          : `Đã lưu bản nháp bài kiểm tra "${saved.title}".`,
      );
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể lưu bài kiểm tra.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!nodeData || !editingQuizId) return;
    if (!window.confirm(`Xóa bài kiểm tra "${quizTitle}" của khái niệm này?`)) return;
    setSavingKey('quiz-delete');
    setActionError('');
    setActionMessage('');
    try {
      await api.deleteConceptQuiz(nodeData.id, editingQuizId);
      await refreshAllAfterMutation(nodeData.id);
      setActionMessage(`Đã xóa bài kiểm tra khỏi khái niệm ${nodeData.name}.`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xóa bài kiểm tra.');
    } finally {
      setSavingKey(null);
    }
  };

  /* -------------------- Concept Metadata Handler -------------------- */
  const handleSaveMetadata = async () => {
    if (!nodeData || !metaTitle.trim()) return;
    setSavingKey('meta');
    setActionError('');
    setActionMessage('');
    try {
      await api.updateConceptMetadata(nodeData.id, {
        title: metaTitle.trim(),
        durationMin: Math.max(1, Math.min(120, Number(metaDuration) || 6)),
      });
      await refreshAllAfterMutation(nodeData.id);
      setActionMessage(`Đã cập nhật thông tin khái niệm "${metaTitle.trim()}".`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể cập nhật thông tin khái niệm.');
    } finally {
      setSavingKey(null);
    }
  };

  if (loadingOverview && !overview) {
    return (
      <div className="concept-authoring-empty">
        <p className="muted">Đang tải danh sách nút Concept đã xuất bản…</p>
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="concept-authoring-empty">
        <p className="form-error" role="alert">{overviewError}</p>
      </div>
    );
  }

  if (overview && overview.totalConcepts === 0) {
    return (
      <div className="empty-wrap">
        <div className="empty-card">
          <BookOpen size={28} style={{ marginBottom: 8, color: 'var(--primary)' }} />
          <h2>Chưa có nút Concept nào được xuất bản</h2>
          <p>
            Quy trình soạn nội dung bài học &amp; bài kiểm tra áp dụng cho các nút Concept sau khi giảng viên hoàn tất xuất bản Course Graph ở Bước D4.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {onOpenAuthoringWizard && (
              <button type="button" className="btn btn-primary" onClick={onOpenAuthoringWizard}>
                <Layers size={13} /> Mở Dựng đồ thị (D1–D4)
              </button>
            )}
            {onBackToGraph && (
              <button type="button" className="btn btn-outline" onClick={onBackToGraph}>
                <ArrowLeft size={13} /> Quay lại Đồ thị
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const total = Math.max(1, overview?.totalConcepts ?? 0);
  const contentPct = Math.round(((overview?.conceptsWithApprovedContent ?? 0) / total) * 100);
  const quizPct = Math.round(((overview?.conceptsWithPublishedQuiz ?? 0) / total) * 100);
  const currentSummary = allConcepts.find((c) => c.id === selectedId) ?? null;
  const activeChapterTitle = formatChapterLabel(
    nodeData?.week ?? currentSummary?.week ?? 1,
    nodeData?.chapterTitle ?? currentSummary?.chapterTitle,
  );

  return (
    <div className="concept-authoring-shell">
      {/* Compact Single-Row Top Bar */}
      <div className="concept-authoring-summary compact">
        <div className="concept-authoring-summary-title">
          <BookOpen size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
          <div>
            <strong>Soạn nội dung &amp; bài kiểm tra Concept</strong>
            <small className="muted-s">
              {courseName ? `${courseName} · ` : ''}
              {overview?.completedConcepts ?? 0}/{overview?.totalConcepts ?? 0} Concept hoàn thiện
            </small>
          </div>
        </div>

        <div className="concept-authoring-metrics compact">
          <div className="concept-metric-pill">
            <span>Bài học</span>
            <b>{overview?.conceptsWithApprovedContent ?? 0}/{overview?.totalConcepts ?? 0} · {contentPct}%</b>
            <div className="progress-track" style={{ height: 4, width: 64 }}>
              <div className="progress-fill" style={{ width: `${contentPct}%` }} />
            </div>
          </div>
          <div className="concept-metric-pill">
            <span>Kiểm tra</span>
            <b>{overview?.conceptsWithPublishedQuiz ?? 0}/{overview?.totalConcepts ?? 0} · {quizPct}%</b>
            <div className="progress-track" style={{ height: 4, width: 64 }}>
              <div className="progress-fill" style={{ width: `${quizPct}%`, background: '#16a34a' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {nextIncompleteConcept && (
            <button
              type="button"
              className="btn btn-primary sm"
              onClick={() => selectConcept(nextIncompleteConcept.id)}
              title={`Chuyển tới Concept chưa hoàn thiện: ${nextIncompleteConcept.name}`}
            >
              Node thiếu tiếp theo <ArrowRight size={12} />
            </button>
          )}
          {onBackToGraph && (
            <button type="button" className="btn btn-outline sm" onClick={onBackToGraph}>
              <ArrowLeft size={12} /> Đồ thị
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Pane Workbench */}
      <div className={`concept-authoring-body${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        {/* Left Collapsible Chapter Rail */}
        {!sidebarCollapsed && (
          <aside className="concept-authoring-sidebar">
            <div className="concept-sidebar-controls">
              <label className="concept-search-box">
                <Search size={13} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên Concept, mã, chương..."
                />
              </label>
              <div className="concept-filter-chips">
                {([
                  ['all', `Tất cả (${overview?.totalConcepts ?? 0})`],
                  ['missing_content', `Thiếu bài (${(overview?.totalConcepts ?? 0) - (overview?.conceptsWithApprovedContent ?? 0)})`],
                  ['missing_quiz', `Thiếu quiz (${(overview?.totalConcepts ?? 0) - (overview?.conceptsWithPublishedQuiz ?? 0)})`],
                  ['complete', `Đủ (${overview?.completedConcepts ?? 0})`],
                ] as [FilterMode, string][]).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={filterMode === mode ? 'on' : ''}
                    onClick={() => setFilterMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="concept-sidebar-list">
              {groupedByChapter.length === 0 ? (
                <p className="muted-s" style={{ padding: 14 }}>Không có Concept nào khớp bộ lọc.</p>
              ) : (
                groupedByChapter.map((group) => {
                  const doneInChapter = group.items.filter((i) => i.isComplete).length;
                  const allDoneInChapter = doneInChapter === group.items.length && group.items.length > 0;
                  const isOpen =
                    searchQuery.trim().length > 0 ||
                    (openChapters[group.week] ?? (group.items.some((i) => i.id === selectedId) || groupedByChapter[0]?.week === group.week));
                  return (
                    <div key={group.week} className="concept-list-group">
                      <button
                        type="button"
                        className="concept-list-group-toggle"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenChapters((prev) => ({ ...prev, [group.week]: !isOpen }))
                        }
                      >
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="concept-list-group-title">{group.title}</span>
                        <span className={`concept-chapter-badge ${allDoneInChapter ? 'ok' : ''}`}>
                          {allDoneInChapter ? '✓ Đủ' : `${doneInChapter}/${group.items.length}`}
                        </span>
                      </button>

                      {isOpen &&
                        group.items.map((item) => {
                          const active = item.id === selectedId;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`concept-list-row${active ? ' active' : ''}${item.isComplete ? ' complete' : ''}`}
                              onClick={() => selectConcept(item.id)}
                            >
                              <div className="concept-list-row-top">
                                <b>{item.name}</b>
                                {item.isComplete && <CheckCircle2 size={14} color="#16a34a" style={{ flexShrink: 0 }} />}
                              </div>
                              <div className="concept-list-row-meta">
                                <span>{item.code} · {item.durationMin}p</span>
                                <div className="concept-status-pills">
                                  <span className={`concept-status-pill ${item.hasContent ? 'ok' : item.contentCount > 0 ? 'warn' : 'muted'}`}>
                                    Bài: {item.approvedContentCount > 0 ? `${item.approvedContentCount}` : item.contentCount > 0 ? 'Nháp' : '0'}
                                  </span>
                                  <span className={`concept-status-pill ${item.hasQuiz ? 'ok' : item.quizCount > 0 ? 'warn' : 'muted'}`}>
                                    Quiz: {item.hasQuiz ? `${item.primaryQuizQuestionCount} câu` : item.quizCount > 0 ? 'Nháp' : '0'}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Right Detail Editor */}
        <section className="concept-authoring-main">
          {loadingNode && !nodeData ? (
            <div className="concept-authoring-empty">
              <p className="muted">Đang tải chi tiết nút Concept…</p>
            </div>
          ) : nodeError ? (
            <div className="empty-wrap">
              <div className="empty-card">
                <AlertTriangle size={26} color="#d97706" style={{ marginBottom: 8 }} />
                <h2>Chưa thể mở nút Concept này</h2>
                <p>{nodeError}</p>
                {onOpenAuthoringWizard && (
                  <button type="button" className="btn btn-primary" onClick={onOpenAuthoringWizard}>
                    Về quy trình Dựng đồ thị (D4 Xuất bản)
                  </button>
                )}
              </div>
            </div>
          ) : nodeData ? (
            <>
              {/* Concept Header + Prev/Next */}
              <div className="concept-editor-head">
                <div className="concept-editor-head-left">
                  <button
                    type="button"
                    className="btn btn-outline sm"
                    onClick={() => setSidebarCollapsed((v) => !v)}
                    title={sidebarCollapsed ? 'Hiện danh sách Concept' : 'Thu gọn danh sách'}
                  >
                    {sidebarCollapsed ? 'Hiện DS' : 'Ẩn DS'}
                  </button>
                  <div>
                    <div className="concept-editor-kicker">
                      <span className="pill-badge blue" style={{ fontSize: 11 }}>{activeChapterTitle}</span>
                      <code>{nodeData.code ?? nodeData.group}</code>
                      <span>·</span>
                      <span>Nội dung v{nodeData.contentVersion ?? 1}</span>
                      {(nodeData.learningOutcomes ?? []).map((lo) => (
                        <span key={lo.code} className="lo-chip" style={{ marginLeft: 2 }}>{lo.code}</span>
                      ))}
                    </div>
                    <h2>{nodeData.name}</h2>
                  </div>
                </div>

                <div className="concept-editor-nav">
                  <button
                    type="button"
                    className="btn btn-outline sm"
                    disabled={!prevConcept}
                    onClick={() => prevConcept && selectConcept(prevConcept.id)}
                  >
                    ‹ Trước
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline sm"
                    disabled={!nextConcept}
                    onClick={() => nextConcept && selectConcept(nextConcept.id)}
                  >
                    Tiếp ›
                  </button>
                </div>
              </div>

              {/* Banners */}
              {(actionError || actionMessage) && (
                <div className="concept-feedback-row">
                  {actionError && <p className="form-error" role="alert" style={{ margin: 0 }}>{actionError}</p>}
                  {actionMessage && <p className="admin-success" role="status" style={{ margin: 0 }}>{actionMessage}</p>}
                </div>
              )}

              {/* Tabs */}
              <div className="concept-editor-tabs">
                <button
                  type="button"
                  className={rightTab === 'content' ? 'on' : ''}
                  onClick={() => setRightTab('content')}
                >
                  <FileText size={14} /> Nội dung bài học
                  <span className="n">{contentDrafts.length}</span>
                </button>
                <button
                  type="button"
                  className={rightTab === 'quiz' ? 'on' : ''}
                  onClick={() => setRightTab('quiz')}
                >
                  <ClipboardCheck size={14} /> Bài kiểm tra Concept
                  <span className="n">{quizQuestions.length} câu</span>
                </button>
                <button
                  type="button"
                  className={rightTab === 'info' ? 'on' : ''}
                  onClick={() => setRightTab('info')}
                >
                  <Clock size={14} /> Thông tin &amp; Tiên quyết
                  <span className="n">{nodeData.prerequisites.length}</span>
                </button>
              </div>

              {/* Tab 1: Lesson Contents */}
              {rightTab === 'content' && (
                <div className="concept-tab-panel">
                  <div className="concept-panel-toolbar">
                    <div className="kg-view-switch" role="tablist" aria-label="Chế độ nội dung">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={contentViewMode === 'edit'}
                        className={contentViewMode === 'edit' ? 'on' : ''}
                        onClick={() => setContentViewMode('edit')}
                      >
                        <Pencil size={12} style={{ marginRight: 4 }} /> Soạn thảo ({contentDrafts.length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={contentViewMode === 'preview'}
                        className={contentViewMode === 'preview' ? 'on' : ''}
                        onClick={() => setContentViewMode('preview')}
                      >
                        <Eye size={12} style={{ marginRight: 4 }} /> Xem trước như SV
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {dirtyDrafts.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary sm"
                          disabled={Boolean(savingKey)}
                          onClick={() => void handleSaveAllDirtyContents()}
                        >
                          <Save size={12} />{' '}
                          {savingKey === 'content-all'
                            ? 'Đang lưu...'
                            : `Lưu tất cả (${dirtyDrafts.length})`}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline sm"
                        onClick={() => appendNewDraft('definition')}
                      >
                        <Plus size={12} /> Lý thuyết
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline sm"
                        onClick={() => appendNewDraft('example')}
                      >
                        <Plus size={12} /> Ví dụ
                      </button>
                    </div>
                  </div>

                  {contentViewMode === 'preview' ? (
                    <div className="concept-student-preview">
                      <div className="concept-student-preview-head">
                        <span className="pill-badge blue">Concept</span>
                        <span className="pill-badge muted">{activeChapterTitle}</span>
                        <span className="pill-badge muted">{nodeData.durationMin ?? 6} phút</span>
                      </div>
                      <h3>{nodeData.name}</h3>
                      {contentDrafts.filter((d) => d.status === 'approved').length === 0 ? (
                        <div className="concept-empty-box">
                          <Eye size={22} color="var(--muted)" />
                          <b>Chưa có mục nội dung nào ở trạng thái "Đã duyệt"</b>
                          <p className="muted-s">
                            Chỉ những mục đặt trạng thái <b>Đã duyệt (Hiển thị cho SV)</b> mới hiển thị trên trang học tập của sinh viên.
                          </p>
                        </div>
                      ) : (
                        <div className="concept-cards-stack">
                          {contentDrafts
                            .filter((d) => d.status === 'approved')
                            .map((d) => (
                              <div
                                key={d.key}
                                style={{
                                  padding: '14px 16px',
                                  borderRadius: 10,
                                  border: '1px solid var(--line)',
                                  borderLeft: d.role === 'example' ? '3px solid #16a34a' : '3px solid var(--primary)',
                                  background: '#fff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={`pill-badge ${d.role === 'example' ? 'ok' : 'blue'}`}>
                                      {d.role === 'example' ? 'Ví dụ minh họa' : 'Lý thuyết / Định nghĩa'}
                                    </span>
                                    <strong style={{ fontSize: 15, color: 'var(--ink)' }}>{d.title}</strong>
                                  </div>
                                  {d.pageFrom.trim() && (
                                    <span className="pill-badge muted" style={{ fontSize: 11 }}>
                                      Trang {d.pageFrom}{d.pageTo.trim() && d.pageTo !== d.pageFrom ? `–${d.pageTo}` : ''}
                                    </span>
                                  )}
                                </div>
                                {d.bodyText.trim() && (
                                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                    {d.bodyText}
                                  </div>
                                )}
                                {d.url.trim() && (
                                  <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)' }}>
                                    {d.url}
                                  </a>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : contentDrafts.length === 0 ? (
                    <div className="concept-empty-box">
                      <FileText size={24} color="var(--muted)" />
                      <b>Chưa có nội dung bài học cho nút "{nodeData.name}"</b>
                      <p className="muted-s">
                        Khởi tạo nhanh khung bài học gồm Lý thuyết và Ví dụ minh họa, hoặc thêm từng mục riêng lẻ.
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                        <button
                          type="button"
                          className="btn btn-primary sm"
                          onClick={() => {
                            const d1 = createEmptyContentDraft('definition', `Tổng quan & Định nghĩa: ${nodeData.name}`);
                            const d2 = createEmptyContentDraft('example', `Ví dụ minh họa: ${nodeData.name}`);
                            setContentDrafts([d1, d2]);
                            setDirtyContentKeys({ [d1.key]: true, [d2.key]: true });
                          }}
                        >
                          <Sparkles size={13} /> Tạo nhanh khung bài học (Lý thuyết + Ví dụ)
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline sm"
                          onClick={() => appendNewDraft('definition')}
                        >
                          <Plus size={13} /> Thêm 1 mục Lý thuyết
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="concept-cards-stack">
                      {contentDrafts.map((draft, idx) => {
                        const isSavingThis = savingKey === `content-${draft.key}`;
                        const isDeletingThis = savingKey === `content-del-${draft.key}`;
                        const isDirty = Boolean(dirtyContentKeys[draft.key]);
                        const refsOpen = Boolean(openRefsByKey[draft.key] || draft.url.trim() || draft.pageFrom.trim());
                        const historyList = draft.id ? historyByContentId[draft.id] : undefined;
                        const historyOpen = Boolean(draft.id && openHistoryId === draft.id);
                        return (
                          <article key={draft.key} className={`concept-content-card${isDirty ? ' is-dirty' : ''}`}>
                            <div className="concept-card-head">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className="pill-badge blue">Mục #{idx + 1}</span>
                                <span className={`pill-badge ${draft.status === 'approved' ? 'ok' : 'warn'}`}>
                                  {draft.status === 'approved' ? 'Đã duyệt · Hiện cho SV' : 'Bản nháp'}
                                </span>
                                {draft.contentVersion != null && (
                                  <span className="pill-badge muted">v{draft.contentVersion}</span>
                                )}
                                {isDirty && (
                                  <span className="pill-badge warn">Chưa lưu</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {draft.id && (
                                  <button
                                    type="button"
                                    className="btn btn-outline sm"
                                    onClick={() => void handleToggleContentHistory(draft.id!)}
                                  >
                                    <History size={12} /> Lịch sử
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-danger sm"
                                  disabled={Boolean(savingKey)}
                                  onClick={() => void handleDeleteContent(draft)}
                                >
                                  <Trash2 size={12} /> {isDeletingThis ? 'Đang xóa...' : 'Xóa'}
                                </button>
                              </div>
                            </div>

                            <div className="concept-form-grid">
                              <div className="concept-content-meta-row">
                                <label style={{ flex: '2 1 240px' }}>
                                  <span>Tiêu đề mục nội dung *</span>
                                  <input
                                    value={draft.title}
                                    onChange={(e) => updateDraftField(draft.key, { title: e.target.value })}
                                    placeholder="VD: Khái niệm cốt lõi / Ví dụ cài đặt"
                                  />
                                </label>
                                <label style={{ flex: '1 1 160px' }}>
                                  <span>Loại</span>
                                  <select
                                    value={draft.role}
                                    onChange={(e) =>
                                      updateDraftField(draft.key, { role: e.target.value as 'definition' | 'example' })
                                    }
                                  >
                                    <option value="definition">Lý thuyết / Định nghĩa</option>
                                    <option value="example">Ví dụ minh họa</option>
                                  </select>
                                </label>
                                <label style={{ flex: '1 1 170px' }}>
                                  <span>Trạng thái</span>
                                  <select
                                    value={draft.status}
                                    onChange={(e) =>
                                      updateDraftField(draft.key, { status: e.target.value as 'approved' | 'draft' })
                                    }
                                  >
                                    <option value="approved">Đã duyệt (Hiện cho SV)</option>
                                    <option value="draft">Bản nháp (Ẩn với SV)</option>
                                  </select>
                                </label>
                              </div>

                              <label>
                                <span>Nội dung bài học chi tiết</span>
                                <textarea
                                  rows={7}
                                  value={draft.bodyText}
                                  onChange={(e) => updateDraftField(draft.key, { bodyText: e.target.value })}
                                  placeholder="Nhập giải thích, công thức, ví dụ cụ thể hoặc tóm tắt kiến thức trọng tâm của khái niệm..."
                                />
                              </label>

                              {!refsOpen ? (
                                <div>
                                  <button
                                    type="button"
                                    className="btn btn-outline sm"
                                    onClick={() => setOpenRefsByKey((prev) => ({ ...prev, [draft.key]: true }))}
                                  >
                                    <Link2 size={12} /> + Thêm liên kết tài liệu / Số trang slide
                                  </button>
                                </div>
                              ) : (
                                <div className="concept-form-row-3">
                                  <label style={{ gridColumn: 'span 2' }}>
                                    <span><Link2 size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Liên kết tài liệu / Video / Slide (tuỳ chọn)</span>
                                    <input
                                      value={draft.url}
                                      onChange={(e) => updateDraftField(draft.key, { url: e.target.value })}
                                      placeholder="https://..."
                                    />
                                  </label>
                                  <div className="concept-form-pages">
                                    <label>
                                      <span>Từ trang</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={draft.pageFrom}
                                        onChange={(e) => updateDraftField(draft.key, { pageFrom: e.target.value })}
                                        placeholder="1"
                                      />
                                    </label>
                                    <label>
                                      <span>Đến trang</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={draft.pageTo}
                                        onChange={(e) => updateDraftField(draft.key, { pageTo: e.target.value })}
                                        placeholder="1"
                                      />
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="concept-card-foot">
                              <button
                                type="button"
                                className="btn btn-primary sm"
                                disabled={Boolean(savingKey)}
                                onClick={() => void handleSaveContent(draft)}
                              >
                                <Check size={13} /> {isSavingThis ? 'Đang lưu...' : draft.id ? 'Lưu mục này' : 'Lưu mục mới'}
                              </button>
                            </div>

                            {historyOpen && (
                              <div className="concept-history-drawer">
                                <strong>Lịch sử phiên bản nội dung</strong>
                                {!historyList ? (
                                  <small className="muted-s">Đang tải lịch sử...</small>
                                ) : historyList.length === 0 ? (
                                  <small className="muted-s">Chưa có bản lưu trước đó.</small>
                                ) : (
                                  <div className="concept-history-list">
                                    {historyList.map((h) => (
                                      <div key={`${h.contentId}-${h.contentVersion}`} className="concept-history-row">
                                        <span className="pill-badge muted">v{h.contentVersion}</span>
                                        <b>{h.title}</b>
                                        <small>{h.isArchived ? 'Lưu trữ' : 'Hiện tại'}</small>
                                        {h.archivedAt && (
                                          <small className="muted-s">
                                            {new Date(h.archivedAt).toLocaleString('vi-VN')}
                                          </small>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Concept Quiz Editor */}
              {rightTab === 'quiz' && (
                <div className="concept-tab-panel concept-quiz-panel">
                  {/* Compact Collapsible Quiz Settings Bar */}
                  <div className="concept-quiz-settings-bar">
                    <div className="concept-quiz-settings-summary">
                      <Sparkles size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <strong>{quizTitle || `Kiểm tra: ${nodeData.name}`}</strong>
                        <small className="muted-s">
                          {quizTimeLimit} phút · Tối đa {quizAttempts} lượt · Đạt ≥ {quizPassPct}% ·{' '}
                          <span style={{ fontWeight: 600 }}>
                            {editingQuizId ? quizStatusLabel(quizStatus).text : 'Chưa lưu trên hệ thống'}
                          </span>
                        </small>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(nodeData.quizzes?.length ?? 0) > 0 && (
                        <select
                          aria-label="Chọn bài kiểm tra của khái niệm"
                          value={editingQuizId ?? '__new__'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__new__') {
                              hydrateQuizForm(null, nodeData.name);
                            } else {
                              const picked = nodeData.quizzes?.find((qz) => qz.id === val) ?? null;
                              hydrateQuizForm(picked, nodeData.name);
                            }
                          }}
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', fontSize: 12 }}
                        >
                          {nodeData.quizzes?.map((qz) => (
                            <option key={qz.id} value={qz.id}>
                              {qz.title} ({quizStatusLabel(qz.status).text} · {qz.questions.length} câu)
                            </option>
                          ))}
                          <option value="__new__">+ Tạo quiz mới</option>
                        </select>
                      )}
                      <button
                        type="button"
                        className={`btn btn-outline sm${quizSettingsOpen ? ' on' : ''}`}
                        onClick={() => setQuizSettingsOpen((v) => !v)}
                      >
                        <Settings size={12} /> {quizSettingsOpen ? 'Ẩn cấu hình' : 'Cấu hình'}
                      </button>
                    </div>
                  </div>

                  {quizSettingsOpen && (
                    <div className="concept-content-card">
                      <div className="concept-card-head">
                        <strong>Cấu hình bài kiểm tra Concept</strong>
                        {editingQuizId && (
                          <button
                            type="button"
                            className="btn btn-danger sm"
                            disabled={Boolean(savingKey)}
                            onClick={() => void handleDeleteQuiz()}
                          >
                            <Trash2 size={12} /> Xóa bài kiểm tra
                          </button>
                        )}
                      </div>

                      <div className="concept-form-grid">
                        <label>
                          <span>Tiêu đề bài kiểm tra *</span>
                          <input
                            value={quizTitle}
                            onChange={(e) => setQuizTitle(e.target.value)}
                            placeholder={`Kiểm tra: ${nodeData.name}`}
                          />
                        </label>
                        <label>
                          <span>Hướng dẫn / Mô tả ngắn</span>
                          <textarea
                            rows={2}
                            value={quizDesc}
                            onChange={(e) => setQuizDesc(e.target.value)}
                            placeholder="Mục tiêu và lưu ý khi làm bài kiểm tra..."
                          />
                        </label>
                        <div className="concept-form-row-3">
                          <label>
                            <span>Thời gian làm bài (phút)</span>
                            <input
                              type="number"
                              min={1}
                              max={600}
                              value={quizTimeLimit}
                              onChange={(e) => setQuizTimeLimit(Number(e.target.value) || 10)}
                            />
                          </label>
                          <label>
                            <span>Số lượt làm tối đa</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={quizAttempts}
                              onChange={(e) => setQuizAttempts(Number(e.target.value) || 3)}
                            />
                          </label>
                          <label>
                            <span>Ngưỡng đạt Mastery (%)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={quizPassPct}
                              onChange={(e) => setQuizPassPct(Number(e.target.value) || 70)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Questions List */}
                  <div className="concept-cards-stack">
                    {quizQuestions.map((q, qIdx) => {
                      const explOpen = Boolean(openExplanationByQid[q.id] || q.explanation.trim());
                      return (
                        <article key={q.id} className="concept-quiz-question-card">
                          <div className="concept-card-head">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="pill-badge blue">Câu {qIdx + 1}</span>
                              <select
                                value={q.bloomLevel}
                                onChange={(e) => updateQuestion(q.id, { bloomLevel: Number(e.target.value) })}
                                aria-label={`Mức Bloom câu ${qIdx + 1}`}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12 }}
                              >
                                {BLOOM_LEVELS.map((b) => (
                                  <option key={b.value} value={b.value}>{b.label}</option>
                                ))}
                              </select>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <span>Điểm:</span>
                                <input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  value={q.points}
                                  onChange={(e) => updateQuestion(q.id, { points: Math.max(0.5, Number(e.target.value) || 1) })}
                                  style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--line)' }}
                                />
                              </label>
                            </div>

                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-outline sm"
                                disabled={qIdx === 0}
                                onClick={() => moveQuestion(qIdx, -1)}
                                title="Di chuyển lên"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline sm"
                                disabled={qIdx === quizQuestions.length - 1}
                                onClick={() => moveQuestion(qIdx, 1)}
                                title="Di chuyển xuống"
                              >
                                <ArrowDown size={12} />
                              </button>
                              {quizQuestions.length > 1 && (
                                <button
                                  type="button"
                                  className="btn btn-danger sm"
                                  onClick={() => setQuizQuestions((prev) => prev.filter((item) => item.id !== q.id))}
                                  title="Xóa câu hỏi"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="concept-form-grid">
                            <label>
                              <span>Nội dung câu hỏi *</span>
                              <textarea
                                rows={2}
                                value={q.prompt}
                                onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                                placeholder={`Câu hỏi kiểm tra khái niệm "${nodeData.name}"...`}
                              />
                            </label>

                            <div className="concept-quiz-options-grid">
                              {q.options.map((opt, optIdx) => {
                                const isCorrect = q.correctOptionId === opt.id;
                                return (
                                  <div key={opt.id} className={`concept-quiz-option-row${isCorrect ? ' correct' : ''}`}>
                                    <input
                                      type="radio"
                                      name={`correct-${q.id}`}
                                      checked={isCorrect}
                                      onChange={() => updateQuestion(q.id, { correctOptionId: opt.id })}
                                      aria-label={`Chọn đáp án ${String.fromCharCode(65 + optIdx)} là đáp án đúng`}
                                    />
                                    <span className="concept-option-letter">{String.fromCharCode(65 + optIdx)}</span>
                                    <input
                                      value={opt.text}
                                      onChange={(e) => updateQuestionOption(q.id, opt.id, e.target.value)}
                                      placeholder={`Phương án ${String.fromCharCode(65 + optIdx)}`}
                                    />
                                    {q.options.length > 2 && (
                                      <button
                                        type="button"
                                        className="icon-plain"
                                        onClick={() => {
                                          const remaining = q.options.filter((o) => o.id !== opt.id);
                                          updateQuestion(q.id, {
                                            options: remaining,
                                            correctOptionId: isCorrect ? remaining[0].id : q.correctOptionId,
                                          });
                                        }}
                                        aria-label="Xóa phương án"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-outline sm"
                                onClick={() =>
                                  updateQuestion(q.id, {
                                    options: [
                                      ...q.options,
                                      { id: makeOptionId(q.id, q.options.length), text: '' },
                                    ],
                                  })
                                }
                              >
                                <Plus size={12} /> Thêm phương án
                              </button>
                              {!explOpen && (
                                <button
                                  type="button"
                                  className="btn btn-outline sm"
                                  onClick={() => setOpenExplanationByQid((prev) => ({ ...prev, [q.id]: true }))}
                                >
                                  + Giải thích đáp án
                                </button>
                              )}
                            </div>

                            {explOpen && (
                              <label>
                                <span>Giải thích đáp án (tuỳ chọn)</span>
                                <textarea
                                  rows={2}
                                  value={q.explanation}
                                  onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                                  placeholder="Giải thích lý do đáp án đúng để hỗ trợ sinh viên ôn tập..."
                                />
                              </label>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {/* Sticky Bottom Quiz Footer */}
                  <div className="concept-quiz-footer sticky">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() =>
                        setQuizQuestions((prev) => [...prev, createEmptyQuestion(prev.length + 1)])
                      }
                    >
                      <Plus size={14} /> Thêm câu hỏi
                    </button>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={Boolean(savingKey)}
                        onClick={() => void handleSaveQuiz('draft')}
                      >
                        {savingKey === 'quiz-draft' ? 'Đang lưu...' : 'Lưu bản nháp'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={Boolean(savingKey)}
                        onClick={() => void handleSaveQuiz('published')}
                      >
                        <CheckCircle2 size={14} />{' '}
                        {savingKey === 'quiz-published' ? 'Đang lưu...' : 'Lưu & Xuất bản bài kiểm tra'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Concept Metadata, Readiness & Prerequisites */}
              {rightTab === 'info' && (
                <div className="concept-tab-panel">
                  <div className="concept-content-card">
                    <strong>Trạng thái sẵn sàng cho sinh viên</strong>
                    <div className="concept-readiness-row">
                      <span className={`concept-readiness-item ${currentSummary?.hasContent ? 'ok' : 'pending'}`}>
                        {currentSummary?.hasContent ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        <span>
                          Nội dung bài học đã duyệt ({currentSummary?.approvedContentCount ?? 0} mục)
                        </span>
                      </span>
                      <span className={`concept-readiness-item ${currentSummary?.hasQuiz ? 'ok' : 'pending'}`}>
                        {currentSummary?.hasQuiz ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        <span>
                          Bài kiểm tra Concept đã xuất bản ({currentSummary?.primaryQuizQuestionCount ?? 0} câu)
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="concept-content-card">
                    <div className="concept-card-head">
                      <strong>Thông tin khái niệm trên đồ thị</strong>
                      <span className="pill-badge muted">{nodeData.code ?? nodeData.group}</span>
                    </div>
                    <div className="concept-form-grid">
                      <label>
                        <span>Tên khái niệm *</span>
                        <input
                          value={metaTitle}
                          onChange={(e) => setMetaTitle(e.target.value)}
                          placeholder="Tên khái niệm"
                        />
                      </label>
                      <div className="concept-form-row-2">
                        <label>
                          <span>Thời lượng học ước tính (phút)</span>
                          <input
                            type="number"
                            min={1}
                            max={120}
                            value={metaDuration}
                            onChange={(e) => setMetaDuration(Number(e.target.value) || 6)}
                          />
                        </label>
                        <label>
                          <span>Chương</span>
                          <input value={activeChapterTitle} disabled />
                        </label>
                      </div>
                    </div>
                    <div className="concept-card-foot">
                      <button
                        type="button"
                        className="btn btn-primary sm"
                        disabled={Boolean(savingKey) || !metaTitle.trim()}
                        onClick={() => void handleSaveMetadata()}
                      >
                        <Check size={13} /> {savingKey === 'meta' ? 'Đang lưu...' : 'Lưu thông tin Concept'}
                      </button>
                    </div>
                  </div>

                  <div className="concept-info-grid-2">
                    <div className="concept-content-card">
                      <strong>Chuẩn đầu ra (Learning Outcomes)</strong>
                      {(nodeData.learningOutcomes?.length ?? 0) === 0 ? (
                        <p className="muted-s">Khái niệm này chưa gắn cạnh DEVELOP tới Chuẩn đầu ra.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          {nodeData.learningOutcomes!.map((lo) => (
                            <div key={lo.code} className="concept-info-row">
                              <span className="lo-chip">{lo.code}</span>
                              <span>{lo.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="concept-content-card">
                      <strong>Điều kiện tiên quyết (PREREQUISITE)</strong>
                      {nodeData.prerequisites.length === 0 ? (
                        <p className="muted-s">Không có nút tiên quyết bắt buộc trước khái niệm này.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          {nodeData.prerequisites.map((p) => (
                            <div key={p} className="concept-info-row">
                              <BookOpen size={13} color="var(--primary)" />
                              <span>{p}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
