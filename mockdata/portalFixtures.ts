import type {
  Announcement, Assignment, AttendanceSession, CalendarEvent, ConversationMessage, ConversationSummary,
  CourseSection, DashboardActivity, MessageContact, RosterStudent, StudentGradeItem, TeacherGradeRow,
  TeacherCourseTopic, CourseOverallGrade,
} from '../src/types';

export const dashboardActivities: DashboardActivity[] = [
  { id: 'act-1', dueAt: '2026-11-09T23:59:00+07:00', title: 'Khảo sát học phần', courseId: 'SP1043', courseCode: 'SP1043', description: 'Khảo sát môn học cần hoàn thành trước hạn.', type: 'survey' },
  { id: 'act-2', dueAt: '2026-11-09T23:59:00+07:00', title: 'Khảo sát học phần', courseId: 'CO2011', courseCode: 'CO2011', description: 'Khảo sát môn học cần hoàn thành trước hạn.', type: 'survey' },
  { id: 'act-3', dueAt: '2026-11-09T23:59:00+07:00', title: 'Khảo sát học phần', courseId: 'IM1022', courseCode: 'IM1022', description: 'Khảo sát môn học cần hoàn thành trước hạn.', type: 'survey' },
  { id: 'act-4', dueAt: '2026-11-15T23:59:00+07:00', title: 'Nộp báo cáo bài tập lớn', courseId: 'CO3001', courseCode: 'CO3001', description: 'Bài tập lớn học kỳ 261.', type: 'assignment' },
  { id: 'act-5', dueAt: '2026-11-22T23:59:00+07:00', title: 'Bài kiểm tra trắc nghiệm', courseId: 'CO3029', courseCode: 'CO3029', description: 'Bài kiểm tra giữa kỳ trực tuyến.', type: 'quiz', targetId: 'quiz-co3029' },
  { id: 'act-6', dueAt: '2026-11-28T23:59:00+07:00', title: 'Nộp bài tập lớn', courseId: 'CO2003', courseCode: 'CO2003', description: 'Bài tập lớn cuối buổi học.', type: 'assignment' },
];

export const calendarEvents: CalendarEvent[] = [
  { id: 'cal-1', date: '2026-11-02', title: 'Thuyết trình nhóm', type: 'info', courseCode: 'CO3001' },
  { id: 'cal-2', date: '2026-11-09', title: 'Khảo sát SP1043', type: 'warning', courseCode: 'SP1043' },
  { id: 'cal-3', date: '2026-11-09', title: 'Khảo sát CO2011', type: 'warning', courseCode: 'CO2011' },
  { id: 'cal-4', date: '2026-11-14', title: 'Bài tập lớn', type: 'warning', courseCode: 'CO3001' },
  { id: 'cal-5', date: '2026-11-15', title: 'Buổi học 1: Lý thuyết', type: 'info', courseCode: 'CO2003' },
  { id: 'cal-6', date: '2026-11-15', title: 'Buổi học 1: Bài tập', type: 'info', courseCode: 'CO2003' },
  { id: 'cal-7', date: '2026-11-17', title: 'Distributed systems', type: 'info', courseCode: 'CO3029' },
  { id: 'cal-8', date: '2026-11-22', title: 'Kiểm tra trắc nghiệm', type: 'warning', courseCode: 'CO3029' },
  { id: 'cal-9', date: '2026-11-28', title: 'Bài tập lớn', type: 'warning', courseCode: 'CO2003' },
];

