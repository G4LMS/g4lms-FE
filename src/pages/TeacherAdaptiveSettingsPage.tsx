import { Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import { AppHeader } from '../features/layout/AppHeader';
import type { AdaptiveCourseSettings, CourseOnboardingConfig } from '../types';

const DEFAULT_SETTINGS: AdaptiveCourseSettings = {
  masteryThreshold: 80,
  hardPrereqStrict: true,
  softPrereqWeight: 40,
  quizWeight: 60,
  assignmentWeight: 40,
  remedialTriggerScore: 55,
  allowSkipMastered: true,
  maxWeeklyMinutes: 180,
};

export default function TeacherAdaptiveSettingsPage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isVi = language === 'vi';

  const { data: courses } = useAsync(() => api.getTeacherCourses(), []);
  const { data: loaded, loading, error } = useAsync(
    () => (courseId ? api.getAdaptiveSettings(courseId) : Promise.resolve(DEFAULT_SETTINGS)),
    [courseId],
  );

  const [form, setForm] = useState<AdaptiveCourseSettings>(DEFAULT_SETTINGS);
  const [onboarding, setOnboarding] = useState<CourseOnboardingConfig | null>(null);
  const [newDiagPrompt, setNewDiagPrompt] = useState('');
  const [newDiagOpt1, setNewDiagOpt1] = useState('');
  const [newDiagOpt2, setNewDiagOpt2] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (loaded) setForm(loaded);
  }, [loaded]);

  useEffect(() => {
    if (!courseId) return;
    api.getCourseOnboardingConfig(courseId).then(setOnboarding).catch(() => null);
  }, [courseId]);

  const courseName = courses?.find((c) => c.id === courseId)?.title ?? courseId;

  const weightSum = form.quizWeight + form.assignmentWeight;

  const handleSave = async () => {
    setSavedMsg('');
    setSaveErr('');
    if (weightSum !== 100) {
      setSaveErr(
        isVi
          ? `Tổng tỷ trọng đánh giá hiện là ${weightSum}% (phải đúng bằng 100%). Vui lòng điều chỉnh Tỷ trọng Quiz và Bài tập.`
          : `Assessment weights sum to ${weightSum}% (must equal 100%).`,
      );
      return;
    }
    if (form.remedialTriggerScore >= form.masteryThreshold) {
      setSaveErr(
        isVi
          ? 'Ngưỡng kích hoạt ôn tập phải nhỏ hơn ngưỡng đạt thành thạo (Mastery).'
          : 'Remedial trigger score must be lower than Mastery threshold.',
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveAdaptiveSettings(courseId, form);
      setForm(saved);
      if (onboarding) {
        const savedOnboarding = await api.saveCourseOnboardingConfig(courseId, onboarding);
        setOnboarding(savedOnboarding);
      }
      setSavedMsg(isVi ? 'Đã lưu cấu hình học tập thích ứng & đánh giá đầu vào.' : 'Saved adaptive learning & onboarding settings.');
    } catch (reason) {
      setSaveErr(reason instanceof Error ? reason.message : 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="container" style={{ maxWidth: 920 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1>{courseName} — {isVi ? 'Cài đặt thích ứng' : 'Adaptive settings'}</h1>
            <p className="muted-s">
              {isVi
                ? 'Điều chỉnh ngưỡng thành thạo, ngưỡng kích hoạt ôn tập và thời lượng học mục tiêu của khóa học.'
                : 'Configure mastery threshold, remedial trigger score, and target weekly study time.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-outline sm" onClick={() => navigate(`/teacher/courses/${courseId}/content`)}>
              {isVi ? 'Quay lại Nội dung' : 'Back to Content'}
            </button>
            <button type="button" className="btn btn-primary sm" disabled={saving || loading} onClick={() => void handleSave()}>
              <Save size={13} /> {saving ? (isVi ? 'Đang lưu...' : 'Saving...') : (isVi ? 'Lưu cấu hình' : 'Save settings')}
            </button>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error.message}</p>}
        {saveErr && <p className="form-error" role="alert">{saveErr}</p>}
        {savedMsg && <p className="admin-success" role="status">{savedMsg}</p>}

        {loading ? (
          <p className="muted">{isVi ? 'Đang tải cấu hình...' : 'Loading settings...'}</p>
        ) : (
          <section className="admin-card" style={{ padding: 18, maxWidth: 560 }}>
            <h2 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <SlidersHorizontal size={15} /> {isVi ? 'Thiết lập ngưỡng & nhịp độ học' : 'Thresholds & Study Pace'}
            </h2>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                <span>{isVi ? 'Ngưỡng đạt thành thạo (Mastery)' : 'Mastery threshold'}</span>
                <span>{form.masteryThreshold}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={form.masteryThreshold}
                onChange={(e) => setForm({ ...form, masteryThreshold: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                <span>{isVi ? 'Ngưỡng kích hoạt ôn tập (Remedial)' : 'Remedial trigger score'}</span>
                <span>{form.remedialTriggerScore}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={75}
                step={5}
                value={form.remedialTriggerScore}
                onChange={(e) => setForm({ ...form, remedialTriggerScore: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <span>{isVi ? 'Thời lượng học mục tiêu / tuần (phút)' : 'Target weekly study time (min)'}</span>
                <span>{form.maxWeeklyMinutes} phút</span>
              </div>
              <input
                type="number"
                min={60}
                max={600}
                step={15}
                value={form.maxWeeklyMinutes}
                onChange={(e) => setForm({ ...form, maxWeeklyMinutes: Number(e.target.value) || 180 })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)' }}
              />
            </label>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {isVi ? 'Tỷ trọng Trắc nghiệm (%)' : 'Quiz weight (%)'}
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.quizWeight}
                  onChange={(e) => setForm({ ...form, quizWeight: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {isVi ? 'Tỷ trọng Bài tập (%)' : 'Assignment weight (%)'}
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.assignmentWeight}
                  onChange={(e) => setForm({ ...form, assignmentWeight: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)' }}
                />
              </label>
            </div>
            <p className="muted-s" style={{ marginTop: 8, color: weightSum === 100 ? 'var(--green)' : '#b91c1c', fontWeight: 600 }}>
              {isVi ? `Tổng tỷ trọng: ${weightSum}% / 100%` : `Total weight: ${weightSum}% / 100%`}
            </p>
          </section>
        )}

        {!loading && onboarding && (
          <section className="admin-card" style={{ padding: 18, maxWidth: 720, marginTop: 16 }}>
            <h2 style={{ fontSize: 14, marginBottom: 10 }}>
              {isVi ? 'Thiết lập thu thập thông tin & đánh giá đầu vào (UC-CC-02)' : 'Onboarding Survey & Diagnostic Setup'}
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={onboarding.surveyEnabled}
                  onChange={(e) => setOnboarding({ ...onboarding, surveyEnabled: e.target.checked })}
                />
                {isVi ? 'Bật khảo sát đầu khóa cho sinh viên' : 'Enable pre-course survey'}
              </label>
              {onboarding.surveyEnabled && (
                <div style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
                  <input
                    value={onboarding.surveyTitle}
                    onChange={(e) => setOnboarding({ ...onboarding, surveyTitle: e.target.value })}
                    placeholder="Tiêu đề biểu mẫu khảo sát"
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                  />
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={onboarding.collectBackground} onChange={(e) => setOnboarding({ ...onboarding, collectBackground: e.target.checked })} />
                      Kiến thức nền
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={onboarding.collectGoal} onChange={(e) => setOnboarding({ ...onboarding, collectGoal: e.target.checked })} />
                      Mục tiêu học tập
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={onboarding.collectWeeklyHours} onChange={(e) => setOnboarding({ ...onboarding, collectWeeklyHours: e.target.checked })} />
                      Số giờ tự học / tuần
                    </label>
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={onboarding.diagnosticEnabled}
                  onChange={(e) => setOnboarding({ ...onboarding, diagnosticEnabled: e.target.checked })}
                />
                {isVi ? 'Bật bài kiểm tra chẩn đoán đầu vào' : 'Enable diagnostic test'}
              </label>
              {onboarding.diagnosticEnabled && (
                <div style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12.5 }}>
                    Ngưỡng đạt chẩn đoán (%):{' '}
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={onboarding.diagnosticPassScore}
                      onChange={(e) => setOnboarding({ ...onboarding, diagnosticPassScore: Number(e.target.value) || 60 })}
                      style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)' }}
                    />
                  </div>
                  {onboarding.diagnosticQuestions.map((q, idx) => (
                    <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: '#f8fafc', fontSize: 12.5 }}>
                      <span><b>Câu {idx + 1}:</b> {q.prompt} ({q.options.length} lựa chọn)</span>
                      <button
                        type="button"
                        className="icon-plain"
                        aria-label="Xóa câu chẩn đoán"
                        onClick={() => setOnboarding({ ...onboarding, diagnosticQuestions: onboarding.diagnosticQuestions.filter((item) => item.id !== q.id) })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6 }}>
                    <input
                      value={newDiagPrompt}
                      onChange={(e) => setNewDiagPrompt(e.target.value)}
                      placeholder="Câu hỏi chẩn đoán mới..."
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12.5 }}
                    />
                    <input
                      value={newDiagOpt1}
                      onChange={(e) => setNewDiagOpt1(e.target.value)}
                      placeholder="Đáp án đúng *"
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12.5 }}
                    />
                    <input
                      value={newDiagOpt2}
                      onChange={(e) => setNewDiagOpt2(e.target.value)}
                      placeholder="Đáp án nhiễu *"
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline sm"
                      onClick={() => {
                        if (!newDiagPrompt.trim() || !newDiagOpt1.trim() || !newDiagOpt2.trim()) return;
                        setOnboarding({
                          ...onboarding,
                          diagnosticQuestions: [
                            ...onboarding.diagnosticQuestions,
                            {
                              id: `diag-${Date.now()}`,
                              prompt: newDiagPrompt.trim(),
                              options: [newDiagOpt1.trim(), newDiagOpt2.trim()],
                              correctIndex: 0,
                            },
                          ],
                        });
                        setNewDiagPrompt('');
                        setNewDiagOpt1('');
                        setNewDiagOpt2('');
                      }}
                    >
                      <Plus size={12} /> Thêm
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
