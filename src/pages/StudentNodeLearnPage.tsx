import {
  ArrowLeft,
  Check,
  Circle,
  ClipboardList,
  Clock,
  FileText,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import { AppHeader } from '../features/layout/AppHeader';
import { CourseIndexSidebar } from '../features/courses/CourseIndexSidebar';
import { resolveRichConceptContent } from '../../mockdata/conceptDetails';
import type { Quiz } from '../types';

type LearnTab = 'content' | 'exercises';

export default function StudentNodeLearnPage() {
  const { courseId = '', nodeId = '' } = useParams();
  const decodedNodeId = decodeURIComponent(nodeId);
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const [tab, setTab] = useState<LearnTab>('content');

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

    const uniqueById = <T extends { id: string }>(list: Array<T | undefined>): T[] => {
      const seen = new Set<string>();
      const out: T[] = [];
      for (const item of list) {
        if (!item || item.id === node.id || seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
      return out;
    };

    const props = (node.properties ?? {}) as Record<string, unknown>;
    const prereqNodes = uniqueById(
      graphData.edges
        .filter((e) => e.type === 'PREREQUISITE' && e.target === node.id)
        .map((e) => graphData.nodes.find((n) => n.id === e.source)),
    );
    const nextNodes = uniqueById(
      graphData.edges
        .filter((e) => e.type === 'PREREQUISITE' && e.source === node.id)
        .map((e) => graphData.nodes.find((n) => n.id === e.target)),
    );
    const childNodes = uniqueById(
      graphData.edges
        .filter((e) => e.type === 'PART_OF' && e.target === node.id)
        .map((e) => graphData.nodes.find((n) => n.id === e.source))
        .filter((n) => n && n.type !== 'Content'),
    );
    const explainNodes = uniqueById(
      graphData.edges
        .filter((e) => e.type === 'EXPLAIN' && e.target === node.id)
        .map((e) => graphData.nodes.find((n) => n.id === e.source)),
    );
    const itemNodes = uniqueById(
      graphData.edges
        .filter((e) => e.type === 'ASSESS' && e.target === node.id)
        .map((e) => graphData.nodes.find((n) => n.id === e.source)),
    );
    return { node, props, prereqNodes, nextNodes, childNodes, explainNodes, itemNodes };
  }, [graphData, decodedNodeId]);

  const props = nodeModel?.props ?? {};
  type EvidenceItem = { slide_id?: string; slideId?: string; quote?: string };
  type DetailItem = { name?: string; evidence?: EvidenceItem[] };
  const rawEvidence = Array.isArray(props.evidence) ? (props.evidence as EvidenceItem[]) : [];
  const rawDetails = Array.isArray(props.details) ? (props.details as DetailItem[]) : [];
  const rawAspects = Array.isArray(props.aspects)
    ? (props.aspects as Array<{ name?: string; slide_ids?: string[] }>)
    : [];

  const richFallback = useMemo(() => {
    if (!nodeModel) return null;
    if (rawEvidence.length > 0 || rawDetails.length > 0 || rawAspects.length > 0) return null;
    return resolveRichConceptContent(
      nodeModel.node.name,
      nodeModel.node.description,
      typeof props.outcome === 'string' ? props.outcome : undefined,
    );
  }, [nodeModel, rawEvidence.length, rawDetails.length, rawAspects.length, props.outcome]);

  const evidenceList: EvidenceItem[] = rawEvidence.length > 0 ? rawEvidence : (richFallback?.evidence ?? []);

  const contentBlocks = useMemo(() => {
    const blocks: Array<{ title: string; body?: string; source?: string }> = [];
    if (nodeDetail?.contents?.length) {
      nodeDetail.contents.forEach((c) => {
        blocks.push({
          title: c.title,
          body: c.bodyText ?? undefined,
          source: c.url ?? (c.role === 'example' ? 'Ví dụ' : 'Định nghĩa'),
        });
      });
    }
    const detailsToUse: DetailItem[] = rawDetails.length > 0 ? rawDetails : (blocks.length === 0 ? (richFallback?.details ?? []) : []);
    detailsToUse.forEach((d) => {
      if (d.name) {
        const ev = d.evidence?.[0];
        blocks.push({
          title: d.name,
          body: ev?.quote ? `"${ev.quote}"` : undefined,
          source: ev?.slide_id ?? ev?.slideId,
        });
      }
    });
    rawAspects.forEach((a) => {
      if (a.name) {
        blocks.push({
          title: a.name,
          source: a.slide_ids?.length ? `Slide: ${a.slide_ids.join(', ')}` : undefined,
        });
      }
    });
    return blocks;
  }, [nodeDetail?.contents, rawDetails, rawAspects, richFallback]);

  const matchingQuiz = useMemo(() => {
    const list = courseQuizzes ?? [];
    if (!list.length) return null;
    if (nodeDetail?.quizIds?.length) {
      const byDetail = list.find((q) => nodeDetail.quizIds!.includes(q.id));
      if (byDetail) return byDetail;
    }
    const byConcept = list.find((q) => q.conceptId === decodedNodeId);
    if (byConcept) return byConcept;
    const chapterRaw = String(props.chapter_id ?? props.chapterId ?? '').toLowerCase();
    const chNum = chapterRaw.match(/\d+/)?.[0];
    if (chNum) {
      const byChapter = list.find((q) => q.id.includes(`ch${chNum}`) || q.title.toLowerCase().includes(`buổi học ${chNum}`));
      if (byChapter) return byChapter;
    }
    return list[0];
  }, [courseQuizzes, nodeDetail?.quizIds, decodedNodeId, props]);

  const durationMin = props.duration_min ?? props.durationMin;
  const defaultWeek = props.default_week ?? props.defaultWeek ?? props.week;
  const nodeName = nodeModel?.node.name ?? nodeDetail?.title ?? decodedNodeId;
  const rawDesc = nodeModel?.node.description || '';
  const nodeDesc =
    richFallback && rawDesc.startsWith('Chủ đề trọng tâm #')
      ? richFallback.description
      : rawDesc;
  const nodeOutcome = typeof props.outcome === 'string' && props.outcome ? props.outcome : richFallback?.outcome;
  const sourceCitation =
    evidenceList[0]?.slide_id ??
    evidenceList[0]?.slideId ??
    nodeModel?.explainNodes[0]?.name ??
    `${courseId} · Slide bài giảng`;

  const isMastered =
    String(props.learning_state ?? props.learningState ?? '') === 'mastered' ||
    (typeof props.mastery === 'number' && props.mastery >= 70);

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
            <span className="pill-badge muted">Buổi học {String(defaultWeek)}</span>
          )}
        </div>

        {kgLoading && !nodeModel ? (
          <p className="muted">{isVi ? 'Đang tải bài học...' : 'Loading lesson...'}</p>
        ) : !nodeModel && !nodeDetail ? (
          <div className="admin-card" style={{ padding: 20 }}>
            <p className="muted">{isVi ? 'Không tìm thấy thông tin node này trong đồ thị.' : 'Node not found in graph.'}</p>
          </div>
        ) : (
          <div>
            <div>
              {/* Header + Completion bar (hệ thống tự động cập nhật khi đạt >= 70%) */}
              <div style={{ marginBottom: 12 }}>
                <h1 style={{ fontSize: 24, marginBottom: 8 }}>{nodeName}</h1>

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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isMastered ? 'var(--green)' : 'var(--muted)', fontWeight: isMastered ? 600 : 400 }}>
                    {isMastered ? <Check size={14} /> : <Circle size={13} />} {isVi ? 'Đạt bài kiểm tra ≥ 70%' : 'Pass quiz ≥ 70%'}
                  </span>
                  <span className="muted-s" style={{ marginLeft: 'auto' }}>
                    {isMastered
                      ? (isVi ? 'Đã hoàn thành & mở khóa bài tiếp theo' : 'Completed & unlocked next')
                      : (isVi ? 'Hệ thống tự động hoàn thành khi đạt ≥ 70%' : 'Auto-completed when quiz ≥ 70%')}
                  </span>
                </div>
              </div>

              <div className="tabs-pill course-detail-tabs" style={{ marginBottom: 14 }}>
                <button className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>
                  <FileText size={14} /> {isVi ? 'Nội dung' : 'Content'}
                </button>
                <button className={tab === 'exercises' ? 'on' : ''} onClick={() => setTab('exercises')}>
                  <ClipboardList size={14} /> {isVi ? 'Bài tập' : 'Exercises'}
                </button>
              </div>

              {tab === 'content' && (
                <div className="admin-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Nội dung chính của bài học (tổng hợp trực tiếp từ mô tả & nội dung trích dẫn) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: 17, margin: 0 }}>{isVi ? 'Nội dung bài học' : 'Lesson content'}</h2>
                      <span className="pill-badge muted" style={{ fontSize: 12 }}>
                        <FileText size={11} style={{ marginRight: 4 }} /> {sourceCitation}
                      </span>
                    </div>

                    {Array.isArray(props.aliases) && props.aliases.length > 0 && (
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        <b>{isVi ? 'Tên gọi khác:' : 'Aliases:'}</b> {(props.aliases as string[]).join(', ')}
                      </div>
                    )}

                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        background: '#f8fafc',
                        border: '1px solid var(--line)',
                        fontSize: 14.5,
                        lineHeight: 1.7,
                        color: 'var(--text)',
                      }}
                    >
                      {nodeDesc || `${nodeName} là một khái niệm trọng tâm trong môn ${courseId}, giúp hình thành nền tảng cho các chủ đề tiếp theo.`}
                    </div>

                    {evidenceList.filter((ev) => ev.quote).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {evidenceList
                          .filter((ev) => ev.quote)
                          .map((ev, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '12px 16px',
                                borderRadius: 8,
                                borderLeft: '3px solid var(--primary)',
                                background: '#ffffff',
                                borderTop: '1px solid var(--line)',
                                borderRight: '1px solid var(--line)',
                                borderBottom: '1px solid var(--line)',
                                fontSize: 14,
                                lineHeight: 1.65,
                                color: 'var(--text)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 12,
                              }}
                            >
                              <span>{ev.quote}</span>
                              {(ev.slide_id ?? ev.slideId) && (
                                <span className="pill-badge muted" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {ev.slide_id ?? ev.slideId}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {contentBlocks.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {contentBlocks.map((b, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 8,
                              border: '1px solid var(--line)',
                              background: '#ffffff',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{b.title}</div>
                              {b.source && (
                                <span className="pill-badge muted" style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: 11 }}>
                                  {b.source}
                                </span>
                              )}
                            </div>
                            {b.body && (
                              <div style={{ fontSize: 13.5, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.55 }}>{b.body}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {(nodeModel?.explainNodes.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {nodeModel?.explainNodes.map((cnt) => {
                          if (!cnt) return null;
                          const isGeneric = cnt.description?.startsWith('Tài liệu bài giảng giải thích chi tiết');
                          const displayQuote = isGeneric ? (evidenceList[0]?.quote ?? '') : (cnt.description ?? '');
                          if (!displayQuote && isGeneric) return null;

  return (
                            <div
                              key={cnt.id}
                              style={{
                                padding: '12px 16px',
                                borderRadius: 8,
                                borderLeft: '3px solid var(--primary)',
                                borderTop: '1px solid var(--line)',
                                borderRight: '1px solid var(--line)',
                                borderBottom: '1px solid var(--line)',
                                background: '#ffffff',
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--primary)' }}>{cnt.name}</div>
                              {displayQuote && (
                                <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 4, lineHeight: 1.65 }}>
                                  "{displayQuote}"
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {Boolean(nodeOutcome) && (
                      <div style={{ padding: '11px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13.5, color: '#166534' }}>
                        <b>{isVi ? 'Mục tiêu cần đạt:' : 'Learning outcome:'}</b> {String(nodeOutcome)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'exercises' && (
                <div className="admin-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 17, marginBottom: 4 }}>{isVi ? 'Bài tập & Kiểm tra mức nắm vững' : 'Exercises & Mastery Quiz'}</h2>
                    <p className="muted-s">
                      {isVi
                        ? 'Hoàn thành bài kiểm tra (Quiz) gắn với khái niệm này để hệ thống cập nhật mức độ làm chủ.'
                        : 'Complete the quiz for this concept to update your mastery level.'}
                    </p>
                  </div>

                  {matchingQuiz ? (
                    <div
                      style={{
                        padding: '16px 18px',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 14,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{matchingQuiz.title}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                          {matchingQuiz.questions.length} câu hỏi · {matchingQuiz.timeLimitMinutes} phút · {isVi ? 'Không giới hạn số lần làm' : 'Unlimited attempts'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/courses/${courseId}/quizzes/${matchingQuiz.id}?nodeId=${encodeURIComponent(decodedNodeId)}`)}
                      >
                        {isVi ? 'Làm bài kiểm tra' : 'Start quiz'}
                      </button>
                    </div>
                  ) : (
                    <p className="muted-s">{isVi ? 'Chưa có bài Quiz riêng cho khái niệm này.' : 'No quiz linked to this concept yet.'}</p>
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

                {isMastered && nodeModel?.nextNodes[0] ? (
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
          </div>
        )}
      </main>
    </div>
  );
}