export const homepageSlides = [
  {
    id: 'guide',
    titleVi: 'Hướng dẫn sử dụng hệ thống',
    titleEn: 'System user guide',
    subtitleVi: 'Dành cho Giảng viên & Sinh viên',
    subtitleEn: 'For lecturers and students',
    linkVi: 'Xem chi tiết',
    linkEn: 'View details',
    imageUrl: 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'activities',
    titleVi: 'Thông tin Hoạt động Sinh viên',
    titleEn: 'Student Activities',
    subtitleVi: 'Student Affairs & Ngoại khóa 2026',
    subtitleEn: 'Student affairs and extracurricular activities',
    linkVi: 'Khám phá ngay',
    linkEn: 'Explore now',
    imageUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'academic',
    titleVi: 'Thông báo Học vụ & Đăng ký môn',
    titleEn: 'Academic Notices & Course Registration',
    subtitleVi: 'Kế hoạch đào tạo và thời khóa biểu học kỳ mới',
    subtitleEn: 'Academic plan and the new semester timetable',
    linkVi: 'Xem lịch trình',
    linkEn: 'View schedule',
    imageUrl: 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?q=80&w=1600&auto=format&fit=crop',
  },
];

export const studentCourseSections: CourseSection[] = [
  { id: 'announcements', titleVi: 'Thông báo', titleEn: 'Announcements', items: [] },
  { id: 'assignments', titleVi: 'Bài tập lớn', titleEn: 'Assignments', items: [] },
  {
    id: 'materials', titleVi: 'Tài liệu môn học', titleEn: 'Course materials',
    items: [
      { id: 'dsa-syllabus', nameVi: 'Đề cương môn Cấu trúc dữ liệu & Giải thuật', nameEn: 'DSA Course Syllabus', kind: 'pdf' },
      { id: 'dsa-book-1', nameVi: 'Giáo trình Data Structures and Algorithms (Weiss)', nameEn: 'DSA Textbook (Weiss)', kind: 'pdf' },
      { id: 'dsa-roadmap', nameVi: 'Lộ trình học 12 tuần và chuẩn đầu ra', nameEn: '12-week learning roadmap', kind: 'slides' },
    ],
  },
  { id: 'quizzes', titleVi: 'Đề ôn luyện và Quiz', titleEn: 'Practice exercises and quizzes', items: [] },
  {
    id: 'ch1', titleVi: 'Buổi học 1: Độ phức tạp thuật toán & Con trỏ', titleEn: 'Session 1: Complexity & Pointers',
    items: [
      { id: 'dsa-ch1-slides', nameVi: 'Slide 1 - Ký pháp Big-O, Omega, Theta và phân tích đệ quy', nameEn: 'Big-O & Recursion Analysis Slides', kind: 'slides' },
      { id: 'dsa-ch1-video', nameVi: 'Video: Con trỏ, cấp phát động và tránh rò rỉ bộ nhớ', nameEn: 'Video: Pointers & Dynamic Allocation', kind: 'video' },
      { id: 'dsa-ch1-quiz', nameVi: 'Quiz: Độ phức tạp thuật toán & Con trỏ', nameEn: 'Quiz: Complexity & Pointers', kind: 'quiz' },
    ],
  },
  {
    id: 'ch2', titleVi: 'Buổi học 2: Danh sách liên kết (Linked List)', titleEn: 'Session 2: Linked Lists',
    items: [
      { id: 'dsa-ch2-slides', nameVi: 'Slide 2 - Danh sách liên kết đơn, đôi, vòng', nameEn: 'Singly, Doubly & Circular Linked Lists Slides', kind: 'slides' },
      { id: 'dsa-ch2-video', nameVi: 'Video: Thao tác chèn, xóa node và đảo ngược danh sách', nameEn: 'Video: Insert, Delete & Reverse Linked List', kind: 'video' },
      { id: 'dsa-ch2-quiz', nameVi: 'Quiz: Danh sách liên kết', nameEn: 'Quiz: Linked Lists', kind: 'quiz' },
    ],
  },
  {
    id: 'ch3', titleVi: 'Buổi học 3: Ngăn xếp (Stack) & Hàng đợi (Queue)', titleEn: 'Session 3: Stack & Queue',
    items: [
      { id: 'dsa-ch3-slides', nameVi: 'Slide 3 - Cài đặt Stack, Queue bằng mảng và con trỏ', nameEn: 'Array & Pointer Stack/Queue Implementation', kind: 'slides' },
      { id: 'dsa-ch3-video', nameVi: 'Video: Ứng dụng Stack tính biểu thức hậu tố (Postfix)', nameEn: 'Video: Postfix Evaluation with Stack', kind: 'video' },
      { id: 'dsa-ch3-quiz', nameVi: 'Quiz: Stack & Queue', nameEn: 'Quiz: Stack & Queue', kind: 'quiz' },
    ],
  },
  {
    id: 'ch4', titleVi: 'Buổi học 4: Cây & Cây nhị phân tìm kiếm (BST)', titleEn: 'Session 4: Trees & BST',
    items: [
      { id: 'dsa-ch4-slides', nameVi: 'Slide 4 - Duyệt cây NLR, LNR, LRN và cân bằng AVL', nameEn: 'Tree Traversals & AVL Balancing Slides', kind: 'slides' },
      { id: 'dsa-ch4-video', nameVi: 'Video: Thêm, xóa node trong BST và phép xoay AVL', nameEn: 'Video: BST Operations & AVL Rotations', kind: 'video' },
      { id: 'dsa-ch4-quiz', nameVi: 'Quiz: Cây & Cây nhị phân tìm kiếm', nameEn: 'Quiz: Trees & BST', kind: 'quiz' },
    ],
  },
  {
    id: 'ch5', titleVi: 'Buổi học 5: Sắp xếp, Heap & Đồ thị', titleEn: 'Session 5: Sorting, Heap & Graphs',
    items: [
      { id: 'dsa-ch5-slides', nameVi: 'Slide 5 - QuickSort, MergeSort, HeapSort, BFS/DFS & Dijkstra', nameEn: 'Sorting, Heaps & Graph Algorithms Slides', kind: 'slides' },
      { id: 'dsa-ch5-video', nameVi: 'Video: So sánh độ phức tạp các thuật toán sắp xếp và tìm đường', nameEn: 'Video: Sorting & Shortest Path Walkthrough', kind: 'video' },
      { id: 'dsa-ch5-quiz', nameVi: 'Quiz: Sắp xếp & Đồ thị', nameEn: 'Quiz: Sorting & Graphs', kind: 'quiz' },
    ],
  },
];

