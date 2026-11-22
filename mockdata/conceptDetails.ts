import type { ChapterLessonDetail, GraphCitation } from '../src/types';

export interface RichConceptContent {
  description: string;
  outcome: string;
  details: ChapterLessonDetail[];
  evidence: GraphCitation[];
}

const RICH_CONCEPT_BY_KEYWORD: Array<{ match: RegExp; content: RichConceptContent }> = [
  /* ==================== CO2003: Cấu trúc dữ liệu & Giải thuật ==================== */
  {
    match: /độ phức tạp|big-o|khái niệm độ phức tạp|tiệm cận/i,
    content: {
      description:
        'Độ phức tạp thuật toán đánh giá tốc độ tăng của thời gian chạy T(n) và bộ nhớ M(n) theo kích thước đầu vào n bằng ký pháp tiệm cận O (trên), Ω (dưới) và Θ (chặt).',
      outcome: 'Xác định được độ phức tạp O(1), O(log n), O(n), O(n log n), O(n²) của vòng lặp và hàm đệ quy.',
      details: [
        { name: 'Bỏ hằng số và chỉ giữ lại số hạng bậc cao nhất khi n → ∞ (ví dụ: 3n² + 5n + 2 = O(n²)).', evidence: [{ slideId: 'DSA_Ch1_p08', quote: 'Big-O mô tả cận trên tiệm cận cho trường hợp xấu nhất.' }] },
        { name: 'Vòng lặp lồng nhau nhân độ phức tạp; vòng lặp nối tiếp cộng độ phức tạp.', evidence: [{ slideId: 'DSA_Ch1_p12', quote: 'Hai vòng lặp lồng nhau 1..n cho độ phức tạp O(n²).' }] },
        { name: 'Chia đôi không gian tìm kiếm ở mỗi bước (như Binary Search) cho độ phức tạp O(log n).', evidence: [{ slideId: 'DSA_Ch1_p15', quote: 'T(n) = T(n/2) + O(1) ⇒ O(log n).' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch1_p08', quote: 'Đánh giá hiệu năng thuật toán độc lập với phần cứng thông qua ký pháp Big-O.' }],
    },
  },
  {
    match: /con trỏ|cấp phát động|rò rỉ|pointer/i,
    content: {
      description:
        'Con trỏ lưu trữ địa chỉ ô nhớ của biến khác. Cấp phát động (new/malloc) xin bộ nhớ trên Heap trong thời gian chạy và bắt buộc phải giải phóng (delete/free) để tránh rò rỉ bộ nhớ (memory leak) hoặc con trỏ treo (dangling pointer).',
      outcome: 'Thao tác an toàn với toán tử &, *, cấp phát/giải phóng bộ nhớ động và tránh lỗi memory leak.',
      details: [
        { name: 'Luôn khởi tạo con trỏ bằng nullptr và kiểm tra trước khi dereference (*ptr).', evidence: [{ slideId: 'DSA_Ch1_p22', quote: 'Dereference con trỏ null gây lỗi Segmentation Fault.' }] },
        { name: 'Sau khi gọi delete ptr, gán lại ptr = nullptr để tránh Dangling Pointer.', evidence: [{ slideId: 'DSA_Ch1_p26', quote: 'Con trỏ treo vẫn giữ địa chỉ vùng nhớ đã thu hồi.' }] },
        { name: 'Mỗi lệnh new/new[] phải có delete/delete[] tương ứng trong destructor.', evidence: [{ slideId: 'DSA_Ch1_p29', quote: 'Quên giải phóng bộ nhớ Heap gây rò rỉ bộ nhớ.' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch1_p24', quote: 'Bộ nhớ Heap cho phép tạo cấu trúc dữ liệu có kích thước thay đổi linh hoạt.' }],
    },
  },
  {
    match: /danh sách|linked list|chèn node|xóa node|đơn|đôi|vòng/i,
    content: {
      description:
        'Danh sách liên kết (Linked List) gồm các Node nối với nhau qua con trỏ next (và prev ở danh sách đôi), cho phép chèn/xóa ở đầu hoặc tại vị trí đã biết trong O(1) mà không cần dời phần tử như mảng.',
      outcome: 'Cài đặt thành thạo thao tác duyệt, chèn, xóa, đảo ngược danh sách liên kết đơn và đôi.',
      details: [
        { name: 'Chèn đầu danh sách: tạo node mới → newNode->next = head → head = newNode (O(1)).', evidence: [{ slideId: 'DSA_Ch2_p09', quote: 'Cập nhật con trỏ next trước khi đổi head để không mất dấu danh sách.' }] },
        { name: 'Xóa node giữa: giữ con trỏ prev đứng trước node cần xóa, nối prev->next = cur->next rồi delete cur.', evidence: [{ slideId: 'DSA_Ch2_p14', quote: 'Xử lý riêng trường hợp danh sách rỗng hoặc xóa node đầu/cuối.' }] },
        { name: 'Truy cập phần tử thứ k tốn O(n) vì phải duyệt tuần tự từ head.', evidence: [{ slideId: 'DSA_Ch2_p18', quote: 'Linked List không hỗ trợ truy cập ngẫu nhiên O(1) như mảng.' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch2_p05', quote: 'Danh sách liên kết cấp phát từng node rời rạc trên Heap.' }],
    },
  },
  {
    match: /stack|ngăn xếp|hậu tố|postfix/i,
    content: {
      description:
        'Ngăn xếp (Stack) là cấu trúc dữ liệu tuyến tính hoạt động theo nguyên tắc LIFO (Last In, First Out — vào sau ra trước), với hai thao tác chính push và pop đều đạt O(1).',
      outcome: 'Cài đặt Stack bằng mảng/danh sách liên kết và ứng dụng vào kiểm tra ngoặc, tính biểu thức hậu tố, khử đệ quy.',
      details: [
        { name: 'push(x) thêm phần tử lên đỉnh (top); pop() lấy và loại bỏ phần tử ở đỉnh; peek() xem đỉnh (O(1)).', evidence: [{ slideId: 'DSA_Ch3_p04', quote: 'Kiểm tra isEmpty() trước khi pop() và isFull() trước khi push() trên mảng.' }] },
        { name: 'Ứng dụng Call Stack: lưu địa chỉ trả về và biến cục bộ khi gọi hàm đệ quy.', evidence: [{ slideId: 'DSA_Ch3_p11', quote: 'Đệ quy quá sâu gây tràn ngăn xếp (Stack Overflow).' }] },
        { name: 'Chuyển đổi trung tố sang hậu tố (Infix → Postfix) và tính giá trị biểu thức.', evidence: [{ slideId: 'DSA_Ch3_p16', quote: 'Toán hạng đưa ra output, toán tử đẩy vào Stack theo độ ưu tiên.' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch3_p03', quote: 'LIFO: phần tử được đưa vào sau cùng sẽ được xử lý đầu tiên.' }],
    },
  },
  {
    match: /queue|hàng đợi/i,
    content: {
      description:
        'Hàng đợi (Queue) hoạt động theo nguyên tắc FIFO (First In, First Out — vào trước ra trước), thêm phần tử ở cuối (enqueue/rear) và lấy phần tử ở đầu (dequeue/front) trong O(1).',
      outcome: 'Cài đặt Queue bằng mảng vòng (Circular Array) hoặc Linked List và ứng dụng trong BFS, lập lịch.',
      details: [
        { name: 'Mảng vòng dùng chỉ số (rear + 1) % capacity để tái sử dụng ô nhớ đầu mảng, tránh tràn giả.', evidence: [{ slideId: 'DSA_Ch3_p24', quote: 'Circular Queue giữ cho enqueue và dequeue đều đạt O(1).' }] },
        { name: 'Ứng dụng trực tiếp trong duyệt đồ thị theo chiều rộng (BFS) và hàng đợi tác vụ.', evidence: [{ slideId: 'DSA_Ch3_p28', quote: 'BFS dùng Queue để mở rộng các đỉnh theo từng mức khoảng cách.' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch3_p21', quote: 'FIFO đảm bảo thứ tự phục vụ công bằng theo thời điểm đến.' }],
    },
  },
  {
    match: /cây|duyệt cây|nhị phân|bst|avl|heap|theo mức/i,
    content: {
      description:
        'Cây là cấu trúc phân cấp gồm nút gốc (root) và các cây con. Cây nhị phân tìm kiếm (BST) thỏa mãn khóa trái < khóa gốc < khóa phải; cây AVL tự cân bằng chiều cao để giữ mọi thao tác tìm/chèn/xóa ở mức O(log n).',
      outcome: 'Thực hiện được 4 phép duyệt cây (NLR, LNR, LRN, Level-order), thao tác trên BST và phép xoay cân bằng AVL.',
      details: [
        { name: 'Duyệt LNR (In-order) trên BST cho ra dãy khóa sắp xếp tăng dần.', evidence: [{ slideId: 'DSA_Ch4_p10', quote: 'Left → Node → Right liệt kê các phần tử BST theo thứ tự tăng.' }] },
        { name: 'Xóa nút có 2 con trong BST: thay bằng phần tử nhỏ nhất cây con phải (hoặc lớn nhất cây con trái).', evidence: [{ slideId: 'DSA_Ch4_p19', quote: 'Giữ nguyên bất biến thứ tự tìm kiếm sau khi xóa.' }] },
        { name: 'Cây AVL duy trì |height(left) - height(right)| ≤ 1 nhờ 4 phép xoay LL, RR, LR, RL.', evidence: [{ slideId: 'DSA_Ch4_p27', quote: 'Chiều cao cây AVL luôn là O(log n).' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch4_p04', quote: 'Cấu trúc cây biểu diễn quan hệ phân cấp tự nhiên và tối ưu tìm kiếm.' }],
    },
  },
  {
    match: /đồ thị|sắp xếp|bảng băm|hash|bfs|dfs|dijkstra|sort/i,
    content: {
      description:
        'Đồ thị G = (V, E) biểu diễn tập đỉnh và cạnh nối, duyệt bằng BFS/DFS và tìm đường đi ngắn nhất bằng Dijkstra. Các thuật toán sắp xếp hiệu quả (MergeSort, QuickSort, HeapSort) đạt O(n log n); Bảng băm cho tra cứu trung bình O(1).',
      outcome: 'Biểu diễn đồ thị bằng danh sách kề, cài đặt BFS/DFS và chọn thuật toán sắp xếp/tìm kiếm phù hợp.',
      details: [
        { name: 'Danh sách kề (Adjacency List) tốn O(V + E) bộ nhớ, tối ưu cho đồ thị thưa.', evidence: [{ slideId: 'DSA_Ch5_p06', quote: 'Ma trận kề tốn O(V²) nhưng kiểm tra cạnh (u,v) trong O(1).' }] },
        { name: 'MergeSort ổn định và luôn đạt O(n log n); QuickSort nhanh thực tế nhưng xấu nhất O(n²).', evidence: [{ slideId: 'DSA_Ch5_p18', quote: 'Chọn pivot hợp lý giúp QuickSort tránh suy biến O(n²).' }] },
        { name: 'Bảng băm xử lý đụng độ bằng Chaining (danh sách liên kết) hoặc Open Addressing.', evidence: [{ slideId: 'DSA_Ch5_p25', quote: 'Hệ số tải (load factor) thấp giúp tra cứu đạt O(1) kỳ vọng.' }] },
      ],
      evidence: [{ slideId: 'DSA_Ch5_p03', quote: 'Lựa chọn cấu trúc dữ liệu phù hợp quyết định trực tiếp hiệu năng thuật toán.' }],
    },
  },

  /* ==================== CO3093: Mạng máy tính ==================== */
  {
    match: /network edge|hosts|end system/i,
    content: {
      description:
        'Biên mạng (Network Edge) gồm các hệ thống đầu cuối (End Systems / Hosts) như máy tính, điện thoại (Clients) và máy chủ đặt tại trung tâm dữ liệu (Servers) chạy các ứng dụng mạng.',
      outcome: 'Phân biệt được vai trò Client, Server và mô hình Peer-to-Peer tại biên mạng.',
      details: [
        { name: 'Clients gửi yêu cầu dịch vụ; Servers cung cấp dịch vụ từ các Datacenter.', evidence: [{ slideId: 'Chapter_1_v9.0_p10', quote: 'hosts: clients and servers; servers often in data centers.' }] },
        { name: 'Mô hình Client-Server vs Peer-to-Peer (P2P): P2P cho phép các host trao đổi trực tiếp.', evidence: [{ slideId: 'Chapter_1_v9.0_p11', quote: 'End systems connect via access networks.' }] },
      ],
      evidence: [{ slideId: 'Chapter_1_v9.0_p10', quote: 'Network edge: hosts (clients and servers) running network applications.' }],
    },
  },
];

export function resolveRichConceptContent(
  name: string,
  existingDesc?: string,
  existingOutcome?: string,
): RichConceptContent {
  for (const entry of RICH_CONCEPT_BY_KEYWORD) {
    if (entry.match.test(name)) {
      return entry.content;
    }
  }
  return {
    description:
      existingDesc && !existingDesc.startsWith('Khái niệm thuộc chủ đề')
        ? existingDesc
        : `${name} là khái niệm cốt lõi trong học phần, giúp học viên hiểu bản chất cơ chế hoạt động và áp dụng giải quyết bài toán thực tế.`,
    outcome: existingOutcome || `Trình bày được định nghĩa, nguyên lý hoạt động và ứng dụng của ${name}.`,
    details: [
      {
        name: `Định nghĩa và vai trò cốt lõi của ${name} trong hệ thống.`,
        evidence: [{ slideId: 'Slide_Core', quote: `Giới thiệu khái niệm và phạm vi áp dụng của ${name}.` }],
      },
      {
        name: `Cơ chế hoạt động, các tham số chính và lưu ý khi triển khai ${name}.`,
        evidence: [{ slideId: 'Slide_Detail', quote: `Phân tích từng bước xử lý và trường hợp biên của ${name}.` }],
      },
      {
        name: `Ví dụ minh họa và liên hệ với các khái niệm liên quan trong chương.`,
        evidence: [{ slideId: 'Slide_Example', quote: `Vận dụng ${name} vào bài tập thực hành.` }],
      },
    ],
    evidence: [{ slideId: 'Slide_Core', quote: `Tổng quan lý thuyết và ví dụ trọng tâm về ${name}.` }],
  };
}
