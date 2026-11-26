import { BookOpen, CheckCircle2, ChevronDown, List, Lock, PanelLeftClose } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { KnowledgeGraphNode } from '../../types';
import { useAsync } from '../common/useAsync';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  courseId: string;
  role: 'student' | 'teacher';
  activeItemId?: string;
  topOffset?: number;
  inline?: boolean;
}

function formatChapterLabel(weekNum: number, raw?: unknown): string {
  const clean = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  if (!clean || /^(Tuần|Week|Chương|Chapter)\s+\d+$/i.test(clean)) return `Chương ${weekNum}`;
  if (/^(Tuần|Week)\s+\d+/i.test(clean)) return clean.replace(/^(Tuần|Week)\s+(\d+)/i, 'Chương $2');
  if (/^(Chương|Chapter)\s+/i.test(clean)) return clean;
  return `Chương ${weekNum}: ${clean}`;
}

export function CourseIndexSidebar({ courseId, role, activeItemId, topOffset = 68, inline = false }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: knowledgeGraph, loading } = useAsync(
    () => (courseId ? api.getKnowledgeGraph(courseId).catch(() => null) : Promise.resolve(null)),
    [courseId],
  );

  const chapters = useMemo(() => {
    const concepts = (knowledgeGraph?.nodes ?? []).filter((n) => n.type === 'Concept');
    if (!concepts.length) return [];
    const byWeek = new Map<number, { key: string; week: number; title: string; nodes: KnowledgeGraphNode[] }>();
    for (const n of concepts) {
      const p = (n.properties ?? {}) as Record<string, unknown>;
      const wk = Number(p.chapter_number ?? p.week ?? p.default_week ?? 1) || 1;
      const title = formatChapterLabel(wk, p.chapter_title ?? p.chapterTitle);
      const existing = byWeek.get(wk);
      if (existing) {
        existing.nodes.push(n);
        if (title.length > existing.title.length && !/^Chương \d+$/i.test(title)) {
          existing.title = title;
        }
      } else {
        byWeek.set(wk, { key: `ch-${wk}`, week: wk, title, nodes: [n] });
      }
    }
    return Array.from(byWeek.values())
      .sort((a, b) => a.week - b.week)
      .map((ch) => ({
        ...ch,
        nodes: [...ch.nodes].sort((a, b) => {
          const sa = Number((a.properties ?? {}).step_seq);
          const sb = Number((b.properties ?? {}).step_seq);
          const hasA = Number.isFinite(sa) && sa > 0;
          const hasB = Number.isFinite(sb) && sb > 0;
          if (hasA && hasB && sa !== sb) return sa - sb;
          if (hasA !== hasB) return hasA ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
      }));
  }, [knowledgeGraph]);

  useEffect(() => {
    if (!chapters.length) return;
    setExpanded((prev) => (Object.keys(prev).length > 0 ? prev : { [chapters[0].key]: true }));
  }, [chapters]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      {!open && (
        <button
          type="button"
          className={`course-index-trigger${inline ? ' inline' : ''}`}
          onClick={() => setOpen(true)}
          aria-label={isVi ? 'Mở mục lục khóa học' : 'Open course index'}
          title={isVi ? 'Mục lục khóa học' : 'Course index'}
          style={inline ? undefined : { top: topOffset }}
        >
          <List size={15} color="var(--primary)" />
          <span>{isVi ? 'Mục lục' : 'Index'}</span>
        </button>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              top: 52,
              background: 'rgba(15, 23, 42, 0.28)',
              backdropFilter: 'blur(2px)',
              zIndex: 35,
            }}
          />
          <aside
            aria-label={isVi ? 'Mục lục khóa học' : 'Course index'}
            style={{
              position: 'fixed',
              left: 0,
              top: 52,
              bottom: 0,
              width: 310,
              maxWidth: '88vw',
              background: '#fff',
              borderRight: '1px solid var(--line)',
              boxShadow: '6px 0 24px rgba(15, 23, 42, 0.14)',
              zIndex: 40,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid var(--line)',
                background: 'var(--bg)',
              }}
            >
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>
                {isVi ? 'Mục lục theo Chương' : 'Course Chapter Index'}
              </strong>
              <button
                type="button"
                className="kg-btn sm"
                onClick={() => setOpen(false)}
                aria-label={isVi ? 'Đóng mục lục' : 'Close index'}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {loading && !chapters.length && (
                <p className="muted-s" style={{ padding: 14 }}>
                  {isVi ? 'Đang tải danh sách khái niệm...' : 'Loading chapters...'}
                </p>
              )}
              {!loading && !chapters.length && (
                <p className="muted-s" style={{ padding: 14 }}>
                  {isVi ? 'Chưa có khái niệm nào được xuất bản.' : 'No published concepts yet.'}
                </p>
              )}
              {chapters.map((ch) => {
                const isOpen = !!expanded[ch.key];
                return (
                  <div key={ch.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      onClick={() => toggle(ch.key)}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        border: 0,
                        background: 'none',
                        textAlign: 'left',
                      }}
                    >
                      <ChevronDown
                        size={14}
                        color="var(--muted)"
                        style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: '0.15s', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
                        {ch.title}
                      </span>
                      <span className="muted-xs">{ch.nodes.length}</span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 8px 8px 26px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {ch.nodes.map((node) => {
                          const p = (node.properties ?? {}) as Record<string, unknown>;
                          const ls = String(p.learning_state ?? p.learningState ?? 'unlearned');
                          const isLocked = role === 'student' && ls === 'locked';
                          const isDone = ls === 'mastered';
                          return (
                            <button
                              key={node.id}
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                if (isLocked) return;
                                setOpen(false);
                                navigate(
                                  role === 'teacher'
                                    ? `/teacher/courses/${courseId}/content?nodeId=${encodeURIComponent(node.id)}`
                                    : `/courses/${courseId}/learn/${encodeURIComponent(node.id)}`,
                                );
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '6px 8px',
                                border: 0,
                                borderRadius: 6,
                                background: node.id === activeItemId ? 'var(--primary-soft)' : 'transparent',
                                color: isLocked ? 'var(--muted)' : 'var(--primary)',
                                opacity: isLocked ? 0.6 : 1,
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                textAlign: 'left',
                                fontSize: 12.5,
                              }}
                            >
                              {isDone ? (
                                <CheckCircle2 size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                              ) : isLocked ? (
                                <Lock size={13} color="#b45309" style={{ flexShrink: 0 }} />
                              ) : (
                                <BookOpen size={14} style={{ flexShrink: 0 }} />
                              )}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {node.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: 10, borderTop: '1px solid var(--line)', background: '#f8fafc' }}>
              <button
                type="button"
                className="btn btn-outline sm"
                style={{ width: '100%' }}
                onClick={() => {
                  setOpen(false);
                  navigate(role === 'teacher' ? `/teacher/courses/${courseId}/content` : `/courses/${courseId}/content`);
                }}
              >
                {isVi ? 'Mở toàn bộ Nội dung môn học →' : 'Open Course Content →'}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
