# Tài liệu Đặc tả UI/UX — G4LMS Frontend (`g4lms-FE`)

Tài liệu này mô tả hệ thống thiết kế, kiến trúc điều hướng, luồng trải nghiệm người dùng theo vai trò và các quy ước tương tác trong ứng dụng **G4LMS Frontend** (Vite + React + TypeScript + D3.js).

---

## 1. Tổng quan & Định hướng Trải nghiệm

- **Mục tiêu sản phẩm:** Hệ thống Quản lý Học tập (LMS) kết hợp **Bản đồ Tri thức (Knowledge Graph)** hỗ trợ 3 vai trò: **Học viên (`student`)**, **Giảng viên (`teacher`)** và **Quản trị viên (`admin`)**.
- **Ngôn ngữ giao diện:** Hỗ trợ song ngữ **Tiếng Việt (`vi`, mặc định)** và **Tiếng Anh (`en`)** qua `LanguageContext` (`src/features/i18n/LanguageContext.tsx`), lưu trạng thái vào `localStorage` (`g4lms.language`).
- **Phong cách thiết kế:** Sáng, gọn, mật độ thông tin cao vừa phải (font cơ sở `13px`), ưu tiên độ rõ ràng của phân cấp học thuật và trực quan hóa đồ thị tri thức.

---

## 2. Hệ thống Thiết kế (Design System)

Định nghĩa tập trung trong [`src/styles/global.css`](src/styles/global.css).

### 2.1. Bảng màu (Color Tokens)

| Token CSS | Mã màu | Vai trò sử dụng |
|---|---|---|
| `--primary` | `#047ea6` | Màu chủ đạo (Header, nút chính, link, trạng thái active) |
| `--primary-dark` | `#046283` | Trạng thái hover của nút chính |
| `--primary-soft` | `#e3f3f9` | Nền nhấn nhẹ (chip/option đang chọn, badge) |
| `--ink` | `#0d3b52` | Chữ đậm trên nút phụ, tiêu đề nhấn |
| `--text` | `#1f2d37` | Màu chữ nội dung chính |
| `--muted` | `#6b7b87` | Chữ phụ, mô tả, metadata, nhãn thời gian |
| `--line` | `#e2e8ed` | Viền card, bảng, đường phân cách |
| `--bg` | `#f4f7f9` | Nền phụ (header popover, hover menu, vùng đệm) |
| `--purple` / `--purple-soft` | `#7c3aed` / `#f1e9ff` | Nhấn trạng thái/thành phần bổ trợ |
| `--red` | `#dc2626` | Lỗi, cảnh báo, nút đăng xuất, badge thông báo mới |
| `--orange` | `#d97706` | Cảnh báo nhẹ, mục cần duyệt (pending review) |
| `--green` | `#16a34a` | Thành công, đã duyệt, hoàn thành |

### 2.2. Typography & Shape

- **Font chữ:** `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`, cỡ chữ mặc định `13px`, `-webkit-font-smoothing: antialiased`.
- **Phân cấp chữ phụ:** `.muted-s` (`11px`), `.muted-xs` (`10px`).
- **Bo góc:** `--radius: 8px` cho card/popover; `6px` cho nút (`.btn`) và nút icon header; `999px` cho pill/badge đếm.
- **Nút bấm:**
  - `.btn-primary`: nền `--primary`, chữ trắng.
  - `.btn-outline`: nền trắng, viền `--line`, chữ `--ink`.
  - `.btn.sm`: kích thước nhỏ gọn (`padding: 4px 10px`, `11px`).

### 2.3. Khung giao diện chung (App Shell & Header)

- **Thanh điều hướng trên cùng (`.app-header`):** Chiều cao cố định `44px`, nền `--primary`, chữ trắng.
  - **Trái:** Logo/Brand + Navigation links (`.main-nav a.active` có gạch chân trắng `2px`).
  - **Phải (`.header-right`):**
    - Toggle chế độ chỉnh sửa (`.edit-toggle`, dành cho ngữ cảnh cho phép sửa).
    - Nút **Thông báo** & **Tin nhắn** (`.icon-btn.header-action-button`, `28x28px`, icon trắng, viền `1px solid rgba(255,255,255,.35)`) kèm chấm đỏ (`.badge-dot`) khi có mục chưa đọc, mở popover rộng `330px` (`max-height: 280px`, cuộn dọc); click vào một tin nhắn trong popover Tin nhắn sẽ điều hướng thẳng tới `/messages`.
    - **Menu người dùng (`.header-user-popover`, rộng `210px`):** Hiển thị tên/email tóm tắt, liên kết hồ sơ, bộ chọn ngôn ngữ 2 cột (`vi` / `en`) và nút Đăng xuất.

---

## 3. Kiến trúc Điều hướng & Phân quyền