export const networkCourseSections: CourseSection[] = [
  { id: 'overview', titleVi: 'Tổng quan môn học', titleEn: 'Course overview', items: [
    { id: 'net-syllabus', nameVi: 'Đề cương môn Mạng máy tính - đầy đủ', nameEn: 'Computer Networks syllabus', kind: 'pdf' },
    { id: 'net-roadmap', nameVi: 'Lộ trình học 15 tuần và chuẩn đầu ra', nameEn: '15-week learning roadmap', kind: 'slides' },
  ] },
  { id: 'ch1', titleVi: 'Buổi học 1: Tổng quan mạng máy tính', titleEn: 'Session 1: Introduction to Networks', items: [
    { id: 'net-ch1-slides', nameVi: 'Slide 1 - Internet, mô hình mạng và kiến trúc lớp', nameEn: 'Internet and network architecture slides', kind: 'slides' },
    { id: 'net-ch1-video', nameVi: 'Video: Internet hoạt động như thế nào', nameEn: 'Video: How the Internet works', kind: 'video' },
    { id: 'net-ch1-quiz', nameVi: 'Quiz 10 câu: mô hình mạng và mạng biên', nameEn: '10-question network fundamentals quiz', kind: 'quiz' },
  ] },
  { id: 'ch2', titleVi: 'Buổi học 2: Tầng ứng dụng', titleEn: 'Session 2: Application Layer', items: [
    { id: 'net-http-slides', nameVi: 'Slide HTTP, DNS, SMTP và truyền tải peer-to-peer', nameEn: 'HTTP, DNS, SMTP and peer-to-peer slides', kind: 'slides' },
    { id: 'net-dns-video', nameVi: 'Video thực hành phân tích DNS và HTTP bằng Wireshark', nameEn: 'DNS and HTTP Wireshark lab video', kind: 'video' },
    { id: 'net-app-quiz', nameVi: 'Quiz tầng ứng dụng và giao thức mạng', nameEn: 'Application layer protocol quiz', kind: 'quiz' },
  ] },
  { id: 'ch3', titleVi: 'Buổi học 3: Tầng giao vận', titleEn: 'Session 3: Transport Layer', items: [
    { id: 'net-tcp-slides', nameVi: 'Slide TCP, UDP, điều khiển luồng và kiểm soát tắc nghẽn', nameEn: 'TCP, UDP, flow and congestion control', kind: 'slides' },
    { id: 'net-tcp-video', nameVi: 'Video mô phỏng bắt tay TCP ba bước và truyền dữ liệu tin cậy', nameEn: 'TCP three-way handshake video', kind: 'video' },
    { id: 'net-tcp-quiz', nameVi: 'Quiz TCP/UDP: tình huống và phân tích', nameEn: 'TCP/UDP scenarios quiz', kind: 'quiz' },
  ] },
  { id: 'ch4', titleVi: 'Buổi học 4-5: Tầng mạng và liên kết dữ liệu', titleEn: 'Network and Data Link Layers', items: [
    { id: 'net-routing-slides', nameVi: 'Slide định tuyến, IP, Ethernet và Switch', nameEn: 'Routing, IP, Ethernet and switching slides', kind: 'slides' },
    { id: 'net-routing-video', nameVi: 'Video tính toán Distance Vector và Link State', nameEn: 'Routing algorithm walkthrough video', kind: 'video' },
    { id: 'net-routing-quiz', nameVi: 'Quiz định tuyến, ARP và Ethernet', nameEn: 'Routing, ARP and Ethernet quiz', kind: 'quiz' },
  ] },
  { id: 'security', titleVi: 'Buổi học 6: An toàn mạng', titleEn: 'Session 6: Network Security', items: [
    { id: 'net-security-slides', nameVi: 'Slide mã hóa, xác thực và bảo mật truyền dữ liệu', nameEn: 'Encryption, authentication and secure transport slides', kind: 'slides' },
    { id: 'net-security-video', nameVi: 'Video phân tích HTTPS và chứng thư số', nameEn: 'HTTPS and digital certificate video', kind: 'video' },
    { id: 'net-security-quiz', nameVi: 'Quiz cơ chế bảo mật mạng', nameEn: 'Network security quiz', kind: 'quiz' },
  ] },
];

