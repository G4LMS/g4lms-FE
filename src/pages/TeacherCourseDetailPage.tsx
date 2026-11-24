import { Bell, CalendarCheck, ChevronDown, ChevronRight, ClipboardList, FileText, FolderOpen, Plus, Search, SlidersHorizontal, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import type { CourseSection, RosterStudent, TeacherCourseTopic, TeacherGradeRow } from '../types';

const TABS = [
  ['graph', 'Lộ trình'],
  ['content', 'Nội dung'],
  ['students', 'Học viên'],
] as const;

export default function TeacherCourseDetailPage() {
  const { courseId = '', tab = 'content' } = useParams();
  const nav = useNavigate();
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [progressFilter, setProgressFilter] = useState<'all' | 'good' | 'mid' | 'low'>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ materials: true, overview: true, ch1: true });
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [creatingSection, setCreatingSection] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [studentSubTab, setStudentSubTab] = useState<'overview' | 'gradebook' | 'attendance'>(
    tab === 'grades' ? 'gradebook' : 'overview',
  );
  const isVi = language === 'vi';
  const { data: courseData, error: coursesError } = useAsync(() => api.getTeacherCourses(), []);
  const { data: rosterData, loading: rosterLoading, error: rosterError } =
    useAsync<RosterStudent[]>(() => api.getTeacherRoster(courseId), [courseId]);
  const { data: gradebookData, loading: gradebookLoading, error: gradebookError } =
    useAsync<TeacherGradeRow[]>(() => api.getTeacherGradebook(courseId), [courseId]);
  const { data: topicData, loading: topicsLoading, error: topicsError } =
    useAsync<TeacherCourseTopic[]>(() => api.getTeacherCourseTopics(courseId), [courseId]);
  const { data: sectionData } =
    useAsync(() => api.getCourseSections(courseId).catch(() => []), [courseId]);
  const { data: attendanceData } =
    useAsync(() => api.getTeacherAttendance(courseId).catch(() => []), [courseId]);
  const { data: assignmentsData } =
    useAsync(() => api.getAssignments(courseId, 'teacher').catch(() => []), [courseId]);
  const { data: quizzesData } =
    useAsync(() => api.getQuizzes(courseId, 'teacher').catch(() => []), [courseId]);
  const { data: filesData } =
    useAsync(() => api.getCourseFiles(courseId).catch(() => []), [courseId]);

  const roster = rosterData ?? [];
  const [gradebook, setGradebook] = useState<TeacherGradeRow[]>([]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [gradeDraft, setGradeDraft] = useState<{ midterm: string; project: string; final: string; attendance: string }>({
    midterm: '',
    project: '',
    final: '',
    attendance: '',
  });
  const [gradeMessage, setGradeMessage] = useState('');
  const [gradeError, setGradeError] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  const defaultWeights = { midterm: 30, project: 25, final: 35, attendance: 10 };
  const [weights, setWeights] = useState(() => {
    try {
      const raw = localStorage.getItem(`g4lms.gradeWeights.${courseId}`);
      if (raw) return { ...defaultWeights, ...(JSON.parse(raw) as typeof defaultWeights) };
    } catch { /* ignore */ }
    return defaultWeights;
  });
  const [weightDraft, setWeightDraft] = useState(weights);
  const [editingWeights, setEditingWeights] = useState(false);

  const computeTotal = (row: TeacherGradeRow): number | null => {
    if (row.midterm == null || row.project == null || row.final == null || row.attendance == null) {
      return row.totalScore;
    }
    return Number((
      (row.midterm * weights.midterm +
        row.project * weights.project +
        row.final * weights.final +
        (row.attendance / 10) * weights.attendance) /
      100
    ).toFixed(1));
  };

  useEffect(() => {
    if (gradebookData) setGradebook(gradebookData);
  }, [gradebookData]);

  useEffect(() => {
    if (sectionData) setSections(sectionData);
  }, [sectionData]);

  const topics = topicData ?? [];
  const courseName = courseData?.find((course) => course.id === courseId)?.title ?? courseId;

  const students = useMemo(
    () =>
      roster.filter((student) =>
        `${student.id} ${student.name} ${student.email ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [query, roster],
  );

  const selectTab = (id: string) => {
    nav(
      id === 'graph'
        ? `/teacher/courses/${courseId}/graph`
        : `/teacher/courses/${courseId}/${id}`,
    );
  };

  const startEditGrade = (student: TeacherGradeRow) => {
    setEditingStudentId(student.id);
    setGradeDraft({
      midterm: student.midterm !== null ? String(student.midterm) : '',
      project: student.project !== null ? String(student.project) : '',
      final: student.final !== null ? String(student.final) : '',
      attendance: student.attendance !== null ? String(student.attendance) : '',
    });
    setGradeError('');
    setGradeMessage('');
  };

  const saveGradeRow = async (studentId: string) => {
    const parseOpt = (val: string) => (val.trim() === '' ? null : Number(val));
    const midterm = parseOpt(gradeDraft.midterm);
    const project = parseOpt(gradeDraft.project);
    const final = parseOpt(gradeDraft.final);
    const attendance = parseOpt(gradeDraft.attendance);
    setSavingGrade(true);
    setGradeError('');
    setGradeMessage('');
    try {
      const updated = await api.updateTeacherGradebookRow(courseId, studentId, {
        midterm,
        project,
        final,
        attendance,
      });
      setGradebook((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditingStudentId(null);
      setGradeMessage(isVi ? `Đã cập nhật điểm cho ${updated.name}.` : `Updated grades for ${updated.name}.`);
    } catch (reason) {
      setGradeError(reason instanceof Error ? reason.message : 'Không thể lưu điểm.');
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="page course-detail-page teacher-course-detail">
      <AppHeader />
      <main className="container course-detail-content">
        <h1>{courseName}</h1>
        {coursesError && <p className="form-error" role="alert">{coursesError.message}</p>}
        <div className="tabs-pill course-detail-tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={tab === id || (id === 'students' && tab === 'grades') ? 'on' : ''}
              onClick={() => selectTab(id)}
            >
              {isVi
                ? label
                : ({
                    graph: 'Path',
                    content: 'Content',
                    students: 'Students',
                  } as Record<string, string>)[id]}
            </button>
          ))}
        </div>

        {tab === 'content' && (
          <div className="course-detail-sections">
            <section className="course-activity-section" aria-labelledby="teacher-activity-heading">
              <h2 id="teacher-activity-heading">{isVi ? 'Hoạt động môn học' : 'Course activities'}</h2>
              <div className="course-activity-links">
                <Link to={`/teacher/courses/${courseId}/announcements`}>
                  <Bell size={17} />{isVi ? 'Quản lý Thông báo' : 'Manage Announcements'}<ChevronRight size={15} />
                </Link>
                <Link to={`/teacher/courses/${courseId}/attendance`}>
                  <CalendarCheck size={17} />{isVi ? 'Quản lý Điểm danh' : 'Manage Attendance'}<ChevronRight size={15} />
                </Link>
                <Link to={`/teacher/courses/${courseId}/files`}>
                  <FolderOpen size={17} />{isVi ? 'Quản lý Tài liệu / Slide' : 'Manage Files / Slides'}<ChevronRight size={15} />
                </Link>
                <Link to={`/teacher/courses/${courseId}/adaptive`}>
                  <SlidersHorizontal size={17} />{isVi ? 'Cài đặt thích ứng' : 'Adaptive settings'}<ChevronRight size={15} />
                </Link>
              </div>
            </section>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary sm"
                onClick={() => setAddingSection((v) => !v)}
              >
                <Plus size={13} /> {isVi ? 'Thêm buổi học / khung mới' : 'Add session / section'}
              </button>
              <button type="button" className="course-collapse-all" onClick={() => setOpenSections({})}>
                {isVi ? 'Thu gọn toàn bộ' : 'Collapse all'}
              </button>
            </div>

            {addingSection && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)' }}>
                <input
                  type="text"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  placeholder={isVi ? 'Ví dụ: Buổi học 6: Thuật toán nâng cao...' : 'e.g. Session 6: Advanced Algorithms...'}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff' }}
                />
                <button
                  type="button"
                  className="btn btn-primary sm"
                  disabled={creatingSection || !newSectionTitle.trim()}
                  onClick={async () => {
                    const title = newSectionTitle.trim();
                    if (!title || creatingSection) return;
                    setCreatingSection(true);
                    setSectionError('');
                    try {
                      const created = await api.createCourseSection(courseId, { titleVi: title, titleEn: title });
                      setSections((prev) => [...prev, created]);
                      setOpenSections((c) => ({ ...c, [created.id]: true }));
                      setNewSectionTitle('');
                      setAddingSection(false);
                    } catch (reason) {
                      setSectionError(reason instanceof Error ? reason.message : 'Không thể tạo buổi học mới.');
                    } finally {
                      setCreatingSection(false);
                    }
                  }}
                >
                  {creatingSection ? (isVi ? 'Đang tạo...' : 'Creating...') : (isVi ? 'Tạo khung' : 'Create')}
                </button>
                <button type="button" className="btn btn-outline sm" onClick={() => setAddingSection(false)}>
                  {isVi ? 'Hủy' : 'Cancel'}
                </button>
              </div>
            )}
            {sectionError && <p className="form-error" role="alert">{sectionError}</p>}

            {/* Các khung nội dung môn học (Tài liệu + từng Buổi học tích hợp Bài tập, Quiz, Tệp) */}
            {topicsError && <p className="form-error" role="alert">{topicsError.message}</p>}
            {topicsLoading && <p className="muted">{isVi ? 'Đang tải nội dung...' : 'Loading course content...'}</p>}
            {(() => {
              const contentSections = sections.filter(
                (s) => !['announcements', 'assignments', 'quizzes', 'materials', 'overview'].includes(s.id),
              );
              const chapterSections = contentSections;
              const allAssignments = assignmentsData ?? [];
              const allQuizzes = quizzesData ?? [];
              const allFiles = filesData ?? [];

              return contentSections.map((section) => {
                const open = !!openSections[section.id];
                const chIdx = chapterSections.findIndex((c) => c.id === section.id);
                const isChapter = chIdx >= 0;

                const chapterAssignments = isChapter
                  ? allAssignments.filter((_, i) => i % Math.max(1, chapterSections.length) === chIdx)
                  : [];
                const chapterQuizzes = isChapter
                  ? allQuizzes.filter((qz, i) => {
                      const numMatch = section.id.match(/\d+/)?.[0];
                      if (numMatch && (qz.id.includes(`ch${numMatch}`) || qz.title.toLowerCase().includes(`quiz ${numMatch}`))) {
                        return true;
                      }
                      return i % Math.max(1, chapterSections.length) === chIdx;
                    })
                  : [];
                const chapterFiles =
                  section.id === 'materials' || section.id === 'overview'
                    ? allFiles
                    : [];

                return (
                  <div className="course-detail-section" key={section.id}>
                    <button
                      type="button"
                      className="course-detail-section-head"
                      aria-expanded={open}
                      onClick={() => setOpenSections((c) => ({ ...c, [section.id]: !c[section.id] }))}
                    >
                      <span className="course-section-title">
                        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        {isVi ? section.titleVi : section.titleEn}
                      </span>
                    </button>
                    {open && (
                      <div className="course-resource-list">
                        {section.items
                          .filter((item) => item.kind !== 'quiz')
                          .map((item) => (
                            <div key={item.id} className="course-resource">
                              <FileText size={16} />
                              <span>{isVi ? item.nameVi : item.nameEn}</span>
                              <small>{item.kind.toUpperCase()}</small>
                            </div>
                          ))}
                        {chapterFiles.map((f) => (
                          <Link to={`/teacher/courses/${courseId}/files`} key={f.id} className="course-resource">
                            <FolderOpen size={16} />
                            <span>{f.name}</span>
                            <small>{Math.max(1, Math.round(f.sizeBytes / 1024))} KB</small>
                          </Link>
                        ))}
                        {chapterAssignments.map((asg) => (
                          <Link to={`/teacher/courses/${courseId}/assignments`} key={asg.id} className="course-resource">
                            <ClipboardList size={16} />
                            <span>{asg.title}</span>
                            <small>{asg.status === 'published' ? (isVi ? 'Bài tập · Đã công bố' : 'Assignment · Published') : (isVi ? 'Bài tập · Nháp' : 'Assignment · Draft')}</small>
                          </Link>
                        ))}
                        {chapterQuizzes.map((qz) => (
                          <Link to={`/teacher/courses/${courseId}/quizzes`} key={qz.id} className="course-resource">
                            <FileText size={16} />
                            <span>{qz.title}</span>
                            <small>Quiz · {qz.questions.length} câu · {qz.timeLimitMinutes}p</small>
                          </Link>
                        ))}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
                          <Link to={`/teacher/courses/${courseId}/assignments`} className="btn btn-outline sm">
                            {isVi ? '+ Thêm Bài tập' : '+ Add Assignment'}
                          </Link>
                          <Link to={`/teacher/courses/${courseId}/quizzes`} className="btn btn-outline sm">
                            {isVi ? '+ Thêm Quiz' : '+ Add Quiz'}
                          </Link>
                          <Link to={`/teacher/courses/${courseId}/files`} className="btn btn-outline sm">
                            {isVi ? '+ Tải Tệp / Slide' : '+ Upload File'}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}

            {!(sectionData ?? []).some((s) => s.id.startsWith('ch')) &&
              topics.map((topic) => (
                <div className="course-detail-section" key={topic.id}>
                  <div className="course-detail-section-head">
                    <span className="course-section-title">
                      <b>{topic.number}</b> · {isVi ? topic.titleVi : topic.titleEn}
                    </span>
                    <small className="muted-s">{topic.resources.join(' · ')}</small>
                  </div>
                </div>
              ))}
          </div>
        )}

        {(tab === 'students' || tab === 'grades') && (
          <section className="teacher-students-card">
            <div className="teacher-students-heading" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Users size={18} />
                <strong>
                  {isVi ? 'Học viên' : 'Students'} · {roster.length}
                </strong>
                <div className="tabs-pill" style={{ marginLeft: 8 }}>
                  <button
                    type="button"
                    className={studentSubTab === 'overview' ? 'on' : ''}
                    onClick={() => setStudentSubTab('overview')}
                  >
                    {isVi ? 'Tiến độ học tập' : 'Learning progress'}
                  </button>
                  <button
                    type="button"
                    className={studentSubTab === 'gradebook' ? 'on' : ''}
                    onClick={() => setStudentSubTab('gradebook')}
                  >
                    {isVi ? 'Bảng điểm chi tiết' : 'Gradebook'}
                  </button>
                  <button
                    type="button"
                    className={studentSubTab === 'attendance' ? 'on' : ''}
                    onClick={() => setStudentSubTab('attendance')}
                  >
                    {isVi ? 'Điểm danh' : 'Attendance'} ({(attendanceData ?? []).length})
                  </button>
                </div>
              </div>
              {studentSubTab !== 'attendance' && (
                <label>
                  <Search size={14} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={isVi ? 'Tìm học viên theo mã, tên, email...' : 'Search students...'}
                  />
                </label>
              )}
            </div>

            {studentSubTab === 'overview' && (() => {
              const totalConcepts = courseId === 'CO3093' ? 28 : 24;
              const avgProgress = roster.length
                ? Math.round(roster.reduce((sum, s) => sum + s.progress, 0) / roster.length)
                : 0;
              const goodCount = roster.filter((s) => s.progress >= 80).length;
              const midCount = roster.filter((s) => s.progress >= 50 && s.progress < 80).length;
              const lowCount = roster.filter((s) => s.progress < 50).length;
              const filteredProgressStudents = students.filter((s) => {
                if (progressFilter === 'good') return s.progress >= 80;
                if (progressFilter === 'mid') return s.progress >= 50 && s.progress < 80;
                if (progressFilter === 'low') return s.progress < 50;
                return true;
              });
              const weakConcepts = courseId === 'CO3093'
                ? ['TCP Congestion Control', 'Subnets & CIDR', 'DNS Caching', 'Link-State Routing']
                : ['Cấp phát động & Con trỏ', 'Xóa node Danh sách liên kết', 'Phép xoay cây AVL', 'Dijkstra'];

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: '12px 0' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
                      <div className="muted-xs">{isVi ? 'Sĩ số lớp' : 'Class size'}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{roster.length}</div>
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <div className="muted-xs">{isVi ? 'Tiến độ trung bình' : 'Average progress'}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0369a1' }}>{avgProgress}%</div>
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div className="muted-xs">{isVi ? 'Hoàn thành tốt (≥ 80%)' : 'On track (≥ 80%)'}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#047857' }}>{goodCount}</div>
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                      <div className="muted-xs">{isVi ? 'Cần hỗ trợ (< 50%)' : 'Needs support (< 50%)'}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#be123c' }}>{lowCount}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(
                      [
                        ['all', `${isVi ? 'Tất cả' : 'All'} (${roster.length})`],
                        ['good', `${isVi ? 'Tốt ≥ 80%' : 'Good ≥ 80%'} (${goodCount})`],
                        ['mid', `${isVi ? 'Đang học 50–79%' : 'In progress 50–79%'} (${midCount})`],
                        ['low', `${isVi ? 'Cần hỗ trợ < 50%' : 'Needs help < 50%'} (${lowCount})`],
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        className={`btn sm ${progressFilter === k ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setProgressFilter(k)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {rosterError && <p className="form-error" role="alert">{rosterError.message}</p>}
                  {rosterLoading && <p className="muted">{isVi ? 'Đang tải danh sách...' : 'Loading roster...'}</p>}
                  <div className="teacher-students-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{isVi ? 'Mã SV' : 'ID'}</th>
                          <th>{isVi ? 'Họ và tên' : 'Full name'}</th>
                          <th style={{ width: 95 }}>{isVi ? 'Tiến độ' : 'Progress'}</th>
                          <th>{isVi ? 'Khái niệm đạt' : 'Concepts mastered'}</th>
                          <th>{isVi ? 'Khái niệm cần ôn' : 'Concept to review'}</th>
                          <th>{isVi ? 'Mức độ' : 'Status'}</th>
                          <th>{isVi ? 'Thời điểm cập nhật' : 'Last synced'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProgressStudents.map((student, idx) => {
                          const masteredCount = Math.round((student.progress / 100) * totalConcepts);
                          const barColor = student.progress >= 80 ? '#16a34a' : student.progress >= 50 ? '#0284c7' : '#dc2626';
                          const statusLabel =
                            student.progress >= 80
                              ? (isVi ? 'Hoàn thành tốt' : 'Mastered')
                              : student.progress >= 50
                                ? (isVi ? 'Đúng tiến độ' : 'On track')
                                : (isVi ? 'Cần hỗ trợ' : 'Needs help');
                          const formatDateTime = (iso?: string) => {
                            if (!iso) return '—';
                            const d = new Date(iso);
                            if (Number.isNaN(d.getTime())) return '—';
                            const pad = (n: number) => String(n).padStart(2, '0');
                            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                          };
                          return (
                            <tr key={student.id}>
                              <td>{student.id}</td>
                              <td>
                                <strong>{student.name}</strong>
                                <div className="muted-xs">{student.email ?? '—'}</div>
                              </td>
                              <td style={{ width: 95 }}>
                                <b style={{ color: barColor }}>{student.progress}%</b>
                              </td>
                              <td>{masteredCount}/{totalConcepts}</td>
                              <td>
                                {student.progress < 75 ? (
                                  <span className="muted-s" style={{ color: '#b45309' }}>
                                    {weakConcepts[idx % weakConcepts.length]}
                                  </span>
                                ) : (
                                  <span className="muted-xs">—</span>
                                )}
                              </td>
                              <td>
                                <span
                                  className="pill-badge"
                                  style={{ color: barColor, borderColor: barColor }}
                                >
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="muted-s" style={{ whiteSpace: 'nowrap' }}>
                                {formatDateTime(student.lastUpdatedAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!rosterLoading && !rosterError && !filteredProgressStudents.length && (
                      <p className="course-empty-section">{isVi ? 'Không tìm thấy học viên.' : 'No students found.'}</p>
                    )}
                  </div>
                </>
              );
            })()}

            {studentSubTab === 'attendance' && (
              <div style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="muted-s">
                    {isVi
                      ? `Tổng hợp ${(attendanceData ?? []).length} buổi điểm danh của lớp`
                      : `${(attendanceData ?? []).length} attendance sessions`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary sm"
                    onClick={() => nav(`/teacher/courses/${courseId}/attendance`)}
                  >
                    <CalendarCheck size={13} /> {isVi ? 'Mở trang điểm danh chi tiết →' : 'Open attendance manager →'}
                  </button>
                </div>
                <div className="teacher-students-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{isVi ? 'Buổi học' : 'Session'}</th>
                        <th>{isVi ? 'Ngày' : 'Date'}</th>
                        <th>{isVi ? 'Trạng thái' : 'Status'}</th>
                        <th>{isVi ? 'Có mặt' : 'Present'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendanceData ?? []).map((s) => {
                        const presentCount = s.records.filter((r) => r.status === 'present').length;
                        return (
                          <tr key={s.id}>
                            <td><strong>{s.title}</strong></td>
                            <td>{s.date}</td>
                            <td>{s.status === 'published' ? (isVi ? 'Đã công bố' : 'Published') : (isVi ? 'Nháp' : 'Draft')}</td>
                            <td>{presentCount}/{s.records.length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {studentSubTab === 'gradebook' && (
              <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '8px 0 12px' }}>
              <span className="muted-s">
                {isVi
                  ? `Trọng số hiện tại: Giữa kỳ ${weights.midterm}% · BTL ${weights.project}% · Cuối kỳ ${weights.final}% · Điểm danh ${weights.attendance}%`
                  : `Weights: Midterm ${weights.midterm}% · Project ${weights.project}% · Final ${weights.final}% · Attendance ${weights.attendance}%`}
              </span>
              <button
                type="button"
                className="btn btn-outline sm"
                onClick={() => {
                  setWeightDraft(weights);
                  setEditingWeights((v) => !v);
                }}
              >
                <SlidersHorizontal size={13} /> {editingWeights ? (isVi ? 'Đóng chỉnh trọng số' : 'Close weights') : (isVi ? 'Chỉnh trọng số điểm' : 'Edit grade weights')}
              </button>
            </div>

            {editingWeights && (
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', marginBottom: 12, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                {(
                  [
                    ['midterm', isVi ? 'Giữa kỳ (%)' : 'Midterm (%)'],
                    ['project', isVi ? 'BTL (%)' : 'Project (%)'],
                    ['final', isVi ? 'Cuối kỳ (%)' : 'Final (%)'],
                    ['attendance', isVi ? 'Điểm danh (%)' : 'Attendance (%)'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600 }}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weightDraft[key]}
                      onChange={(e) => setWeightDraft((w) => ({ ...w, [key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                      style={{ width: 82, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff' }}
                    />
                  </label>
                ))}
                {(() => {
                  const sum = weightDraft.midterm + weightDraft.project + weightDraft.final + weightDraft.attendance;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: sum === 100 ? 'var(--green)' : 'var(--red)' }}>
                        Tổng: {sum}%
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary sm"
                        disabled={sum !== 100}
                        onClick={() => {
                          setWeights(weightDraft);
                          try {
                            localStorage.setItem(`g4lms.gradeWeights.${courseId}`, JSON.stringify(weightDraft));
                          } catch { /* ignore */ }
                          setEditingWeights(false);
                          setGradeMessage(isVi ? 'Đã cập nhật trọng số điểm và tính lại điểm tổng kết.' : 'Updated grade weights.');
                        }}
                      >
                        {isVi ? 'Lưu trọng số' : 'Save weights'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {gradebookError && <p className="form-error" role="alert">{gradebookError.message}</p>}
            {gradeError && <p className="form-error" role="alert">{gradeError}</p>}
            {gradeMessage && <p className="admin-success" role="status">{gradeMessage}</p>}
            {gradebookLoading && <p className="muted">{isVi ? 'Đang tải bảng điểm...' : 'Loading gradebook...'}</p>}
            <div className="teacher-students-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{isVi ? 'Mã SV' : 'Student ID'}</th>
                    <th>{isVi ? 'Họ tên' : 'Name'}</th>
                    <th>{isVi ? `Giữa kỳ (${weights.midterm}%)` : `Midterm (${weights.midterm}%)`}</th>
                    <th>BTL ({weights.project}%)</th>
                    <th>{isVi ? `Cuối kỳ (${weights.final}%)` : `Final (${weights.final}%)`}</th>
                    <th>{isVi ? `Điểm danh (${weights.attendance}%)` : `Attendance (${weights.attendance}%)`}</th>
                    <th>{isVi ? 'Tổng' : 'Total'}</th>
                    <th>{isVi ? 'Thao tác' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {gradebook.map((student) => {
                    const isEditing = editingStudentId === student.id;
                    return (
                      <tr key={student.id}>
                        <td>{student.id}</td>
                        <td><strong>{student.name}</strong></td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              style={{ width: 68 }}
                              value={gradeDraft.midterm}
                              onChange={(e) => setGradeDraft((d) => ({ ...d, midterm: e.target.value }))}
                            />
                          ) : (
                            student.midterm ?? '—'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              style={{ width: 68 }}
                              value={gradeDraft.project}
                              onChange={(e) => setGradeDraft((d) => ({ ...d, project: e.target.value }))}
                            />
                          ) : (
                            student.project ?? '—'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              style={{ width: 68 }}
                              value={gradeDraft.final}
                              onChange={(e) => setGradeDraft((d) => ({ ...d, final: e.target.value }))}
                            />
                          ) : (
                            student.final ?? '—'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              style={{ width: 72 }}
                              value={gradeDraft.attendance}
                              onChange={(e) => setGradeDraft((d) => ({ ...d, attendance: e.target.value }))}
                            />
                          ) : (
                            student.attendance === null ? '—' : `${student.attendance}%`
                          )}
                        </td>
                        <td>
                          <strong>{(() => { const t = computeTotal(student); return t === null ? '—' : t.toFixed(1); })()}</strong>
                        </td>
                        <td>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="btn btn-primary sm"
                                disabled={savingGrade}
                                onClick={() => void saveGradeRow(student.id)}
                              >
                                {isVi ? 'Lưu' : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline sm"
                                onClick={() => setEditingStudentId(null)}
                              >
                                {isVi ? 'Hủy' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline sm"
                              onClick={() => startEditGrade(student)}
                            >
                              {isVi ? 'Nhập điểm' : 'Edit'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