Định nghĩa tại [`src/App.tsx`](src/App.tsx) với hai lớp bảo vệ:
- `SignedIn`: Yêu cầu đăng nhập; nếu `user.passwordResetRequired` là `true` sẽ ép chuyển hướng tới `/change-password`. Tài khoản `admin` tự động điều hướng về `/admin`.
- `Guard`: Kiểm tra đúng `role` (`student`, `teacher`, `admin`). Nếu sai vai trò sẽ tự chuyển về trang mặc định của vai trò đó (`/courses`, `/teacher/courses`, hoặc `/admin`).

### Bản đồ Route chính

| Vai trò | Đường dẫn | Màn hình |
|---|---|---|
| Chung | `/login`, `/change-password` | Đăng nhập, Đổi mật khẩu bắt buộc |
| Student & Teacher | `/home`, `/dashboard`, `/messages` | Trang chủ, Bảng điều khiển (Timeline/Lịch), Tin nhắn |
| Student | `/courses`, `/grades`, `/profile/student`, `/preferences` | Danh sách khóa học, Tổng quan điểm, Hồ sơ cá nhân, Tùy chỉnh học tập |
| Student (Course) | `/courses/:courseId/:tab` (kèm `StudentOnboardingPanel`), `/courses/:courseId/graph`, `/courses/:courseId/learn/:nodeId`, `/assignments`, `/announcements`, `/quizzes`, `/quizzes/:quizId`, `/attendance` | Chi tiết khóa học & Khảo sát đầu vào, Bản đồ tri thức học viên, Học vi bài học theo Node, Bài tập, Thông báo, Trắc nghiệm, Điểm danh |
| Teacher | `/teacher/courses`, `/profile/teacher` | Quản lý khóa học giảng dạy, Hồ sơ giảng viên |
| Teacher (Course) | `/teacher/courses/:courseId/:tab`, `/graph`, `/nodes/:nodeId`, `/files`, `/adaptive`, `/assignments`, `/announcements`, `/quizzes`, `/attendance` | Chi tiết khóa học (bao gồm `Phân tích lớp`), Bản đồ tri thức (chỉnh sửa), Trình sửa Node, Tài liệu, Cấu hình thích ứng, Công cụ giảng dạy |
| Admin | `/admin`, `/admin/users`, `/admin/enrollments` | Bảng điều khiển quản trị, Quản lý người dùng, Quản lý ghi danh |

---

## 4. Luồng Trải nghiệm theo Vai trò

### 4.1. Học viên (`student`)
1. **Đăng nhập -> `/home` hoặc `/courses`:** Xem các khóa học truy cập gần đây, hạn nộp sắp tới, tiến độ hoàn thành và lỗ hổng kiến thức (`gap`).
2. **Chi tiết khóa học (`/courses/:courseId/:tab`):** Điều hướng nhanh giữa nội dung môn học, bài tập, bài kiểm tra, thông báo, điểm danh; hoàn thành khảo sát & bài kiểm tra đầu vào (`StudentOnboardingPanel`) để khởi tạo hồ sơ học tập (`UC-UM-03`).
3. **Bản đồ Tri thức (`/courses/:courseId/graph`) & Học Node (`/courses/:courseId/learn/:nodeId`):** Khám phá cấu trúc môn học từ Môn học -> Chuẩn đầu ra (LO) -> Khái niệm (Concept) -> Bài tập/Câu hỏi/Slide; mở trang học vi bài học (`StudentNodeLearnPage`, `UC-AL-02`).
4. **Làm bài kiểm tra (`/courses/:courseId/quizzes/:quizId`) & Tùy chỉnh (`/preferences`):** `StudentQuizPage` cảnh báo câu hỏi chưa trả lời trước khi nộp, hỗ trợ gợi ý ôn tập ở lần làm 1 và điều hướng ôn lại node tiên quyết ở lần làm 2+ (`UC-AL-03`); trang `/preferences` cho phép thiết lập tùy chọn học tập cá nhân.

