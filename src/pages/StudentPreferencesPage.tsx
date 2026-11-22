import { Check, ChevronDown, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { useLanguage } from '../features/i18n/LanguageContext';
import { AppHeader } from '../features/layout/AppHeader';

export interface LearningPreferences {
  domains: string[];
  goal: string;
  examDate: string;
  minutes: string;
  sessions: number;
}

const DEFAULT_PREFERENCES: LearningPreferences = {
  domains: ['Lập trình'],
  goal: 'gap',
  examDate: '',
  minutes: '30 phút',
  sessions: 3,
};

const DOMAINS = [
  'Lập trình',
  'Trí tuệ nhân tạo',
  'Khoa học dữ liệu',
  'Vật lý',
  'Kinh tế',
  'Tài chính',
  'Kỹ thuật',
  'Đời sống hằng ngày',
];

const GOALS = [
  { id: 'exam', labelVi: 'Chuẩn bị thi học kỳ', labelEn: 'Prepare for final exam', descVi: 'Ôn tập có trọng tâm trước kỳ thi sắp tới.', descEn: 'Focused review ahead of upcoming exams.' },
  { id: 'theory', labelVi: 'Hiểu sâu lý thuyết', labelEn: 'Deep theory understanding', descVi: 'Nắm vững định nghĩa và chứng minh cốt lõi.', descEn: 'Master core definitions and proofs.' },
  { id: 'practice', labelVi: 'Luyện nhiều bài tập', labelEn: 'Hands-on practice', descVi: 'Thành thạo qua thực hành và bài kiểm tra.', descEn: 'Build fluency through exercises and quizzes.' },
  { id: 'gap', labelVi: 'Lấp lỗ hổng kiến thức', labelEn: 'Close knowledge gaps', descVi: 'Ưu tiên các node bạn còn yếu.', descEn: 'Prioritize concepts that need reinforcement.' },
];

const DURATIONS = ['15 phút', '30 phút', '1 giờ', 'Hơn 1 giờ'];
const MAX_DOMAINS = 3;

function loadPreferences(userId: string): LearningPreferences {
  try {
    const raw = localStorage.getItem(`g4lms.preferences.${userId}`);
    if (raw) return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<LearningPreferences>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCES;
}

export default function StudentPreferencesPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isVi = language === 'vi';
  const userKey = user?.id ?? 'guest';

  const [prefs, setPrefs] = useState<LearningPreferences>(() => loadPreferences(userKey));
  const [open, setOpen] = useState({ d: true, g: true, t: true });
  const [saved, setSaved] = useState(false);

  const allOpen = open.d && open.g && open.t;
  const full = prefs.domains.length >= MAX_DOMAINS;

  const toggleDomain = (domain: string) => {
    setPrefs((prev) => {
      const exists = prev.domains.includes(domain);
      if (exists) return { ...prev, domains: prev.domains.filter((x) => x !== domain) };
      if (prev.domains.length >= MAX_DOMAINS) return prev;
      return { ...prev, domains: [...prev.domains, domain] };
    });
  };

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    if (prefs.domains.length === 0) return;
    try {
      localStorage.setItem(`g4lms.preferences.${userKey}`, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="container" style={{ maxWidth: 820 }}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={20} color="var(--primary)" />
            {isVi ? 'Sở thích học tập' : 'Learning preferences'}
          </h1>
          <p className="muted-s" style={{ marginTop: 4 }}>
            {isVi
              ? 'AI dùng các thông tin này để chọn ví dụ minh họa và gợi ý việc nên học tiếp. Chỉ bạn nhìn thấy các lựa chọn này.'
              : 'AI uses these preferences to tailor examples and next-step recommendations. Only you can see these choices.'}
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              className="btn btn-outline sm"
              onClick={() => setOpen({ d: !allOpen, g: !allOpen, t: !allOpen })}
            >
              {allOpen ? (isVi ? 'Thu gọn tất cả' : 'Collapse all') : (isVi ? 'Mở rộng tất cả' : 'Expand all')}
            </button>
          </div>

          {/* 1. Lĩnh vực minh họa */}
          <section className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              aria-expanded={open.d}
              onClick={() => setOpen((o) => ({ ...o, d: !o.d }))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                border: 0,
                borderBottom: open.d ? '1px solid var(--line)' : 'none',
                background: 'var(--bg)',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              <ChevronDown size={16} style={{ transform: open.d ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
              {isVi ? 'Lĩnh vực minh họa' : 'Illustration domains'}
            </button>
            {open.d && (
              <div style={{ padding: 16 }}>
                <p className="muted-s" style={{ marginBottom: 10 }}>
                  {isVi ? 'Chọn tối đa 3 lĩnh vực để AI lấy ví dụ gần gũi với bạn.' : 'Select up to 3 domains for relatable AI examples.'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DOMAINS.map((d) => {
                    const on = prefs.domains.includes(d);
                    const off = full && !on;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        disabled={off}
                        onClick={() => toggleDomain(d)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 14px',
                          borderRadius: 8,
                          border: `1.5px solid ${on ? '#7dd3fc' : 'var(--line)'}`,
                          background: on ? '#e0f2fe' : '#fff',
                          color: on ? '#0369a1' : 'var(--text)',
                          fontWeight: on ? 600 : 400,
                          opacity: off ? 0.5 : 1,
                        }}
                      >
                        {on && <Check size={14} />}
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="muted-s" style={{ marginTop: 10, display: 'flex', gap: 12 }}>
                  <span>{isVi ? `Đã chọn ${prefs.domains.length}/${MAX_DOMAINS}` : `Selected ${prefs.domains.length}/${MAX_DOMAINS}`}</span>
                  {full && <span>{isVi ? 'Đã đạt tối đa. Bỏ chọn một mục để đổi.' : 'Maximum reached.'}</span>}
                  {prefs.domains.length === 0 && (
                    <span className="c-orange" style={{ fontWeight: 600 }}>
                      {isVi ? 'Chọn ít nhất 1 lĩnh vực.' : 'Select at least 1 domain.'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 2. Mục tiêu */}
          <section className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              aria-expanded={open.g}
              onClick={() => setOpen((o) => ({ ...o, g: !o.g }))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                border: 0,
                borderBottom: open.g ? '1px solid var(--line)' : 'none',
                background: 'var(--bg)',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              <ChevronDown size={16} style={{ transform: open.g ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
              {isVi ? 'Mục tiêu học tập' : 'Learning goal'}
            </button>
            {open.g && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GOALS.map((g) => {
                  const on = prefs.goal === g.id;
                  return (
                    <label
                      key={g.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: `1.5px solid ${on ? '#7dd3fc' : 'var(--line)'}`,
                        background: on ? '#f0f9ff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="goal"
                        checked={on}
                        onChange={() => setPrefs((prev) => ({ ...prev, goal: g.id }))}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <strong style={{ display: 'block' }}>{isVi ? g.labelVi : g.labelEn}</strong>
                        <span className="muted-s">{isVi ? g.descVi : g.descEn}</span>
                      </span>
                    </label>
                  );
                })}
                {prefs.goal === 'exam' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 220, marginTop: 6 }}>
                    <span className="muted-s" style={{ fontWeight: 600 }}>
                      {isVi ? 'Ngày thi (không bắt buộc)' : 'Exam date (optional)'}
                    </span>
                    <input
                      type="date"
                      value={prefs.examDate}
                      onChange={(e) => setPrefs((prev) => ({ ...prev, examDate: e.target.value }))}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
                    />
                  </label>
                )}
              </div>
            )}
          </section>

          {/* 3. Thời gian học */}
          <section className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              aria-expanded={open.t}
              onClick={() => setOpen((o) => ({ ...o, t: !o.t }))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                border: 0,
                borderBottom: open.t ? '1px solid var(--line)' : 'none',
                background: 'var(--bg)',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              <ChevronDown size={16} style={{ transform: open.t ? 'none' : 'rotate(-90deg)', transition: '0.15s' }} />
              {isVi ? 'Thời gian học' : 'Study schedule'}
            </button>
            {open.t && (
              <div style={{ padding: 16 }}>
                <p className="muted-s" style={{ marginBottom: 10 }}>
                  {isVi ? 'Thời lượng mỗi buổi học:' : 'Duration per study session:'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {DURATIONS.map((d) => {
                    const on = prefs.minutes === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPrefs((prev) => ({ ...prev, minutes: d }))}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 14px',
                          borderRadius: 8,
                          border: `1.5px solid ${on ? '#7dd3fc' : 'var(--line)'}`,
                          background: on ? '#e0f2fe' : '#fff',
                          color: on ? '#0369a1' : 'var(--text)',
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {on && <Check size={14} />}
                        {d}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {isVi ? 'Bao nhiêu buổi mỗi tuần?' : 'How many sessions per week?'}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    aria-label={isVi ? 'Giảm số buổi' : 'Decrease sessions'}
                    disabled={prefs.sessions <= 1}
                    onClick={() => setPrefs((prev) => ({ ...prev, sessions: Math.max(1, prev.sessions - 1) }))}
                    className="btn btn-outline"
                    style={{ borderRadius: '6px 0 0 6px' }}
                  >
                    <Minus size={14} />
                  </button>
                  <span
                    style={{
                      minWidth: 96,
                      padding: '6px 12px',
                      textAlign: 'center',
                      borderTop: '1px solid var(--line)',
                      borderBottom: '1px solid var(--line)',
                      fontWeight: 700,
                    }}
                  >
                    {prefs.sessions} {isVi ? 'buổi' : 'sessions'}
                  </span>
                  <button
                    type="button"
                    aria-label={isVi ? 'Tăng số buổi' : 'Increase sessions'}
                    disabled={prefs.sessions >= 7}
                    onClick={() => setPrefs((prev) => ({ ...prev, sessions: Math.min(7, prev.sessions + 1) }))}
                    className="btn btn-outline"
                    style={{ borderRadius: '0 6px 6px 0' }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
            <button type="submit" className="btn btn-primary" disabled={prefs.domains.length === 0}>
              {isVi ? 'Lưu thay đổi' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
              {isVi ? 'Hủy' : 'Cancel'}
            </button>
            {saved && (
              <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontWeight: 600 }}>
                <Check size={15} /> {isVi ? 'Đã lưu thay đổi' : 'Changes saved'}
              </span>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
