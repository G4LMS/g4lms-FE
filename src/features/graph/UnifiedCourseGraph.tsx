import { Activity, Layers, LayoutList, Lock, Map as MapIcon, Network, PanelRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { KnowledgeEdgeType, KnowledgeNodeType } from '../../types';
import { useAsync } from '../common/useAsync';
import { useLanguage } from '../i18n/LanguageContext';
import { CourseIndexSidebar } from '../courses/CourseIndexSidebar';
import { AppHeader } from '../layout/AppHeader';
import { CourseAuthoringWizard } from '../teacher/CourseAuthoringWizard';
import { GraphHealthPanel } from './GraphHealthPanel';
import { serializeKnowledgeGraph } from './graphSerializer';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';
import { StudentJourneyViews } from './StudentJourneyViews';
import { StudentRelationMap } from './StudentRelationMap';

interface Props {
  role: 'student' | 'teacher';
}

export function UnifiedCourseGraph({ role }: Props) {
  const canEdit = role === 'teacher';
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const { courseId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();

  const initialViewParam = searchParams.get('view');

  const [editMode, setEditMode] = useState(canEdit);
  const [rightOpen, setRightOpen] = useState(true);
  const [healthOpen, setHealthOpen] = useState(false);
  const [authoringMode, setAuthoringMode] = useState<'wizard' | 'editor'>('wizard');
  const [view, setView] = useState<'path' | 'structure' | 'list' | 'authoring'>(
    canEdit ? (initialViewParam === 'authoring' ? 'authoring' : 'structure') : 'path',
  );
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const ready = true;
  const { data: knowledgeGraph, loading: kgLoading, error: kgError } = useAsync(
    () => (courseId ? api.getKnowledgeGraph(courseId) : Promise.resolve(null)),
    [courseId, reloadTick],
  );
  const { data: graphDrafts } = useAsync(
    () => (canEdit && courseId && authoringMode === 'editor' ? api.listGraphDrafts(courseId).catch(() => []) : Promise.resolve([])),
    [canEdit, courseId, authoringMode, reloadTick],
  );
  const openManualDraft =
    (graphDrafts ?? []).find((d) => !d.publishedReleaseId && d.status !== 'archived' && d.status !== 'rejected') ?? null;
  const { data: studentCourses, error: studentCoursesError } = useAsync(
    () => (!canEdit ? api.getStudentCourses() : Promise.resolve([])),
    [canEdit],
  );
  const { data: teacherCourses, error: teacherCoursesError } = useAsync(
    () => (canEdit ? api.getTeacherCourses() : Promise.resolve([])),
    [canEdit, reloadTick],
  );
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);

  useEffect(() => {
    setActionError('');
    setActionMessage('');
    const requestedView = searchParams.get('view');
    const requestedNode = searchParams.get('nodeId');
    if (canEdit && requestedView === 'concepts') {
      nav(
        `/teacher/courses/${courseId}/content${requestedNode ? `?nodeId=${encodeURIComponent(requestedNode)}` : ''}`,
        { replace: true },
      );
      return;
    }
    setView(canEdit ? (requestedView === 'authoring' ? 'authoring' : 'structure') : 'path');
    setAuthoringMode('wizard');
  }, [courseId, canEdit, searchParams, nav]);

  const serviceError = [kgError, studentCoursesError, teacherCoursesError].find(Boolean);
  const coursesList = canEdit ? (teacherCourses ?? []) : (studentCourses ?? []);
  const activeCourse = coursesList.find((course) => course.id === courseId);
  const courseName = activeCourse?.title ?? courseId;
  const courseCode = activeCourse?.code ?? courseId;
  const isD5Completed = Boolean(
    activeCourse &&
      'published' in activeCourse &&
      activeCourse.published &&
      knowledgeGraph?.nodes.some((n) => n.type !== 'Course'),
  );

  useEffect(() => {
    if (!isD5Completed && authoringMode === 'editor') {
      setAuthoringMode('wizard');
    }
  }, [isD5Completed, authoringMode]);

  const refreshGraph = () => setReloadTick((tick) => tick + 1);

  const handlePublishManualDraft = async () => {
    if (!canEdit || !openManualDraft || publishingDraft) return;
    setPublishingDraft(true);
    setActionError('');
    setActionMessage('');
    try {
      await api.publishCourseGraph(
        courseId,
        openManualDraft.draftRevision,
        0,
        `manual-pub-${Date.now()}`,
        openManualDraft.draftId,
      );
      setActionMessage(
        isVi
          ? 'Đã xuất bản các thay đổi hiệu chỉnh sang Đồ thị môn học và Neo4j!'
          : 'Published manual edits to Course Graph and Neo4j!',
      );
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xuất bản bản hiệu chỉnh.');
    } finally {
      setPublishingDraft(false);
    }
  };

  const syncGraphJsonToBe = async (note: string) => {
    try {
      const latestKg = await api.getKnowledgeGraph(courseId);
      await api.saveKnowledgeGraph(courseId, serializeKnowledgeGraph(latestKg), {
        title: 'Knowledge Graph Draft',
        note,
      });
    } catch {
      // Non-blocking sync; primary node/edge mutation already persisted
    }
  };

  const handleAddNode = async (input: {
    name: string;
    nodeType: KnowledgeNodeType;
    parentId?: string | null;
    description?: string;
    properties?: Record<string, unknown>;
  }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.createGraphNode(courseId, {
        name: input.name,
        nodeType: input.nodeType,
        clusterId: input.parentId ?? null,
        description: input.description,
        properties: input.properties,
      });
      await syncGraphJsonToBe(`Add node ${input.name}`);
      setActionMessage(`Đã thêm nút "${input.name}" (${input.nodeType}) vào đồ thị.`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể thêm nút.');
    }
  };

  const handleAddEdge = async (input: { fromId: string; toId: string; kind: KnowledgeEdgeType; properties?: Record<string, unknown> }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.createGraphEdge(courseId, input);
      await syncGraphJsonToBe(`Add edge ${input.fromId} -> ${input.toId} (${input.kind})`);
      setActionMessage(`Đã nối quan hệ ${input.fromId} → ${input.toId} (${input.kind}).`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể nối quan hệ.');
      throw reason;
    }
  };

  const handleMergeNodes = async (input: { keepId: string; mergeId: string }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.mergeGraphNodes(courseId, input);
      setActionMessage(`Đã gộp ${input.mergeId} vào ${input.keepId}.`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể gộp nút.');
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.deleteGraphNode(courseId, nodeId);
      setActionMessage(`Đã xóa nút ${nodeId}.`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xóa nút.');
    }
  };

  const handleDeleteEdge = async (input: { fromId: string; toId: string; edgeType: string }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.deleteGraphEdge(courseId, input);
      setActionMessage(`Đã xóa quan hệ ${input.fromId} → ${input.toId}.`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xóa quan hệ.');
    }
  };

  const handleUpdateEdge = async (input: {
    oldFromId: string;
    oldToId: string;
    oldEdgeType: string;
    fromId: string;
    toId: string;
    kind: KnowledgeEdgeType;
    properties?: Record<string, unknown>;
  }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.deleteGraphEdge(courseId, {
        fromId: input.oldFromId,
        toId: input.oldToId,
        edgeType: input.oldEdgeType,
      });
      await api.createGraphEdge(courseId, {
        fromId: input.fromId,
        toId: input.toId,
        kind: input.kind,
        properties: input.properties,
      });
      await syncGraphJsonToBe(`Update edge ${input.fromId} -> ${input.toId} (${input.kind})`);
      setActionMessage(`Đã cập nhật quan hệ ${input.fromId} → ${input.toId} (${input.kind}).`);
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể sửa quan hệ.');
      throw reason;
    }
  };

  const handleApproveNode = async (nodeId: string) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.updateGraphNode(courseId, nodeId, { approved: true, status: 'approved' });
      setActionMessage('Đã duyệt nút kiến thức.');
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể duyệt nút.');
    }
  };

  const handleApproveEdge = async (input: { fromId: string; toId: string; edgeType: string }) => {
    if (!canEdit) return;
    setActionError('');
    setActionMessage('');
    try {
      await api.approveGraphEdge(courseId, input);
      setActionMessage('Đã duyệt quan hệ kiến thức.');
      refreshGraph();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể duyệt quan hệ.');
    }
  };

  const teacherTabs = isVi
    ? ['Lộ trình', 'Nội dung', 'Học viên']
    : ['Path', 'Content', 'Students'];
  const studentTabs = isVi
    ? ['Lộ trình kiến nghị', 'Nội dung', 'Điểm số']
    : ['Recommended path', 'Content', 'Grades'];
  const tabs = canEdit ? teacherTabs : studentTabs;

  const onTabClick = (index: number) => {
    if (canEdit) {
      nav(
        index === 0
          ? `/teacher/courses/${courseId}/graph`
          : `/teacher/courses/${courseId}/${['', 'content', 'students'][index]}`,
      );
    } else {
      if (index === 0) nav(`/courses/${courseId}/graph`);
      if (index === 1) nav(`/courses/${courseId}/content`);
      if (index === 2) nav(`/courses/${courseId}/grades`);
    }
  };

  const showAuthoringEditor = canEdit && view === 'authoring' && authoringMode === 'editor' && isD5Completed;

  return (
    <div className={`page graph-page${canEdit ? ' teacher' : ''}`}>
      <AppHeader showEditToggle={showAuthoringEditor} editMode={editMode} onEditModeChange={setEditMode} />

      {!(view === 'authoring' && canEdit) && (
        <div className="crumbs top">
          <a onClick={() => nav(canEdit ? '/teacher/courses' : '/home')}>{isVi ? 'Trang chủ' : 'Home'}</a>
          <i>›</i>
          <a onClick={() => nav(canEdit ? '/teacher/courses' : '/courses')}>{isVi ? 'Khóa học của tôi' : 'My courses'}</a>
          <i>›</i>
          <a>{courseName}</a>
          <i>›</i>
          <b>{isVi ? 'Đồ thị tri thức' : 'Knowledge graph'}</b>
        </div>
      )}

      <div className={`course-subheader${canEdit ? ' teacher' : ' compact-student'}${view === 'authoring' ? ' compact-authoring' : ''}`}>
        <div className="course-subheader-left">
          <CourseIndexSidebar courseId={courseId} role={role} inline />
          <div className="subheader-center">
            <h1 title={courseName}>{courseName}</h1>
            <div className="tabs-pill">
              {tabs.map((label, index) => (
                <button key={label} className={index === 0 ? 'on' : ''} onClick={() => onTabClick(index)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="kg-subheader-actions">
          <div className="kg-view-switch">
            {!canEdit && (
              <button type="button" className={view === 'path' ? 'on' : ''} onClick={() => setView('path')}>
                <MapIcon size={12} style={{ marginRight: 4 }} />
                {isVi ? 'Lộ trình' : 'Path'}
              </button>
            )}
            <button
              type="button"
              className={view === 'structure' ? 'on' : ''}
              onClick={() => {
                setView('structure');
                refreshGraph();
              }}
            >
              {!canEdit && <Network size={12} style={{ marginRight: 4 }} />}
              {canEdit ? (isVi ? 'Đồ thị tri thức' : 'Knowledge graph') : (isVi ? 'Bản đồ quan hệ' : 'Relation map')}
            </button>
            {!canEdit && (
              <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                <LayoutList size={12} style={{ marginRight: 4 }} />
                {isVi ? 'Danh sách' : 'List'}
              </button>
            )}
            {canEdit && (
              <button type="button" className={view === 'authoring' ? 'on' : ''} onClick={() => setView('authoring')}>
                <Layers size={12} style={{ marginRight: 4 }} />
                {isVi ? 'Dựng đồ thị (D1–D4)' : 'Authoring (D1–D4)'}
              </button>
            )}
          </div>
          {showAuthoringEditor && (
            <button
              type="button"
              className={`btn btn-outline sm${healthOpen ? ' on' : ''}`}
              onClick={() => setHealthOpen((o) => !o)}
            >
              <Activity size={12} /> {isVi ? 'Tính hoàn thiện' : 'Completeness'}
            </button>
          )}
          {canEdit && ready && (view === 'structure' || showAuthoringEditor) && !healthOpen && knowledgeGraph?.nodes.some((n) => n.type !== 'Course') && (
            <button
              type="button"
              className={`round-btn right${rightOpen ? '' : ' off'}`}
              style={{ position: 'static' }}
              onClick={() => setRightOpen((o) => !o)}
              aria-label={isVi ? 'Bảng thuộc tính' : 'Properties panel'}
              title={isVi ? (rightOpen ? 'Ẩn bảng thuộc tính' : 'Mở bảng thuộc tính') : (rightOpen ? 'Hide properties panel' : 'Show properties panel')}
            >
              <PanelRight size={16} />
            </button>
          )}
        </div>
      </div>

      {(serviceError || actionError) && (
        <p className="form-error graph-error" role="alert">
          {actionError || serviceError?.message}
        </p>
      )}
      {actionMessage && (
        <p className="admin-success" style={{ margin: '4px 16px' }} role="status">
          {actionMessage}
        </p>
      )}

      {ready && (
        <div className="graph-body" style={{ flex: 1, minHeight: 0 }}>
          {view === 'authoring' && canEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
              <div className="authoring-subbar compact">
                <div className="kg-view-switch">
                  <button
                    type="button"
                    className={authoringMode === 'wizard' ? 'on' : ''}
                    onClick={() => setAuthoringMode('wizard')}
                  >
                    <Layers size={12} style={{ marginRight: 5 }} />
                    {isVi ? 'Quy trình 4 bước (D1–D4)' : '4-Step Wizard (D1–D4)'}
                  </button>
                  <button
                    type="button"
                    className={authoringMode === 'editor' ? 'on' : ''}
                    disabled={!isD5Completed}
                    title={
                      !isD5Completed
                        ? (isVi ? 'Trang hiệu chỉnh bị khóa cho đến khi hoàn thành D4 (Xuất bản Course Graph).' : 'Locked until D4 is completed.')
                        : undefined
                    }
                    style={!isD5Completed ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                    onClick={() => {
                      if (!isD5Completed) return;
                      setAuthoringMode('editor');
                      refreshGraph();
                    }}
                  >
                    {isD5Completed ? <Network size={12} style={{ marginRight: 5 }} /> : <Lock size={12} style={{ marginRight: 5 }} />}
                    {isVi ? (isD5Completed ? 'Hiệu chỉnh' : 'Hiệu chỉnh (Khóa · Chưa xong D4)') : (isD5Completed ? 'Edit' : 'Edit (Locked)')}
                  </button>
                </div>
                {authoringMode !== 'wizard' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <small className="muted-s authoring-subbar-hint">
                      {isVi
                        ? 'Chỉnh sửa thủ công trực tiếp nút/cạnh & nội dung bài học trên đồ thị môn học.'
                        : 'Edit nodes, edges & lesson content directly on the course graph.'}
                    </small>
                    {openManualDraft && (
                      <>
                        <span className="pill-badge amber">
                          {isVi ? `Có thay đổi nháp (Rev ${openManualDraft.draftRevision})` : `Draft Rev ${openManualDraft.draftRevision}`}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary sm"
                          disabled={publishingDraft}
                          onClick={handlePublishManualDraft}
                        >
                          {publishingDraft
                            ? (isVi ? 'Đang xuất bản...' : 'Publishing...')
                            : (isVi ? 'Xuất bản bản hiệu chỉnh' : 'Publish edits')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {authoringMode === 'wizard' ? (
                <div className="graph-stage wizard-stage-host">
                  <CourseAuthoringWizard
                    courseId={courseId}
                    courseName={courseName}
                    hasPublishedGraph={isD5Completed}
                    onGraphUpdated={refreshGraph}
                    onPublishedGraph={() => {
                      setView('structure');
                      refreshGraph();
                    }}
                    onAuthorConceptContent={() => nav(`/teacher/courses/${courseId}/content`)}
                  />
                </div>
              ) : !isD5Completed ? (
                <div className="empty-wrap">
                  <div className="empty-card">
                    <Lock size={28} style={{ marginBottom: 8, color: 'var(--muted)' }} />
                    <h2>Trang hiệu chỉnh đang bị khóa</h2>
                    <p>Trang hiệu chỉnh chỉ mở sau khi hoàn thành Bước D4 (Xuất bản Course Graph).</p>
                    <button type="button" className="btn btn-primary" onClick={() => setAuthoringMode('wizard')}>
                      Quay lại quy trình D1–D4
                    </button>
                  </div>
                </div>
              ) : knowledgeGraph && knowledgeGraph.nodes.some((n) => n.type !== 'Course') ? (
                <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
                  <KnowledgeGraphCanvas
                    courseId={courseId}
                    data={knowledgeGraph}
                    role={role}
                    editMode={editMode}
                    rightOpen={rightOpen && !healthOpen}
                    focusRequest={focusRequest}
                    onQuickUpdateNode={async (nodeId, input) => {
                      await api.updateGraphNode(courseId, nodeId, input);
                      setActionMessage(`Đã cập nhật nhanh nút "${input.name}".`);
                      refreshGraph();
                    }}
                    onAddNode={handleAddNode}
                    onAddEdge={handleAddEdge}
                    onMergeNodes={handleMergeNodes}
                    onDeleteNode={handleDeleteNode}
                    onDeleteEdge={handleDeleteEdge}
                    onUpdateEdge={handleUpdateEdge}
                    onApproveNode={handleApproveNode}
                    onApproveEdge={handleApproveEdge}
                    onOpenNodeEditor={(id) => nav(`/teacher/courses/${courseId}/content?nodeId=${encodeURIComponent(id)}`)}
                  />
                  {healthOpen && (
                    <GraphHealthPanel
                      data={knowledgeGraph}
                      onSelectNode={(id) => setFocusRequest({ id, nonce: Date.now() })}
                      onClose={() => setHealthOpen(false)}
                    />
                  )}
                </div>
              ) : (
                <div className="empty-wrap">
                  <div className="empty-card">
                    <h2>Chưa có đồ thị để hiệu chỉnh</h2>
                    <p>Hãy hoàn thành quy trình D1–D4 để sinh đồ thị trước khi hiệu chỉnh thủ công.</p>
                    <button type="button" className="btn btn-primary" onClick={() => setAuthoringMode('wizard')}>
                      <Layers size={12} /> Mở quy trình D1–D4
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : kgLoading && !knowledgeGraph ? (
            <div className="graph-stage" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              Đang tải đồ thị tri thức…
            </div>
          ) : knowledgeGraph && knowledgeGraph.nodes.some((n) => n.type !== 'Course') ? (
            !canEdit && (view === 'path' || view === 'list') ? (
              <StudentJourneyViews
                courseId={courseId}
                data={knowledgeGraph}
                mode={view}
                onOpenLearn={(nodeId) => nav(`/courses/${courseId}/learn/${encodeURIComponent(nodeId)}`)}
                onFocusInGraph={(nodeId) => {
                  setView('structure');
                  if (nodeId) setFocusRequest({ id: nodeId, nonce: Date.now() });
                }}
              />
            ) : !canEdit ? (
              <StudentRelationMap
                courseId={courseId}
                courseCode={courseCode}
                courseName={courseName}
                data={knowledgeGraph}
                rightOpen={rightOpen}
                focusRequest={focusRequest}
                onStartLearning={(nodeId) => nav(`/courses/${courseId}/learn/${encodeURIComponent(nodeId)}`)}
              />
            ) : (
              <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
                <KnowledgeGraphCanvas
                  courseId={courseId}
                  data={knowledgeGraph}
                  role={role}
                  editMode={false}
                  rightOpen={rightOpen}
                  focusRequest={focusRequest}
                  onOpenNodeEditor={(id) => nav(`/teacher/courses/${courseId}/content?nodeId=${encodeURIComponent(id)}`)}
                />
              </div>
            )
          ) : (
            <div className="empty-wrap">
              <div className="empty-card">
                <div className="empty-illu">
                  <span className="orbit">
                    <Network size={18} />
                  </span>
                </div>
                <h2>Môn học chưa có đồ thị tri thức</h2>
                <p>
                  {canEdit
                    ? 'Hãy bắt đầu theo quy trình 4 bước (D1: Khung môn học → D2: Bài học theo chương → D3: Sinh quan hệ trên toàn bộ đồ thị → D4: Xuất bản Course Graph) để kiểm soát từng chương ~20 node.'
                    : 'Giảng viên chưa công bố đồ thị tri thức cho môn học này.'}
                </p>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={() => setView('authoring')}>
                      <Layers size={12} /> Bắt đầu dựng đồ thị (D1–D4)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UnifiedCourseGraph;