export const studentGradesByCourse: Record<string, StudentGradeItem[]> = {
  CO2003: [
    { id: 'midterm', category: 'manual', titleVi: 'Giữa kỳ', titleEn: 'Midterm', score: 9, maxScore: 10, weight: 0.3, feedback: null },
    { id: 'project', category: 'manual', titleVi: 'Bài tập lớn', titleEn: 'Course project', score: 8.5, maxScore: 10, weight: 0.25, feedback: null },
    { id: 'final', category: 'manual', titleVi: 'Cuối kỳ', titleEn: 'Final exam', score: 7.5, maxScore: 10, weight: 0.35, feedback: null },
    { id: 'attendance', category: 'attendance', titleVi: 'Điểm danh', titleEn: 'Attendance', score: 75, maxScore: 100, weight: 0.1, feedback: null },
  ],
  MT2013: [
    { id: 'midterm', category: 'manual', titleVi: 'Giữa kỳ', titleEn: 'Midterm', score: 8, maxScore: 10, weight: 0.4, feedback: null },
    { id: 'final', category: 'manual', titleVi: 'Cuối kỳ', titleEn: 'Final exam', score: 7.3333, maxScore: 10, weight: 0.6, feedback: null },
  ],
  CO3093: [
    { id: 'midterm', category: 'manual', titleVi: 'Giữa kỳ', titleEn: 'Midterm', score: 8.4, maxScore: 10, weight: 0.3, feedback: null },
    { id: 'project', category: 'manual', titleVi: 'Bài tập lớn', titleEn: 'Course project', score: null, maxScore: 10, weight: 0.25, feedback: null },
    { id: 'final', category: 'manual', titleVi: 'Cuối kỳ', titleEn: 'Final exam', score: null, maxScore: 10, weight: 0.35, feedback: null },
    { id: 'attendance', category: 'attendance', titleVi: 'Điểm danh', titleEn: 'Attendance', score: 100, maxScore: 100, weight: 0.1, feedback: null },
  ],
};

