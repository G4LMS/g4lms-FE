import { Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import { AppHeader } from '../features/layout/AppHeader';
import type { AdaptiveCourseSettings } from '../types';

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
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (loaded) setForm(loaded);
  }, [loaded]);

  const courseName = courses?.find((c) => c.id === courseId)?.title ?? courseId;

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    setSaveErr('');
    try {
      const saved = await api.saveAdaptiveSettings(courseId, form);
      setForm(saved);
      setSavedMsg(isVi ? 'Đã lưu cấu hình học tập thích ứng.' : 'Saved adaptive learning settings.');
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

            <label style={{ display: 'block' }}>
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
          </section>
        )}
      </main>
    </div>
  );
}
