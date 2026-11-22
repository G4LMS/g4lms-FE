import type { Quiz, QuizOption } from '../src/types';

export interface QuizFixture {
  quiz: Quiz;
  answerKey: Record<string, string>;
}

interface QuestionSeed {
  prompt: string;
  answer: string;
  options: QuizOption[];
}

function createMultiQuiz(
  id: string,
  courseId: string,
  title: string,
  description: string,
  timeLimitMinutes: number,
  items: QuestionSeed[],
): QuizFixture {
  const answerKey: Record<string, string> = {};
  const questions = items.map((item, idx) => {
    const qId = `${id}-q${idx + 1}`;
    answerKey[qId] = item.answer;
    return { id: qId, prompt: item.prompt, options: item.options };
  });

  return {
    quiz: {
      id,
      courseId,
      title,
      description,
      timeLimitMinutes,
      attemptsAllowed: 3,
      attemptsUsed: 0,
      status: 'published',
      questions,
    },
    answerKey,
  };
}

export const quizFixtures: QuizFixture[] = [
  /* ==================== CO3093: Mạng máy tính ==================== */
  createMultiQuiz('net-ch1-quiz', 'CO3093', 'Quiz 1: Tổng quan mạng máy tính', 'Kiểm tra kiến thức mô hình mạng biên, lõi mạng và phân giải tên miền.', 15, [
    {
      prompt: 'Giao thức nào chịu trách nhiệm phân giải tên miền sang địa chỉ IP?',
      answer: 'b',
      options: [{ id: 'a', text: 'HTTP' }, { id: 'b', text: 'DNS' }, { id: 'c', text: 'FTP' }, { id: 'd', text: 'SMTP' }],
    },
    {
      prompt: 'Độ trễ nào phụ thuộc vào tốc độ truyền (transmission rate R) của liên kết và kích thước gói tin L?',
      answer: 'c',
      options: [{ id: 'a', text: 'Trễ lan truyền (Propagation delay)' }, { id: 'b', text: 'Trễ xử lý (Processing delay)' }, { id: 'c', text: 'Trễ truyền (Transmission delay = L/R)' }, { id: 'd', text: 'Trễ hàng đợi (Queueing delay)' }],
    },
    {
      prompt: 'Kỹ thuật chuyển mạch nào phân chia băng thông cố định theo khe thời gian hoặc tần số cho mỗi cuộc gọi?',
      answer: 'a',
      options: [{ id: 'a', text: 'Chuyển mạch kênh (Circuit Switching)' }, { id: 'b', text: 'Chuyển mạch gói (Packet Switching)' }, { id: 'c', text: 'Store-and-forward' }, { id: 'd', text: 'Multicast' }],
    },
  ]),
  createMultiQuiz('net-app-quiz', 'CO3093', 'Quiz 2: Tầng ứng dụng (HTTP, DNS, SMTP)', 'Đánh giá hiểu biết về các giao thức tầng ứng dụng.', 15, [
    {
      prompt: 'HTTP thường được sử dụng để truyền loại dữ liệu nào?',
      answer: 'a',
      options: [{ id: 'a', text: 'Tài nguyên web (HTML, JSON, ảnh...)' }, { id: 'b', text: 'Bảng định tuyến' }, { id: 'c', text: 'Khung Ethernet' }, { id: 'd', text: 'Gói ARP' }],
    },
    {
      prompt: 'Mã trạng thái HTTP nào biểu thị tài nguyên không tìm thấy trên máy chủ?',
      answer: 'd',
      options: [{ id: 'a', text: '200 OK' }, { id: 'b', text: '301 Moved Permanently' }, { id: 'c', text: '400 Bad Request' }, { id: 'd', text: '404 Not Found' }],
    },
    {
      prompt: 'Giao thức nào được dùng để gửi thư điện tử giữa các mail server?',
      answer: 'b',
      options: [{ id: 'a', text: 'IMAP' }, { id: 'b', text: 'SMTP' }, { id: 'c', text: 'POP3' }, { id: 'd', text: 'SNMP' }],
    },
  ]),
  createMultiQuiz('net-tcp-quiz', 'CO3093', 'Quiz 3: Tầng giao vận (TCP và UDP)', 'So sánh cơ chế truyền tin cậy, kiểm soát luồng và tắc nghẽn.', 15, [
    {
      prompt: 'Đặc tính nào phân biệt TCP với UDP?',
      answer: 'c',
      options: [{ id: 'a', text: 'TCP không có số thứ tự' }, { id: 'b', text: 'UDP đảm bảo truyền tin cậy' }, { id: 'c', text: 'TCP thiết lập kết nối và truyền tin cậy' }, { id: 'd', text: 'UDP luôn mã hóa dữ liệu' }],
    },
    {
      prompt: 'Quá trình thiết lập kết nối TCP sử dụng cơ chế nào?',
      answer: 'b',
      options: [{ id: 'a', text: 'Bắt tay 2 bước' }, { id: 'b', text: 'Bắt tay 3 bước (SYN, SYN-ACK, ACK)' }, { id: 'c', text: 'Bắt tay 4 bước' }, { id: 'd', text: 'Không cần thiết lập kết nối' }],
    },
    {
      prompt: 'Trong kiểm soát tắc nghẽn TCP, khi nhận được 3 ACK trùng lặp (3 duplicate ACKs), TCP chuyển sang cơ chế nào?',
      answer: 'a',
      options: [{ id: 'a', text: 'Fast Retransmit / Fast Recovery' }, { id: 'b', text: 'Slow Start từ cwnd = 1' }, { id: 'c', text: 'Đóng kết nối ngay lập tức' }, { id: 'd', text: 'Tăng gấp đôi cwnd' }],
    },
  ]),
  createMultiQuiz('net-routing-quiz', 'CO3093', 'Quiz 4: Định tuyến mạng & Tầng liên kết', 'Kiến thức về IP, ARP, Ethernet và thuật toán định tuyến.', 15, [
    {
      prompt: 'Bảng định tuyến (Routing table) được dùng để làm gì?',
      answer: 'd',
      options: [{ id: 'a', text: 'Lưu mật khẩu người dùng' }, { id: 'b', text: 'Đếm số byte ứng dụng' }, { id: 'c', text: 'Mã hóa khung dữ liệu' }, { id: 'd', text: 'Chọn cổng ra chuyển tiếp gói tin IP' }],
    },
    {
      prompt: 'Giao thức ARP có nhiệm vụ ánh xạ thông tin nào sang thông tin nào trong mạng LAN?',
      answer: 'b',
      options: [{ id: 'a', text: 'Tên miền → Địa chỉ IP' }, { id: 'b', text: 'Địa chỉ IP → Địa chỉ MAC' }, { id: 'c', text: 'Địa chỉ MAC → Số cổng TCP' }, { id: 'd', text: 'Địa chỉ IPv4 → IPv6' }],
    },
    {
      prompt: 'Thuật toán định tuyến Link-State (như OSPF) sử dụng thuật toán tìm đường đi ngắn nhất nào?',
      answer: 'a',
      options: [{ id: 'a', text: 'Dijkstra' }, { id: 'b', text: 'Bellman-Ford' }, { id: 'c', text: 'Kruskal' }, { id: 'd', text: 'Floyd-Warshall' }],
    },
  ]),
  createMultiQuiz('net-security-quiz', 'CO3093', 'Quiz 5: An toàn mạng', 'Kiểm tra về mã hóa đối xứng, bất đối xứng và TLS/HTTPS.', 15, [
    {
      prompt: 'HTTPS bảo vệ dữ liệu truyền bằng cách nào?',
      answer: 'b',
      options: [{ id: 'a', text: 'Nén nội dung HTTP' }, { id: 'b', text: 'Dùng TLS để mã hóa và xác thực' }, { id: 'c', text: 'Ẩn địa chỉ IP nguồn' }, { id: 'd', text: 'Đổi DNS mỗi yêu cầu' }],
    },
    {
      prompt: 'Chữ ký số (Digital Signature) đảm bảo thuộc tính bảo mật nào?',
      answer: 'c',
      options: [{ id: 'a', text: 'Chỉ bảo mật nội dung' }, { id: 'b', text: 'Tăng tốc độ mạng' }, { id: 'c', text: 'Xác thực nguồn gốc và toàn vẹn dữ liệu' }, { id: 'd', text: 'Thay thế hoàn toàn tường lửa' }],
    },
  ]),

  /* ==================== CO2003: Cấu trúc dữ liệu và giải thuật ==================== */
  createMultiQuiz('dsa-ch1-quiz', 'CO2003', 'Quiz 1: Độ phức tạp thuật toán & Con trỏ', 'Đánh giá phân tích Big-O, đệ quy và quản lý bộ nhớ động.', 15, [
    {
      prompt: 'Độ phức tạp thời gian của thuật toán tìm kiếm nhị phân (Binary Search) trên mảng đã sắp xếp kích thước n là gì?',
      answer: 'b',
      options: [{ id: 'a', text: 'O(1)' }, { id: 'b', text: 'O(log n)' }, { id: 'c', text: 'O(n)' }, { id: 'd', text: 'O(n log n)' }],
    },
    {
      prompt: 'Hiện tượng "Dangling Pointer" (con trỏ treo) xảy ra khi nào?',
      answer: 'c',
      options: [{ id: 'a', text: 'Con trỏ được gán giá trị nullptr' }, { id: 'b', text: 'Quên cấp phát bộ nhớ trước khi dùng' }, { id: 'c', text: 'Vùng nhớ con trỏ trỏ tới đã bị giải phóng nhưng con trỏ vẫn giữ địa chỉ cũ' }, { id: 'd', text: 'Khai báo hai con trỏ cùng kiểu dữ liệu' }],
    },
    {
      prompt: 'Đoạn code có 2 vòng lặp lồng nhau chạy từ 1 đến n có độ phức tạp thời gian trường hợp xấu nhất là:',
      answer: 'd',
      options: [{ id: 'a', text: 'O(n)' }, { id: 'b', text: 'O(log n)' }, { id: 'c', text: 'O(n log n)' }, { id: 'd', text: 'O(n²)' }],
    },
  ]),
  createMultiQuiz('dsa-ch2-quiz', 'CO2003', 'Quiz 2: Danh sách liên kết (Linked List)', 'Kiểm tra thao tác chèn, xóa và so sánh với mảng.', 15, [
    {
      prompt: 'Độ phức tạp thời gian để chèn một node mới vào ĐẦU danh sách liên kết đơn (khi đã có con trỏ head) là:',
      answer: 'a',
      options: [{ id: 'a', text: 'O(1)' }, { id: 'b', text: 'O(log n)' }, { id: 'c', text: 'O(n)' }, { id: 'd', text: 'O(n²)' }],
    },
    {
      prompt: 'Ưu điểm chính của danh sách liên kết đôi (Doubly Linked List) so với danh sách liên kết đơn là gì?',
      answer: 'b',
      options: [{ id: 'a', text: 'Tốn ít bộ nhớ hơn' }, { id: 'b', text: 'Có thể duyệt ngược từ cuối về đầu và xóa node với O(1) khi có con trỏ node' }, { id: 'c', text: 'Truy cập ngẫu nhiên phần tử thứ i với O(1)' }, { id: 'd', text: 'Không cần dùng con trỏ' }],
    },
    {
      prompt: 'Để truy cập phần tử ở vị trí thứ k trong danh sách liên kết đơn, độ phức tạp thời gian là:',
      answer: 'c',
      options: [{ id: 'a', text: 'O(1)' }, { id: 'b', text: 'O(log n)' }, { id: 'c', text: 'O(n)' }, { id: 'd', text: 'O(n log n)' }],
    },
  ]),
  createMultiQuiz('dsa-ch3-quiz', 'CO2003', 'Quiz 3: Ngăn xếp (Stack) & Hàng đợi (Queue)', 'Nguyên lý LIFO/FIFO và ứng dụng thực tế.', 15, [
    {
      prompt: 'Cấu trúc dữ liệu Stack hoạt động theo nguyên tắc nào?',
      answer: 'b',
      options: [{ id: 'a', text: 'FIFO (First In First Out)' }, { id: 'b', text: 'LIFO (Last In First Out)' }, { id: 'c', text: 'Ngẫu nhiên' }, { id: 'd', text: 'Ưu tiên theo khóa lớn nhất' }],
    },
    {
      prompt: 'Cấu trúc dữ liệu nào phù hợp nhất để cài đặt thuật toán duyệt đồ thị theo chiều rộng (BFS)?',
      answer: 'a',
      options: [{ id: 'a', text: 'Queue (Hàng đợi)' }, { id: 'b', text: 'Stack (Ngăn xếp)' }, { id: 'c', text: 'Hash Table' }, { id: 'd', text: 'Binary Search Tree' }],
    },
    {
      prompt: 'Ứng dụng nào sau đây thường sử dụng Stack?',
      answer: 'd',
      options: [{ id: 'a', text: 'Lập lịch tiến trình CPU Round-Robin' }, { id: 'b', text: 'Hàng đợi in tài liệu' }, { id: 'c', text: 'Tìm đường đi ngắn nhất không trọng số' }, { id: 'd', text: 'Kiểm tra dấu ngoặc hợp lệ và tính biểu thức hậu tố' }],
    },
  ]),
  createMultiQuiz('dsa-ch4-quiz', 'CO2003', 'Quiz 4: Cây & Cây nhị phân tìm kiếm (BST)', 'Duyệt cây, tính chất BST và cân bằng AVL.', 15, [
    {
      prompt: 'Phép duyệt cây nhị phân tìm kiếm (BST) nào cho ra dãy giá trị tăng dần?',
      answer: 'b',
      options: [{ id: 'a', text: 'Pre-order (NLR)' }, { id: 'b', text: 'In-order (LNR)' }, { id: 'c', text: 'Post-order (LRN)' }, { id: 'd', text: 'Level-order (BFS)' }],
    },
    {
      prompt: 'Độ phức tạp tìm kiếm trung bình trên cây nhị phân tìm kiếm cân bằng (như AVL) có n nút là:',
      answer: 'c',
      options: [{ id: 'a', text: 'O(1)' }, { id: 'b', text: 'O(n)' }, { id: 'c', text: 'O(log n)' }, { id: 'd', text: 'O(n log n)' }],
    },
    {
      prompt: 'Trong cây AVL, hệ số cân bằng (balance factor) hợp lệ của mỗi nút nằm trong khoảng nào?',
      answer: 'a',
      options: [{ id: 'a', text: '{-1, 0, 1}' }, { id: 'b', text: '{0, 1, 2}' }, { id: 'c', text: '{-2, -1, 0, 1, 2}' }, { id: 'd', text: 'Bất kỳ số nguyên nào' }],
    },
  ]),
  createMultiQuiz('dsa-ch5-quiz', 'CO2003', 'Quiz 5: Sắp xếp, Heap & Thuật toán đồ thị', 'Đánh giá thuật toán sắp xếp và duyệt đồ thị.', 15, [
    {
      prompt: 'Thuật toán sắp xếp nào luôn đảm bảo độ phức tạp O(n log n) trong mọi trường hợp (tốt nhất, trung bình, xấu nhất)?',
      answer: 'c',
      options: [{ id: 'a', text: 'QuickSort' }, { id: 'b', text: 'Insertion Sort' }, { id: 'c', text: 'Merge Sort' }, { id: 'd', text: 'Bubble Sort' }],
    },
    {
      prompt: 'Trong Max-Heap, phần tử lớn nhất luôn nằm ở đâu?',
      answer: 'a',
      options: [{ id: 'a', text: 'Tại nút gốc (root)' }, { id: 'b', text: 'Tại nút lá ngoài cùng bên phải' }, { id: 'c', text: 'Tại nút lá ngoài cùng bên trái' }, { id: 'd', text: 'Ở giữa mảng' }],
    },
    {
      prompt: 'Thuật toán Dijkstra dùng để giải quyết bài toán nào trên đồ thị có trọng số không âm?',
      answer: 'd',
      options: [{ id: 'a', text: 'Tìm cây khung nhỏ nhất' }, { id: 'b', text: 'Sắp xếp topo' }, { id: 'c', text: 'Kiểm tra đồ thị hai phía' }, { id: 'd', text: 'Tìm đường đi ngắn nhất từ một đỉnh nguồn tới các đỉnh còn lại' }],
    },
  ]),

  /* ==================== CO3029 ==================== */
  createMultiQuiz('quiz-co3029', 'CO3029', 'Bài kiểm tra trắc nghiệm', 'Kiểm tra nhanh kiến thức Khai phá dữ liệu.', 10, [
    {
      prompt: 'Mục tiêu chính của phân cụm dữ liệu là gì?',
      answer: 'a',
      options: [{ id: 'a', text: 'Nhóm các điểm dữ liệu tương tự' }, { id: 'b', text: 'Gán nhãn đúng cho mọi điểm' }, { id: 'c', text: 'Mã hóa dữ liệu' }, { id: 'd', text: 'Tăng số chiều dữ liệu' }],
    },
  ]),
];