export const courseOverallGrades: CourseOverallGrade[] = [
  { courseId: 'CO2003', courseCode: 'CO2003', courseTitle: 'Cấu trúc dữ liệu và giải thuật', term: 'HK261', credits: 4, finalScore: 8.2, maxScore: 10, letterGrade: 'B+', status: 'published' },
  { courseId: 'MT2013', courseCode: 'MT2013', courseTitle: 'Xác suất thống kê', term: 'HK261', credits: 3, finalScore: 7.6, maxScore: 10, letterGrade: 'B', status: 'published' },
  { courseId: 'CO3093', courseCode: 'CO3093', courseTitle: 'Mạng máy tính', term: 'HK261', credits: 3, finalScore: null, maxScore: 10, letterGrade: null, status: 'in_progress' },
];

const firstNames = [
  'An', 'Anh', 'Bình', 'Chi', 'Dũng', 'Dung', 'Giang', 'Hải', 'Hạnh', 'Hoa',
  'Hùng', 'Huy', 'Khoa', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'My',
  'Nam', 'Ngân', 'Ngọc', 'Nhân', 'Phát', 'Phong', 'Phương', 'Quân', 'Quang', 'Quỳnh',
  'Thảo', 'Thiện', 'Thịnh', 'Thu', 'Trang', 'Trung', 'Tú', 'Uyên', 'Việt', 'Vy',
  'Bảo', 'Châu', 'Đạt', 'Đức', 'Hiếu', 'Khang', 'Kiên', 'Lộc', 'Phúc', 'Tài',
];
const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'];

export const teacherRoster: RosterStudent[] = firstNames.map((name, index) => {
  const id = `225${String(2001 + index).padStart(4, '0')}`;
  const fullName = `${lastNames[index % lastNames.length]} ${name}`;
  const day = String(18 + (index % 5)).padStart(2, '0');
  const hour = String(8 + (index % 12)).padStart(2, '0');
  const min = String((index * 7) % 60).padStart(2, '0');
  const sec = String((index * 13) % 60).padStart(2, '0');
  return {
    id,
    name: fullName,
    email: `sv.${id}@hcmut.edu.vn`,
    enrolledAt: `2026-09-${String(1 + (index % 15)).padStart(2, '0')}`,
    lastUpdatedAt: `2026-11-${day}T${hour}:${min}:${sec}+07:00`,
    status: 'active',
    progress: 45 + ((index * 11) % 56),
  };
});

export const teacherGradebook: TeacherGradeRow[] = teacherRoster.map((student, index) => ({
  ...student,
  midterm: Number((7.2 + (index * 17 % 28) / 10).toFixed(1)),
  project: Number((6.8 + (index * 13 % 32) / 10).toFixed(1)),
  final: Number((7 + (index * 19 % 30) / 10).toFixed(1)),
  attendance: 80 + (index * 7 % 21),
  totalScore: Number((
    (7.2 + (index * 17 % 28) / 10) * 0.3
    + (6.8 + (index * 13 % 32) / 10) * 0.25
    + (7 + (index * 19 % 30) / 10) * 0.35
    + (80 + (index * 7 % 21)) / 100 * 0.1
  ).toFixed(1)),
}));

