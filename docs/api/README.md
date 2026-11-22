# Backend API Contract — G4LMS Frontend (`g4lms-FE`)

Tài liệu này đặc tả toàn bộ hợp đồng API mà Frontend (`src/api/client.ts`, `src/api/graphGenerator.ts`, `src/types/index.ts`) kỳ vọng từ LMS Backend và AI Graph Generator Service.

---

## 1. Quy ước chung

- **Base URL (LMS Backend):** Cấu hình qua `VITE_API_URL` (mặc định `/api`). Trong môi trường dev (`vite.config.ts`), `/api` được proxy tới `VITE_BACKEND_URL` (`http://localhost:8000`).
- **Base URL (AI Graph Generator Service):** Cấu hình qua `VITE_GRAPH_GEN_URL` (mặc định `/graph-gen`), được proxy tới `VITE_GRAPH_GEN_TARGET` (`http://127.0.0.1:8765`, bỏ prefix `/graph-gen`).
- **Chế độ Mock:** `VITE_USE_MOCK_API !== 'false'` sẽ dùng `mockdata/service.ts` thay cho HTTP request thật.
- **Authentication:** Gửi kèm header `Authorization: Bearer <accessToken>` cho mọi endpoint yêu cầu đăng nhập.
  - Nếu server trả `401` (trừ `/auth/login`), FE tự xóa `localStorage['g4lms.user']` và phát sự kiện `g4lms:unauthorized` để chuyển về trang đăng nhập.
- **Content-Type:** Mặc định `application/json` (trừ upload file dùng `multipart/form-data` với field `file`).
- **Status `204 No Content`:** Dùng cho các thao tác `DELETE` hoặc đánh dấu đã đọc không cần body trả về.
- **Định dạng lỗi:** HTTP `4xx/5xx` trả về JSON dạng:
  ```json
  { "message": "Mô tả lỗi", "detail": "Chi tiết (hoặc mảng { msg })", "code": "ERROR_CODE" }
  ```
- **Idempotency & Optimistic Locking (Luồng D1–D5):**
  - Các endpoint tạo job/publish yêu cầu header `Idempotency-Key`.
  - Các endpoint cập nhật bản nháp/duyệt sử dụng `expectedRevision` (và `expectedMasterVersion` khi publish) để tránh ghi đè đồng thời.

---

## 2. Auth & Profile

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| `POST` | `/auth/login` | `{ identity, password, role }` | `{ user: Omit<User, 'accessToken'>, accessToken }` |
| `POST` | `/auth/logout` | — | `204` |
| `POST` | `/auth/change-password` | `{ currentPassword, newPassword }` | `{ user: User, accessToken }` |
| `GET` | `/me/profile` | — | `ProfileRecord` (hoặc `ProfileDetails`) |
| `PATCH` | `/me/profile` | `{ fullName, dateOfBirth }` | `ProfileRecord` |

---

## 3. Home, Dashboard, Thông báo & Tin nhắn

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| `GET` | `/dashboard` | — | `DashboardData` (`{ activities, calendarEvents }`) |
| `GET` | `/home/slides` | — | `HomeSlide[]` |
| `GET` | `/home/login-stats` | — | `LoginHeroStat[]` |
| `GET` | `/home/announcements` | — | `AdminAnnouncementRecord[]` |
| `GET` | `/notifications` | — | `NotificationRecord[]` |
| `POST` | `/notifications/read-all` | `{}` | `204` |
| `GET` | `/messages` | — | `MessagePreview[]` |
| `GET` | `/conversations` | — | `ConversationSummary[]` |
| `GET` | `/conversations/contacts` | — | `MessageContact[]` |
| `POST` | `/conversations` | `{ recipientId, message }` | `ConversationSummary` |
| `GET` | `/conversations/:conversationId/messages` | — | `ConversationMessage[]` |
| `POST` | `/conversations/:conversationId/messages` | `{ body }` | `ConversationMessage` |
| `PATCH` | `/conversations/:conversationId/read` | `{}` | `204` |

---

