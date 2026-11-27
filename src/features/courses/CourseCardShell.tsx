import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CourseTheme } from '../../types';

interface Props {
  code: string;
  theme: CourseTheme;
  faculty: string;
  title: string;
  to: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function CourseCardShell({ code, theme, faculty, title, to, badge, children, footer }: Props) {
  const nav = useNavigate();
  return (
    <article className="course-card">
      <Link to={to} className={`course-banner theme-${theme}`}>
        <span>{code}</span>
        {badge && <div className="course-banner-badge">{badge}</div>}
      </Link>
      <div className="course-body">
        <div className="course-faculty">{faculty}</div>
        <Link to={to} className="course-title">{title}</Link>
        {children}
        <div className="course-foot">
          <div>{footer}</div>
          <button type="button" className="more" aria-label="Mở khóa học" title="Mở khóa học" onClick={() => nav(to)}><MoreHorizontal size={14} /></button>
        </div>
      </div>
    </article>
  );
}