export const attendanceSessions: AttendanceSession[] = [
  {
    id: 'attendance-2026-11-07', courseId: 'CO3093', title: 'Thực hành Wireshark',
    date: '2026-11-07', status: 'published',
    records: teacherRoster.map((student, index) => ({
      studentId: student.id, name: student.name,
      status: index % 12 === 0 ? 'absent' : index % 9 === 0 ? 'late' : 'present',
    })),
  },
  {
    id: 'attendance-2026-11-14', courseId: 'CO3093', title: 'Tầng giao vận',
    date: '2026-11-14', status: 'published',
    records: teacherRoster.map((student, index) => ({
      studentId: student.id, name: student.name,
      status: index % 15 === 0 ? 'excused' : index % 10 === 0 ? 'absent' : 'present',
    })),
  },
  {
    id: 'dsa-attendance-1', courseId: 'CO2003', title: 'Thực hành Danh sách liên kết & Con trỏ',
    date: '2026-11-05', status: 'published',
    records: teacherRoster.map((student, index) => ({
      studentId: student.id, name: student.name,
      status: index % 14 === 0 ? 'absent' : index % 11 === 0 ? 'late' : 'present',
    })),
  },
  {
    id: 'dsa-attendance-2', courseId: 'CO2003', title: 'Thực hành Stack, Queue & Cây BST',
    date: '2026-11-12', status: 'published',
    records: teacherRoster.map((student, index) => ({
      studentId: student.id, name: student.name,
      status: index % 16 === 0 ? 'excused' : index % 13 === 0 ? 'absent' : 'present',
    })),
  },
];

export const teacherCourseTopics: TeacherCourseTopic[] = [
  { id: 'topic-1', number: '01', titleVi: 'Tổng quan Internet và kiến trúc mạng', titleEn: 'Internet overview and network architecture', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'topic-2', number: '02', titleVi: 'Tầng ứng dụng: HTTP, DNS, SMTP', titleEn: 'Application layer: HTTP, DNS, SMTP', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'topic-3', number: '03', titleVi: 'Tầng giao vận: TCP và UDP', titleEn: 'Transport layer: TCP and UDP', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'topic-4', number: '04-05', titleVi: 'Tầng mạng và liên kết dữ liệu', titleEn: 'Network and data link layers', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'topic-6', number: '06', titleVi: 'An toàn mạng', titleEn: 'Network security', resources: ['Slide', 'Video', 'Quiz'] },
];

export const dsaTeacherCourseTopics: TeacherCourseTopic[] = [
  { id: 'dsa-topic-1', number: '01', titleVi: 'Độ phức tạp thuật toán & Con trỏ', titleEn: 'Algorithm complexity and pointers', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'dsa-topic-2', number: '02', titleVi: 'Danh sách liên kết đơn, đôi, vòng', titleEn: 'Singly, doubly and circular linked lists', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'dsa-topic-3', number: '03', titleVi: 'Ngăn xếp (Stack) & Hàng đợi (Queue)', titleEn: 'Stack and Queue', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'dsa-topic-4', number: '04', titleVi: 'Cây nhị phân tìm kiếm (BST) & AVL', titleEn: 'Binary search trees and AVL', resources: ['Slide', 'Video', 'Quiz'] },
  { id: 'dsa-topic-5', number: '05', titleVi: 'Sắp xếp, Heap & Thuật toán đồ thị', titleEn: 'Sorting, Heaps and Graph algorithms', resources: ['Slide', 'Video', 'Quiz'] },
];

