import { serializeKnowledgeGraph } from '../features/graph/graphSerializer';
import type {
  AdminAnnouncementRecord, AdminCourseOption, AdminCourseRecord, AdminEnrollment, AdminStats, AdminStudentOption, AdminUser, Announcement, Assignment, AssignmentSubmissionRecord,
  AttendanceSession, ChapterLessonItem, ClusterView, ConversationMessage, ConversationSummary,
  CourseFile, CourseGraphDraftSummary, CourseOutlineData, CourseOverallGrade, CourseRecommendation, CourseRelationItem, CreateAnnouncementInput, CreateAssignmentInput, CreateAttendanceSessionInput,
  CreateConversationInput, CreateQuizInput, CreateTeacherCourseInput, DashboardData, HeatSpot, HomeSlide,
  KnowledgeEdgeType, KnowledgeGraphData, KnowledgeNodeType,
  LearningOutcome, LoginHeroStat, MessageContact, MessagePreview, NodeDetail, NodeEditorData,
  NotificationRecord, OutlineDraftResponse, PdfFile, ProfileDetails, ProfileRecord, PublicationStatusResponse, PublishCourseResponse, QueueSummary, Quiz, QuizAttempt, RelationEndpointOption, ReviewDecision, Role, StudentAttendanceData,
  StudentCourse, StudentGradeItem, StudentGraph, StudentLearningProfile, SubmitAssignmentInput, SubmitQuizInput, TeacherCourse,
  TeacherCourseTopic, TeacherGradeRow, TeacherGraphData, UpdateAnnouncementInput, UpdateAssignmentInput, UpdateAttendanceSessionInput, UpdateGradebookRowInput, UpdateTeacherCourseInput, User, WorkflowJobResponse,
  AdaptiveCourseSettings, CourseUsageSummary, SourceReadinessResponse, Step3SnapshotSummary, Step3WorkspaceResponse,
  ConceptQuiz, ContentHistoryItem, ContentItem, CourseConceptsContentOverview, UpsertConceptQuizInput,
} from '../types';

import { mockApi } from '../../mockdata/service';

export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshInFlight: Promise<User | null> | null = null;

async function tryRefreshSession(): Promise<User | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { user: Omit<User, 'accessToken'>; accessToken: string };
      const refreshed: User = { ...data.user, accessToken: data.accessToken };
      localStorage.setItem('g4lms.user', JSON.stringify(refreshed));
      window.dispatchEvent(new Event('g4lms:user-updated'));
      return refreshed;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, _retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const user = getStoredUser();
  if (user?.accessToken) headers.set('Authorization', `Bearer ${user.accessToken}`);
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });
  if (response.status === 401 && !path.endsWith('/auth/login') && !path.endsWith('/auth/refresh')) {
    if (!_retried) {
      const refreshed = await tryRefreshSession();
      if (refreshed?.accessToken) {
        return request<T>(path, init, true);
      }
    }
    localStorage.removeItem('g4lms.user');
    window.dispatchEvent(new Event('g4lms:unauthorized'));
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = payload && typeof payload === 'object'
      ? payload as { message?: string; detail?: string | { msg?: string }[]; code?: string }
      : null;
    const detail = Array.isArray(error?.detail)
      ? error.detail.map((item) => item.msg).filter(Boolean).join(' ')
      : error?.detail;
    const fallbackMsg =
      response.status >= 500 && typeof payload === 'string' && !payload.trim()
        ? 'Không thể kết nối tới máy chủ Backend (500). Hãy kiểm tra g4lms-BE đã được khởi động chưa.'
        : `Yêu cầu thất bại (${response.status}).`;
    throw new ApiError(
      error?.message ?? detail ?? fallbackMsg,
      response.status,
      error?.code,
    );
  }
  return payload as T;
}

function invoke<T>(mock: () => Promise<T>, path: string, init?: RequestInit): Promise<T> {
  return USE_MOCK_API ? mock() : request<T>(path, init);
}

