import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CourseOnboardingConfig, StudentOnboardingResult } from '../../types';

export function StudentOnboardingPanel({ courseId }: { courseId: string }) {
  const [config, setConfig] = useState<CourseOnboardingConfig | null>(null);
  const [result, setResult] = useState<StudentOnboardingResult | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'survey' | 'diagnostic'>('survey');
  const [backgroundLevel, setBackgroundLevel] = useState('Đã có kiến thức nền cơ bản');
  const [learningGoal, setLearningGoal] = useState('Nắm vững kiến thức cốt lõi & qua môn');
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.getCourseOnboardingConfig(courseId).catch(() => null),
      api.getStudentOnboardingResult(courseId).catch(() => null),
    ]).then(([cfg, res]) => {
      if (!alive) return;
      if (cfg) {
        setConfig(cfg);
        setStep(cfg.surveyEnabled ? 'survey' : 'diagnostic');
      }
      if (res) setResult(res);
    });
    return () => {
      alive = false;
    };
  }, [courseId]);

  if (!config || (!config.surveyEnabled && !config.diagnosticEnabled)) {
    return null;
  }

  const handleSubmit = async () => {
    if (config.diagnosticEnabled && config.diagnosticQuestions.length > 0) {
      const unanswered = config.diagnosticQuestions.filter((q) => answers[q.id] === undefined);
      if (unanswered.length > 0) {
        setError(`Vui lòng trả lời đầy đủ ${config.diagnosticQuestions.length} câu hỏi chẩn đoán.`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const saved = await api.submitStudentOnboarding(courseId, {
        survey: config.surveyEnabled ? { backgroundLevel, learningGoal, weeklyHours } : undefined,
        diagnosticAnswers: answers,
      });
      setResult(saved);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu đánh giá đầu vào.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.completed) {
    return (
      <div className="admin-card" style={{ padding: '12px 16px', marginBottom: 14, borderLeft: '4px solid #16a34a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} color="#16a34a" />
          <div>
            <b style={{ fontSize: 13 }}>Hồ sơ học thuật đầu vào đã hoàn tất</b>
            <p className="muted-s" style={{ margin: '2px 0 0' }}>{result.summary}</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline sm"
          onClick={() => {
            setStep(config.surveyEnabled ? 'survey' : 'diagnostic');
            setOpen((v) => !v);
          }}
        >
          {open ? 'Thu gọn' : 'Làm lại đánh giá'}
        </button>
      </div>
    );
  }

  return (
    <section className="admin-card" style={{ padding: 16, marginBottom: 14, borderLeft: '4px solid var(--primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardCheck size={18} color="var(--primary)" />
          <div>
            <b style={{ fontSize: 14 }}>Đánh giá đầu vào học phần (UC-UM-03)</b>
            <p className="muted-s" style={{ margin: '2px 0 0' }}>
              {config.surveyEnabled
                ? 'Hoàn thành khảo sát đầu khóa và bài kiểm tra chẩn đoán để tổng hợp hồ sơ lộ trình cá nhân.'
                : 'Làm bài kiểm tra chẩn đoán đầu vào để tổng hợp hồ sơ lộ trình cá nhân.'}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-primary sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Đóng' : 'Bắt đầu đánh giá đầu vào'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'grid', gap: 12 }}>
          {error && <p className="form-error" role="alert" style={{ margin: 0 }}>{error}</p>}

          {step === 'survey' && config.surveyEnabled && (
            <div style={{ display: 'grid', gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 13 }}>Bước 1: {config.surveyTitle}</h4>
              {config.collectBackground && (
                <label className="field">
                  <span>Mức độ kiến thức nền hiện tại</span>
                  <select value={backgroundLevel} onChange={(e) => setBackgroundLevel(e.target.value)}>
                    <option value="Chưa có kiến thức nền">Chưa có kiến thức nền</option>
                    <option value="Đã có kiến thức nền cơ bản">Đã có kiến thức nền cơ bản</option>
                    <option value="Đã vững, muốn học nâng cao">Đã vững, muốn học nâng cao</option>
                  </select>
                </label>
              )}
              {config.collectGoal && (
                <label className="field">
                  <span>Mục tiêu học tập</span>
                  <input value={learningGoal} onChange={(e) => setLearningGoal(e.target.value)} />
                </label>
              )}
              {config.collectWeeklyHours && (
                <label className="field">
                  <span>Số giờ tự học dự kiến / tuần</span>
                  <input type="number" min={1} max={40} value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value) || 4)} />
                </label>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {config.diagnosticEnabled ? (
                  <button type="button" className="btn btn-primary sm" onClick={() => setStep('diagnostic')}>
                    Tiếp tục sang bài chẩn đoán
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary sm" disabled={submitting} onClick={() => void handleSubmit()}>
                    {submitting ? 'Đang lưu...' : 'Hoàn thành đánh giá'}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'diagnostic' && config.diagnosticEnabled && (
            <div style={{ display: 'grid', gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13 }}>
                {config.surveyEnabled ? 'Bước 2: Bài kiểm tra chẩn đoán đầu vào' : 'Bài kiểm tra chẩn đoán đầu vào'}
              </h4>
              {config.diagnosticQuestions.map((q, idx) => (
                <fieldset key={q.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
                  <legend style={{ fontSize: 12.5, fontWeight: 600, padding: '0 6px' }}>
                    Câu {idx + 1}: {q.prompt}
                  </legend>
                  <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                    {q.options.map((opt, optIdx) => (
                      <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`diag-${q.id}`}
                          checked={answers[q.id] === optIdx}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                {config.surveyEnabled ? (
                  <button type="button" className="btn btn-outline sm" onClick={() => setStep('survey')}>
                    Quay lại khảo sát
                  </button>
                ) : <span />}
                <button type="button" className="btn btn-primary sm" disabled={submitting} onClick={() => void handleSubmit()}>
                  {submitting ? 'Đang tổng hợp hồ sơ...' : 'Nộp bài chẩn đoán & Tổng hợp hồ sơ'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
