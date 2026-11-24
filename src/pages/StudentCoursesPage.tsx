import { useState } from 'react';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import { CourseToolbar } from '../features/courses/CourseToolbar';
import { CourseCardShell } from '../features/courses/CourseCardShell';
import { ProgressBar } from '../features/common/ProgressBar';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';

export default function StudentCoursesPage() {
  const { language, t } = useLanguage();
  const isVi = language === 'vi';
  const statusOptions = isVi ? ['Tất cả', 'Đang diễn ra', 'Đã kết thúc'] : ['All', 'In progress', 'Ended'];
  const { data, error, loading } = useAsync(() => api.getStudentCourses(), []);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState(statusOptions[0]);
  const [sortBy, setSortBy] = useState('title');

  const list = (data ?? [])
    .filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => {
      if (statusFilter === statusOptions[1]) return c.progress < 100;
      if (statusFilter === statusOptions[2]) return c.progress >= 100;
      return true;
    })
    .sort((a, b) => (sortBy === 'progress' ? b.progress - a.progress : a.title.localeCompare(b.title)));

  return (
    <div className="page">
      <AppHeader />
      <main className="container">
        <h1 className="page-title">{t('courses')}</h1>
        <CourseToolbar
          statusOptions={statusOptions}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
          sortValue={sortBy}
          onSortChange={setSortBy}
          query={q}
          onQuery={setQ}
        />
        {error && <p className="form-error" role="alert">{error.message}</p>}
        {loading && <p className="muted">{isVi ? 'Đang tải khóa học...' : 'Loading courses...'}</p>}
        <div className="course-grid">
          {list.map((c) => (
            <CourseCardShell
              key={c.id}
              code={c.code}
              theme={c.theme}
              faculty={c.faculty}
              title={c.title}
              badge={`${c.progress}%`}
              to={`/courses/${c.id}/graph`}
              footer={c.deadline && <span className="muted-s">{c.deadline}</span>}
            >
              <div className="course-lecturer">{t('lecturer')}: {c.lecturer}</div>
              <ProgressBar value={c.progress} />
              <div className="course-progress">{c.progress}% {t('completed')}</div>
              {c.gap && <div className="course-gap">{c.gap}</div>}
            </CourseCardShell>
          ))}
        </div>
        {!loading && !error && list.length === 0 && (
          <div className="course-empty-state">
            <b>{isVi ? 'Không tìm thấy khóa học nào' : 'No courses found'}</b>
            <span>{isVi ? 'Thử thay đổi từ khóa tìm kiếm hoặc trạng thái lọc.' : 'Try adjusting your search query or status filter.'}</span>
          </div>
        )}
        <div className="page-size">{t('show')}
          <label className="select tiny"><select defaultValue="12"><option>12</option><option>24</option><option>48</option></select></label>
        </div>
      </main>
    </div>
  );
}