## 4. Admin Portal (`/admin/*`)

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| `GET` | `/admin/stats` | — | `AdminStats` |
| `GET` | `/admin/users` | — | `AdminUser[]` |
| `POST` | `/admin/users` | `{ email, fullName, role, initialPassword }` | `AdminUser` |
| `POST` | `/admin/users/:userId/reset-password` | `{ temporaryPassword }` | `204` |
| `DELETE` | `/admin/users/:userId` | — | `204` |
| `GET` | `/admin/enrollments` | — | `{ students, courses, enrollments }` |
| `POST` | `/admin/enrollments` | `{ studentId, courseId }` | `AdminEnrollment` |
| `DELETE` | `/admin/enrollments/:enrollmentId` | — | `204` |
| `GET` | `/admin/courses` | — | `AdminCourseRecord[]` |
| `POST` | `/admin/courses` | `{ code, title, description?, faculty, semester?, year?, theme?, published?, lecturerId? }` | `AdminCourseRecord` |
| `PATCH` | `/admin/courses/:courseId` | `UpdateTeacherCourseInput` | `AdminCourseRecord` |
| `DELETE` | `/admin/courses/:courseId` | — | `204` |
| `GET` | `/admin/announcements` | — | `AdminAnnouncementRecord[]` |
| `POST` | `/admin/announcements` | `{ title, body, courseId?, isGlobal?, status? }` | `AdminAnnouncementRecord` |
| `PATCH` | `/admin/announcements/:announcementId` | `{ title?, body?, status?, isGlobal? }` | `AdminAnnouncementRecord` |
| `DELETE` | `/admin/announcements/:announcementId` | — | `204` |

---

## 5. Student Portal (`/student/*`)

| Method | Endpoint | Query / Body | Response |
|---|---|---|---|
| `GET` | `/student/courses` | — | `StudentCourse[]` |
| `GET` | `/courses/:courseId/sections` | — | `CourseSection[]` |
| `GET` | `/student/grades` | — | `CourseOverallGrade[]` |
| `GET` | `/student/courses/:courseId/grades` | — | `StudentGradeItem[]` |
| `GET` | `/student/courses/:courseId/attendance` | — | `StudentAttendanceData` |
| `GET` | `/student/courses/:courseId/assignments` | — | `Assignment[]` |
| `POST` | `/student/courses/:courseId/assignments/:assignmentId/submissions` | `{ text }` | `Assignment` |
| `GET` | `/student/courses/:courseId/announcements` | — | `Announcement[]` |
| `GET` | `/student/courses/:courseId/quizzes` | — | `Quiz[]` |
| `GET` | `/student/courses/:courseId/quizzes/:quizId` | — | `Quiz` |
| `POST` | `/student/courses/:courseId/quizzes/:quizId/attempts` | `{}` | `QuizAttempt` |
| `POST` | `/student/courses/:courseId/quizzes/:quizId/attempts/:attemptId/submit` | `{ answers: Record<string, string> }` | `QuizAttempt` |
| `GET` | `/student/learning-profile` | `?course_id=...` (optional) | `StudentLearningProfile` |
| `GET` | `/student/courses/:courseId/recommendations` | — | `CourseRecommendation[]` |
| `GET` | `/student/courses/:courseId/learning-outcomes` | — | `LearningOutcome[]` |
| `GET` | `/student/courses/:courseId/graph` | `?cluster_id=...` (optional) | `StudentGraph` |
| `GET` | `/student/nodes/:nodeId` | — | `NodeDetail` |

---

## 6. Teacher Portal (`/teacher/*`)

