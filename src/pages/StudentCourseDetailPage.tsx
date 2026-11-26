import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Award, Bell, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Edit3, HelpCircle, Lock, Search, Sigma, Users } from 'lucide-react';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '../types';


type DetailTab = 'content' | 'grades';
type ChapterConceptFilter = 'all' | 'available' | 'mastered' | 'locked';
type StudentConceptStatus = 'mastered' | 'learning' | 'unlearned' | 'locked';

function formatChapterTitle(weekNum: number, raw?: unknown): string {
  const rawTitle = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  if (!rawTitle || /^(Tuần|Week|Chương|Chapter)\s+\d+$/i.test(rawTitle)) {
    return `Chương ${weekNum}`;
  }
  if (/^(Tuần|Week)\s+\d+/i.test(rawTitle)) {
    return rawTitle.replace(/^(Tuần|Week)\s+(\d+)/i, 'Chương $2');
  }
  if (/^(Chương|Chapter)\s+/i.test(rawTitle)) {
    return rawTitle;
  }
  return `Chương ${weekNum}: ${rawTitle}`;
}

function topoSortChapterNodes(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): KnowledgeGraphNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.type === 'PREREQUISITE' && ids.has(e.source) && ids.has(e.target) && e.source !== e.target) {
      adj.get(e.source)!.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }
  }
  const topoRank = new Map<string, number>();
  const ready = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0);
  let rank = 0;
  while (ready.length > 0) {
    ready.sort((a, b) => a.name.localeCompare(b.name));
    const cur = ready.shift()!;
    topoRank.set(cur.id, rank++);
    for (const nxt of adj.get(cur.id) ?? []) {
      const nextDeg = (inDeg.get(nxt) ?? 0) - 1;
      inDeg.set(nxt, nextDeg);
      if (nextDeg === 0) {
        const nxtNode = nodes.find((x) => x.id === nxt);
        if (nxtNode) ready.push(nxtNode);
      }
    }
  }
  return [...nodes].sort((a, b) => {
    const seqA = Number((a.properties ?? {}).step_seq);
    const seqB = Number((b.properties ?? {}).step_seq);
    const hasSeqA = Number.isFinite(seqA) && seqA > 0;
    const hasSeqB = Number.isFinite(seqB) && seqB > 0;
    if (hasSeqA && hasSeqB && seqA !== seqB) return seqA - seqB;
    if (hasSeqA !== hasSeqB) return hasSeqA ? -1 : 1;
    const ra = topoRank.get(a.id) ?? 999999;
    const rb = topoRank.get(b.id) ?? 999999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

export default function StudentCourseDetailPage() {
  const { courseId = '', tab = 'content' } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChapterConceptFilter>('all');
  const [gradeChapterFilter, setGradeChapterFilter] = useState<'all' | number>('all');
  const [gradeViewMode, setGradeViewMode] = useState<'quizzes' | 'chapters'>('quizzes');
  const isVi = language === 'vi';
  const { data: courseData, error: coursesError } = useAsync(() => api.getStudentCourses(), []);
  const { data: gradeData, loading: gradesLoading, error: gradesError } =
    useAsync(() => api.getStudentGrades(courseId), [courseId]);
  const { data: knowledgeGraph, loading: kgLoading, error: kgError } =
    useAsync(() => (courseId ? api.getKnowledgeGraph(courseId) : Promise.resolve(null)), [courseId]);

  const conceptNodes = useMemo(
    () => (knowledgeGraph?.nodes ?? []).filter((n) => n.type === 'Concept'),
    [knowledgeGraph],
  );

  const conceptChapters = useMemo(() => {
    if (!conceptNodes.length) return [];
    const byWeek = new Map<number, { key: string; week: number; title: string; nodes: KnowledgeGraphNode[] }>();
    for (const n of conceptNodes) {
      const p = (n.properties ?? {}) as Record<string, unknown>;
      const wk = Number(p.chapter_number ?? p.week ?? p.default_week ?? 1) || 1;
      const label = formatChapterTitle(wk, p.chapter_title ?? p.chapterTitle);
      const existing = byWeek.get(wk);
      if (existing) {
        existing.nodes.push(n);
        if (label.length > existing.title.length && !/^Chương \d+$/i.test(label)) {
          existing.title = label;
        }
      } else {
        byWeek.set(wk, { key: `kg-ch-${wk}`, week: wk, title: label, nodes: [n] });
      }
    }
    const edges = knowledgeGraph?.edges ?? [];
    return Array.from(byWeek.values())
      .sort((a, b) => a.week - b.week)
      .map((ch) => ({
        ...ch,
        nodes: topoSortChapterNodes(ch.nodes, edges),
      }));
  }, [conceptNodes, knowledgeGraph]);

  const learningStateMap = useMemo(() => {
    const map = new Map<string, { state: StudentConceptStatus; lockReason?: string }>();
    const prereqSources = new Map<string, string[]>();
    const nameById = new Map((knowledgeGraph?.nodes ?? []).map((n) => [n.id, n.name]));
    for (const e of knowledgeGraph?.edges ?? []) {
      if (e.type === 'PREREQUISITE' && (e.properties ?? {}).strength !== 'soft') {
        const arr = prereqSources.get(e.target) ?? [];
        arr.push(e.source);
        prereqSources.set(e.target, arr);
      }
    }
    let hasLearning = false;
    for (const node of conceptNodes) {
      const p = (node.properties ?? {}) as Record<string, unknown>;
      const ls = String(p.learning_state ?? p.learningState ?? '');
      const masteryVal = typeof p.mastery === 'number' ? p.mastery : null;
      if (ls === 'mastered' || (masteryVal !== null && masteryVal >= 70)) {
        map.set(node.id, { state: 'mastered' });
      } else if (ls === 'learning') {
        hasLearning = true;
        map.set(node.id, { state: 'learning' });
      } else if (ls === 'locked') {
        map.set(node.id, { state: 'locked' });
      } else {
        map.set(node.id, { state: 'unlearned' });
      }
    }
    for (const node of conceptNodes) {
      const cur = map.get(node.id);
      if (!cur || cur.state === 'mastered' || cur.state === 'learning') continue;
      const reqs = prereqSources.get(node.id) ?? [];
      const missing = reqs.find((srcId) => map.get(srcId)?.state !== 'mastered');
      if (missing) {
        map.set(node.id, {
          state: 'locked',
          lockReason: `Cần hoàn thành: ${nameById.get(missing) ?? missing}`,
        });
      } else if (cur.state === 'locked') {
        map.set(node.id, { state: 'locked', lockReason: 'Cần hoàn thành khái niệm tiên quyết trước' });
      }
    }
    const orderedNodes = conceptChapters.flatMap((c) => c.nodes);
    if (!hasLearning && orderedNodes.length > 0) {
      const firstOpen =
        orderedNodes.find((n) => map.get(n.id)?.state === 'unlearned') ??
        orderedNodes.find((n) => map.get(n.id)?.state !== 'locked') ??
        null;
      if (firstOpen && map.get(firstOpen.id)?.state !== 'locked') {
        map.set(firstOpen.id, { state: 'learning' });
      }
    }
    return map;
  }, [conceptNodes, conceptChapters, knowledgeGraph]);

  const summaryStats = useMemo(() => {
    const ordered = conceptChapters.flatMap((c) => c.nodes);
    const total = ordered.length;
    const mastered = ordered.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const nextNode =
      ordered.find((n) => learningStateMap.get(n.id)?.state === 'learning') ??
      ordered.find((n) => {
        const st = learningStateMap.get(n.id)?.state;
        return st !== 'mastered' && st !== 'locked';
      }) ??
      null;
    const activeChapterKey = nextNode
      ? (conceptChapters.find((ch) => ch.nodes.some((n) => n.id === nextNode.id))?.key ?? conceptChapters[0]?.key)
      : conceptChapters[0]?.key;
    return { total, mastered, pct, nextNode, activeChapterKey };
  }, [conceptChapters, learningStateMap]);

  useEffect(() => {
    if (!conceptChapters.length) return;
    setOpenChapters((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const defaultKey = summaryStats.activeChapterKey ?? conceptChapters[0]?.key;
      return defaultKey ? { [defaultKey]: true } : {};
    });
  }, [conceptChapters, summaryStats.activeChapterKey]);

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conceptChapters
      .map((ch) => {
        const masteredCount = ch.nodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
        const nodes = ch.nodes.filter((node) => {
          const st = learningStateMap.get(node.id)?.state ?? 'unlearned';
          if (statusFilter === 'mastered' && st !== 'mastered') return false;
          if (statusFilter === 'locked' && st !== 'locked') return false;
          if (statusFilter === 'available' && (st === 'mastered' || st === 'locked')) return false;
          if (!q) return true;
          return `${node.name} ${node.description ?? ''} ${ch.title}`.toLowerCase().includes(q);
        });
        return { ...ch, masteredCount, totalCount: ch.nodes.length, nodes };
      })
      .filter((ch) => ch.nodes.length > 0);
  }, [conceptChapters, learningStateMap, searchQuery, statusFilter]);

  const grades = gradeData ?? [];
  const courseName = courseData?.find((course) => course.id === courseId)?.title ?? courseId;

  const quizGrades = useMemo(() => grades.filter((item) => item.category === 'quiz'), [grades]);
  const assignmentGrades = useMemo(() => grades.filter((item) => item.category === 'assignment'), [grades]);
  const componentGrades = useMemo(
    () => grades.filter((item) => item.category === 'manual' || item.category === 'attendance'),
    [grades],
  );

  const gradeStats = useMemo(() => {
    const passedCount = quizGrades.filter((q) => q.passed === true || q.status === 'passed').length;
    const attemptedQuizzes = quizGrades.filter((q) => q.score !== null && q.maxScore > 0);
    const quizAvg10 =
      attemptedQuizzes.length > 0
        ? Number(
            (
              attemptedQuizzes.reduce((acc, q) => acc + ((q.score ?? 0) / q.maxScore) * 10, 0) /
              attemptedQuizzes.length
            ).toFixed(1),
          )
        : null;
    const gradedComponents = componentGrades.filter((c) => c.score !== null && c.weight !== null && c.maxScore > 0);
    const gradedWeightSum = gradedComponents.reduce((acc, c) => acc + (c.weight ?? 0), 0);
    const componentWeightedAvg10 =
      gradedWeightSum > 0
        ? Number(
            (
              gradedComponents.reduce((acc, c) => acc + ((c.score ?? 0) / c.maxScore) * 10 * (c.weight ?? 0), 0) /
              gradedWeightSum
            ).toFixed(1),
          )
        : null;
    return {
      passedCount,
      attemptedCount: attemptedQuizzes.length,
      quizAvg10,
      componentWeightedAvg10,
    };
  }, [quizGrades, componentGrades]);

  const gradeChapterOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const ch of conceptChapters) {
      map.set(ch.week, ch.title);
    }
    for (const q of quizGrades) {
      if (typeof q.chapterNumber === 'number' && !map.has(q.chapterNumber)) {
        map.set(q.chapterNumber, q.chapterTitle || `Chương ${q.chapterNumber}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [conceptChapters, quizGrades]);

  const filteredQuizGrades = useMemo(() => {
    if (gradeChapterFilter === 'all') return quizGrades;
    return quizGrades.filter((q) => q.chapterNumber === gradeChapterFilter);
  }, [quizGrades, gradeChapterFilter]);

  const chapterGradeRows = useMemo(() => {
    return conceptChapters
      .filter((ch) => gradeChapterFilter === 'all' || ch.week === gradeChapterFilter)
      .map((ch) => {
        const masteredCount = ch.nodes.filter((n) => learningStateMap.get(n.id)?.state === 'mastered').length;
        const chQuizzes = quizGrades.filter((q) => q.chapterNumber === ch.week);
        const passedQuizzes = chQuizzes.filter((q) => q.passed === true || q.status === 'passed').length;
        const attempted = chQuizzes.filter((q) => q.score !== null && q.maxScore > 0);
        const avg10 =
          attempted.length > 0
            ? Number(
                (attempted.reduce((acc, q) => acc + ((q.score ?? 0) / q.maxScore) * 10, 0) / attempted.length).toFixed(1),
              )
            : null;
        return {
          key: ch.key,
          week: ch.week,
          title: ch.title,
          masteredCount,
          totalCount: ch.nodes.length,
          pct: ch.nodes.length > 0 ? Math.round((masteredCount / ch.nodes.length) * 100) : 0,
          quizzesTotal: chQuizzes.length,
          quizzesPassed: passedQuizzes,
          avg10,
        };
      });
  }, [conceptChapters, learningStateMap, quizGrades, gradeChapterFilter]);

  const tabs: { id: DetailTab | 'graph'; label: string }[] = [
    { id: 'graph', label: isVi ? 'Lộ trình kiến nghị' : 'Recommended path' },
    { id: 'content', label: isVi ? 'Nội dung' : 'Content' },
    { id: 'grades', label: isVi ? 'Điểm số' : 'Grades' },
  ];

  const selectTab = (id: DetailTab | 'graph') => {
    navigate(id === 'graph' ? `/courses/${courseId}/graph` : `/courses/${courseId}/${id}`);
  };
  const totalContribution = [...componentGrades, ...assignmentGrades].reduce((sum, item) => (
    item.score !== null && item.weight !== null ? sum + (item.score / item.maxScore) * item.weight * 100 : sum
  ), 0);

  return (
    <div className="page course-detail-page">
      <AppHeader />
      <main className="container course-detail-content">
        <h1>{courseName}</h1>
        {coursesError && <p className="form-error" role="alert">{coursesError.message}</p>}
        <div className="tabs-pill course-detail-tabs">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'on' : ''} onClick={() => selectTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'content' && (
          <div className="course-detail-sections">
            <section className="course-activity-section" aria-labelledby="course-activity-heading">
              <h2 id="course-activity-heading">{isVi ? 'Hoạt động môn học' : 'Course activities'}</h2>
              <div className="course-activity-links">
                <Link to={`/courses/${courseId}/announcements`}><Bell size={17} />{isVi ? 'Thông báo' : 'Announcements'}<ChevronRight size={15} /></Link>
                <Link to={`/courses/${courseId}/attendance`}><CalendarCheck size={17} />{isVi ? 'Điểm danh' : 'Attendance'}<ChevronRight size={15} /></Link>
              </div>
            </section>

            {kgError && <p className="form-error" role="alert">{kgError.message}</p>}
            {kgLoading && !knowledgeGraph ? (
              <div className="course-detail-section">
                <p className="course-empty-section">{isVi ? 'Đang tải danh sách khái niệm theo chương...' : 'Loading chapter concepts...'}</p>
              </div>
            ) : conceptChapters.length === 0 ? (
              <div className="course-detail-section">
                <p className="course-empty-section">
                  {isVi
                    ? 'Giảng viên chưa xuất bản đồ thị khái niệm cho môn học này.'
                    : 'No published concept graph available for this course yet.'}
                </p>
              </div>
            ) : (
              <>
                <div className="student-chapter-summary">
                  <div style={{ flex: '1 1 260px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0c4a6e' }}>
                      {isVi ? 'Nội dung học tập theo Chương' : 'Chapter Study Content'} · {summaryStats.mastered}/{summaryStats.total}{' '}
                      {isVi ? `khái niệm đã vững (${summaryStats.pct}%)` : `mastered (${summaryStats.pct}%)`}
                    </div>
                    <div className="progress-track" style={{ height: 7, marginTop: 8, maxWidth: 360 }}>
                      <div className="progress-fill" style={{ width: `${summaryStats.pct}%` }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {summaryStats.nextNode && (
                      <button
                        type="button"
                        className="btn btn-primary sm"
                        onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(summaryStats.nextNode!.id)}`)}
                      >
                        {isVi ? `Học tiếp: ${summaryStats.nextNode.name}` : `Continue: ${summaryStats.nextNode.name}`} <ArrowRight size={13} />
                      </button>
                    )}
                    <Link to={`/courses/${courseId}/graph`} className="btn btn-outline sm">
                      {isVi ? 'Xem Lộ trình kiến nghị' : 'View Recommended Path'} <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>

                <div className="student-chapter-toolbar">
                  <label className="student-chapter-search">
                    <Search size={14} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={isVi ? 'Tìm khái niệm theo tên hoặc chương...' : 'Search concepts or chapters...'}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(
                      [
                        ['all', isVi ? 'Tất cả' : 'All'],
                        ['available', isVi ? 'Sẵn sàng học' : 'Available'],
                        ['mastered', isVi ? 'Đã vững' : 'Mastered'],
                        ['locked', isVi ? 'Khóa tiên quyết' : 'Locked'],
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        className={`btn sm ${statusFilter === k ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setStatusFilter(k)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="course-collapse-all"
                      onClick={() => setOpenChapters(Object.fromEntries(conceptChapters.map((c) => [c.key, true])))}
                    >
                      {isVi ? 'Mở tất cả' : 'Expand all'}
                    </button>
                    <button type="button" className="course-collapse-all" onClick={() => setOpenChapters({})}>
                      {isVi ? 'Thu gọn toàn bộ' : 'Collapse all'}
                    </button>
                  </div>
                </div>

                {filteredChapters.length === 0 ? (
                  <div className="course-detail-section">
                    <p className="course-empty-section">
                      {isVi ? 'Không có khái niệm nào khớp bộ lọc hiện tại.' : 'No concepts match your filter.'}
                    </p>
                  </div>
                ) : (
                  filteredChapters.map((ch) => {
                    const isSearching = Boolean(searchQuery.trim() || statusFilter !== 'all');
                    const open = isSearching ? true : Boolean(openChapters[ch.key]);
                    return (
                      <div className="course-detail-section" key={ch.key}>
                        <button
                          type="button"
                          className="course-detail-section-head"
                          aria-expanded={open}
                          onClick={() => setOpenChapters((cur) => ({ ...cur, [ch.key]: !open }))}
                        >
                          <span className="course-section-title">
                            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            {ch.title}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="student-chapter-progress-pill">
                              {ch.masteredCount}/{ch.totalCount} {isVi ? 'đã vững' : 'mastered'}
                            </span>
                            <small className="muted-s">{ch.totalCount} {isVi ? 'khái niệm' : 'concepts'}</small>
                          </span>
                        </button>
                        {open && (
                          <div className="course-resource-list" style={{ paddingLeft: 14 }}>
                            {ch.nodes.map((node) => {
                              const p = (node.properties ?? {}) as Record<string, unknown>;
                              const info = learningStateMap.get(node.id) ?? { state: 'unlearned' as StudentConceptStatus };
                              const contentCnt = Number(p.approved_content_count ?? 0);
                              const quizCnt = Number(p.published_quiz_count ?? 0);
                              const durationMin = Number(p.duration_min ?? 0);
                              const stepSeq = Number(p.step_seq ?? 0);
                              const isLocked = info.state === 'locked';
                              const isDone = info.state === 'mastered';
                              const isLearning = info.state === 'learning';

                              const metaParts: string[] = [];
                              if (contentCnt > 0) metaParts.push(`${contentCnt} bài học`);
                              if (quizCnt > 0) metaParts.push(`${quizCnt} quiz`);
                              if (durationMin > 0) metaParts.push(`~${durationMin}p`);

                              return (
                                <button
                                  key={node.id}
                                  type="button"
                                  className={`student-concept-row${isLocked ? ' is-locked' : ''}${isDone ? ' is-done' : ''}${isLearning ? ' is-learning' : ''}`}
                                  disabled={isLocked}
                                  onClick={() => !isLocked && navigate(`/courses/${courseId}/learn/${encodeURIComponent(node.id)}`)}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isDone ? (
                                      <CheckCircle2 size={17} color="#16a34a" />
                                    ) : isLocked ? (
                                      <Lock size={16} color="#b45309" />
                                    ) : (
                                      <BookOpen size={17} color="var(--primary)" />
                                    )}
                                  </span>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      {Number.isFinite(stepSeq) && stepSeq > 0 && (
                                        <span className="student-concept-seq">#{stepSeq}</span>
                                      )}
                                      <b style={{ color: 'var(--ink)' }}>{node.name}</b>
                                      {metaParts.length > 0 && (
                                        <span className="muted-xs">{metaParts.join(' · ')}</span>
                                      )}
                                    </span>
                                    {isLocked && info.lockReason && (
                                      <span className="muted-xs" style={{ display: 'block', color: '#b45309', marginTop: 2 }}>
                                        {info.lockReason}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`student-concept-cta ${isDone ? 'done' : isLocked ? 'locked' : 'ready'}`}
                                  >
                                    {isDone
                                      ? (isVi ? 'Ôn lại' : 'Review')
                                      : isLocked
                                        ? (isVi ? 'Khóa tiên quyết' : 'Locked')
                                        : isLearning
                                          ? (isVi ? 'Học ngay →' : 'Continue →')
                                          : (isVi ? 'Học ngay →' : 'Start →')}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}

        {tab === 'grades' && (
          <div className="student-grades-stack">
            {gradesError && <p className="form-error" role="alert">{gradesError.message}</p>}
            {gradesLoading && <p className="muted">{isVi ? 'Đang tải điểm...' : 'Loading grades...'}</p>}

            {/* KPI Summary Cards synced with active knowledge graph & quizzes */}
            <div className="student-grades-kpi-grid">
              <div className="student-grades-kpi-card">
                <span className="kpi-label">{isVi ? 'Làm chủ kiến thức' : 'Concept mastery'}</span>
                <strong className="kpi-value">
                  {summaryStats.mastered}/{summaryStats.total}{' '}
                  <small className="kpi-unit">({summaryStats.pct}%)</small>
                </strong>
                <div className="progress-track" style={{ height: 6, marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${summaryStats.pct}%` }} />
                </div>
              </div>
              <div className="student-grades-kpi-card">
                <span className="kpi-label">{isVi ? 'Bài kiểm tra (Quiz)' : 'Concept quizzes'}</span>
                <strong className="kpi-value">
                  {gradeStats.passedCount}/{quizGrades.length}{' '}
                  <small className="kpi-unit">{isVi ? 'đạt' : 'passed'}</small>
                </strong>
                <span className="kpi-sub">
                  {isVi ? `Đã làm ${gradeStats.attemptedCount} bài` : `${gradeStats.attemptedCount} attempted`}
                </span>
              </div>
              <div className="student-grades-kpi-card">
                <span className="kpi-label">{isVi ? 'Điểm TB Quiz (hệ 10)' : 'Quiz average (10pt)'}</span>
                <strong className="kpi-value">
                  {gradeStats.quizAvg10 === null ? '—' : `${gradeStats.quizAvg10.toLocaleString(isVi ? 'vi-VN' : 'en-US')}/10`}
                </strong>
                <span className="kpi-sub">
                  {isVi ? 'Tính từ điểm cao nhất mỗi quiz' : 'Best attempt per published quiz'}
                </span>
              </div>
              <div className="student-grades-kpi-card">
                <span className="kpi-label">{isVi ? 'Điểm thành phần học phần' : 'Course component avg'}</span>
                <strong className="kpi-value">
                  {gradeStats.componentWeightedAvg10 === null
                    ? '—'
                    : `${gradeStats.componentWeightedAvg10.toLocaleString(isVi ? 'vi-VN' : 'en-US')}/10`}
                </strong>
                <span className="kpi-sub">
                  {isVi
                    ? `Đóng góp hiện tại: ${Number(totalContribution.toFixed(1)).toLocaleString('vi-VN')}%`
                    : `Graded contribution: ${Number(totalContribution.toFixed(1))}%`}
                </span>
              </div>
            </div>

            {/* Block 1: Concept & Chapter Assessments */}
            <div className="course-grades-card">
              <div className="course-grades-heading" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={16} />
                  <strong>{isVi ? 'Đánh giá theo Nội dung môn học (Chương & Khái niệm hiện tại)' : 'Assessments by Active Chapters & Concepts'}</strong>
                </div>
                <div className="tabs-pill">
                  <button
                    type="button"
                    className={gradeViewMode === 'quizzes' ? 'on' : ''}
                    onClick={() => setGradeViewMode('quizzes')}
                  >
                    {isVi ? `Bài kiểm tra Khái niệm (${quizGrades.length})` : `Concept Quizzes (${quizGrades.length})`}
                  </button>
                  <button
                    type="button"
                    className={gradeViewMode === 'chapters' ? 'on' : ''}
                    onClick={() => setGradeViewMode('chapters')}
                  >
                    {isVi ? `Tổng hợp theo Chương (${conceptChapters.length})` : `By Chapter (${conceptChapters.length})`}
                  </button>
                </div>
              </div>

              {gradeChapterOptions.length > 0 && (
                <div className="student-grades-toolbar">
                  <button
                    type="button"
                    className={`grade-chapter-pill${gradeChapterFilter === 'all' ? ' on' : ''}`}
                    onClick={() => setGradeChapterFilter('all')}
                  >
                    {isVi ? 'Tất cả chương' : 'All chapters'}
                  </button>
                  {gradeChapterOptions.map(([wk, label]) => (
                    <button
                      key={wk}
                      type="button"
                      className={`grade-chapter-pill${gradeChapterFilter === wk ? ' on' : ''}`}
                      onClick={() => setGradeChapterFilter(wk)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {gradeViewMode === 'quizzes' ? (
                filteredQuizGrades.length === 0 ? (
                  <div className="student-grades-empty">
                    <p className="muted">
                      {isVi
                        ? 'Chưa có bài kiểm tra (quiz) nào được xuất bản cho nội dung đang lọc.'
                        : 'No published concept quizzes match the selected chapter.'}
                    </p>
                    <button type="button" className="btn btn-outline sm" onClick={() => selectTab('content')}>
                      {isVi ? 'Sang tab Nội dung →' : 'Go to Content →'}
                    </button>
                  </div>
                ) : (
                  <div className="course-grades-table-wrap">
                    <table className="course-grades-table student-quiz-grades-table">
                      <thead>
                        <tr>
                          <th>{isVi ? 'Chương / Khái niệm / Quiz' : 'Chapter / Concept / Quiz'}</th>
                          <th>{isVi ? 'Lượt làm' : 'Attempts'}</th>
                          <th>{isVi ? 'Số câu đúng' : 'Correct'}</th>
                          <th>{isVi ? 'Điểm & Tỷ lệ' : 'Score'}</th>
                          <th>{isVi ? 'Trạng thái' : 'Status'}</th>
                          <th>{isVi ? 'Cập nhật' : 'Submitted'}</th>
                          <th>{isVi ? 'Thao tác' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuizGrades.map((item) => {
                          const status = item.status ?? 'not_started';
                          const statusLabel =
                            status === 'passed'
                              ? (isVi ? `Đạt (≥ ${Math.round(item.passScorePct ?? 70)}%)` : 'Passed')
                              : status === 'failed'
                                ? (isVi ? 'Chưa đạt' : 'Not passed')
                                : (isVi ? 'Chưa làm' : 'Not started');
                          const formattedTime = item.submittedAt
                            ? new Date(item.submittedAt).toLocaleString(isVi ? 'vi-VN' : 'en-US', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—';
                          return (
                            <tr key={item.id}>
                              <td>
                                <span className="grade-item-icon"><HelpCircle size={14} /></span>
                                <span>
                                  <small>
                                    {item.chapterNumber ? `Chương ${item.chapterNumber}` : (item.chapterTitle ?? (isVi ? 'Toàn môn' : 'Course-wide'))}
                                    {item.conceptTitle ? ` · ${item.conceptTitle}` : ''}
                                  </small>
                                  <strong>{isVi ? item.titleVi : item.titleEn}</strong>
                                </span>
                              </td>
                              <td>{item.attemptsUsed ?? 0}/{item.attemptsAllowed ?? 1}</td>
                              <td>
                                {item.correctCount !== null && item.correctCount !== undefined && item.totalQuestions
                                  ? `${item.correctCount}/${item.totalQuestions}`
                                  : `—/${item.totalQuestions ?? 0}`}
                              </td>
                              <td>
                                {item.score === null ? (
                                  '—'
                                ) : (
                                  <span>
                                    <strong>{item.score.toLocaleString(isVi ? 'vi-VN' : 'en-US')}/{item.maxScore}</strong>
                                    {item.scorePct !== null && item.scorePct !== undefined && (
                                      <span className="muted-xs" style={{ marginLeft: 6 }}>({item.scorePct}%)</span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className={`grade-status-pill ${status}`}>{statusLabel}</span>
                              </td>
                              <td className="muted-s">{formattedTime}</td>
                              <td>
                                {item.quizId ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline sm"
                                    onClick={() => navigate(`/courses/${courseId}/quizzes/${encodeURIComponent(item.quizId!)}`)}
                                  >
                                    {status === 'not_started'
                                      ? (isVi ? 'Làm bài →' : 'Start →')
                                      : (isVi ? 'Ôn / Làm lại →' : 'Review →')}
                                  </button>
                                ) : item.conceptId ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline sm"
                                    onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(item.conceptId!)}`)}
                                  >
                                    {isVi ? 'Mở bài học →' : 'Open →'}
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                chapterGradeRows.length === 0 ? (
                  <div className="student-grades-empty">
                    <p className="muted">
                      {isVi ? 'Chưa có chương nào trong đồ thị môn học hiện tại.' : 'No chapters found in current course graph.'}
                    </p>
                  </div>
                ) : (
                  <div className="course-grades-table-wrap">
                    <table className="course-grades-table student-quiz-grades-table">
                      <thead>
                        <tr>
                          <th>{isVi ? 'Chương' : 'Chapter'}</th>
                          <th>{isVi ? 'Khái niệm đã vững' : 'Mastered concepts'}</th>
                          <th>{isVi ? 'Quiz đã đạt' : 'Quizzes passed'}</th>
                          <th>{isVi ? 'Điểm TB Quiz (hệ 10)' : 'Quiz Avg (10pt)'}</th>
                          <th>{isVi ? 'Thao tác' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapterGradeRows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <span className="grade-item-icon"><BookOpen size={14} /></span>
                              <span>
                                <small>Chương {row.week}</small>
                                <strong>{row.title}</strong>
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <strong>{row.masteredCount}/{row.totalCount}</strong>
                                <span className="muted-xs">({row.pct}%)</span>
                              </div>
                            </td>
                            <td>
                              {row.quizzesTotal > 0 ? `${row.quizzesPassed}/${row.quizzesTotal}` : <span className="muted-xs">—</span>}
                            </td>
                            <td>
                              {row.avg10 === null ? '—' : <strong>{row.avg10.toLocaleString(isVi ? 'vi-VN' : 'en-US')}/10</strong>}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline sm"
                                onClick={() => {
                                  setOpenChapters((prev) => ({ ...prev, [row.key]: true }));
                                  selectTab('content');
                                }}
                              >
                                {isVi ? 'Học chương →' : 'Study chapter →'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Block 2: Assignments (if any) & Official Course Component Grades */}
            <div className="course-grades-card">
              <div className="course-grades-heading">
                <ChevronDown size={15} />
                <strong>{isVi ? `Điểm thành phần học phần — ${courseName}` : `Course Component Grades — ${courseName}`}</strong>
              </div>
              <div className="course-grades-table-wrap">
                <table className="course-grades-table">
                  <thead>
                    <tr>
                      <th>{isVi ? 'Mục điểm' : 'Grade item'}</th>
                      <th>{isVi ? 'Trọng số' : 'Weight'}</th>
                      <th>{isVi ? 'Điểm' : 'Score'}</th>
                      <th>{isVi ? 'Thang điểm' : 'Scale'}</th>
                      <th>{isVi ? 'Phần trăm' : 'Percentage'}</th>
                      <th>{isVi ? 'Phản hồi' : 'Feedback'}</th>
                      <th>{isVi ? 'Đóng góp' : 'Contribution'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...assignmentGrades, ...componentGrades].map((item) => {
                      const percent = item.score === null || item.maxScore <= 0 ? null : (item.score / item.maxScore) * 100;
                      const contribution = percent !== null && item.weight !== null ? percent * item.weight : null;
                      const catLabel =
                        item.category === 'assignment'
                          ? (isVi ? 'Bài tập' : 'Assignment')
                          : item.category === 'manual'
                            ? (isVi ? 'Điểm thành phần' : 'Course component')
                            : (isVi ? 'Chuyên cần' : 'Attendance');
                      return (
                        <tr key={item.id}>
                          <td>
                            <span className="grade-item-icon">
                              {item.category === 'assignment' ? (
                                <ClipboardList size={14} />
                              ) : item.category === 'manual' ? (
                                <Edit3 size={14} />
                              ) : (
                                <Users size={14} />
                              )}
                            </span>
                            <span>
                              <small>{catLabel}</small>
                              <strong>{isVi ? item.titleVi : item.titleEn}</strong>
                            </span>
                          </td>
                          <td>{item.weight === null ? '—' : `${(item.weight * 100).toLocaleString(isVi ? 'vi-VN' : 'en-US')}%`}</td>
                          <td>{item.score === null ? '—' : item.score.toLocaleString(isVi ? 'vi-VN' : 'en-US')}</td>
                          <td>0–{item.maxScore}</td>
                          <td>{percent === null ? '—' : `${Number(percent.toFixed(1)).toLocaleString(isVi ? 'vi-VN' : 'en-US')}%`}</td>
                          <td>{item.feedback ?? '—'}</td>
                          <td>{contribution === null ? '—' : `${Number(contribution.toFixed(1)).toLocaleString(isVi ? 'vi-VN' : 'en-US')}%`}</td>
                        </tr>
                      );
                    })}
                    <tr className="course-grade-total">
                      <td><Sigma size={15} /> {isVi ? 'Tổng đóng góp đã có điểm' : 'Graded contribution'}</td>
                      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                      <td>{Number(totalContribution.toFixed(1)).toLocaleString(isVi ? 'vi-VN' : 'en-US')}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
