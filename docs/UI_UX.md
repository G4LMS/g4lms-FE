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
    - Nút **Thông báo** & **Tin nhắn** (`28x28px`) kèm chấm đỏ (`.badge-dot`) khi có mục chưa đọc, mở popover rộng `330px` (`max-height: 280px`, cuộn dọc).
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
| Student | `/courses`, `/grades`, `/profile/student` | Danh sách khóa học, Tổng quan điểm, Hồ sơ cá nhân |
| Student (Course) | `/courses/:courseId/:tab`, `/courses/:courseId/graph`, `/assignments`, `/announcements`, `/quizzes`, `/quizzes/:quizId`, `/attendance` | Chi tiết khóa học, Bản đồ tri thức học viên, Bài tập, Thông báo, Trắc nghiệm, Điểm danh |
| Teacher | `/teacher/courses`, `/profile/teacher` | Quản lý khóa học giảng dạy, Hồ sơ giảng viên |
| Teacher (Course) | `/teacher/courses/:courseId/:tab`, `/graph`, `/nodes/:nodeId`, `/files`, `/assignments`, `/announcements`, `/quizzes`, `/attendance` | Chi tiết khóa học, Bản đồ tri thức (chỉnh sửa), Trình sửa Node, Tài liệu, Công cụ giảng dạy |
| Admin | `/admin`, `/admin/users`, `/admin/enrollments` | Bảng điều khiển quản trị, Quản lý người dùng, Quản lý ghi danh |

---

## 4. Luồng Trải nghiệm theo Vai trò

### 4.1. Học viên (`student`)
1. **Đăng nhập -> `/home` hoặc `/courses`:** Xem các khóa học truy cập gần đây, hạn nộp sắp tới, tiến độ hoàn thành và lỗ hổng kiến thức (`gap`).
2. **Chi tiết khóa học (`/courses/:courseId/:tab`):** Điều hướng nhanh giữa nội dung môn học, bài tập, bài kiểm tra, thông báo, điểm danh.
3. **Bản đồ Tri thức (`/courses/:courseId/graph`):** Khám phá cấu trúc môn học từ Môn học -> Chuẩn đầu ra (LO) -> Khái niệm (Concept) -> Bài tập/Câu hỏi/Slide; xem chi tiết node và bắt đầu học (`onStartLearning`).

### 4.2. Giảng viên (`teacher`)
1. **Quản lý khóa học (`/teacher/courses`):** Lọc khóa học theo trạng thái (`Tất cả (trừ đã ẩn)`, `Đã xuất bản`, `Chưa xuất bản`) hoặc tạo khóa học mới.
2. **Biên soạn nội dung AI 4 bước (`CourseAuthoringWizard`):** Xây dựng khung chương trình -> sinh bài học theo chương -> thiết lập quan hệ liên chương -> xuất bản Master Graph.
3. **Quản trị Bản đồ Tri thức (`/teacher/courses/:courseId/graph` & `/nodes/:nodeId`):** Bật `editMode` để kéo-ghim vị trí node, thêm/xóa/gộp node, duyệt các node/cạnh do AI đề xuất (`needsReview`), hoặc mở trang chỉnh sửa chi tiết node.

### 4.3. Quản trị viên (`admin`)
- Tập trung vào 3 màn hình chuyên biệt: Tổng quan hệ thống (`/admin`), Quản lý tài khoản & đặt lại mật khẩu tạm (`/admin/users`), và Quản lý ghi danh (`/admin/enrollments`).

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
- **Tìm kiếm toàn cục & Auto-expand:** Thanh tìm kiếm hỗ trợ tìm trên toàn bộ đồ thị; khi chọn kết quả đang bị ẩn, hệ thống tự động mở chuỗi node tổ tiên (`findAncestorPath`) và căn mượt camera tới node đích.
- **Phím tắt:**
  - `/`: Focus nhanh vào ô tìm kiếm.
  - `Esc`: Bỏ chọn / đóng trạng thái tìm kiếm.
- **Thao tác Giảng viên (khi bật `editMode`):**
  - Kéo node để ghim vị trí với **ngưỡng chống rung `4px` (drag deadzone)** để click không bị hiểu nhầm thành kéo.
  - Chấm cam báo hiệu các node/cạnh có trạng thái `proposed`, `draft`, hoặc `pending_review` (`needsReview`), hỗ trợ duyệt nhanh ngay trong bảng Inspector bên phải (`rightOpen`).

---

## 6. Đặc tả UI/UX Trình Biên soạn Khóa học (D1–D4 Wizard)

Triển khai tại [`src/features/teacher/CourseAuthoringWizard.tsx`](src/features/teacher/CourseAuthoringWizard.tsx) với thanh Stepper 4 bước và bộ theo dõi tiến trình AI (D5 Active Job Tracker):

1. **Bước 1 — D1 Outline:** Tải lên đề cương (syllabus), quản lý Chuẩn đầu ra (`learningOutcomes`) và danh sách Chương (`chapters`). Trạng thái chuyển qua `DRAFT` -> `OUTLINE_REVIEW` -> `OUTLINE_APPROVED`.
2. **Bước 2 — D2 Chapter Lessons:** Bố cục 2 cột (sidebar danh sách chương + workspace chương đang chọn). Cho phép tải tài liệu chương, sinh bài học bằng AI, phân trang danh sách bài học, chỉnh sửa tiêu đề/nội dung và ra quyết định (`PENDING`, `APPROVE`, `EDIT`, `REJECT`).
3. **Bước 3 — D3 Cross-Chapter Relations:** Chọn nhiều chương để AI gợi ý quan hệ liên chương và rà soát danh sách quan hệ có phân trang.
4. **Bước 4 — D4 Publish Master Graph:** Hiển thị cảnh báo kiểm tra trước xuất bản (`publishWarnings`), theo dõi `masterVersion` và xác nhận xuất bản đồ thị chính thức cho học viên.

---

## 7. Responsive & Trạng thái Hệ thống

- **Mobile (`@media (max-width: 700px)`):** Giảm khoảng cách các nút hành động trên header (`gap: 4px`), tự động co giãn chiều rộng popover (`min(330px, calc(100vw - 16px))`) để không tràn màn hình.
- **Trạng thái rỗng & tải dữ liệu:** Các màn hình đều cung cấp thông báo rõ ràng khi đang tải (`Đang tải tài khoản...`), khi danh sách trống (`Chưa có môn học nào được mở gần đây`, `Không có bài tập...`), và banner thông báo lỗi/thành công nhất quán trong các form thao tác.