### 6.1. Khóa học, Lớp học & Bảng điểm

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| `GET` | `/teacher/courses` | — | `TeacherCourse[]` |
| `POST` | `/teacher/courses` | `CreateTeacherCourseInput` | `TeacherCourse` |
| `PATCH` | `/teacher/courses/:courseId` | `UpdateTeacherCourseInput` | `TeacherCourse` |
| `DELETE` | `/teacher/courses/:courseId` | — | `204` |
| `GET` | `/teacher/courses/:courseId/students` | — | `RosterStudent[]` |
| `GET` | `/teacher/courses/:courseId/gradebook` | — | `TeacherGradeRow[]` |
| `PATCH` | `/teacher/courses/:courseId/gradebook/:studentId` | `{ midterm, project, final, attendance }` | `TeacherGradeRow` |
| `GET` | `/teacher/courses/:courseId/topics` | — | `TeacherCourseTopic[]` |
| `GET` | `/teacher/courses/:courseId/documents` | — | `CourseFile[]` / `PdfFile[]` |
| `POST` | `/teacher/courses/:courseId/documents` | `FormData` (`file`) | `CourseFile` |
| `GET` | `/teacher/courses/:courseId/adaptive-settings` | — | `AdaptiveCourseSettings` |
| `PUT` | `/teacher/courses/:courseId/adaptive-settings` | `AdaptiveCourseSettings` | `AdaptiveCourseSettings` |

### 6.2. Thông báo, Bài tập, Trắc nghiệm & Điểm danh

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| `GET` | `/teacher/courses/:courseId/announcements` | — | `Announcement[]` |
| `POST` | `/teacher/courses/:courseId/announcements` | `{ title, body }` | `Announcement` |
| `PATCH` | `/teacher/courses/:courseId/announcements/:announcementId` | `{ title?, body?, status? }` | `Announcement` |
| `DELETE` | `/teacher/courses/:courseId/announcements/:announcementId` | — | `204` |
| `GET` | `/teacher/courses/:courseId/assignments` | — | `Assignment[]` |
| `POST` | `/teacher/courses/:courseId/assignments` | `{ title, description, dueAt, maxScore }` | `Assignment` |
| `PATCH` | `/teacher/courses/:courseId/assignments/:assignmentId` | `UpdateAssignmentInput` | `Assignment` |
| `DELETE` | `/teacher/courses/:courseId/assignments/:assignmentId` | — | `204` |
| `GET` | `/teacher/courses/:courseId/assignments/:assignmentId/submissions` | — | `AssignmentSubmissionRecord[]` |
| `PATCH` | `/teacher/courses/:courseId/assignments/:assignmentId/submissions/:submissionId` | `{ score, feedback? }` | `AssignmentSubmissionRecord` |
| `GET` | `/teacher/courses/:courseId/quizzes` | — | `Quiz[]` |
| `POST` | `/teacher/courses/:courseId/quizzes` | `CreateQuizInput` | `Quiz` |
| `PATCH` | `/teacher/courses/:courseId/quizzes/:quizId` | `{ status }` | `Quiz` |
| `GET` | `/teacher/courses/:courseId/attendance` | — | `AttendanceSession[]` |
| `POST` | `/teacher/courses/:courseId/attendance/sessions` | `{ title, date }` | `AttendanceSession` |
| `PATCH` | `/teacher/courses/:courseId/attendance/sessions/:sessionId` | `{ records, status }` | `AttendanceSession` |
| `DELETE` | `/teacher/courses/:courseId/attendance/sessions/:sessionId` | — | `204` |

---

## 7. Knowledge Graph & Analytics