### 4.2. Giảng viên (`teacher`)
1. **Quản lý khóa học (`/teacher/courses`):** Lọc khóa học theo trạng thái (`Tất cả (trừ đã ẩn)`, `Đã xuất bản`, `Chưa xuất bản`) hoặc tạo khóa học mới; hỗ trợ tải lên nhiều tài liệu cùng lúc (`PDF`, `Word`, `Excel`, `PowerPoint`, `MP4/MOV`, `ZIP`) tại `/teacher/courses/:courseId/files`.
2. **Phân tích lớp & Cấu hình thích ứng:** Tab con `Phân tích lớp` trong `TeacherCourseDetailPage` hiển thị phân phối điểm và `HeatPanel` (`UC-AN-04`); trang `/teacher/courses/:courseId/adaptive` (`TeacherAdaptiveSettingsPage`) kiểm tra tổng trọng số đạt `100%` và cấu hình khảo sát đầu vào (`UC-CC-02`).
3. **Biên soạn nội dung AI 4 bước (`CourseAuthoringWizard`) & Quản trị Đồ thị (`UnifiedCourseGraph`):** Trong `UnifiedCourseGraph`, giảng viên chuyển đổi giữa `Đồ thị tri thức` và `Dựng đồ thị (D1–D4)` (tab `Chuẩn đầu ra` tách rời đã được loại bỏ); tab con `Hiệu chỉnh` tự động mở khóa ngay sau khi xuất bản D4 (`onPublished`).
4. **Trình sửa Node (`/teacher/courses/:courseId/nodes/:nodeId`):** Thêm/sửa nội dung vi bài học (văn bản/video/tài liệu), ngưỡng đạt và quy tắc mở khóa (`UC-CC-04`); thêm/sửa ngân hàng câu hỏi (quiz/practice, đáp án, giải thích, mức Bloom, độ khó — `UC-CC-05`).

### 4.3. Quản trị viên (`admin`)
- Tập trung vào 3 màn hình chuyên biệt: Tổng quan hệ thống (`/admin`), Quản lý tài khoản (`/admin/users` — tạo/sửa `fullName`, `email`, `role`, theo dõi trạng thái `Hoạt động` / `Đã khóa`, nút Khóa/Kích hoạt tài khoản theo `UC-UM-02`, đặt lại mật khẩu tạm), và Quản lý ghi danh (`/admin/enrollments`).

---

## 5. Đặc tả UI/UX Bản đồ Tri thức (Knowledge Graph)

Triển khai tại [`src/features/graph/KnowledgeGraphCanvas.tsx`](src/features/graph/KnowledgeGraphCanvas.tsx) và [`src/features/graph/graphHierarchy.ts`](src/features/graph/graphHierarchy.ts) bằng **D3.js Force Simulation**.

### 5.1. Ontology Màu sắc & Kích thước Node

| Loại Node | Nhãn tiếng Việt | Màu nền (`fill`) | Viền (`stroke`) | Bán kính (`r`) |
|---|---|---|---|---|
| `Course` | Môn học | `#FFD86E` | `#EDBA39` | `42px` |
| `LO` | Chuẩn đầu ra | `#6DCE9E` | `#4FB383` | `34px` |
| `Assignment` | Bài tập | `#FF756E` | `#E0504A` | `32px` |
| `Concept` | Khái niệm | `#68BDF6` | `#4A9FD8` | `30px` |
| `Item` | Câu hỏi | `#F79767` | `#D97C4E` | `26px` |
| `Content` | Nội dung (slide) | `#C9CDD4` | `#A5ABB6` | `12px` |
| `More` | Xem thêm (nút ảo phân trang) | `#eef3f9` | `#0a6ed1` | `22px` |

### 5.2. Hệ thống Cạnh (Edges)

| Loại Cạnh | Nhãn tiếng Việt | Màu | Độ dày | Nét đứt | Mũi tên |
|---|---|---|---|---|---|
| `PREREQUISITE` | Tiên quyết | `#46556f` | `2px` | Liền | Có |
| `PART_OF` | Là một phần của | `#1f9d68` | `2.5px` | Liền | Có |
| `RELATED_TO` | Liên quan | `#8e98a8` | `1.6px` | `5 4` | Không |
| `DEVELOP` | Góp phần đạt | `#9b6bd1` | `1.8px` | Liền | Có |
| `EXPLAIN` | Giải thích | `#b4bac5` | `1px` | Liền | Có |
| `ASSESS` | Kiểm tra | `#f08a4b` | `1.6px` | Liền | Có |
| `MORE` | Xem thêm | `#0a6ed1` | `1.4px` | `3 3` | Không |

### 5.3. Cơ chế Hiển thị Tiệm tiến (Progressive Disclosure) & Tương tác

- **Thu gọn mặc định & Phân trang:** Tránh quá tải thị giác trên đồ thị lớn; mỗi node cha hiển thị tối đa `DEFAULT_CHILD_PAGE_SIZE = 12` node con mỗi trang và sinh nút ảo `+N xem thêm` (`More`) khi vượt ngưỡng.
- **Badge mở rộng/thu gọn (`+N` / `−`):** Click riêng vào badge trên góc node để mở rộng hoặc thu gọn nhánh con mà không làm mất ngữ cảnh camera.
- **Lọc theo Buổi học (`Buổi học (Tuần gợi ý)`):** Dropdown lọc node theo `default_week` (ẩn các node thuộc tuần khác, tự động mở rộng nhánh và căn giữa đồ thị).
- **Tìm kiếm toàn cục & Auto-expand:** Thanh tìm kiếm hỗ trợ tìm trên toàn bộ đồ thị; khi chọn kết quả đang bị ẩn, hệ thống tự động mở chuỗi node tổ tiên (`findAncestorPath`) và căn mượt camera tới node đích.
- **Phím tắt:**
  - `/`: Focus nhanh vào ô tìm kiếm.
  - `Esc`: Bỏ chọn / đóng trạng thái tìm kiếm.
