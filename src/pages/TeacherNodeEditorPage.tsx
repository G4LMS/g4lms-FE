import { ArrowLeft, FileText, HelpCircle, Trash2 } from 'lucide-react';
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
  const questions = data.questions
    .filter((q) => !removed.includes(q.id))
    .map((q) => ({
      ...q,
      bloom: qs[q.id]?.bloom ?? q.bloom,
      difficulty: qs[q.id]?.difficulty ?? q.difficulty,
      status: qs[q.id]?.status ?? q.status,
    }));
  const nameV = name ?? data.name;
  const descV = desc ?? data.description;

  const startEditContent = (item: ContentItem) => {
    setEditingContentId(item.id);
    setContentDraft({ ...item });
  };

  const applyContentDraft = () => {
    if (!contentDraft) return;
    setContents(contentList.map((c) => (c.id === contentDraft.id ? { ...contentDraft, title: contentDraft.title.trim() || c.title } : c)));
    setEditingContentId(null);
    setContentDraft(null);
  };

  const saveAndBack = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.saveNodeEditor(courseId, nodeId, {
        name: nameV.trim() || data.name,
        description: descV,
        contents: contentList,
        questions,
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
            <header><div><small>CONTENT</small><h2>Nội dung học tập</h2></div><span>Các định nghĩa và ví dụ được trích từ tài liệu nguồn.</span></header>
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
                        </div>
                        <b>{c.title}</b>
                        <small>{c.source}</small>
                      </div>
                      <button type="button" className="btn btn-outline sm" onClick={() => startEditContent(c)}>Chỉnh sửa</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'quiz' && (
          <section className="ed-card">
            <header><div><small>ITEM</small><h2>Câu hỏi đánh giá</h2></div><span>{questions.length} câu dùng để đo mức độ làm chủ {nameV}.</span></header>
            <div className="rule-box"><HelpCircle size={14} /><div><b>Quy tắc</b><span>Mỗi câu hỏi chỉ kiểm tra một khái niệm</span></div></div>
            <table className="q-table">
              <thead><tr><th>Câu</th><th>Nội dung</th><th /><th>Mức Bloom</th><th>Độ khó</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr key={q.id}>
                    <td><span className="q-no">{i + 1}</span></td>
                    <td className="q-text">{q.text}</td>
                    <td><button className="icon-plain" onClick={() => setRemoved((r) => [...r, q.id])} aria-label="Xóa"><Trash2 size={12} /></button></td>
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
