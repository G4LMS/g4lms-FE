import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppHeader } from '../features/layout/AppHeader';
import { ConceptAuthoringWorkspace } from '../features/teacher/ConceptAuthoringWorkspace';

export default function TeacherNodeEditorPage() {
  const { courseId = '', nodeId = '' } = useParams();
  const nav = useNavigate();

  return (
    <div className="page editor-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppHeader />
      <div className="editor-topbar" style={{ borderBottom: '1px solid var(--line)', padding: '10px 20px' }}>
        <button
          type="button"
          className="btn btn-outline sm"
          onClick={() => nav(`/teacher/courses/${courseId}/content`)}
        >
          <ArrowLeft size={13} /> Quay lại Nội dung môn học
        </button>
        <div className="crumbs small" style={{ margin: 0 }}>
          <a onClick={() => nav('/teacher/courses')}>Khóa học của tôi</a>
          <i>›</i>
          <a onClick={() => nav(`/teacher/courses/${courseId}/graph`)}>Đồ thị tri thức</a>
          <i>›</i>
          <b>Soạn nội dung &amp; bài kiểm tra Concept</b>
        </div>
      </div>

      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
        <ConceptAuthoringWorkspace
          courseId={courseId}
          initialConceptId={nodeId}
          onSelectConceptId={(nextId) => {
            if (nextId && nextId !== nodeId) {
              nav(`/teacher/courses/${courseId}/nodes/${encodeURIComponent(nextId)}`, { replace: true });
            }
          }}
          onBackToGraph={() => nav(`/teacher/courses/${courseId}/content`)}
        />
      </main>
    </div>
  );
}
