import { ChevronDown, ClipboardList, FileText, List, PanelLeftClose, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAsync } from '../common/useAsync';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  courseId: string;
  role: 'student' | 'teacher';
  activeItemId?: string;
  topOffset?: number;
}

export function CourseIndexSidebar({ courseId, role, activeItemId, topOffset = 62 }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ materials: true, overview: true, ch1: true, ch2: true });

  const { data: sectionsData } = useAsync(
    () => (courseId ? api.getCourseSections(courseId).catch(() => []) : Promise.resolve([])),
    [courseId],
  );
  const { data: quizzesData } = useAsync(
    () => (courseId ? api.getQuizzes(courseId, role).catch(() => []) : Promise.resolve([])),
    [courseId, role],
  );
  const { data: assignmentsData } = useAsync(
    () => (courseId ? api.getAssignments(courseId, role).catch(() => []) : Promise.resolve([])),
    [courseId, role],
  );

  const sections = (sectionsData ?? []).filter((s) => !['announcements', 'assignments', 'quizzes'].includes(s.id));
  const chapterSections = sections.filter((s) => s.id !== 'materials' && s.id !== 'overview');
  const quizzes = quizzesData ?? [];
  const assignments = assignmentsData ?? [];

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      {/* Floating / inline toggle button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={isVi ? 'Mở mục lục khóa học' : 'Open course index'}
          title={isVi ? 'Mục lục khóa học' : 'Course index'}
          style={{
            position: 'fixed',
            left: 14,
            top: topOffset,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 999,
            border: '1px solid var(--line)',
            background: '#fff',
            color: 'var(--ink)',
            fontWeight: 600,
            fontSize: 12,
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
          }}
        >
          <List size={15} color="var(--primary)" />
          <span>{isVi ? 'Mục lục' : 'Index'}</span>
        </button>
      )}

      {/* Backdrop + Drawer */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              top: 44,
              background: 'rgba(15, 23, 42, 0.25)',
              zIndex: 35,
            }}
          />
          <aside
            aria-label={isVi ? 'Mục lục khóa học' : 'Course index'}
            style={{
              position: 'fixed',
              left: 0,
              top: 44,
              bottom: 0,
              width: 290,
              maxWidth: '88vw',
              background: '#fff',
              borderRight: '1px solid var(--line)',
              boxShadow: '6px 0 24px rgba(15, 23, 42, 0.12)',
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
                {isVi ? 'Mục lục khóa học' : 'Course index'}
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

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sections.map((sec) => {
                const isOpen = !!expanded[sec.id];
                const chIdx = chapterSections.findIndex((c) => c.id === sec.id);
                const isChapter = chIdx >= 0;
                const chAssignments = isChapter
                  ? assignments.filter((_, i) => i % Math.max(1, chapterSections.length) === chIdx)
                  : [];
                const chQuizzes = isChapter
                  ? quizzes.filter((qz, i) => {
                      const numMatch = sec.id.match(/\d+/)?.[0];
                      if (numMatch && (qz.id.includes(`ch${numMatch}`) || qz.title.toLowerCase().includes(`quiz ${numMatch}`))) {
                        return true;
                      }
                      return i % Math.max(1, chapterSections.length) === chIdx;
                    })
                  : [];

                return (
                  <div key={sec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      onClick={() => toggle(sec.id)}
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
                        {isVi ? sec.titleVi : sec.titleEn}
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 8px 8px 26px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {sec.items
                          .filter((it) => it.kind !== 'quiz')
                          .map((it) => (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                navigate(role === 'teacher' ? `/teacher/courses/${courseId}/content` : `/courses/${courseId}/content`);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '5px 8px',
                                border: 0,
                                borderRadius: 6,
                                background: it.id === activeItemId ? 'var(--primary-soft)' : 'transparent',
                                color: 'var(--primary)',
                                textAlign: 'left',
                                fontSize: 12,
                              }}
                            >
                              {it.kind === 'video' ? <PlayCircle size={14} style={{ flexShrink: 0 }} /> : <FileText size={14} style={{ flexShrink: 0 }} />}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {isVi ? it.nameVi : it.nameEn}
                              </span>
                            </button>
                          ))}

                        {chAssignments.map((asg) => (
                          <button
                            key={asg.id}
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate(role === 'teacher' ? `/teacher/courses/${courseId}/assignments` : `/courses/${courseId}/assignments`);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                              padding: '5px 8px',
                              border: 0,
                              borderRadius: 6,
                              background: 'transparent',
                              color: 'var(--ink)',
                              textAlign: 'left',
                              fontSize: 12,
                            }}
                          >
                            <ClipboardList size={14} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {asg.title}
                            </span>
                          </button>
                        ))}

                        {chQuizzes.map((qz) => (
                          <button
                            key={qz.id}
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate(role === 'teacher' ? `/teacher/courses/${courseId}/quizzes` : `/courses/${courseId}/quizzes/${qz.id}`);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                              padding: '5px 8px',
                              border: 0,
                              borderRadius: 6,
                              background: qz.id === activeItemId ? 'var(--primary-soft)' : 'transparent',
                              color: 'var(--primary)',
                              textAlign: 'left',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            <FileText size={14} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {qz.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