| Method | Endpoint | Query / Body | Response |
|---|---|---|---|
| `GET` | `/courses/:courseId/knowledge-graph` | — | `KnowledgeGraphData` (`{ nodes, edges }`) |
| `POST` | `/teacher/courses/:courseId/knowledge-graph/generate` | `{}` | `KnowledgeGraphData` hoặc `{ jobId, status }` (FE poll tối đa 60 lần, mỗi 1s) |
| `GET` | `/teacher/courses/:courseId/knowledge-graph/jobs/:jobId` | — | `{ status: 'completed' \| 'failed' \| ..., errorMessage? }` |
| `GET` | `/courses/:courseId/graph` | — | `TeacherGraphData` |
| `GET` | `/courses/:courseId/clusters/:clusterId` | — | `ClusterView` |
| `GET` | `/courses/:courseId/learning-outcomes/chains` | — | LO Chains |
| `GET` | `/teacher/courses/:courseId/graph` | — | `TeacherGraphData` |
| `GET` | `/teacher/clusters/:clusterId` | — | `ClusterView` |
| `POST` | `/teacher/courses/:courseId/graph/nodes` | `{ name, nodeType?, clusterId?, description?, x?, y?, lo?, properties? }` | `Record<string, unknown>` |
| `PATCH` | `/teacher/courses/:courseId/graph/nodes/:nodeId` | `{ name?, description?, status?, approved?, lo?, properties? }` | `Record<string, unknown>` |
| `DELETE` | `/teacher/courses/:courseId/graph/nodes/:nodeId` | — | `204` |
| `POST` | `/teacher/courses/:courseId/graph/nodes/merge` | `{ keepId, mergeId }` | `{ id: string }` |
| `POST` | `/teacher/courses/:courseId/graph/edges` | `{ fromId, toId, kind, properties? }` | `{ from, to, kind }` |
| `DELETE` | `/teacher/courses/:courseId/graph/edges` | `{ fromId, toId, edgeType? }` | `204` |
| `POST` | `/teacher/courses/:courseId/graph/edges/approve` | `{ fromId, toId, edgeType? }` | `204` |
| `GET` | `/teacher/courses/:courseId/review-queue` | — | `QueueSummary` |
| `GET` | `/teacher/analytics/heatmap` | `?cluster_id=...` (optional) | `HeatSpot` |
| `GET` | `/teacher/nodes/:nodeId` | — | `NodeEditorData` |

---

## 8. D1–D5 Course Graph Authoring Workflow & Async Jobs

### D1 — Khung chương trình (Outline)
| Method | Endpoint | Headers / Body | Response |
|---|---|---|---|
| `POST` | `/courses/:courseId/syllabus` | `FormData` (`file`) | `{ syllabusId: string }` |
| `POST` | `/courses/:courseId/outline-jobs` | `Idempotency-Key`, `{ syllabusId }` | `{ jobId: string, status: string }` |
| `GET` | `/courses/:courseId/outline/draft` | — | `OutlineDraftResponse` (`{ outline, state, revision }`) |
| `PUT` | `/courses/:courseId/outline/draft` | `{ outline, expectedRevision }` | `OutlineDraftResponse` |
| `POST` | `/courses/:courseId/outline/approval` | `{ expectedRevision }` | `{ state: 'OUTLINE_APPROVED', revision }` |

### D2 — Bài học theo chương (Chapter Lessons)
| Method | Endpoint | Headers / Query / Body | Response |
|---|---|---|---|
| `POST` | `/courses/:courseId/chapters/:chapterId/reopen` | `{ expectedRevision }` | `{ draftId, state: 'DRAFT', revision }` |
| `POST` | `/courses/:courseId/chapters/:chapterId/documents` | `FormData` (`file`) | `{ documentId, revision }` |
| `POST` | `/courses/:courseId/chapters/:chapterId/lesson-jobs` | `Idempotency-Key`, `{ expectedRevision }` | `{ jobId, status }` |
| `GET` | `/courses/:courseId/chapters/:chapterId/lessons` | `?limit=20&cursor=...` | `{ items: ChapterLessonItem[], nextCursor, revision }` |
| `PATCH` | `/courses/:courseId/chapters/:chapterId/lessons/:lessonId` | `{ decision, changes?, reviewNote?, expectedRevision }` | `{ lesson: ChapterLessonItem, revision }` |
| `POST` | `/courses/:courseId/chapters/:chapterId/lessons/batch-review` | `{ items, expectedRevision }` | `{ updatedCount, revision }` |
| `POST` | `/courses/:courseId/chapters/:chapterId/lesson-approval` | `{ expectedRevision }` | `{ state: 'LESSON_APPROVED', revision }` |
| `POST` | `/courses/:courseId/chapters/:chapterId/lessons/discard` | `{ expectedRevision }` | `{ state: 'DRAFT', revision }` |
| `GET` | `/courses/:courseId/chapters/:chapterId/source-readiness` | — | `SourceReadinessResponse` |
| `GET` | `/courses/:courseId/usage` | — | `CourseUsageSummary` |