export const assignments: Assignment[] = [
  {
    id: 'asg-1', courseId: 'CO3093', title: 'Báo cáo phân tích giao thức TCP',
    description: 'Phân tích một phiên TCP bằng Wireshark và nộp báo cáo PDF.',
    dueAt: '2026-11-30T23:59:00+07:00', maxScore: 10, status: 'published',
    submissionStatus: 'not_submitted',
  },
  {
    id: 'asg-2', courseId: 'CO3093', title: 'Bài tập tầng ứng dụng',
    description: 'Trả lời câu hỏi về HTTP, DNS và cache.',
    dueAt: '2026-11-10T23:59:00+07:00', maxScore: 10, status: 'published',
    submissionStatus: 'graded', submittedAt: '2026-11-09T20:10:00+07:00',
    score: 8.5, feedback: 'Phân tích tốt, cần bổ sung nguồn tham khảo.',
    submissionText: 'Đã nộp báo cáo.',
  },
  {
    id: 'asg-3', courseId: 'CO3093', title: 'Bản nháp bài thực hành định tuyến',
    description: 'Nội dung đang được giảng viên soạn.',
    dueAt: '2026-12-10T23:59:00+07:00', maxScore: 10, status: 'draft',
  },
  {
    id: 'dsa-asg-1', courseId: 'CO2003', title: 'Bài tập lớn 1: Cài đặt Danh sách liên kết & Stack/Queue',
    description: 'Hiện thực lớp SinglyLinkedList và Stack/Queue ứng dụng tính giá trị biểu thức hậu tố bằng C++.',
    dueAt: '2026-11-28T23:59:00+07:00', maxScore: 10, status: 'published',
    submissionStatus: 'not_submitted',
  },
  {
    id: 'dsa-asg-2', courseId: 'CO2003', title: 'Bài tập thực hành Cây BST & AVL',
    description: 'Cài đặt các phép chèn, xóa, xoay trái/phải và kiểm tra độ cân bằng cây AVL.',
    dueAt: '2026-11-12T23:59:00+07:00', maxScore: 10, status: 'published',
    submissionStatus: 'graded', submittedAt: '2026-11-11T19:45:00+07:00',
    score: 9.0, feedback: 'Code sạch, xử lý đầy đủ trường hợp xoay kép LR/RL.',
    submissionText: 'Đã nộp file AVLTree.cpp và báo cáo kiểm thử.',
  },
];

export const courseAnnouncements: Announcement[] = [
  {
    id: 'ann-1', courseId: 'CO3093', title: 'Cập nhật lịch thực hành Wireshark',
    body: 'Buổi thực hành được chuyển sang phòng máy B1. Thời gian học giữ nguyên theo lịch.',
    status: 'published', createdAt: '2026-11-10T03:00:00Z', publishedAt: '2026-11-10T03:00:00Z',
  },
  {
    id: 'ann-2', courseId: 'CO3093', title: 'Tài liệu ôn tập cuối kỳ',
    body: 'Tổng hợp nội dung ôn tập các buổi học 1 đến 6.',
    status: 'published', createdAt: '2026-11-12T03:00:00Z', publishedAt: '2026-11-12T03:00:00Z',
  },
  {
    id: 'dsa-ann-1', courseId: 'CO2003', title: 'Hướng dẫn nộp Bài tập lớn 1 (Danh sách liên kết)',
    body: 'Sinh viên kiểm tra kỹ memory leak bằng Valgrind trước khi nộp lên hệ thống.',
    status: 'published', createdAt: '2026-11-08T02:30:00Z', publishedAt: '2026-11-08T02:30:00Z',
  },
  {
    id: 'dsa-ann-2', courseId: 'CO2003', title: 'Lịch phụ đạo Cây AVL và Đồ thị trước kỳ thi',
    body: 'Giảng viên mở buổi phụ đạo trực tuyến vào 19h00 thứ Sáu tuần này.',
    status: 'published', createdAt: '2026-11-15T04:00:00Z', publishedAt: '2026-11-15T04:00:00Z',
  },
];

export const loginHeroStats = [
  { value: '12,400+', labelVi: 'Học viên', labelEn: 'Learners' },
  { value: '380', labelVi: 'Khóa học', labelEn: 'Courses' },
  { value: '98%', labelVi: 'Hoàn thành', labelEn: 'Completion' },
];

export const profileDetails = {
  student: { id: '2252001', fieldVi: 'Khoa học Máy tính', fieldEn: 'Computer Science', labelVi: 'Ngành', labelEn: 'Major', extra: '2022-2026' },
  teacher: { id: 'GV-0148', fieldVi: 'Khoa Khoa học Máy tính', fieldEn: 'Faculty of Computer Science', labelVi: 'Khoa', labelEn: 'Faculty', extra: 'Lecturer' },
};

