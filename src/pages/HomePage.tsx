import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  HelpCircle,
  Layers,
  Network,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "../features/layout/AppHeader";
import { useAuth } from "../features/auth/AuthContext";
import { useLanguage } from "../features/i18n/LanguageContext";
import { api } from "../api/client";
import { useAsync } from "../features/common/useAsync";
import type { HomeSlide } from "../types";

type AnnouncementScope = "all" | "global" | "course";

function getGreeting(isVi: boolean): string {
  const hour = new Date().getHours();
  if (hour < 12) return isVi ? "Chào buổi sáng" : "Good morning";
  if (hour < 18) return isVi ? "Chào buổi chiều" : "Good afternoon";
  return isVi ? "Chào buổi tối" : "Good evening";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const HomePage: React.FC = () => {
  const { language, t } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [annFilter, setAnnFilter] = useState<AnnouncementScope>("all");
  const [showBackTop, setShowBackTop] = useState(false);
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const isVi = language === "vi";
  const coursesPath = isTeacher ? "/teacher/courses" : "/courses";

  const { data: slidesData, error } = useAsync(() => api.getHomeSlides(), []);
  const { data: studentCourses } = useAsync(
    () => (isTeacher ? Promise.resolve([]) : api.getStudentCourses()),
    [isTeacher],
  );
  const { data: teacherCourses } = useAsync(
    () => (isTeacher ? api.getTeacherCourses() : Promise.resolve([])),
    [isTeacher],
  );
  const { data: dashboardData } = useAsync(() => api.getDashboard(), []);
  const { data: homeAnnouncements } = useAsync(() => api.getHomeAnnouncements(), []);

  const slides = useMemo<HomeSlide[]>(() => {
    const raw = slidesData ?? [];
    if (raw.length > 0) return raw;
    return [
      {
        id: "default-hero",
        titleVi: "Học tập thích ứng theo Đồ thị Tri thức",
        titleEn: "Adaptive Learning with Knowledge Graph",
        subtitleVi: "Theo dõi lộ trình từng chương, nắm chắc khái niệm tiên quyết và chuẩn đầu ra môn học.",
        subtitleEn: "Follow chapter learning paths, master prerequisites, and track course learning outcomes.",
        linkVi: "Khám phá ngay",
        linkEn: "Explore now",
        imageUrl: "",
      },
    ];
  }, [slidesData]);

  const coursesList = isTeacher ? (teacherCourses ?? []) : (studentCourses ?? []);
  const firstCourse = coursesList[0] ?? null;
  const primaryHeroPath = firstCourse
    ? (isTeacher ? `/teacher/courses/${firstCourse.id}/graph` : `/courses/${firstCourse.id}/graph`)
    : coursesPath;

  const upcomingActivities = (dashboardData?.activities ?? []).slice(0, 5);
  const weekEvents = (dashboardData?.calendarEvents ?? []).slice(0, 5);
  const announcements = homeAnnouncements ?? [];

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((item) => {
      if (annFilter === "global") return item.isGlobal;
      if (annFilter === "course") return !item.isGlobal;
      return true;
    });
  }, [announcements, annFilter]);

  const avgProgress = isTeacher
    ? (teacherCourses?.length
      ? Math.round(
          teacherCourses.reduce(
            (sum, c) => sum + (c.totalNodes ? (c.nodesWithContent / c.totalNodes) * 100 : 0),
            0,
          ) / teacherCourses.length,
        )
      : 0)
    : (studentCourses?.length
      ? Math.round(studentCourses.reduce((sum, c) => sum + c.progress, 0) / studentCourses.length)
      : 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % Math.max(slides.length, 1));
    }, 6500);
    return () => clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handlePrevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page home-page">
      <AppHeader />

      {/* Personalized Hero Slider Banner */}
      <section className="home-hero">
        {error && <p className="form-error" role="alert">{error.message}</p>}
        {slides.map((slide, index) => {
          const subtitle =
            language === "en"
              ? slide.subtitleEn
              : slide.subtitleVi.replace(/từng tuần/gi, "từng chương");
          return (
            <div
              key={slide.id}
              className={`home-slide ${index === currentSlide ? "active" : ""}`}
            >
              {slide.imageUrl && (
                <img
                  src={slide.imageUrl}
                  alt={language === "vi" ? slide.titleVi : slide.titleEn}
                  className="home-slide-image"
                />
              )}
              <div className="home-slide-overlay" />
              <div className="home-slide-content-wrap">
                <div className="home-hero-card">
                  <div className="home-hero-greeting">
                    <Sparkles size={13} />
                    <span>
                      {getGreeting(isVi)}, {user?.name ?? (isVi ? "Bạn" : "Learner")}
                    </span>
                    <span className="home-hero-role-pill">
                      {isTeacher ? (isVi ? "Giảng viên" : "Teacher") : (isVi ? "Học viên" : "Student")}
                    </span>
                  </div>
                  <h2>{language === "en" ? slide.titleEn : slide.titleVi}</h2>
                  <p>{subtitle}</p>
                  <div className="home-hero-actions">
                    <Link to={primaryHeroPath} className="home-hero-cta-primary">
                      <Network size={14} />
                      <span>
                        {firstCourse
                          ? (isTeacher
                              ? (isVi ? `Mở Đồ thị · ${firstCourse.code}` : `Open Graph · ${firstCourse.code}`)
                              : (isVi ? `Tiếp tục lộ trình · ${firstCourse.code}` : `Continue path · ${firstCourse.code}`))
                          : (language === "en" ? slide.linkEn : slide.linkVi)}
                      </span>
                      <ArrowRight size={14} />
                    </Link>
                    <Link to={coursesPath} className="home-hero-cta-glass">
                      <BookOpen size={14} />
                      <span>{isVi ? "Tất cả khóa học" : "All courses"}</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {slides.length > 1 && (
          <button
            onClick={handlePrevSlide}
            className="home-slider-arrow home-slider-prev"
            aria-label={isVi ? "Slide trước" : "Previous slide"}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {slides.length > 1 && (
          <button
            onClick={handleNextSlide}
            className="home-slider-arrow home-slider-next"
            aria-label={isVi ? "Slide tiếp theo" : "Next slide"}
          >
            <ChevronRight size={18} />
          </button>
        )}

        {slides.length > 1 && (
          <div className="home-slider-dots">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Chuyển đến slide ${idx + 1}`}
                className={idx === currentSlide ? "active" : ""}
              />
            ))}
          </div>
        )}
      </section>

      <main className="home-main">
        {/* Overlapping KPI Cards */}
        <section className="home-kpi-grid" aria-label={isVi ? "Tổng quan nhanh" : "Quick stats"}>
          <div className="home-kpi-card" style={{ animationDelay: "0ms" }}>
            <div className="home-kpi-icon tone-sky">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="home-kpi-label">{isVi ? "Khóa học của tôi" : "My courses"}</div>
              <div className="home-kpi-value">{coursesList.length}</div>
            </div>
          </div>

          <div className="home-kpi-card" style={{ animationDelay: "40ms" }}>
            <div className="home-kpi-icon tone-emerald">
              <TrendingUp size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="home-kpi-label">
                {isTeacher
                  ? (isVi ? "Độ phủ nội dung" : "Content coverage")
                  : (isVi ? "Tiến độ trung bình" : "Average progress")}
              </div>
              <div className="home-kpi-value">{avgProgress}%</div>
              <div className="progress-track" style={{ height: 5, marginTop: 5 }}>
                <div className="progress-fill" style={{ width: `${avgProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="home-kpi-card" style={{ animationDelay: "80ms" }}>
            <div className="home-kpi-icon tone-amber">
              <Clock size={20} />
            </div>
            <div>
              <div className="home-kpi-label">{isVi ? "Hoạt động sắp tới" : "Upcoming tasks"}</div>
              <div className="home-kpi-value">{dashboardData?.activities.length ?? 0}</div>
            </div>
          </div>

          <div className="home-kpi-card" style={{ animationDelay: "120ms" }}>
            <div className="home-kpi-icon tone-violet">
              <Bell size={20} />
            </div>
            <div>
              <div className="home-kpi-label">{isVi ? "Thông báo mới" : "Announcements"}</div>
              <div className="home-kpi-value">{announcements.length}</div>
            </div>
          </div>
        </section>

        {/* My Courses Rich Card Grid */}
        <section style={{ marginTop: 26 }}>
          <div className="home-section-head">
            <h2 className="home-section-title">
              <Layers size={18} color="var(--primary)" />
              <span>{t("courses")}</span>
              <span className="home-count-pill">{coursesList.length}</span>
            </h2>
            <Link to={coursesPath} className="btn btn-outline sm">
              {isVi ? "Xem tất cả" : "View all"} <ArrowRight size={13} />
            </Link>
          </div>

          {coursesList.length === 0 ? (
            <div className="home-panel" style={{ marginTop: 12 }}>
              <p className="muted" style={{ margin: 0 }}>{t("recentCoursesEmpty")}</p>
            </div>
          ) : (
            <div className="home-courses-grid">
              {coursesList.slice(0, 6).map((course, idx) => {
                const isStudentCourse = "progress" in course;
                const pct = isStudentCourse
                  ? course.progress
                  : course.totalNodes
                    ? Math.round((course.nodesWithContent / course.totalNodes) * 100)
                    : 0;
                return (
                  <article
                    key={course.id}
                    className="home-course-card"
                    style={{ animationDelay: `${Math.min(idx, 5) * 45}ms` }}
                  >
                    <div className={`home-course-accent ${course.theme ?? "blue"}`} />
                    <div className="home-course-body">
                      <div className="home-course-badges">
                        <span className="pill-badge">{course.code}</span>
                        {course.semester && <span className="pill-badge">{course.semester}</span>}
                        {!isStudentCourse && (
                          <span className={`pill-badge ${course.published ? "ok" : "warn"}`}>
                            {course.published ? (isVi ? "Đã xuất bản" : "Published") : (isVi ? "Chưa xuất bản" : "Draft")}
                          </span>
                        )}
                      </div>

                      <h3 className="home-course-title">{course.title}</h3>

                      <div className="muted-s">
                        {isStudentCourse
                          ? `${course.lecturer} · ${course.faculty}`
                          : `${course.students} ${isVi ? "học viên" : "students"} · ${course.faculty}`}
                      </div>

                      <div style={{ marginTop: "auto", paddingTop: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                          <span className="muted-xs">
                            {isStudentCourse
                              ? (isVi ? "Tiến độ học tập" : "Learning progress")
                              : (isVi
                                  ? `Nội dung: ${course.nodesWithContent}/${course.totalNodes} khái niệm`
                                  : `Content: ${course.nodesWithContent}/${course.totalNodes} concepts`)}
                          </span>
                          <b style={{ color: "#0369a1" }}>{pct}%</b>
                        </div>
                        <div className="progress-track" style={{ height: 6 }}>
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="home-course-footer">
                      <Link
                        to={isTeacher ? `/teacher/courses/${course.id}/graph` : `/courses/${course.id}/graph`}
                        className="btn btn-primary sm"
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        {isTeacher ? (isVi ? "Đồ thị môn học" : "Course Graph") : (isVi ? "Vào Lộ trình" : "Learning Path")}
                        <ArrowRight size={13} />
                      </Link>
                      <Link
                        to={isTeacher ? `/teacher/courses/${course.id}/content` : `/courses/${course.id}/content`}
                        className="btn btn-outline sm"
                      >
                        {isTeacher ? (isVi ? "Soạn nội dung" : "Author Content") : (isVi ? "Nội dung" : "Content")}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* 2-Column Workspace: Announcements + Activities & Events */}
        <div className="home-lower-grid">
          {/* Left: Latest Announcements */}
          <section className="home-panel">
            <div className="home-section-head" style={{ marginBottom: 14 }}>
              <h2 className="home-section-title" style={{ fontSize: 15.5 }}>
                <Bell size={17} color="var(--primary)" />
                <span>{isVi ? "Thông báo mới nhất từ Nhà Trường & Học phần" : "Latest School & Course Announcements"}</span>
              </h2>
              {announcements.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(
                    [
                      ["all", isVi ? "Tất cả" : "All"],
                      ["global", isVi ? "Toàn trường" : "Global"],
                      ["course", isVi ? "Học phần" : "Course"],
                    ] as const
                  ).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      className={`btn sm ${annFilter === scope ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setAnnFilter(scope)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredAnnouncements.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {isVi ? "Chưa có thông báo phù hợp." : "No recent announcements."}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredAnnouncements.map((item) => (
                  <article className="home-ann-card" key={item.id}>
                    <div className="home-ann-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div className="home-ann-avatar">{getInitials(item.authorName)}</div>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 13.5, color: "var(--ink)" }}>
                            {item.title}
                          </strong>
                          <span className="muted-xs">
                            {item.authorName} ·{" "}
                            {new Date(item.publishedAt ?? item.createdAt).toLocaleDateString(
                              isVi ? "vi-VN" : "en-US",
                            )}
                          </span>
                        </div>
                      </div>
                      <span className={`pill-badge ${item.isGlobal ? "ok" : ""}`} style={{ flexShrink: 0 }}>
                        {item.isGlobal ? (isVi ? "Toàn trường" : "Global") : item.courseName}
                      </span>
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                      {item.body}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Right: Upcoming Tasks & Events */}
          <div style={{ display: "grid", gap: 16 }}>
            <section className="home-panel">
              <div className="home-section-head" style={{ marginBottom: 12 }}>
                <h2 className="home-section-title" style={{ fontSize: 15 }}>
                  <Clock size={16} color="#d97706" />
                  <span>{t("upcoming")}</span>
                </h2>
              </div>
              {upcomingActivities.length === 0 ? (
                <p className="muted-s" style={{ margin: 0 }}>{t("upcomingEmpty")}</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {upcomingActivities.map((act) => {
                    const d = new Date(act.dueAt);
                    const dayNum = Number.isNaN(d.getTime()) ? "--" : String(d.getDate()).padStart(2, "0");
                    const monLabel = Number.isNaN(d.getTime())
                      ? ""
                      : isVi
                        ? `Thg ${d.getMonth() + 1}`
                        : d.toLocaleDateString("en-US", { month: "short" });
                    return (
                      <Link
                        key={act.id}
                        className="home-activity-item"
                        to={
                          isTeacher
                            ? `/teacher/courses/${act.courseId}/assignments`
                            : `/courses/${act.courseId}/assignments`
                        }
                      >
                        <div className="home-date-pill">
                          <strong>{dayNum}</strong>
                          <span>{monLabel}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {act.title}
                          </div>
                          <div className="muted-xs" style={{ marginTop: 2 }}>
                            <b>{act.courseCode}</b> · {act.description}
                          </div>
                        </div>
                        <ChevronRight size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="home-panel">
              <div className="home-section-head" style={{ marginBottom: 12 }}>
                <h2 className="home-section-title" style={{ fontSize: 15 }}>
                  <Calendar size={16} color="#0284c7" />
                  <span>{t("thisWeek")}</span>
                </h2>
              </div>
              {weekEvents.length === 0 ? (
                <p className="muted-s" style={{ margin: 0 }}>{t("thisWeekText")}</p>
              ) : (
                <div className="home-list">
                  {weekEvents.map((evt) => {
                    const matched = coursesList.find((c) => c.code === evt.courseCode);
                    const evtPath = matched
                      ? (isTeacher ? `/teacher/courses/${matched.id}/graph` : `/courses/${matched.id}/graph`)
                      : coursesPath;
                    return (
                      <Link key={evt.id} to={evtPath} className="home-list-item">
                        <span className="home-list-title">
                          <strong>{evt.courseCode}</strong> · {evt.title}
                        </span>
                        <span className="home-list-meta">{evt.date}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Floating Actions */}
      <div className="home-floating-actions">
        {showBackTop && (
          <button
            type="button"
            onClick={scrollToTop}
            className="home-floating-button"
            title={t("backToTop")}
            aria-label={t("backToTop")}
          >
            <ChevronUp size={18} />
          </button>
        )}
        <button
          type="button"
          className="home-floating-button"
          title={isVi ? "Trợ giúp" : "Help"}
          aria-label={isVi ? "Trợ giúp" : "Help"}
          onClick={() => setHelpOpen((prev) => !prev)}
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {helpOpen && (
        <div
          role="dialog"
          aria-label={isVi ? "Trợ giúp" : "Help"}
          style={{
            position: "fixed",
            right: 20,
            bottom: 92,
            width: 300,
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.14)",
            zIndex: 40,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>Hỗ trợ nhanh G4LMS</strong>
            <button type="button" className="btn btn-outline sm" onClick={() => setHelpOpen(false)}>
              {isVi ? "Đóng" : "Close"}
            </button>
          </div>
          <p className="muted-s" style={{ margin: "0 0 6px" }}>
            {isVi
              ? "Sử dụng thanh điều hướng phía trên để mở Trang chủ, Các khóa học của tôi hoặc xem Thông báo mới nhất."
              : "Use the top navigation bar to open Home, My Courses, or Notifications."}
          </p>
          <p className="muted-s" style={{ margin: 0 }}>
            {isVi ? "Liên hệ hỗ trợ kỹ thuật:" : "Technical support:"} <b>support@g4lms.edu.vn</b>
          </p>
        </div>
      )}
    </div>
  );
};

export default HomePage;
