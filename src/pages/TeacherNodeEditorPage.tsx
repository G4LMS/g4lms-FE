import { ArrowLeft, FileText, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import { useAsync } from '../features/common/useAsync';
import { contentStatusLabel } from '../features/teacher/statusLabels';
import type { ContentItem, QuestionItem } from '../types';

type Tab = 'desc' | 'content' | 'quiz' | 'prereq';
const BLOOM = ['Nhớ', 'Hiểu', 'Áp dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'];
const DIFF = ['Dễ', 'Vừa', 'Khó'];

export default function TeacherNodeEditorPage() {
  const { courseId = '', nodeId = '' } = useParams();
  const nav = useNavigate();
  const { data, loading, error } = useAsync(() => api.getNodeEditor(nodeId), [nodeId]);
  const [tab, setTab] = useState<Tab>('desc');
  const [name, setName] = useState<string | null>(null);
  const [desc, setDesc] = useState<string | null>(null);
  const [contents, setContents] = useState<ContentItem[] | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState<ContentItem | null>(null);
  const [addingContent, setAddingContent] = useState(false);
  const [newContent, setNewContent] = useState<Omit<ContentItem, 'id'>>({
    kind: 'Definition',
    status: 'approved',
    title: '',
    source: '',
    mediaUrl: '',
    durationMin: 6,
  });
  const [passThreshold, setPassThreshold] = useState<number | null>(null);
  const [unlockRule, setUnlockRule] = useState<'pass_quiz' | 'view_and_pass' | 'open' | null>(null);
  const [customQuestions, setCustomQuestions] = useState<QuestionItem[]>([]);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qDraft, setQDraft] = useState<{
    text: string;
    mode: 'quiz' | 'practice';
    optA: string;
    optB: string;
    optC: string;
    optD: string;
    correctIndex: number;
    explanation: string;
    bloom: string;
    difficulty: string;
    status: 'approved' | 'draft';
  }>({
    text: '',
    mode: 'quiz',
    optA: '',
    optB: '',
    optC: '',
    optD: '',
    correctIndex: 0,
    explanation: '',
    bloom: 'Hiểu',
    difficulty: 'Vừa',
    status: 'approved',
  });
  const [qs, setQs] = useState<Record<string, { bloom?: string; difficulty?: string; status?: QuestionItem['status'] }>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setName(null);
    setDesc(null);
    setContents(null);
    setEditingContentId(null);
    setContentDraft(null);
    setAddingContent(false);
    setPassThreshold(null);
    setUnlockRule(null);
    setCustomQuestions([]);
    setAddingQuestion(false);
    setEditingQuestionId(null);
    setQs({});
    setRemoved([]);
  }, [nodeId]);

  if (!data) return (
    <div className="page">
      <AppHeader showEditToggle />
      <main className="container">
        {error && <p className="form-error" role="alert">{error.message}</p>}
        {loading && <p className="muted">Đang tải node...</p>}
      </main>
    </div>
  );
  const back = () => nav(`/teacher/courses/${courseId}/graph`);
  const contentList = contents ?? data.contents;
  const questions = [...data.questions, ...customQuestions]
    .filter((q) => !removed.includes(q.id))
    .map((q) => ({
      ...q,
      bloom: qs[q.id]?.bloom ?? q.bloom,
      difficulty: qs[q.id]?.difficulty ?? q.difficulty,
      status: qs[q.id]?.status ?? q.status,
    }));
  const nameV = name ?? data.name;
  const descV = desc ?? data.description;
  const thresholdV = passThreshold ?? data.passThreshold ?? 70;
  const unlockRuleV = unlockRule ?? data.unlockRule ?? 'pass_quiz';

  const startEditContent = (item: ContentItem) => {
    setEditingContentId(item.id);
    setContentDraft({ ...item });
  };

  const applyContentDraft = () => {
    if (!contentDraft) return;
    if (!contentDraft.title.trim()) {
      setSaveError('Tiêu đề nội dung không được để trống.');
      return;
    }
    setSaveError('');
    setContents(contentList.map((c) => (c.id === contentDraft.id ? { ...contentDraft, title: contentDraft.title.trim() } : c)));
    setEditingContentId(null);
    setContentDraft(null);
  };

  const addContentItem = () => {
    if (!newContent.title.trim() || !newContent.source.trim()) {
      setSaveError('Vui lòng nhập tiêu đề và nguồn/liên kết tài liệu cho bài học vi mô.');
      return;
    }
    setSaveError('');
    const created: ContentItem = {
      id: `cnt-${Date.now()}`,
      kind: newContent.kind,
      status: newContent.status,
      title: newContent.title.trim(),
      source: newContent.source.trim(),
      mediaUrl: newContent.mediaUrl?.trim() || undefined,
      durationMin: newContent.durationMin || 6,
    };
    setContents([...contentList, created]);
    setNewContent({ kind: 'Definition', status: 'approved', title: '', source: '', mediaUrl: '', durationMin: 6 });
    setAddingContent(false);
  };

  const openAddQuestion = () => {
    setEditingQuestionId(null);
    setQDraft({
      text: '',
      mode: 'quiz',
      optA: '',
      optB: '',
      optC: '',
      optD: '',
      correctIndex: 0,
      explanation: '',
      bloom: 'Hiểu',
      difficulty: 'Vừa',
      status: 'approved',
    });
    setAddingQuestion(true);
    setSaveError('');
  };

  const startEditQuestion = (q: QuestionItem) => {
    setAddingQuestion(false);
    setEditingQuestionId(q.id);
    const opts = q.options ?? ['', '', '', ''];
    setQDraft({
      text: q.text,
      mode: q.mode ?? 'quiz',
      optA: opts[0] ?? '',
      optB: opts[1] ?? '',
      optC: opts[2] ?? '',
      optD: opts[3] ?? '',
      correctIndex: q.correctIndex ?? 0,
      explanation: q.explanation ?? '',
      bloom: q.bloom,
      difficulty: q.difficulty,
      status: q.status,
    });
    setSaveError('');
  };

  const saveQuestionDraft = () => {
    const opts = [qDraft.optA.trim(), qDraft.optB.trim(), qDraft.optC.trim(), qDraft.optD.trim()].filter(Boolean);
    if (!qDraft.text.trim() || opts.length < 2 || !qDraft.explanation.trim()) {
      setSaveError('Câu hỏi bắt buộc có nội dung, ít nhất 2 đáp án và giải thích.');
      return;
    }
    setSaveError('');
    if (editingQuestionId) {
      const updatedItem: QuestionItem = {
        id: editingQuestionId,
        text: qDraft.text.trim(),
        mode: qDraft.mode,
        options: opts,
        correctIndex: Math.min(qDraft.correctIndex, opts.length - 1),
        explanation: qDraft.explanation.trim(),
        bloom: qDraft.bloom,
        difficulty: qDraft.difficulty,
        status: qDraft.status,
      };
      if (customQuestions.some((q) => q.id === editingQuestionId)) {
        setCustomQuestions((prev) => prev.map((q) => (q.id === editingQuestionId ? updatedItem : q)));
      } else {
        setRemoved((r) => [...r, editingQuestionId]);
        setCustomQuestions((prev) => [...prev, updatedItem]);
      }
      setEditingQuestionId(null);
    } else {
      const created: QuestionItem = {
        id: `q-${Date.now()}`,
        text: qDraft.text.trim(),
        mode: qDraft.mode,
        options: opts,
        correctIndex: Math.min(qDraft.correctIndex, opts.length - 1),
        explanation: qDraft.explanation.trim(),
        bloom: qDraft.bloom,
        difficulty: qDraft.difficulty,
        status: qDraft.status,
      };
      setCustomQuestions((prev) => [...prev, created]);
      setAddingQuestion(false);
    }
  };

  const saveAndBack = async () => {
    if (!descV.trim() && contentList.length === 0) {
      setSaveError('Vui lòng nhập mô tả hoặc thêm ít nhất 1 nội dung bài học trước khi lưu.');
      return;
    }
    if (thresholdV < 1 || thresholdV > 100) {
      setSaveError('Ngưỡng đạt bài học phải nằm trong khoảng 1% – 100%.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await api.saveNodeEditor(courseId, nodeId, {
        name: nameV.trim() || data.name,
        description: descV,
        contents: contentList,
        questions,
        passThreshold: thresholdV,
        unlockRule: unlockRuleV,
      });
      back();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Không thể lưu thay đổi node.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page editor-page">
      <AppHeader showEditToggle />
      <div className="editor-topbar">
        <button className="btn btn-outline" onClick={back}><ArrowLeft size={12} /> Quay lại</button>
        <div className="crumbs small"><a>{data.course}</a><i>›</i><a>{data.group}</a><i>›</i><b>{data.parentNode}</b></div>
      </div>

      <div className="editor-head">
        <button className="btn btn-outline" onClick={back}><ArrowLeft size={12} /> Graph</button>
        <div>
          <div className="crumbs xs"><a>{data.course}</a><i>›</i><a>{data.cluster}</a><i>›</i><b>{nameV}</b></div>
          <h1>{nameV}</h1>
        </div>
        <button className="btn btn-primary" disabled={saving} onClick={() => void saveAndBack()}>
          {saving ? 'Đang lưu...' : 'Lưu và quay lại graph'}
        </button>
      </div>
      {saveError && <p className="form-error graph-error" role="alert">{saveError}</p>}

      <div className="editor-tabs">
        {([
          ['desc', 'Mô tả'], ['content', 'Nội dung'], ['quiz', 'Câu hỏi'], ['prereq', 'Tiên quyết'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
            {k === 'content' && <span className="n">{contentList.length}</span>}
            {k === 'quiz' && <span className="n">{questions.length}</span>}
            {k === 'prereq' && <span className="n">{data.prerequisites.length}</span>}
          </button>
        ))}
      </div>

      <main className="editor-main">
        {tab === 'desc' && (
          <section className="ed-card">
            <header><div><small>THÔNG TIN NODE</small><h2>Mô tả khái niệm</h2></div><span>Xác định một khái niệm rõ ràng và kết quả học tập mong đợi.</span></header>
            <div className="ed-form">
              <div className="ed-row"><label>Tên node</label><input value={nameV} onChange={(e) => setName(e.target.value)} /></div>
              <div className="ed-row"><label>Cụm kiến thức</label><span className="pill-tag">{data.cluster}</span></div>
              <div className="ed-row top"><label>Mô tả</label><textarea rows={5} value={descV} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="ed-row"><span /><small className="muted-s">Mô tả chỉ tập trung vào khái niệm {nameV}.</small></div>
            </div>
          </section>
        )}

        {tab === 'content' && (
          <section className="ed-card">
            <header>
              <div><small>CONTENT (EXPLAIN → CONCEPT)</small><h2>Nội dung bài học vi mô (5–7 phút)</h2></div>
              <button type="button" className="btn btn-outline sm" onClick={() => setAddingContent((v) => !v)}>
                <Plus size={12} /> Thêm nội dung / Video / Tài liệu
              </button>
            </header>

            {addingContent && (
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--line)', background: '#f8fafc', marginBottom: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                  <input
                    value={newContent.title}
                    onChange={(e) => setNewContent({ ...newContent, title: e.target.value })}
                    placeholder="Tiêu đề bài học / video / tài liệu *"
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                  <select
                    value={newContent.kind}
                    onChange={(e) => setNewContent({ ...newContent, kind: e.target.value as ContentItem['kind'] })}
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  >
                    <option value="Definition">Definition</option>
                    <option value="Example">Example</option>
                    <option value="Video">Video</option>
                    <option value="Document">Document</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={newContent.durationMin ?? 6}
                    onChange={(e) => setNewContent({ ...newContent, durationMin: Number(e.target.value) || 6 })}
                    placeholder="Phút"
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    value={newContent.source}
                    onChange={(e) => setNewContent({ ...newContent, source: e.target.value })}
                    placeholder="Nguồn tham chiếu (Slide / Giáo trình) *"
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                  <input
                    value={newContent.mediaUrl ?? ''}
                    onChange={(e) => setNewContent({ ...newContent, mediaUrl: e.target.value })}
                    placeholder="Link Video hoặc Tài liệu đính kèm (tùy chọn)"
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline sm" onClick={() => setAddingContent(false)}>Hủy</button>
                  <button type="button" className="btn btn-primary sm" onClick={addContentItem}>Thêm vào bài học</button>
                </div>
              </div>
            )}

            <div className="content-list">
              {contentList.map((c) => (
                <div key={c.id} className="content-item" style={{ flexWrap: 'wrap' }}>
                  <span className={`c-ico ${c.status === 'approved' ? 'blue' : 'green'}`}><FileText size={14} /></span>
                  {editingContentId === c.id && contentDraft ? (
                    <div style={{ flex: 1, display: 'grid', gap: 8, minWidth: 260 }}>
                      <input
                        value={contentDraft.title}
                        onChange={(e) => setContentDraft({ ...contentDraft, title: e.target.value })}
                        placeholder="Tiêu đề nội dung"
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          value={contentDraft.kind}
                          onChange={(e) => setContentDraft({ ...contentDraft, kind: e.target.value as ContentItem['kind'] })}
                        >
                          <option value="Definition">Definition</option>
                          <option value="Example">Example</option>
                          <option value="Video">Video</option>
                          <option value="Document">Document</option>
                        </select>
                        <select
                          value={contentDraft.status}
                          onChange={(e) => setContentDraft({ ...contentDraft, status: e.target.value as ContentItem['status'] })}
                        >
                          <option value="approved">Đã duyệt</option>
                          <option value="draft">Bản nháp</option>
                        </select>
                        <input
                          value={contentDraft.source}
                          onChange={(e) => setContentDraft({ ...contentDraft, source: e.target.value })}
                          placeholder="Nguồn tham chiếu"
                          style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                        />
                        <input
                          value={contentDraft.mediaUrl ?? ''}
                          onChange={(e) => setContentDraft({ ...contentDraft, mediaUrl: e.target.value })}
                          placeholder="URL video / tài liệu"
                          style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                        />
                        <button type="button" className="btn btn-primary sm" onClick={applyContentDraft}>Lưu mục</button>
                        <button type="button" className="btn btn-outline sm" onClick={() => { setEditingContentId(null); setContentDraft(null); }}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="c-main">
                        <div className="c-tags">
                          <span className="tag-kind">{c.kind}</span>
                          <span className={`tag-status ${c.status === 'approved' ? 'ok' : 'draft'}`}>{contentStatusLabel(c.status)}</span>
                          {c.durationMin != null && <span className="tag-kind">{c.durationMin} phút</span>}
                        </div>
                        <b>{c.title}</b>
                        <small>{c.source}{c.mediaUrl ? ` · ${c.mediaUrl}` : ''}</small>
                      </div>
                      <button type="button" className="btn btn-outline sm" onClick={() => startEditContent(c)}>Chỉnh sửa</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Ngưỡng đạt bài học (%)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={thresholdV}
                  onChange={(e) => setPassThreshold(Number(e.target.value))}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', fontWeight: 400 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Điều kiện mở bài tiếp theo
                <select
                  value={unlockRuleV}
                  onChange={(e) => setUnlockRule(e.target.value as 'pass_quiz' | 'view_and_pass' | 'open')}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)', fontWeight: 400 }}
                >
                  <option value="pass_quiz">Đạt bài kiểm tra sau bài học</option>
                  <option value="view_and_pass">Xem đủ nội dung &amp; đạt bài kiểm tra</option>
                  <option value="open">Mở tự do (không chặn)</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {tab === 'quiz' && (
          <section className="ed-card">
            <header>
              <div><small>ITEM (ASSESS → CONCEPT)</small><h2>Ngân hàng câu hỏi &amp; bài tập tự luyện</h2></div>
              <button type="button" className="btn btn-outline sm" onClick={openAddQuestion}>
                <Plus size={12} /> Thêm câu hỏi
              </button>
            </header>
            <div className="rule-box"><HelpCircle size={14} /><div><b>Quy tắc</b><span>Mỗi câu hỏi chỉ kiểm tra một khái niệm, bắt buộc có đáp án và giải thích.</span></div></div>

            {(addingQuestion || editingQuestionId) && (
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--line)', background: '#f8fafc', marginBottom: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                  <input
                    value={qDraft.text}
                    onChange={(e) => setQDraft({ ...qDraft, text: e.target.value })}
                    placeholder="Nội dung câu hỏi *"
                    style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                  <select value={qDraft.mode} onChange={(e) => setQDraft({ ...qDraft, mode: e.target.value as 'quiz' | 'practice' })}>
                    <option value="quiz">Đánh giá (Quiz)</option>
                    <option value="practice">Tự luyện (Practice)</option>
                  </select>
                  <select value={qDraft.bloom} onChange={(e) => setQDraft({ ...qDraft, bloom: e.target.value })}>
                    {BLOOM.map((b) => <option key={b}>{b}</option>)}
                  </select>
                  <select value={qDraft.difficulty} onChange={(e) => setQDraft({ ...qDraft, difficulty: e.target.value })}>
                    {DIFF.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={qDraft.optA} onChange={(e) => setQDraft({ ...qDraft, optA: e.target.value })} placeholder="Đáp án A *" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }} />
                  <input value={qDraft.optB} onChange={(e) => setQDraft({ ...qDraft, optB: e.target.value })} placeholder="Đáp án B *" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }} />
                  <input value={qDraft.optC} onChange={(e) => setQDraft({ ...qDraft, optC: e.target.value })} placeholder="Đáp án C" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }} />
                  <input value={qDraft.optD} onChange={(e) => setQDraft({ ...qDraft, optD: e.target.value })} placeholder="Đáp án D" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8 }}>
                  <select value={qDraft.correctIndex} onChange={(e) => setQDraft({ ...qDraft, correctIndex: Number(e.target.value) })}>
                    <option value={0}>Đáp án đúng: A</option>
                    <option value={1}>Đáp án đúng: B</option>
                    <option value={2}>Đáp án đúng: C</option>
                    <option value={3}>Đáp án đúng: D</option>
                  </select>
                  <input
                    value={qDraft.explanation}
                    onChange={(e) => setQDraft({ ...qDraft, explanation: e.target.value })}
                    placeholder="Giải thích đáp án *"
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline sm" onClick={() => { setAddingQuestion(false); setEditingQuestionId(null); }}>Hủy</button>
                  <button type="button" className="btn btn-primary sm" onClick={saveQuestionDraft}>{editingQuestionId ? 'Lưu câu hỏi' : 'Thêm câu hỏi'}</button>
                </div>
              </div>
            )}

            <table className="q-table">
              <thead><tr><th>Câu</th><th>Nội dung</th><th /><th>Mức Bloom</th><th>Độ khó</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr key={q.id}>
                    <td><span className="q-no">{i + 1}</span></td>
                    <td className="q-text">
                      <div>{q.text}</div>
                      {q.mode === 'practice' && <small className="muted-s">Bài tập tự luyện</small>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-outline sm" style={{ marginRight: 6 }} onClick={() => startEditQuestion(q)}>Sửa</button>
                      <button className="icon-plain" onClick={() => setRemoved((r) => [...r, q.id])} aria-label="Xóa"><Trash2 size={12} /></button>
                    </td>
                    <td>
                      <select value={qs[q.id]?.bloom ?? q.bloom} onChange={(e) => setQs((s) => ({ ...s, [q.id]: { ...s[q.id], bloom: e.target.value } }))}>
                        {BLOOM.map((b) => <option key={b}>{b}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={qs[q.id]?.difficulty ?? q.difficulty} onChange={(e) => setQs((s) => ({ ...s, [q.id]: { ...s[q.id], difficulty: e.target.value } }))}>
                        {DIFF.map((b) => <option key={b}>{b}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={q.status}
                        onChange={(e) => setQs((s) => ({ ...s, [q.id]: { ...s[q.id], status: e.target.value as QuestionItem['status'] } }))}
                      >
                        <option value="approved">Đã duyệt</option>
                        <option value="draft">Bản nháp</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'prereq' && (
          <section className="ed-card">
            <header><div><small>PREREQUISITE</small><h2>Điều kiện tiên quyết</h2></div><span>Các node học viên cần nắm trước khi học node này.</span></header>
            <div className="content-list">
              {data.prerequisites.map((p) => (
                <div key={p} className="content-item"><span className="c-ico blue"><FileText size={14} /></span><div className="c-main"><b>{p}</b><small>Tiên quyết (bắt buộc)</small></div></div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
