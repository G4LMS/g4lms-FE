import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Network,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import { AppHeader } from '../features/layout/AppHeader';
import { CourseIndexSidebar } from '../features/courses/CourseIndexSidebar';
import type { Quiz } from '../types';

type LearnTab = 'materials' | 'details' | 'practice';

function readStudentDomains(userId?: string): string[] {
  try {
    const raw = localStorage.getItem(`g4lms.preferences.${userId ?? 'guest'}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { domains?: string[] };
      if (Array.isArray(parsed.domains) && parsed.domains.length) return parsed.domains;
    }
  } catch {
    /* ignore */
  }
  return ['Lập trình'];
}

function buildPersonalizedAnalogy(nodeName: string, domain: string, description: string): string {
  const d = domain.toLowerCase();
  if (d.includes('trí tuệ') || d.includes('khoa học dữ liệu')) {
    return `Trong ${domain}, "${nodeName}" đóng vai trò như một thành phần cốt lõi trong pipeline xử lý dữ liệu và tối ưu hóa mô hình: ${description || `giúp tổ chức và suy luận tri thức có cấu trúc, giảm chi phí tính toán khi dữ liệu mở rộng.`}`;
  }
  if (d.includes('kinh tế') || d.includes('tài chính')) {
    return `Liên hệ với ${domain}, hãy hình dung "${nodeName}" giống như quy trình điều phối luồng giao dịch và phân bổ nguồn lực tối ưu: ${description || `mỗi bước đều cần minh bạch điều kiện tiên quyết để tránh tắc nghẽn hệ thống.`}`;
  }
  if (d.includes('vật lý') || d.includes('kỹ thuật')) {
    return `Ở góc nhìn ${domain}, "${nodeName}" tương tự một mắt xích truyền dẫn năng lượng và tín hiệu ổn định trong hệ thống: ${description || `nếu hiểu rõ cơ chế vận hành cốt lõi, bạn có thể dự đoán chính xác trạng thái của toàn mạch.`}`;
  }
  return `Hãy tưởng tượng trong ${domain}, "${nodeName}" giống như một cấu trúc hoặc giao thức chuẩn hóa giúp hệ thống chạy ổn định và dễ mở rộng: ${description || `khi nắm vững nguyên lý này, bạn sẽ dễ dàng debug và tối ưu hiệu năng khi bài toán tăng kích thước.`}`;
}

export default function StudentNodeLearnPage() {
  const { courseId = '', nodeId = '' } = useParams();
  const decodedNodeId = decodeURIComponent(nodeId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const [tab, setTab] = useState<LearnTab>('materials');
  const [markedDone, setMarkedDone] = useState(false);
  const [aiVote, setAiVote] = useState<'up' | 'down' | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  const studentDomains = useMemo(() => readStudentDomains(user?.id), [user?.id]);
  const primaryDomain = studentDomains[0] ?? 'Lập trình';

  const { data: graphData, loading: kgLoading } = useAsync(
    () => (courseId ? api.getKnowledgeGraph(courseId) : Promise.resolve(null)),
    [courseId],
  );
  const { data: nodeDetail } = useAsync(
    () => (decodedNodeId ? api.getNodeDetail(decodedNodeId).catch(() => null) : Promise.resolve(null)),
    [decodedNodeId],
  );
  const { data: courseQuizzes } = useAsync<Quiz[]>(
    () => (courseId ? api.getQuizzes(courseId, 'student').catch(() => []) : Promise.resolve([])),
    [courseId],
  );

  const nodeModel = useMemo(() => {
    if (!graphData) return null;
    const node = graphData.nodes.find((n) => n.id === decodedNodeId);
    if (!node) return null;

    const props = (node.properties ?? {}) as Record<string, unknown>;
    const prereqNodes = graphData.edges
      .filter((e) => e.type === 'PREREQUISITE' && e.target === node.id)
      .map((e) => graphData.nodes.find((n) => n.id === e.source))
      .filter(Boolean);
    const nextNodes = graphData.edges
      .filter((e) => e.type === 'PREREQUISITE' && e.source === node.id)
      .map((e) => graphData.nodes.find((n) => n.id === e.target))
      .filter(Boolean);
    const childNodes = graphData.edges
      .filter((e) => e.type === 'PART_OF' && e.target === node.id)
      .map((e) => graphData.nodes.find((n) => n.id === e.source))
      .filter((n) => n && n.type !== 'Content');
    const explainNodes = graphData.edges
      .filter((e) => e.type === 'EXPLAIN' && e.target === node.id)
      .map((e) => graphData.nodes.find((n) => n.id === e.source))
      .filter(Boolean);
    const itemNodes = graphData.edges
      .filter((e) => e.type === 'ASSESS' && e.target === node.id)
      .map((e) => graphData.nodes.find((n) => n.id === e.source))
      .filter(Boolean);
    const allStudyNodes = graphData.nodes.filter((n) => n.type !== 'Content' && n.type !== 'Course');

    return { node, props, prereqNodes, nextNodes, childNodes, explainNodes, itemNodes, allStudyNodes };
  }, [graphData, decodedNodeId]);

  const props = nodeModel?.props ?? {};
  const evidenceList = Array.isArray(props.evidence)
    ? (props.evidence as Array<{ slide_id?: string; slideId?: string; quote?: string }>)
    : [];
  const rawDetails = Array.isArray(props.details)
    ? (props.details as Array<{ name?: string; evidence?: Array<{ slide_id?: string; slideId?: string; quote?: string }> }>)
    : [];
  const rawAspects = Array.isArray(props.aspects)
    ? (props.aspects as Array<{ name?: string; slide_ids?: string[] }>)
    : [];

  const detailItems = useMemo(() => {
    const items: Array<{ name: string; source?: string }> = [];
    rawDetails.forEach((d) => {
      if (d.name) {
        const ev = d.evidence?.[0];
        items.push({
          name: d.name,
          source: ev?.quote ? `"${ev.quote}" (${ev.slide_id ?? ev.slideId ?? ''})` : undefined,
        });
      }
    });
    rawAspects.forEach((a) => {
      if (a.name) {
        items.push({
          name: a.name,
          source: a.slide_ids?.length ? `Slide: ${a.slide_ids.join(', ')}` : undefined,
        });
      }
    });
    if (items.length === 0 && nodeModel) {
      nodeModel.childNodes.forEach((c) => {
        if (c) items.push({ name: c.name, source: c.description });
      });
    }
    if (items.length === 0 && nodeModel?.explainNodes.length) {
      nodeModel.explainNodes.forEach((ex) => {
        if (ex) items.push({ name: ex.name, source: ex.description });
      });
    }
    return items;
  }, [rawDetails, rawAspects, nodeModel]);

  const matchingQuiz = useMemo(() => {
    const list = courseQuizzes ?? [];
    if (!list.length) return null;
    const chapterRaw = String(props.chapter_id ?? props.chapterId ?? '').toLowerCase();
    const chNum = chapterRaw.match(/\d+/)?.[0];
    if (chNum) {
      const byChapter = list.find((q) => q.id.includes(`ch${chNum}`) || q.title.toLowerCase().includes(`chương ${chNum}`));
      if (byChapter) return byChapter;
    }
    return list[0];
  }, [courseQuizzes, props]);

  const durationMin = props.duration_min ?? props.durationMin;
  const defaultWeek = props.default_week ?? props.defaultWeek;
  const nodeName = nodeModel?.node.name ?? nodeDetail?.title ?? decodedNodeId;
  const nodeDesc = nodeModel?.node.description || '';
  const sourceCitation =
    evidenceList[0]?.slide_id ??
    evidenceList[0]?.slideId ??
    nodeModel?.explainNodes[0]?.name ??
    `${courseId} · Slide bài giảng`;

  return (
    <div className="page course-detail-page">
      <AppHeader />
      <CourseIndexSidebar courseId={courseId} role="student" activeItemId={decodedNodeId} />
      <main className="container course-detail-content" style={{ maxWidth: 1040 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline sm"
            onClick={() => navigate(`/courses/${courseId}/graph`)}
          >
            <ArrowLeft size={13} /> {isVi ? 'Quay lại bản đồ' : 'Back to graph'}
          </button>
          <span className="pill-badge blue">{nodeModel?.node.type ?? 'Concept'}</span>
          {durationMin != null && (
            <span className="pill-badge muted">
              <Clock size={11} style={{ marginRight: 4 }} /> {String(durationMin)} phút
            </span>
          )}
          {defaultWeek != null && (
            <span className="pill-badge muted">Tuần {String(defaultWeek)}</span>
          )}
        </div>

        {kgLoading && !nodeModel ? (
          <p className="muted">{isVi ? 'Đang tải bài học...' : 'Loading lesson...'}</p>
        ) : !nodeModel && !nodeDetail ? (
          <div className="admin-card" style={{ padding: 20 }}>
            <p className="muted">{isVi ? 'Không tìm thấy thông tin node này trong đồ thị.' : 'Node not found in graph.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gap: 18, alignItems: 'start' }}>
            <div>
              {/* Header + Completion bar (giống G4LMS) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <h1 style={{ fontSize: 24, marginBottom: 6 }}>{nodeName}</h1>
                  <button
                    type="button"
                    className={`btn ${markedDone ? 'btn-outline' : 'btn-primary'} sm`}
                    onClick={() => setMarkedDone((v) => !v)}
                  >
                    <CheckCircle2 size={14} />
                    {markedDone ? (isVi ? 'Đã hoàn thành' : 'Completed') : (isVi ? 'Đánh dấu đã học' : 'Mark complete')}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    flexWrap: 'wrap',
                    padding: '9px 14px',
                    borderRadius: 8,
                    background: '#f4f7f9',
                    border: '1px solid var(--line)',
                    fontSize: 13,
                  }}
                >
                  <b>{isVi ? 'Điều kiện hoàn thành:' : 'Completion:'}</b>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontWeight: 600 }}>
                    <Check size={14} /> {isVi ? 'Xem nội dung' : 'View content'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: markedDone ? 'var(--green)' : 'var(--muted)' }}>
                    {markedDone ? <Check size={14} /> : <Circle size={13} />} {isVi ? 'Đạt bài kiểm tra ≥ 70%' : 'Pass quiz ≥ 70%'}
                  </span>
                  <span className="muted-s" style={{ marginLeft: 'auto' }}>
                    {isVi ? 'Hoàn thành tự động khi đủ điều kiện' : 'Auto-completed when met'}
                  </span>
                </div>
              </div>

              <div className="tabs-pill course-detail-tabs" style={{ marginBottom: 14 }}>
                <button className={tab === 'materials' ? 'on' : ''} onClick={() => setTab('materials')}>
                  <FileText size={14} /> {isVi ? 'Nội dung & Trích dẫn' : 'Content & Citations'}
                </button>
                <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>
                  <BookOpen size={14} /> {isVi ? 'Nội dung chi tiết' : 'Detailed breakdown'}
                </button>
                <button className={tab === 'practice' ? 'on' : ''} onClick={() => setTab('practice')}>
                  <Sparkles size={14} /> {isVi ? 'Kiểm tra nhanh' : 'Practice'}
                </button>
              </div>

              {tab === 'materials' && (
                <div className="admin-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Khái niệm */}
                  <div>
                    <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isVi ? 'Khái niệm' : 'Concept'}</h2>
                    {Array.isArray(props.aliases) && props.aliases.length > 0 && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                        <b>{isVi ? 'Tên gọi khác:' : 'Aliases:'}</b> {(props.aliases as string[]).join(', ')}
                      </div>
                    )}
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text)' }}>
                      {nodeDesc || `${nodeName} là một khái niệm trọng tâm trong môn ${courseId}, giúp hình thành nền tảng cho các chủ đề tiếp theo.`}
                    </p>
                    {Boolean(props.outcome) && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)' }}>
                        <b>{isVi ? 'Mục tiêu đầu ra:' : 'Learning outcome:'}</b> {String(props.outcome)}
                      </div>
                    )}
                  </div>

                  {/* Giải thích theo sở thích của bạn (giống G4LMS) */}
                  <div>
                    <h2 style={{ fontSize: 16, marginBottom: 10 }}>
                      {isVi ? `Giải thích theo sở thích của bạn (${primaryDomain})` : `Personalized explanation (${primaryDomain})`}
                    </h2>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        border: '1.5px solid #bae6fd',
                        background: '#f0f9ff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: 999,
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          <Sparkles size={12} /> {isVi ? 'Tạo bởi AI' : 'Generated by AI'}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.65, color: '#0f172a' }}>
                        {buildPersonalizedAnalogy(nodeName, primaryDomain, nodeDesc)}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                        <FileText size={13} />
                        <span>{isVi ? 'Dựa trên:' : 'Based on:'} <b>{sourceCitation}</b></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                        <span style={{ fontSize: 13, color: '#475569' }}>{isVi ? 'Giải thích này có hữu ích không?' : 'Was this helpful?'}</span>
                        <button
                          type="button"
                          className={`btn sm ${aiVote === 'up' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setAiVote('up')}
                        >
                          <ThumbsUp size={12} /> {isVi ? 'Hữu ích' : 'Helpful'}
                        </button>
                        <button
                          type="button"
                          className={`btn sm ${aiVote === 'down' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setAiVote('down')}
                        >
                          <ThumbsDown size={12} /> {isVi ? 'Không hữu ích' : 'Not helpful'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Trích dẫn từ bài giảng */}
                  {(evidenceList.length > 0 || (nodeModel?.explainNodes.length ?? 0) > 0) && (
                    <div>
                      <h2 style={{ fontSize: 15, marginBottom: 8 }}>{isVi ? 'Tài liệu & Trích dẫn gốc' : 'Source slides & quotes'}</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {evidenceList.map((ev, idx) => (
                          <div key={idx} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                              {ev.slide_id ?? ev.slideId ?? `Slide #${idx + 1}`}
                            </div>
                            {ev.quote && <p style={{ marginTop: 4, fontStyle: 'italic', lineHeight: 1.5 }}>"{ev.quote}"</p>}
                          </div>
                        ))}
                        {nodeModel?.explainNodes.map((cnt) => cnt && (
                          <div key={cnt.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{cnt.name}</div>
                              {cnt.description && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{cnt.description}</div>}
                            </div>
                            <span className="pill-badge muted" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Slide / PDF</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kiểm tra mức nắm vững (giống G4LMS) */}
                  {matchingQuiz && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{isVi ? 'Kiểm tra mức nắm vững' : 'Mastery check'}</div>
                        <div style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13, marginTop: 3 }}>{matchingQuiz.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {matchingQuiz.questions.length} câu hỏi · {matchingQuiz.timeLimitMinutes} phút · Còn {Math.max(1, matchingQuiz.attemptsAllowed - matchingQuiz.attemptsUsed)} lần làm
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/courses/${courseId}/quizzes/${matchingQuiz.id}`)}
                      >
                        {isVi ? 'Làm bài kiểm tra' : 'Start quiz'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'details' && (
                <div className="admin-card" style={{ padding: 20 }}>
                  <h2 style={{ fontSize: 16, marginBottom: 10 }}>{isVi ? 'Các ý trọng tâm cần nắm' : 'Key sub-topics'}</h2>
                  {detailItems.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.65 }}>
                      <p>{nodeDesc}</p>
                      {Boolean(props.outcome) && (
                        <p><b>{isVi ? 'Chuẩn đầu ra cần đạt:' : 'Target outcome:'}</b> {String(props.outcome)}</p>
                      )}
                    </div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.6 }}>
                      {detailItems.map((d, idx) => (
                        <li key={idx}>
                          <b>{d.name}</b>
                          {d.source && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{d.source}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'practice' && (
                <div className="admin-card" style={{ padding: 20 }}>
                  <h2 style={{ fontSize: 16, marginBottom: 10 }}>{isVi ? 'Câu hỏi kiểm tra khái niệm' : 'Concept check items'}</h2>
                  {matchingQuiz ? (
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
                        <b>{matchingQuiz.title}</b> · {matchingQuiz.questions.length} câu hỏi luyện tập nhanh
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {matchingQuiz.questions.slice(0, 3).map((q, qIdx) => (
                          <div key={q.id} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)' }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                              Câu {qIdx + 1}: {q.prompt}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {q.options.map((opt) => {
                                const chosen = selectedAnswers[q.id] === opt.id;
                                return (
                                  <label
                                    key={opt.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 12px',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      border: `1px solid ${chosen ? 'var(--primary)' : 'var(--line)'}`,
                                      background: chosen ? 'var(--primary-soft)' : '#fff',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name={`practice-${q.id}`}
                                      checked={chosen}
                                      onChange={() => setSelectedAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                                    />
                                    <span>{opt.text}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => navigate(`/courses/${courseId}/quizzes/${matchingQuiz.id}`)}
                        >
                          {isVi ? 'Làm bài Quiz chính thức →' : 'Take full quiz →'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => navigate(`/courses/${courseId}/quizzes`)}
                        >
                          {isVi ? 'Xem tất cả Quiz' : 'All quizzes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate(`/courses/${courseId}/quizzes`)}
                    >
                      {isVi ? 'Mở danh sách Quiz môn học' : 'Open course quizzes'}
                    </button>
                  )}
                </div>
              )}

              {/* Bottom Prev / Jump / Next bar (giống G4LMS) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                {nodeModel?.prereqNodes[0] ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(nodeModel.prereqNodes[0]!.id)}`)}
                  >
                    ‹ {isVi ? 'Hoạt động trước:' : 'Prev:'} {nodeModel.prereqNodes[0]!.name}
                  </button>
                ) : (
                  <span />
                )}

                <select
                  aria-label="Chuyển đến bài khác"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) navigate(`/courses/${courseId}/learn/${encodeURIComponent(e.target.value)}`);
                  }}
                  style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', maxWidth: 220 }}
                >
                  <option value="">{isVi ? 'Chuyển đến...' : 'Jump to...'}</option>
                  {(nodeModel?.allStudyNodes ?? []).slice(0, 40).map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>

                {nodeModel?.nextNodes[0] ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(nodeModel.nextNodes[0]!.id)}`)}
                  >
                    {isVi ? 'Hoạt động tiếp theo:' : 'Next:'} {nodeModel.nextNodes[0]!.name} ›
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </div>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <section className="admin-card" style={{ padding: 14 }}>
                <h2 style={{ fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Network size={14} /> {isVi ? 'Kiến thức tiên quyết' : 'Prerequisites'}
                </h2>
                {(nodeModel?.prereqNodes.length ?? 0) === 0 ? (
                  <p className="muted-s">{isVi ? 'Không có điều kiện tiên quyết.' : 'No prerequisites.'}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nodeModel?.prereqNodes.map((p) => p && (
                      <button
                        key={p.id}
                        type="button"
                        className="btn btn-outline sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(p.id)}`)}
                      >
                        ← {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-card" style={{ padding: 14 }}>
                <h2 style={{ fontSize: 13, marginBottom: 8 }}>{isVi ? 'Bài học tiếp theo' : 'Next recommended'}</h2>
                {(nodeModel?.nextNodes.length ?? 0) === 0 ? (
                  <p className="muted-s">{isVi ? 'Đây là nút cuối nhánh.' : 'End of branch.'}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nodeModel?.nextNodes.map((n) => n && (
                      <button
                        key={n.id}
                        type="button"
                        className="btn btn-outline sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => navigate(`/courses/${courseId}/learn/${encodeURIComponent(n.id)}`)}
                      >
                        → {n.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