### D3 — Quan hệ liên chương (Cross-Chapter Relations)
| Method | Endpoint | Headers / Query / Body | Response |
|---|---|---|---|
| `POST` | `/courses/:courseId/relation-jobs` | `Idempotency-Key`, `{ chapterIds, expectedRevision }` | `{ jobId, status }` |
| `GET` | `/courses/:courseId/relations` | `?limit=20&cursor=...` | `{ items: CourseRelationItem[], nextCursor, revision }` |
| `PATCH` | `/courses/:courseId/relations/:relationId` | `{ decision, changes?, reviewNote?, expectedRevision }` | `{ relation: CourseRelationItem, revision }` |
| `POST` | `/courses/:courseId/relations/batch-review` | `{ items, expectedRevision }` | `{ updatedCount, revision }` |
| `POST` | `/courses/:courseId/relations/discard` | `{ expectedRevision }` | `{ revision }` |

### D4 — Xuất bản Master Graph (Publish)
| Method | Endpoint | Headers / Body | Response |
|---|---|---|---|
| `POST` | `/courses/:courseId/publish` | `Idempotency-Key`, `{ expectedRevision, expectedMasterVersion }` | `PublishCourseResponse` |
| `POST` | `/courses/:courseId/publish/recover` | `{ publicationId }` | `PublishCourseResponse` |

### D5 — Theo dõi Async Jobs
| Method | Endpoint | Headers / Body | Response |
|---|---|---|---|
| `GET` | `/jobs/:jobId` | — | `WorkflowJobResponse` |
| `POST` | `/jobs/:jobId/resume` | `Idempotency-Key` | `{ jobId, status: 'QUEUED' }` |

---

## 9. Tham chiếu Schema chính (`src/types/index.ts`)

```ts
// User & Auth
type Role = 'student' | 'teacher' | 'admin';
interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  accessToken?: string;
  passwordResetRequired?: boolean;
}

// Knowledge Graph
type KnowledgeNodeType = 'Course' | 'LO' | 'Concept' | 'Assignment' | 'Item' | 'Content' | string;
type KnowledgeEdgeType = 'PREREQUISITE' | 'PART_OF' | 'RELATED_TO' | 'DEVELOP' | 'EXPLAIN' | 'ASSESS' | string;

interface KnowledgeGraphData {
  nodes: Array<{ id: string; name: string; type: KnowledgeNodeType; description?: string; properties?: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; type: KnowledgeEdgeType; properties?: Record<string, unknown> }>;
}

// D1–D5 Workflow
type OutlineState = 'DRAFT' | 'OUTLINE_REVIEW' | 'OUTLINE_APPROVED';
type ChapterWorkflowState = 'DRAFT' | 'LESSON_REVIEW' | 'LESSON_APPROVED' | 'PUBLISHED';
type ReviewDecision = 'PENDING' | 'APPROVE' | 'EDIT' | 'REJECT';
type WorkflowJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'BLOCKED' | 'FAILED';

interface WorkflowJobResponse {
  jobId?: string;
  status: WorkflowJobStatus;
  progress: number;
  result?: { revision?: number; [key: string]: unknown };
  error?: string;
  canResume: boolean;
  resumeCount: number;
  maxResumeAttempts: number;
  resumeBlockedReason?: string;
}

interface PublishCourseResponse {
  state: 'PUBLISHED' | 'PUBLISHING';
  revision: number;
  masterVersion: number;
  warnings: string[];
  publicationId?: string;
}

interface SourceReadinessResponse {
  status: 'ready' | 'warning' | 'blocked';
  canGenerate: boolean;
  counts: { totalPages: number; readablePages: number; lowTextPages: number };
  warnings: string[];
  revision: number;
}

interface CourseUsageSummary {
  totalCalls: number;
  providerReportedCostUsd: number;
  estimatedCostUsd: number;
  budgetLimitUsd: number;
  remainingBudgetUsd: number;
}

interface AdaptiveCourseSettings {
  masteryThreshold: number;
  hardPrereqStrict: boolean;
  softPrereqWeight: number;
  quizWeight: number;
  assignmentWeight: number;
  remedialTriggerScore: number;
  allowSkipMastered: boolean;
  maxWeeklyMinutes: number;
}
```

---