- **Thao tác Giảng viên (khi bật `editMode`):**
  - Kéo node để ghim vị trí với **ngưỡng chống rung `4px` (drag deadzone)** để click không bị hiểu nhầm thành kéo.
  - Chấm cam báo hiệu các node/cạnh có trạng thái `proposed`, `draft`, hoặc `pending_review` (`needsReview`), hỗ trợ duyệt nhanh ngay trong bảng Inspector bên phải (`rightOpen`).
  - Hỗ trợ **Sửa quan hệ** trực tiếp từ Inspector cạnh (dùng chung modal thêm/sửa cạnh) và kiểm tra đầy đủ dữ liệu đầu vào (`Tạo nút & lưu nội dung`, `Xác nhận nối cạnh`).

---

## 6. Đặc tả UI/UX Trình Biên soạn Khóa học (D1–D4 Wizard)

Triển khai tại [`src/features/teacher/CourseAuthoringWizard.tsx`](src/features/teacher/CourseAuthoringWizard.tsx) với thanh Stepper 4 bước và bộ theo dõi tiến trình AI (D5 Active Job Tracker):

- **Điều hướng & Khóa bước (Step Locking):** Chỉ bước hiện tại được mở khóa (`step !== currentStep` bị khóa), trạng thái bước được lưu theo khóa học qua `sessionStorage` (`g4lms.wizard.step.${courseId}`), kèm nút **Quay lại** ở góc dưới bên trái. Nếu khóa học đã xuất bản Course Graph (`hasPublishedGraph`), Wizard tự động nhảy thẳng tới Bước 4 và khóa các bước D1–D3.

1. **Bước 1 — D1. Khung môn học:** Tải lên nhiều file đề cương cùng lúc (`PDF`, `Word`, `Excel`), quản lý Chuẩn đầu ra (`learningOutcomes`) và danh sách Chương (`chapters`).
2. **Bước 2 — D2. Bài học theo buổi học:** Bố cục 2 cột (sidebar buổi học + workspace đang chọn). Cho phép tải lên nhiều tài liệu mỗi buổi (`PDF`, `Word`, `Excel`, `PowerPoint`), sinh bài học bằng AI và rà soát quyết định (`PENDING`, `APPROVE`, `EDIT`, `REJECT`). Mọi thay đổi ở D2 tự động đánh dấu quan hệ ở Bước 3 là cần sinh lại (`relationsStale`).
3. **Bước 3 — D3. Sinh quan hệ trên toàn bộ đồ thị:** Chọn tối thiểu 2 buổi học đã duyệt để chạy `Relation Job`; sau khi sinh xong, hiển thị trực tiếp `KnowledgeGraphCanvas` đầy đủ với các thao tác `Bật hiệu chỉnh`, `Kiểm tra tính hoàn thiện`, `Sửa quan hệ` và tự động duyệt khi xác nhận.
4. **Bước 4 — D4. Xuất bản Course Graph:** Hiển thị cảnh báo kiểm tra trước xuất bản (`publishWarnings`), theo dõi phiên bản và xác nhận xuất bản Course Graph chính thức (sau khi xuất bản sẽ mở khóa tab con `Hiệu chỉnh` trong `UnifiedCourseGraph`). Bao gồm mục **Tích hợp vào Master Graph liên môn (`UC-KG-05`)** để AI đề xuất cầu nối liên môn, duyệt/từ chối và kiểm tra chu trình liên môn.

---

## 7. Responsive & Trạng thái Hệ thống

- **Mobile (`@media (max-width: 700px)`):** Giảm khoảng cách các nút hành động trên header (`gap: 4px`), tự động co giãn chiều rộng popover (`min(330px, calc(100vw - 16px))`) để không tràn màn hình.
- **Trợ giúp & Điều hướng thẻ khóa học:** `HomePage` cung cấp hộp thoại Trợ giúp nổi (floating Help dialog), `LoginPage` có phản hồi khi chọn "Liên hệ quản trị viên", và `CourseCardShell` tích hợp nút điều hướng vào khóa học.
- **Trạng thái rỗng & tải dữ liệu:** Các màn hình đều cung cấp thông báo rõ ràng khi đang tải (`Đang tải tài khoản...`), khi danh sách trống (`Chưa có môn học nào được mở gần đây`, `Không có bài tập...`), và banner thông báo lỗi/thành công nhất quán trong các form thao tác.