function getStoredUser(): User | null {
  const rawUser = localStorage.getItem('g4lms.user');
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser) as User;
  } catch {
    return null;
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const api = {
  login: async (identity: string, password: string, role: Role): Promise<User> => {
    if (USE_MOCK_API) return mockApi.login(identity, password, role);
    const response = await request<{ user: Omit<User, 'accessToken'>; accessToken: string }>(
      '/auth/login',
      json('POST', { identity, password, role }),
    );
    return { ...response.user, accessToken: response.accessToken };
  },
  logout: (): Promise<void> =>
    USE_MOCK_API ? Promise.resolve() : request('/auth/logout', { method: 'POST' }),
  getDashboard: (): Promise<DashboardData> =>
    invoke(mockApi.getDashboard, '/dashboard'),
  getHomeSlides: (): Promise<HomeSlide[]> =>
    invoke(mockApi.getHomeSlides, '/home/slides'),
  getLoginHeroStats: (): Promise<LoginHeroStat[]> =>
    invoke(mockApi.getLoginHeroStats, '/home/login-stats'),
  getProfileDetails: async (role: Role): Promise<ProfileDetails> => {
    if (USE_MOCK_API) return mockApi.getProfileDetails(role);
    const rec = await request<ProfileRecord>('/me/profile');
    return {
      id: rec.studentCode ?? rec.staffCode ?? rec.id,
      labelVi: role === 'student' ? 'Khoa / Ngành' : 'Khoa / Bộ môn',
      labelEn: role === 'student' ? 'Faculty' : 'Department',
      fieldVi: rec.faculty || 'Khoa học & Kỹ thuật Máy tính',
      fieldEn: rec.faculty || 'Computer Science & Engineering',
      extra: role === 'student' ? (rec.classYear || 'K2023') : (rec.title || 'Giảng viên'),
    };
  },
  getMyProfile: async (): Promise<ProfileRecord> => {
    if (!USE_MOCK_API) return request('/me/profile');
    const user = getStoredUser();
    if (!user) throw new ApiError('Vui lòng đăng nhập lại.', 401);
    const details = user.role === 'student' || user.role === 'teacher'
      ? await mockApi.getProfileDetails(user.role)
      : null;
    return {
      id: details?.id ?? user.id,
      email: user.email,
      fullName: user.name,
      role: user.role,
      dateOfBirth: null,
      studentCode: user.role === 'student' ? details?.id : null,
      staffCode: user.role === 'teacher' ? details?.id : null,
      faculty: null,
      classYear: user.role === 'student' ? details?.extra : null,
      title: user.role === 'teacher' ? details?.extra : null,
    };
  },
  updateMyProfile: async (input: { fullName: string; dateOfBirth: string | null }): Promise<ProfileRecord> => {
    if (!USE_MOCK_API) return request('/me/profile', json('PATCH', input));
    const user = getStoredUser();
    if (!user) throw new ApiError('Vui lòng đăng nhập lại.', 401);
    const updatedUser = { ...user, name: input.fullName.trim() };
    localStorage.setItem('g4lms.user', JSON.stringify(updatedUser));
    return {
      id: user.id,
      email: user.email,
      fullName: updatedUser.name,
      role: user.role,
      dateOfBirth: input.dateOfBirth,
    };
  },
  changePassword: async (input: { currentPassword: string; newPassword: string }): Promise<{ user: User; accessToken: string }> => {
    if (!USE_MOCK_API) return request('/auth/change-password', json('POST', input));
    const user = getStoredUser();
    if (!user) throw new ApiError('Vui lòng đăng nhập lại.', 401);
    return {
      user: { ...user, passwordResetRequired: false },
      accessToken: user.accessToken ?? 'demo-access-token',
    };
  },
  getAdminUsers: (): Promise<AdminUser[]> =>
    USE_MOCK_API ? mockApi.getAdminUsers() : request('/admin/users'),
  createAdminUser: (input: {
    email: string;
    fullName: string;
    role: Role;
    initialPassword: string;
  }): Promise<AdminUser> =>
    USE_MOCK_API ? mockApi.createAdminUser(input) : request('/admin/users', json('POST', input)),
  resetAdminUserPassword: (userId: string, temporaryPassword: string): Promise<void> =>
    USE_MOCK_API
      ? mockApi.resetAdminUserPassword(userId)
      : request(`/admin/users/${encodeURIComponent(userId)}/reset-password`, json('POST', { temporaryPassword })),
  deleteAdminUser: (userId: string): Promise<void> =>
    USE_MOCK_API
      ? mockApi.deleteAdminUser(userId)
      : request(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getAdminEnrollments: (): Promise<{
    students: AdminStudentOption[];
    courses: AdminCourseOption[];
    enrollments: AdminEnrollment[];
  }> =>
    USE_MOCK_API ? mockApi.getAdminEnrollments() : request('/admin/enrollments'),
  createAdminEnrollment: (input: { studentId: string; courseId: string }): Promise<AdminEnrollment> =>
    USE_MOCK_API ? mockApi.createAdminEnrollment(input) : request('/admin/enrollments', json('POST', input)),
  deleteAdminEnrollment: (enrollmentId: string): Promise<void> =>
    USE_MOCK_API
      ? mockApi.deleteAdminEnrollment(enrollmentId)
      : request(`/admin/enrollments/${encodeURIComponent(enrollmentId)}`, { method: 'DELETE' }),
  getAdminStats: (): Promise<AdminStats> =>
    USE_MOCK_API ? mockApi.getAdminStats() : request('/admin/stats'),
  getAdminCourses: (): Promise<AdminCourseRecord[]> =>
    USE_MOCK_API ? mockApi.getAdminCourses() : request('/admin/courses'),
  createAdminCourse: (input: {
    code: string;
    title: string;
    description?: string;
    faculty: string;
    semester?: string;
    year?: number;
    theme?: TeacherCourse['theme'];
    published?: boolean;
    lecturerId?: string | null;
  }): Promise<AdminCourseRecord> =>
    USE_MOCK_API ? mockApi.createAdminCourse(input) : request('/admin/courses', json('POST', input)),
  updateAdminCourse: (courseId: string, input: UpdateTeacherCourseInput): Promise<AdminCourseRecord> =>
    USE_MOCK_API
      ? mockApi.updateAdminCourse(courseId, input)
      : request(`/admin/courses/${encodeURIComponent(courseId)}`, json('PATCH', input)),
  deleteAdminCourse: (courseId: string): Promise<void> =>
    USE_MOCK_API
      ? mockApi.deleteAdminCourse(courseId)
      : request(`/admin/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' }),
  getAdminAnnouncements: (): Promise<AdminAnnouncementRecord[]> =>
    USE_MOCK_API ? mockApi.getAdminAnnouncements() : request('/admin/announcements'),
  createAdminAnnouncement: (input: {
    title: string;
    body: string;
    courseId?: string | null;
    isGlobal?: boolean;
    status?: 'draft' | 'published';
  }): Promise<AdminAnnouncementRecord> =>
    USE_MOCK_API ? mockApi.createAdminAnnouncement(input) : request('/admin/announcements', json('POST', input)),
  updateAdminAnnouncement: (
    announcementId: string,
    input: { title?: string; body?: string; status?: 'draft' | 'published'; isGlobal?: boolean },
  ): Promise<AdminAnnouncementRecord> =>
    USE_MOCK_API
      ? mockApi.updateAdminAnnouncement(announcementId, input)
      : request(`/admin/announcements/${encodeURIComponent(announcementId)}`, json('PATCH', input)),
  deleteAdminAnnouncement: (announcementId: string): Promise<void> =>
    USE_MOCK_API
      ? mockApi.deleteAdminAnnouncement(announcementId)
      : request(`/admin/announcements/${encodeURIComponent(announcementId)}`, { method: 'DELETE' }),
  getHomeAnnouncements: (): Promise<AdminAnnouncementRecord[]> =>
    invoke(mockApi.getHomeAnnouncements, '/home/announcements'),
  getNotifications: (): Promise<NotificationRecord[]> =>
    invoke(mockApi.getNotifications, '/notifications'),
  markNotificationsRead: (): Promise<void> =>
    invoke(mockApi.markNotificationsRead, '/notifications/read-all', json('POST', {})),
  getMessages: (): Promise<MessagePreview[]> =>
    invoke(mockApi.getMessages, '/messages'),
  getConversations: (): Promise<ConversationSummary[]> =>
    invoke(mockApi.getConversations, '/conversations'),
  getMessageContacts: (): Promise<MessageContact[]> =>
    invoke(mockApi.getMessageContacts, '/conversations/contacts'),
  getConversationMessages: (conversationId: string): Promise<ConversationMessage[]> =>
    invoke(
      () => mockApi.getConversationMessages(conversationId),
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
    ),
  createConversation: (input: CreateConversationInput): Promise<ConversationSummary> =>
    invoke(mockApi.createConversation.bind(null, input), '/conversations', json('POST', input)),
  sendMessage: (conversationId: string, body: string): Promise<ConversationMessage> =>
    invoke(
      () => mockApi.sendMessage(conversationId, body),
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      json('POST', { body }),
    ),
  markConversationRead: (conversationId: string): Promise<void> =>
    invoke(
      () => mockApi.markConversationRead(conversationId),
      `/conversations/${encodeURIComponent(conversationId)}/read`,
      json('PATCH', {}),
    ),
  getStudentCourses: (): Promise<StudentCourse[]> =>
    invoke(mockApi.getStudentCourses, '/student/courses'),
  getTeacherCourses: (): Promise<TeacherCourse[]> =>
    invoke(mockApi.getTeacherCourses, '/teacher/courses'),
  createTeacherCourse: (input: CreateTeacherCourseInput): Promise<TeacherCourse> =>
    invoke(() => mockApi.createTeacherCourse(input), '/teacher/courses', json('POST', input)),
  updateTeacherCourse: (courseId: string, input: UpdateTeacherCourseInput): Promise<TeacherCourse> =>
    invoke(
      () => mockApi.updateTeacherCourse(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}`,
      json('PATCH', input),
    ),
  deleteTeacherCourse: (courseId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteTeacherCourse(courseId),
      `/teacher/courses/${encodeURIComponent(courseId)}`,
      { method: 'DELETE' },
    ),
  getCourseSections: (courseId: string) =>
    invoke(() => mockApi.getCourseSections(courseId), `/courses/${encodeURIComponent(courseId)}/sections`),
  createCourseSection: (courseId: string, input: { titleVi: string; titleEn?: string }) =>
    invoke(
      () => mockApi.createCourseSection(courseId, input),
      `/courses/${encodeURIComponent(courseId)}/sections`,
      json('POST', input),
    ),
  getStudentGrades: (courseId: string): Promise<StudentGradeItem[]> =>
    invoke(() => mockApi.getStudentGrades(courseId), `/student/courses/${encodeURIComponent(courseId)}/grades`),
  getStudentGradeSummary: (): Promise<CourseOverallGrade[]> =>
    invoke(mockApi.getStudentGradeSummary, '/student/grades'),
  getStudentAttendance: (courseId: string): Promise<StudentAttendanceData> =>
    invoke(
      () => mockApi.getStudentAttendance(courseId),
      `/student/courses/${encodeURIComponent(courseId)}/attendance`,
    ),
  getTeacherAttendance: (courseId: string): Promise<AttendanceSession[]> =>
    invoke(
      () => mockApi.getTeacherAttendance(courseId),
      `/teacher/courses/${encodeURIComponent(courseId)}/attendance`,
    ),
  createAttendanceSession: (courseId: string, input: CreateAttendanceSessionInput): Promise<AttendanceSession> =>
    invoke(
      () => mockApi.createAttendanceSession(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/attendance/sessions`,
      json('POST', input),
    ),
  updateAttendanceSession: (
    courseId: string,
    sessionId: string,
    input: UpdateAttendanceSessionInput,
  ): Promise<AttendanceSession> =>
    invoke(
      () => mockApi.updateAttendanceSession(courseId, sessionId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/attendance/sessions/${encodeURIComponent(sessionId)}`,
      json('PATCH', input),
    ),
  deleteAttendanceSession: (courseId: string, sessionId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteAttendanceSession(courseId, sessionId),
      `/teacher/courses/${encodeURIComponent(courseId)}/attendance/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    ),
  getTeacherRoster: (courseId: string) =>
    invoke(() => mockApi.getTeacherRoster(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/students`),
  getTeacherGradebook: (courseId: string): Promise<TeacherGradeRow[]> =>
    invoke(() => mockApi.getTeacherGradebook(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/gradebook`),
  updateTeacherGradebookRow: (
    courseId: string,
    studentId: string,
    input: UpdateGradebookRowInput,
  ): Promise<TeacherGradeRow> =>
    invoke(
      () => mockApi.updateTeacherGradebookRow(courseId, studentId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/gradebook/${encodeURIComponent(studentId)}`,
      json('PATCH', input),
    ),
  getTeacherCourseTopics: (courseId: string): Promise<TeacherCourseTopic[]> =>
    invoke(() => mockApi.getTeacherCourseTopics(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/topics`),
  getAssignments: (courseId: string, role: Role): Promise<Assignment[]> =>
    invoke(
      () => mockApi.getAssignments(courseId, role),
      `/${role}/courses/${encodeURIComponent(courseId)}/assignments`,
    ),
  getAnnouncements: (courseId: string, role: Role): Promise<Announcement[]> =>
    invoke(
      () => mockApi.getAnnouncements(courseId, role),
      `/${role}/courses/${encodeURIComponent(courseId)}/announcements`,
    ),
  createAnnouncement: (courseId: string, input: CreateAnnouncementInput): Promise<Announcement> =>
    invoke(
      () => mockApi.createAnnouncement(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/announcements`,
      json('POST', input),
    ),
  updateAnnouncementStatus: (courseId: string, announcementId: string, status: Announcement['status']): Promise<Announcement> =>
    invoke(
      () => mockApi.updateAnnouncementStatus(courseId, announcementId, status),
      `/teacher/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`,
      json('PATCH', { status }),
    ),
  updateAnnouncement: (courseId: string, announcementId: string, input: UpdateAnnouncementInput): Promise<Announcement> =>
    invoke(
      () => mockApi.updateAnnouncement(courseId, announcementId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`,
      json('PATCH', input),
    ),
  deleteAnnouncement: (courseId: string, announcementId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteAnnouncement(courseId, announcementId),
      `/teacher/courses/${encodeURIComponent(courseId)}/announcements/${encodeURIComponent(announcementId)}`,
      { method: 'DELETE' },
    ),
  createAssignment: (courseId: string, input: CreateAssignmentInput): Promise<Assignment> =>
    invoke(() => mockApi.createAssignment(courseId, input), `/teacher/courses/${encodeURIComponent(courseId)}/assignments`, json('POST', input)),
  updateAssignmentStatus: (courseId: string, assignmentId: string, status: Assignment['status']): Promise<Assignment> =>
    invoke(
      () => mockApi.updateAssignmentStatus(courseId, assignmentId, status),
      `/teacher/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
      json('PATCH', { status }),
    ),
  updateAssignment: (courseId: string, assignmentId: string, input: UpdateAssignmentInput): Promise<Assignment> =>
    invoke(
      () => mockApi.updateAssignment(courseId, assignmentId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
      json('PATCH', input),
    ),
  deleteAssignment: (courseId: string, assignmentId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteAssignment(courseId, assignmentId),
      `/teacher/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { method: 'DELETE' },
    ),
  submitAssignment: (courseId: string, assignmentId: string, input: SubmitAssignmentInput): Promise<Assignment> =>
    invoke(
      () => mockApi.submitAssignment(courseId, assignmentId, input),
      `/student/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions`,
      json('POST', input),
    ),
  getAssignmentSubmissions: (courseId: string, assignmentId: string): Promise<AssignmentSubmissionRecord[]> =>
    invoke(
      () => mockApi.getAssignmentSubmissions(courseId, assignmentId),
      `/teacher/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions`,
    ),
  gradeSubmission: (
    courseId: string,
    assignmentId: string,
    submissionId: string,
    input: { score: number; feedback?: string | null },
  ): Promise<AssignmentSubmissionRecord> =>
    invoke(
      () => mockApi.gradeSubmission(courseId, assignmentId, submissionId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(submissionId)}`,
      json('PATCH', input),
    ),
  getStudentLearningProfile: (courseId?: string): Promise<StudentLearningProfile> => {
    const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
    return invoke(() => mockApi.getStudentLearningProfile(courseId), `/student/learning-profile${query}`);
  },
  getCourseRecommendations: (courseId: string): Promise<CourseRecommendation[]> =>
    invoke(() => mockApi.getCourseRecommendations(courseId), `/student/courses/${encodeURIComponent(courseId)}/recommendations`),

  getQuiz: (courseId: string, quizId: string): Promise<Quiz> =>
    invoke(
      () => mockApi.getQuiz(courseId, quizId),
      `/student/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}`,
    ),
  startQuizAttempt: (courseId: string, quizId: string, unlimited = false): Promise<QuizAttempt> =>
    invoke(
      () => mockApi.startQuizAttempt(courseId, quizId, unlimited),
      `/student/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}/attempts`,
      json('POST', { unlimited }),
    ),
  submitQuizAttempt: (courseId: string, quizId: string, attemptId: string, input: SubmitQuizInput): Promise<QuizAttempt> =>
    invoke(
      () => mockApi.submitQuizAttempt(quizId, attemptId, input),
      `/student/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}/attempts/${encodeURIComponent(attemptId)}/submit`,
      json('POST', input),
    ),
  getQuizzes: (courseId: string, role: Role): Promise<Quiz[]> =>
    invoke(
      () => mockApi.getQuizzes(courseId, role),
      `/${role}/courses/${encodeURIComponent(courseId)}/quizzes`,
    ),
  createQuiz: (courseId: string, input: CreateQuizInput): Promise<Quiz> =>
    invoke(
      () => mockApi.createQuiz(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/quizzes`,
      json('POST', input),
    ),
  updateQuizStatus: (courseId: string, quizId: string, status: Quiz['status']): Promise<Quiz> =>
    invoke(
      () => mockApi.updateQuizStatus(courseId, quizId, status),
      `/teacher/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}`,
      json('PATCH', { status }),
    ),
  getLearningOutcomes: (courseId: string): Promise<LearningOutcome[]> =>
    invoke(() => mockApi.getLearningOutcomes(courseId), `/student/courses/${encodeURIComponent(courseId)}/learning-outcomes`),
  getStudentGraph: (courseId: string, clusterId?: string): Promise<StudentGraph> => {
    const query = clusterId ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
    return invoke(() => mockApi.getStudentGraph(courseId, clusterId), `/student/courses/${encodeURIComponent(courseId)}/graph${query}`);
  },
  getNodeDetail: (nodeId: string): Promise<NodeDetail> =>
    invoke(() => mockApi.getNodeDetail(nodeId), `/student/nodes/${encodeURIComponent(nodeId)}`),
  getKnowledgeGraph: (courseId: string): Promise<KnowledgeGraphData> =>
    invoke(
      () => mockApi.getKnowledgeGraph(courseId),
      `/courses/${encodeURIComponent(courseId)}/knowledge-graph`,
    ),
  getAuthoringGraph: (courseId: string): Promise<KnowledgeGraphData> =>
    invoke(
      () => mockApi.getAuthoringGraph(courseId),
      `/courses/${encodeURIComponent(courseId)}/authoring-graph`,
    ),
  listGraphDrafts: (courseId: string): Promise<CourseGraphDraftSummary[]> =>
    invoke(
      () => mockApi.listGraphDrafts(courseId),
      `/courses/${encodeURIComponent(courseId)}/graph-drafts`,
    ),
  saveKnowledgeGraph: (
    courseId: string,
    graph: KnowledgeGraphData,
    options?: { effectiveTermNo?: number; baseRevision?: number | null; title?: string; note?: string },
  ): Promise<KnowledgeGraphData> => {
    const serialized = serializeKnowledgeGraph(graph);
    if (USE_MOCK_API) {
      return mockApi.saveKnowledgeGraph(courseId, serialized);
    }
    return request<Record<string, unknown>>(
      `/courses/${encodeURIComponent(courseId)}/graph-drafts`,
      json('POST', {
        ...(options?.effectiveTermNo ? { effectiveTermNo: options.effectiveTermNo } : {}),
        baseRevision: options?.baseRevision ?? null,
        payload: serialized,
        title: options?.title ?? 'Knowledge Graph Draft',
        note: options?.note ?? 'Synced from UI',
      }),
    ).then(() => serialized);
  },
  generateKnowledgeGraph: async (courseId: string): Promise<KnowledgeGraphData> => {
    if (USE_MOCK_API) {
      return mockApi.generateKnowledgeGraph(courseId);
    }
    const res = await request<KnowledgeGraphData & { jobId?: string; status?: string }>(
      `/teacher/courses/${encodeURIComponent(courseId)}/knowledge-graph/generate`,
      json('POST', {}),
    );
    if (res.jobId && res.status && res.status !== 'completed') {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const job = await request<{ status: string; errorMessage?: string }>(
          `/teacher/courses/${encodeURIComponent(courseId)}/knowledge-graph/jobs/${encodeURIComponent(res.jobId)}`,
        );
        if (job.status === 'completed') {
          return api.getKnowledgeGraph(courseId);
        }
        if (job.status === 'failed') {
          throw new Error(job.errorMessage || 'Trích xuất đồ thị từ PDF thất bại.');
        }
      }
      throw new Error('Tác vụ trích xuất đồ thị mất quá nhiều thời gian.');
    }
    return res;
  },
  getCourseGraph: (courseId: string): Promise<TeacherGraphData> =>
    invoke(() => mockApi.getCourseGraph(courseId), `/courses/${encodeURIComponent(courseId)}/graph`),
  getCourseClusterView: (courseId: string, clusterId: string): Promise<ClusterView> =>
    invoke(
      () => mockApi.getCourseClusterView(courseId, clusterId),
      `/courses/${encodeURIComponent(courseId)}/clusters/${encodeURIComponent(clusterId)}`,
    ),
  getTeacherGraph: (courseId: string): Promise<TeacherGraphData> =>
    invoke(() => mockApi.getTeacherGraph(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/graph`),
  getClusterView: (clusterId: string): Promise<ClusterView> =>
    invoke(() => mockApi.getClusterView(clusterId), `/teacher/clusters/${encodeURIComponent(clusterId)}`),
  createGraphNode: (
    courseId: string,
    input: {
      name: string;
      nodeType?: KnowledgeNodeType;
      clusterId?: string | null;
      description?: string;
      x?: number;
      y?: number;
      lo?: string[];
      properties?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> =>
    invoke(
      () => mockApi.createGraphNode(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/nodes`,
      json('POST', input),
    ),
  updateGraphNode: (
    courseId: string,
    nodeId: string,
    input: {
      name?: string;
      description?: string;
      status?: 'approved' | 'draft' | 'pending_review' | 'outside_cluster' | 'proposed';
      approved?: boolean;
      lo?: string[];
      properties?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> =>
    invoke(
      () => mockApi.updateGraphNode(courseId, nodeId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/nodes/${encodeURIComponent(nodeId)}`,
      json('PATCH', input),
    ),
  deleteGraphNode: (courseId: string, nodeId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteGraphNode(courseId, nodeId),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/nodes/${encodeURIComponent(nodeId)}`,
      { method: 'DELETE' },
    ),
  createGraphEdge: (
    courseId: string,
    input: { fromId: string; toId: string; kind: KnowledgeEdgeType | 'prereq' | 'related' | 'concept'; clusterId?: string | null; properties?: Record<string, unknown> },
  ): Promise<{ from: string; to: string; kind: string }> =>
    invoke(
      () => mockApi.createGraphEdge(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/edges`,
      json('POST', { fromId: input.fromId, toId: input.toId, kind: input.kind, properties: input.properties ?? {} }),
    ),
  deleteGraphEdge: (
    courseId: string,
    input: { fromId: string; toId: string; edgeType?: string | null; clusterId?: string | null },
  ): Promise<void> =>
    invoke(
      () => mockApi.deleteGraphEdge(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/edges`,
      json('DELETE', { fromId: input.fromId, toId: input.toId, edgeType: input.edgeType ?? null }),
    ),
  approveGraphEdge: (
    courseId: string,
    input: { fromId: string; toId: string; edgeType?: string | null },
  ): Promise<void> =>
    invoke(
      () => mockApi.approveGraphEdge(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/edges/approve`,
      json('POST', { fromId: input.fromId, toId: input.toId, edgeType: input.edgeType ?? null }),
    ),
  mergeGraphNodes: (
    courseId: string,
    input: { keepId: string; mergeId: string; clusterId?: string | null },
  ): Promise<{ id: string }> =>
    invoke(
      () => mockApi.mergeGraphNodes(courseId, input),
      `/teacher/courses/${encodeURIComponent(courseId)}/graph/nodes/merge`,
      json('POST', { keepId: input.keepId, mergeId: input.mergeId }),
    ),
  getReviewQueue: (courseId: string): Promise<QueueSummary> =>
    invoke(() => mockApi.getReviewQueue(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/review-queue`),
  getHeatSpot: (clusterId?: string): Promise<HeatSpot> => {
    const query = clusterId ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
    return invoke(() => mockApi.getHeatSpot(clusterId), `/teacher/analytics/heatmap${query}`);
  },
  getCoursePdfs: (courseId: string): Promise<PdfFile[]> =>
    invoke(() => mockApi.getCoursePdfs(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/documents`),
  getCourseFiles: (courseId: string): Promise<CourseFile[]> =>
    invoke(() => mockApi.getCourseFiles(courseId), `/teacher/courses/${encodeURIComponent(courseId)}/documents`),
  uploadCourseFile: (courseId: string, file: File): Promise<CourseFile> => {
    const form = new FormData();
    form.append('file', file);
    return invoke(
      () => mockApi.uploadCourseFile(courseId, file),
      `/teacher/courses/${encodeURIComponent(courseId)}/documents`,
      { method: 'POST', body: form },
    );
  },
  downloadCourseFile: async (courseId: string, fileId: string, fallbackName: string): Promise<void> => {
    if (USE_MOCK_API) {
      throw new ApiError('Chế độ mock không lưu nội dung tệp để tải xuống.', 400);
    }
    const url = `${BASE_URL}/courses/${encodeURIComponent(courseId)}/documents/${encodeURIComponent(fileId)}/download`;
    const fetchWithAuth = async (): Promise<Response> => {
      const headers = new Headers();
      const user = getStoredUser();
      if (user?.accessToken) headers.set('Authorization', `Bearer ${user.accessToken}`);
      return fetch(url, { headers, credentials: 'include' });
    };
    let res = await fetchWithAuth();
    if (res.status === 401) {
      const refreshed = await tryRefreshSession();
      if (refreshed?.accessToken) {
        res = await fetchWithAuth();
      }
    }
    if (!res.ok) {
      throw new ApiError(`Không thể tải tệp (${res.status}).`, res.status);
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objUrl;
    anchor.download = fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objUrl);
  },
  getLoChains: (courseId: string) =>
    invoke(() => mockApi.getLoChains(courseId), `/courses/${encodeURIComponent(courseId)}/learning-outcomes/chains`),
  getCourseConceptsContentOverview: (courseId: string): Promise<CourseConceptsContentOverview> =>
    invoke(
      () => mockApi.getCourseConceptsContentOverview(courseId),
      `/teacher/courses/${encodeURIComponent(courseId)}/concepts/content-overview`,
    ),
  getNodeEditor: (nodeId: string): Promise<NodeEditorData> =>
    invoke(() => mockApi.getNodeEditor(nodeId), `/teacher/nodes/${encodeURIComponent(nodeId)}`),
  updateConceptMetadata: (
    nodeId: string,
    input: { title?: string; durationMin?: number },
  ): Promise<NodeEditorData> =>
    invoke(
      () => mockApi.updateConceptMetadata(nodeId, input),
      `/teacher/nodes/${encodeURIComponent(nodeId)}`,
      json('PATCH', input),
    ),
  upsertNodeContent: (
    nodeId: string,
    input: {
      id?: string | null;
      title: string;
      role: 'definition' | 'example';
      bodyText?: string | null;
      url?: string | null;
      pageFrom?: number | null;
      pageTo?: number | null;
      status: 'draft' | 'approved';
    },
  ): Promise<ContentItem> => {
    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (USE_MOCK_API) {
      return mockApi.upsertNodeContent(nodeId, input);
    }
    const payload = {
      title: input.title.trim(),
      role: input.role,
      body_text: input.bodyText?.trim() || null,
      url: input.url?.trim() || null,
      page_from: input.pageFrom ?? null,
      page_to: input.pageFrom != null ? (input.pageTo ?? input.pageFrom) : null,
      status: input.status,
    };
    if (input.id && isUuid(input.id)) {
      return request<ContentItem>(
        `/teacher/nodes/${encodeURIComponent(nodeId)}/contents/${encodeURIComponent(input.id)}`,
        json('PUT', payload),
      );
    }
    return request<ContentItem>(`/teacher/nodes/${encodeURIComponent(nodeId)}/contents`, json('POST', payload));
  },
  deleteNodeContent: (nodeId: string, contentId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteNodeContent(nodeId, contentId),
      `/teacher/nodes/${encodeURIComponent(nodeId)}/contents/${encodeURIComponent(contentId)}`,
      { method: 'DELETE' },
    ),
  getContentHistory: (contentId: string): Promise<ContentHistoryItem[]> =>
    invoke(
      () => mockApi.getContentHistory(contentId),
      `/teacher/contents/${encodeURIComponent(contentId)}/history`,
    ),
  deleteNodeItem: (nodeId: string, itemId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteNodeItem(nodeId, itemId),
      `/teacher/nodes/${encodeURIComponent(nodeId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    ),
  upsertConceptQuiz: (nodeId: string, input: UpsertConceptQuizInput): Promise<ConceptQuiz> =>
    invoke(
      () => mockApi.upsertConceptQuiz(nodeId, input),
      `/teacher/nodes/${encodeURIComponent(nodeId)}/quiz`,
      json('PUT', input),
    ),
  deleteConceptQuiz: (nodeId: string, quizId: string): Promise<void> =>
    invoke(
      () => mockApi.deleteConceptQuiz(nodeId, quizId),
      `/teacher/nodes/${encodeURIComponent(nodeId)}/quizzes/${encodeURIComponent(quizId)}`,
      { method: 'DELETE' },
    ),
  saveNodeEditor: async (
    courseId: string,
    nodeId: string,
    input: {
      name?: string;
      description?: string;
      contents?: NodeEditorData['contents'];
      questions?: NodeEditorData['questions'];
    },
  ): Promise<NodeEditorData> => {
    if (USE_MOCK_API) {
      return mockApi.saveNodeEditor(courseId, nodeId, input);
    }
    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (input.name !== undefined) {
      await request(
        `/teacher/nodes/${encodeURIComponent(nodeId)}`,
        json('PATCH', { title: input.name }),
      );
    }
    if (input.contents) {
      for (const item of input.contents) {
        const body = {
          title: item.title,
          role: item.role ?? (item.kind === 'Example' ? 'example' : 'definition'),
          body_text: item.bodyText || item.source || item.title,
          url: item.url ?? null,
          page_from: item.pageFrom ?? null,
          page_to: item.pageFrom != null ? (item.pageTo ?? item.pageFrom) : null,
          status: item.status,
        };
        if (isUuid(item.id)) {
          await request(`/teacher/nodes/${encodeURIComponent(nodeId)}/contents/${encodeURIComponent(item.id)}`, json('PUT', body));
        } else {
          await request(`/teacher/nodes/${encodeURIComponent(nodeId)}/contents`, json('POST', body));
        }
      }
    }
    if (input.questions) {
      const bloomMap: Record<string, number> = {
        'Nhớ': 1,
        'Hiểu': 2,
        'Áp dụng': 3,
        'Phân tích': 4,
        'Đánh giá': 5,
        'Sáng tạo': 6,
      };
      for (const q of input.questions) {
        const body = {
          stem: q.text,
          options: q.options ?? [],
          correct_answer: q.correctAnswer ?? { option_id: '' },
          explanation: q.explanation ?? '',
          bloom_level: bloomMap[q.bloom] ?? q.bloomLevel ?? 2,
          status: q.status,
        };
        if (isUuid(q.id)) {
          await request(`/teacher/nodes/${encodeURIComponent(nodeId)}/items/${encodeURIComponent(q.id)}`, json('PUT', body));
        } else {
          await request(`/teacher/nodes/${encodeURIComponent(nodeId)}/items`, json('POST', body));
        }
      }
    }
    return api.getNodeEditor(nodeId);
  },

  /* ==================== D1–D5 Course Graph Authoring Workflow ==================== */
  uploadCourseSyllabus: (courseId: string, file: File): Promise<{ syllabusId: string }> => {
    const form = new FormData();
    form.append('file', file);
    return invoke(
      () => mockApi.uploadCourseSyllabus(courseId, file),
      `/courses/${encodeURIComponent(courseId)}/syllabus`,
      { method: 'POST', body: form },
    );
  },
  createOutlineJob: (
    courseId: string,
    syllabusId: string,
    idempotencyKey: string,
  ): Promise<{ jobId: string; status: string }> =>
    invoke(
      () => mockApi.createOutlineJob(courseId, syllabusId, idempotencyKey),
      `/courses/${encodeURIComponent(courseId)}/outline-jobs`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ syllabusId }) },
    ),
  getOutlineDraft: (courseId: string): Promise<OutlineDraftResponse> =>
    invoke(() => mockApi.getOutlineDraft(courseId), `/courses/${encodeURIComponent(courseId)}/outline/draft`),
  saveOutlineDraft: (
    courseId: string,
    outline: CourseOutlineData,
    expectedRevision: number,
  ): Promise<OutlineDraftResponse> =>
    invoke(
      () => mockApi.saveOutlineDraft(courseId, outline, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/outline/draft`,
      json('PUT', { outline, expectedRevision }),
    ),
  approveOutline: (
    courseId: string,
    expectedRevision: number,
  ): Promise<{ state: 'OUTLINE_APPROVED'; revision: number }> =>
    invoke(
      () => mockApi.approveOutline(courseId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/outline/approval`,
      json('POST', { expectedRevision }),
    ),

  reopenChapter: (
    courseId: string,
    chapterId: string,
    expectedRevision: number,
  ): Promise<{ draftId: string; state: 'DRAFT'; revision: number }> =>
    invoke(
      () => mockApi.reopenChapter(courseId, chapterId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/reopen`,
      json('POST', { expectedRevision }),
    ),
  uploadChapterDocument: (
    courseId: string,
    chapterId: string,
    file: File,
  ): Promise<{ documentId: string; revision: number }> => {
    const form = new FormData();
    form.append('file', file);
    return invoke(
      () => mockApi.uploadChapterDocument(courseId, chapterId, file),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/documents`,
      { method: 'POST', body: form },
    );
  },
  createLessonJob: (
    courseId: string,
    chapterId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<{ jobId: string; status: string }> =>
    invoke(
      () => mockApi.createLessonJob(courseId, chapterId, expectedRevision, idempotencyKey),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lesson-jobs`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ expectedRevision }) },
    ),
  getChapterLessons: (
    courseId: string,
    chapterId: string,
    cursor?: string | null,
    limit = 20,
  ): Promise<{ items: ChapterLessonItem[]; nextCursor: string | null; revision: number }> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return invoke(
      () => mockApi.getChapterLessons(courseId, chapterId, cursor, limit),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons?${params.toString()}`,
    );
  },
  reviewChapterLesson: (
    courseId: string,
    chapterId: string,
    lessonId: string,
    input: { decision: ReviewDecision; changes?: Partial<ChapterLessonItem>; reviewNote?: string; expectedRevision: number },
  ): Promise<{ lesson: ChapterLessonItem; revision: number }> =>
    invoke(
      () => mockApi.reviewChapterLesson(courseId, chapterId, lessonId, input),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons/${encodeURIComponent(lessonId)}`,
      json('PATCH', input),
    ),
  batchReviewChapterLessons: (
    courseId: string,
    chapterId: string,
    input: {
      items: Array<{ lessonId: string; decision: ReviewDecision; changes?: Partial<ChapterLessonItem>; reviewNote?: string }>;
      expectedRevision: number;
    },
  ): Promise<{ updatedCount: number; revision: number }> =>
    invoke(
      () => mockApi.batchReviewChapterLessons(courseId, chapterId, input),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons/batch-review`,
      json('POST', input),
    ),
  createChapterLesson: (
    courseId: string,
    chapterId: string,
    input: {
      title: string;
      content: string;
      level?: 'topic' | 'lesson';
      loCodes?: string[];
      outcome?: string;
      durationMin?: number;
      aliases?: string[];
      slideId?: string;
      reviewNote?: string;
      expectedRevision: number;
    },
  ): Promise<{ lesson: ChapterLessonItem; revision: number }> =>
    invoke(
      () => mockApi.createChapterLesson(courseId, chapterId, input),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons`,
      json('POST', input),
    ),
  deleteChapterLesson: (
    courseId: string,
    chapterId: string,
    lessonId: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean; mode?: 'removed' | 'rejected'; revision: number }> =>
    invoke(
      () => mockApi.deleteChapterLesson(courseId, chapterId, lessonId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons/${encodeURIComponent(lessonId)}?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
      { method: 'DELETE' },
    ),
  approveChapterLessons: (
    courseId: string,
    chapterId: string,
    expectedRevision: number,
  ): Promise<{ state: 'LESSON_APPROVED'; revision: number }> =>
    invoke(
      () => mockApi.approveChapterLessons(courseId, chapterId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lesson-approval`,
      json('POST', { expectedRevision }),
    ),
  discardChapterLessons: (
    courseId: string,
    chapterId: string,
    expectedRevision: number,
  ): Promise<{ state: 'DRAFT'; revision: number }> =>
    invoke(
      () => mockApi.discardChapterLessons(courseId, chapterId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/lessons/discard`,
      json('POST', { expectedRevision }),
    ),

  listStep3Snapshots: (courseId: string): Promise<Step3SnapshotSummary[]> =>
    invoke(
      () => mockApi.listStep3Snapshots(courseId),
      `/courses/${encodeURIComponent(courseId)}/step3/snapshots`,
    ),
  getStep3Workspace: (
    courseId: string,
    params: { focusWeekId: string; weekIds: string[]; snapshotId?: string | null },
  ): Promise<Step3WorkspaceResponse> => {
    const qs = new URLSearchParams({ focusWeekId: params.focusWeekId });
    if (params.weekIds.length > 0) qs.set('weekIds', params.weekIds.join(','));
    if (params.snapshotId === null) qs.set('snapshotId', 'none');
    else if (params.snapshotId) qs.set('snapshotId', params.snapshotId);
    return invoke(
      () => mockApi.getStep3Workspace(courseId, params),
      `/courses/${encodeURIComponent(courseId)}/step3/workspace?${qs.toString()}`,
    );
  },
  saveStep3Snapshot: (
    courseId: string,
    body: {
      focusWeekId: string;
      selectedWeekIds: string[];
      baseSnapshotId?: string | null;
      title?: string;
      note?: string;
      expectedRevision: number;
    },
  ): Promise<{ snapshot: Step3SnapshotSummary; snapshots: Step3SnapshotSummary[]; revision: number }> =>
    invoke(
      () => mockApi.saveStep3Snapshot(courseId, body),
      `/courses/${encodeURIComponent(courseId)}/step3/snapshots`,
      json('POST', body),
    ),

  createRelationJob: (
    courseId: string,
    chapterIds: string[],
    expectedRevision: number,
    idempotencyKey: string,
    options?: {
      contextWeekIds?: string[];
      baseSnapshotId?: string | null;
      useExplicitContext?: boolean;
    },
  ): Promise<{ jobId: string; status: string }> => {
    const weekId = chapterIds[0] ?? 'week_1';
    return invoke(
      () => mockApi.createRelationJob(courseId, chapterIds, expectedRevision, idempotencyKey),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relation-jobs`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          expectedRevision,
          ...(options?.useExplicitContext
            ? {
                useExplicitContext: true,
                contextWeekIds: options.contextWeekIds ?? [],
                baseSnapshotId: options.baseSnapshotId ?? null,
              }
            : {}),
        }),
      },
    );
  },
  getCourseRelations: (
    courseId: string,
    cursor?: string | null,
    limit = 20,
    weekId = 'week_1',
  ): Promise<{
    items: CourseRelationItem[];
    nextCursor: string | null;
    revision: number;
    endpoints?: RelationEndpointOption[];
  }> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return invoke(
      () => mockApi.getCourseRelations(courseId, cursor, limit, weekId),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relations?${params.toString()}`,
    );
  },
  reviewCourseRelation: (
    courseId: string,
    relationId: string,
    input: { decision: ReviewDecision; changes?: Partial<CourseRelationItem>; reviewNote?: string; expectedRevision: number },
    weekId = 'week_1',
  ): Promise<{ relation: CourseRelationItem; revision: number }> =>
    invoke(
      () => mockApi.reviewCourseRelation(courseId, relationId, input, weekId),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relations/${encodeURIComponent(relationId)}`,
      json('PATCH', input),
    ),
  createCourseRelation: (
    courseId: string,
    input: {
      sourceId: string;
      targetId: string;
      relationType: 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO';
      strength?: 'hard' | 'soft' | null;
      reason: string;
      requiredKnowledge?: string;
      reviewNote?: string;
      contextWeekIds?: string[];
      baseSnapshotId?: string | null;
      expectedRevision: number;
    },
    weekId = 'week_1',
  ): Promise<{ relation: CourseRelationItem; revision: number }> =>
    invoke(
      () => mockApi.createCourseRelation(courseId, input, weekId),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relations`,
      json('POST', input),
    ),
  deleteCourseRelation: (
    courseId: string,
    relationId: string,
    expectedRevision: number,
    weekId = 'week_1',
  ): Promise<{ deleted: boolean; revision: number }> =>
    invoke(
      () => mockApi.deleteCourseRelation(courseId, relationId, expectedRevision, weekId),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relations/${encodeURIComponent(relationId)}?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
      { method: 'DELETE' },
    ),
  batchReviewCourseRelations: (
    courseId: string,
    input: {
      items: Array<{ relationId: string; decision: ReviewDecision; changes?: Partial<CourseRelationItem>; reviewNote?: string }>;
      expectedRevision: number;
    },
    weekId = 'week_1',
  ): Promise<{ updatedCount: number; revision: number }> =>
    invoke(
      () => mockApi.batchReviewCourseRelations(courseId, input, weekId),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/relations/batch-review`,
      json('POST', input),
    ),
  discardCourseRelations: (courseId: string, expectedRevision: number, weekId?: string): Promise<{ revision: number }> =>
    invoke(
      () => mockApi.discardCourseRelations(courseId, expectedRevision, weekId),
      `/courses/${encodeURIComponent(courseId)}/relations/discard`,
      json('POST', weekId ? { expectedRevision, weekId } : { expectedRevision }),
    ),
  rebaseWeek: (
    courseId: string,
    weekId: string,
    expectedRevision: number,
  ): Promise<{ weekId: string; revision: number; masterVersion: number }> =>
    invoke(
      () => mockApi.rebaseWeek(courseId, weekId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/rebase`,
      json('POST', { expectedRevision }),
    ),
  publishWeekToMaster: (
    courseId: string,
    weekId: string,
    expectedRevision: number,
  ): Promise<{ state: 'PUBLISHED'; weekId: string; revision: number; masterVersion: number }> =>
    invoke(
      () => mockApi.publishWeekToMaster(courseId, weekId, expectedRevision),
      `/courses/${encodeURIComponent(courseId)}/weeks/${encodeURIComponent(weekId)}/publish`,
      json('POST', { expectedRevision }),
    ),
  getPublicationStatus: (courseId: string, publicationId: string): Promise<PublicationStatusResponse> =>
    invoke(
      () => mockApi.getPublicationStatus(courseId, publicationId),
      `/courses/${encodeURIComponent(courseId)}/publications/${encodeURIComponent(publicationId)}`,
    ),

  publishCourseGraph: (
    courseId: string,
    expectedRevision: number,
    expectedMasterVersion: number,
    idempotencyKey: string,
    draftId?: string,
  ): Promise<PublishCourseResponse> =>
    invoke(
      () => mockApi.publishCourseGraph(courseId, expectedRevision, expectedMasterVersion, idempotencyKey, draftId),
      `/courses/${encodeURIComponent(courseId)}/publish`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          expectedRevision,
          expectedMasterVersion,
          ...(draftId ? { draftId } : {}),
        }),
      },
    ),
  recoverCoursePublish: (courseId: string, publicationId: string): Promise<PublishCourseResponse> =>
    invoke(
      () => mockApi.recoverCoursePublish(courseId, publicationId),
      `/courses/${encodeURIComponent(courseId)}/publish/recover`,
      json('POST', { publicationId }),
    ),

  getWorkflowJob: (jobId: string): Promise<WorkflowJobResponse> =>
    invoke(() => mockApi.getWorkflowJob(jobId), `/jobs/${encodeURIComponent(jobId)}`),
  resumeWorkflowJob: (jobId: string, idempotencyKey: string): Promise<{ jobId: string; status: 'QUEUED' }> =>
    invoke(
      () => mockApi.resumeWorkflowJob(jobId, idempotencyKey),
      `/jobs/${encodeURIComponent(jobId)}/resume`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
    ),
  getChapterSourceReadiness: (courseId: string, chapterId: string): Promise<SourceReadinessResponse> =>
    invoke(
      () => mockApi.getChapterSourceReadiness(courseId, chapterId),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/source-readiness`,
    ),
  excludeChapterOcrPages: (
    courseId: string,
    chapterId: string,
    body: { expectedRevision: number; slideIds?: string[]; reason?: string },
  ): Promise<{ revision: number; remainingOcrPages: Array<{ slideId: string; file: string; page: number }>; excludedCount: number }> =>
    invoke(
      () => mockApi.excludeChapterOcrPages(courseId, chapterId, body),
      `/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}/exclude-ocr-pages`,
      json('POST', body),
    ),
  getCourseUsage: (courseId: string): Promise<CourseUsageSummary> =>
    invoke(
      () => mockApi.getCourseUsage(courseId),
      `/courses/${encodeURIComponent(courseId)}/usage`,
    ),
  getAdaptiveSettings: (courseId: string): Promise<AdaptiveCourseSettings> =>
    invoke(
      () => mockApi.getAdaptiveSettings(courseId),
      `/teacher/courses/${encodeURIComponent(courseId)}/adaptive-settings`,
    ),
  saveAdaptiveSettings: (courseId: string, settings: AdaptiveCourseSettings): Promise<AdaptiveCourseSettings> =>
    invoke(
      () => mockApi.saveAdaptiveSettings(courseId, settings),
      `/teacher/courses/${encodeURIComponent(courseId)}/adaptive-settings`,
      json('PUT', settings),
    ),

};