## 10. Kiến trúc nối BE LMS → Graph Generator Service (`docs/LMS_INTEGRATION.md`)

> **Luồng chuẩn Production:** `FE` → `BE LMS (/api/*)` → `Graph Generator Service (127.0.0.1:8765)`.
> - Khi giảng viên bấm sinh (`D1/D2/D3`), **BE LMS** gọi `POST .../generate` sang Graph Generator Service, lấy `job_id` để theo dõi; bản nháp được lưu trên **SQLite** của service.
> - Khi giảng viên chốt xuất bản (`D4`), **BE LMS** gọi `database-proposals` / `database-publish` để ghi vào **PostgreSQL**, sau đó worker (`scripts/lms_database.py`) đồng bộ sang **Neo4j**.
> - Client `graphGenApi` (`src/api/graphGenerator.ts`, proxy `/graph-gen`) dùng để dev/test trực tiếp hoặc làm tham chiếu cho BE LMS.

| Method | Endpoint | Request Body / Query | Response |
|---|---|---|---|
| `GET` | `/health` | — | `{ status: string }` |
| `GET` | `/providers` | — | Model/provider config theo tác vụ |
| `GET` | `/courses` | — | `Array<CourseSummary>` |
| `POST` | `/courses` | `{ id, outline?, syllabus_text? }` | `CourseSummary` (`201`) |
| `GET` | `/courses/:courseId` | — | `CourseSummary` |
| `POST` | `/courses/:courseId/syllabus/pdf` | `?expected_revision=N`, body: raw PDF bytes (`application/pdf`) | `{ revision, next_action, message }` |
| `PUT` | `/courses/:courseId/outline` | `{ expected_revision, outline, approve, actor }` | `CourseSummary` |
| `GET` | `/courses/:courseId/chapters/:chapterId` | — | Chapter detail + `draft` + `quality_gate` + `source_readiness` |
| `GET` | `/courses/:courseId/chapters/:chapterId/source-readiness` | — | `{ status, can_generate, counts, warnings, revision }` |
| `GET` | `/courses/:courseId/chapters/:chapterId/source-revisions` | — | `{ items }` |
| `GET` | `/courses/:courseId/chapters/:chapterId/workflow` | — | Authoritative workflow state |
| `POST` | `/courses/:courseId/chapters/:chapterId/sources` | `{ expected_revision, source_id, slides }` | `CourseSummary` |
| `POST` | `/courses/:courseId/chapters/:chapterId/pdf/:sourceId` | `?expected_revision=N`, body: raw PDF bytes (`application/pdf`) | `CourseSummary` |
| `POST` | `/courses/:courseId/chapters/:chapterId/generate` | `{ expected_revision, kind: 'outline'\|'nodes'\|'relations', budget_usd? }` | `GenJobResponse` (`202`) |
| `PUT` | `/courses/:courseId/chapters/:chapterId/draft` | `{ expected_revision, draft, actor }` | `CourseSummary` |
| `POST` | `/courses/:courseId/chapters/:chapterId/approve-nodes` | `{ expected_revision, actor }` | `CourseSummary` |
| `POST` | `/courses/:courseId/chapters/:chapterId/rebase` | `{ expected_revision, actor }` | `CourseSummary` |
| `POST` | `/courses/:courseId/chapters/:chapterId/publish` | `{ expected_revision, actor }` | `CourseSummary` |
| `GET` | `/courses/:courseId/master` | `?version=N` (optional) | Master snapshot (convert sang `KnowledgeGraphData` qua `graphGenApi.toKnowledgeGraphData`) |
| `GET` | `/courses/:courseId/usage` | — | Token/cost usage summary |
| `GET` | `/courses/:courseId/events` | — | Audit events |
| `GET` | `/jobs` | `?course_id=...` (optional) | `GenJobResponse[]` |
| `GET` | `/jobs/:jobId` | — | `GenJobResponse` |
| `POST` | `/jobs/:jobId/cancel` | — | `GenJobResponse` |
| `POST` | `/jobs/:jobId/resume` | `{ budget_usd?, expected_revision?, actor? }` | `GenJobResponse` |