export const notifications = [
  { id: 'n1', title: 'Hạn nộp: Khảo sát môn học HK261', description: 'Vui lòng hoàn thành khảo sát môn Mô hình hóa Toán học trước 23:59 hôm nay.', time: '2 giờ trước', read: false },
  { id: 'n2', title: 'Thông báo cập nhật lịch thi giữa kỳ', description: 'Phòng Đào tạo đã đăng tải lịch thi chính thức cho các lớp học phần.', time: 'Hôm qua', read: false },
  { id: 'n3', title: 'Bài tập lớn: Đã cập nhật đề cương', description: 'Giảng viên đã tải lên tài liệu hướng dẫn nhóm.', time: '3 ngày trước', read: true },
];

export const messages = [
  { id: 'msg-1', initials: 'GV', sender: 'Thầy Phạm An Vinh', time: '10:45', preview: 'Nhóm em kiểm tra lại câu hỏi số 2 nhé...', unread: true },
  { id: 'msg-2', initials: 'LT', sender: 'Lớp trưởng CO3029', time: 'Hôm qua', preview: 'Link drive bài nộp chung ở đây nha các bạn.', unread: true },
];

export const messageContacts: MessageContact[] = [
  { id: 'usr-teacher-1', name: 'Thầy Phạm An Vinh', initials: 'AV', role: 'teacher', courseCode: 'CO3093' },
  { id: 'usr-class-lead', name: 'Lớp trưởng CO3029', initials: 'LT', role: 'student', courseCode: 'CO3029' },
  { id: 'usr-teacher-2', name: 'Cô Nguyễn Thảo', initials: 'NT', role: 'teacher', courseCode: 'CO2003' },
];

export const conversations: ConversationSummary[] = [
  {
    id: 'conv-co3093', participantId: 'usr-teacher-1', participantName: 'Thầy Phạm An Vinh',
    initials: 'AV', courseCode: 'CO3093', lastMessage: 'Nhóm em kiểm tra lại câu hỏi số 2 nhé...',
    lastMessageAt: '2026-11-15T10:45:00+07:00', unreadCount: 1,
  },
  {
    id: 'conv-co3029', participantId: 'usr-class-lead', participantName: 'Lớp trưởng CO3029',
    initials: 'LT', courseCode: 'CO3029', lastMessage: 'Link drive bài nộp chung ở đây nha các bạn.',
    lastMessageAt: '2026-11-14T16:30:00+07:00', unreadCount: 1,
  },
];

export const conversationMessages: Record<string, ConversationMessage[]> = {
  'conv-co3093': [
    { id: 'msg-101', conversationId: 'conv-co3093', senderId: 'usr-teacher-1', senderName: 'Thầy Phạm An Vinh', body: 'Chào em, thầy đã xem phần trả lời của nhóm.', sentAt: '2026-11-15T10:30:00+07:00' },
    { id: 'msg-102', conversationId: 'conv-co3093', senderId: 'usr-demo', senderName: 'Nguyễn Anh', body: 'Dạ nhóm em sẽ rà soát lại ạ.', sentAt: '2026-11-15T10:38:00+07:00' },
    { id: 'msg-103', conversationId: 'conv-co3093', senderId: 'usr-teacher-1', senderName: 'Thầy Phạm An Vinh', body: 'Nhóm em kiểm tra lại câu hỏi số 2 nhé...', sentAt: '2026-11-15T10:45:00+07:00' },
  ],
  'conv-co3029': [
    { id: 'msg-201', conversationId: 'conv-co3029', senderId: 'usr-class-lead', senderName: 'Lớp trưởng CO3029', body: 'Link drive bài nộp chung ở đây nha các bạn.', sentAt: '2026-11-14T16:30:00+07:00' },
  ],
};
