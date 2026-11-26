import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3 } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../features/common/useAsync';
import { AppHeader } from '../features/layout/AppHeader';
import { useLanguage } from '../features/i18n/LanguageContext';
import type { QuizAttempt } from '../types';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function StudentQuizPage() {
  const { courseId = '', quizId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const nodeId = searchParams.get('nodeId') ?? undefined;
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const { data: quiz, loading, error: loadError } = useAsync(
    () => api.getQuiz(courseId, quizId),
    [courseId, quizId],
  );
  const { data: graphData } = useAsync(
    () => (courseId ? api.getKnowledgeGraph(courseId).catch(() => null) : Promise.resolve(null)),
    [courseId],
  );
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [unansweredWarning, setUnansweredWarning] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!attempt || result) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, result]);

  const submit = async (force = false) => {
    if (!attempt || busy || result || !quiz) return;
    const unanswered = quiz.questions.length - Object.keys(answers).length;
    if (!force && unanswered > 0) {
      setUnansweredWarning(true);
      return;
    }
    setUnansweredWarning(false);
    setBusy(true);
    setActionError('');
    try {
      const submitted = await api.submitQuizAttempt(courseId, quizId, attempt.id, { answers, nodeId });
      const ratio = submitted.totalQuestions > 0 ? (submitted.correctCount ?? 0) / submitted.totalQuestions : 1;
      if (ratio < 0.7) {
        setFailCount((c) => c + 1);
      }
      setResult(submitted);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể nộp bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (remaining === 0 && attempt && Date.now() >= new Date(attempt.expiresAt).getTime()
      && !result && !busy && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit(true);
    }
  }, [remaining, attempt, result, busy]);

  const fromNode = Boolean(nodeId);

  const start = async () => {
    setBusy(true);
    setActionError('');
    try {
      const started = await api.startQuizAttempt(courseId, quizId, fromNode);
      setAttempt(started);
      setRemaining(Math.max(0, Math.ceil((new Date(started.expiresAt).getTime() - Date.now()) / 1000)));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể bắt đầu bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  };

  const dueMs = quiz?.dueAt ? Date.parse(quiz.dueAt) : NaN;
  const isExpired = Number.isFinite(dueMs) && Date.now() > dueMs;
  const canStart = !!quiz && quiz.status === 'published' && !isExpired && (fromNode || quiz.attemptsUsed < quiz.attemptsAllowed);

  const retry = async () => {
    setResult(null);
    setAttempt(null);
    setAnswers({});
    autoSubmitted.current = false;
    await start();
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="container quiz-page">
        <Link className="quiz-back" to={`/courses/${courseId}/content`}><ArrowLeft size={15} />{isVi ? 'Quay lại nội dung môn học' : 'Back to course content'}</Link>
        {loading && <p className="muted">{isVi ? 'Đang tải bài kiểm tra...' : 'Loading quiz...'}</p>}
        {loadError && <p className="form-error" role="alert">{loadError.message}</p>}
        {quiz && (
          <>
            <header className="quiz-heading">
              <span className="profile-kicker">{courseId}</span>
              <h1>{quiz.title}</h1>
              <p>{quiz.description}</p>
              <div className="quiz-meta">
                <span><Clock3 size={14} />{quiz.timeLimitMinutes} {isVi ? 'phút' : 'minutes'}</span>
                <span>{quiz.questions.length} {isVi ? 'câu hỏi' : 'questions'}</span>
                <span>
                  {isVi ? 'Số lần làm' : 'Attempts'}:{' '}
                  {fromNode ? (isVi ? 'Không giới hạn' : 'Unlimited') : `${quiz.attemptsUsed}/${quiz.attemptsAllowed}`}
                </span>
                {quiz.dueAt && (
                  <span>{isVi ? 'Hạn đóng' : 'Due'}: {new Date(quiz.dueAt).toLocaleString(isVi ? 'vi-VN' : 'en-US')}</span>
                )}
              </div>
            </header>

            {actionError && <p className="form-error" role="alert">{actionError}</p>}
            {!attempt && !result && (
              <section className="quiz-start-card">
                <p>
                  {isExpired
                    ? (isVi ? 'Bài kiểm tra đã quá hạn. Chức năng làm bài đã bị khóa.' : 'This quiz has passed its deadline and is now locked.')
                    : (isVi ? 'Thời gian bắt đầu tính ngay khi bạn bắt đầu. Hệ thống sẽ tự nộp khi hết giờ.' : 'The timer starts when you begin. Your answers will be submitted automatically when time runs out.')}
                </p>
                <button className="btn btn-primary" onClick={start} disabled={busy || !canStart}>
                  {isExpired
                    ? (isVi ? 'Đã quá hạn làm bài' : 'Quiz expired')
                    : canStart
                      ? (isVi ? 'Bắt đầu làm bài' : 'Start quiz')
                      : (isVi ? 'Không còn lượt làm' : 'No attempts remaining')}
                </button>
              </section>
            )}

            {attempt && !result && (
              <>
                <div className={`quiz-timer ${remaining < 60 ? 'urgent' : ''}`} aria-live="polite">
                  <Clock3 size={16} />{isVi ? 'Thời gian còn lại' : 'Time remaining'} <strong>{formatTime(remaining)}</strong>
                </div>
                <div className="quiz-question-list">
                  {quiz.questions.map((question, index) => (
                    <fieldset className="quiz-question" key={question.id}>
                      <legend>{isVi ? `Câu ${index + 1}` : `Question ${index + 1}`}: {question.prompt}</legend>
                      {question.options.map((option) => (
                        <label className="quiz-option" key={option.id}>
                          <input
                            type="radio"
                            name={question.id}
                            value={option.id}
                            checked={answers[question.id] === option.id}
                            onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                          />
                          <span>{option.text}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                {unansweredWarning && (
                  <div className="wizard-banner error" role="alert" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                    <span>
                      {isVi
                        ? `Bạn còn ${quiz.questions.length - Object.keys(answers).length} câu hỏi chưa trả lời. Vẫn muốn nộp bài?`
                        : `${quiz.questions.length - Object.keys(answers).length} unanswered questions remain. Submit anyway?`}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-outline sm" onClick={() => setUnansweredWarning(false)}>
                        {isVi ? 'Làm tiếp' : 'Continue'}
                      </button>
                      <button type="button" className="btn btn-primary sm" disabled={busy} onClick={() => void submit(true)}>
                        {isVi ? 'Nộp bài luôn' : 'Submit anyway'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="quiz-submit-row">
                  <span>{Object.keys(answers).length}/{quiz.questions.length} {isVi ? 'câu đã trả lời' : 'answered'}</span>
                  <button className="btn btn-primary" onClick={() => void submit(false)} disabled={busy}>
                    {isVi ? 'Nộp bài kiểm tra' : 'Submit quiz'}
                  </button>
                </div>
              </>
            )}

            {result && (
              <section className="quiz-result-card">
                <CheckCircle2 size={26} />
                <h2>{isVi ? 'Đã nộp bài' : 'Quiz submitted'}</h2>
                <strong>{result.score?.toLocaleString(isVi ? 'vi-VN' : 'en-US')} / {result.maxScore}</strong>
                <p>{result.correctCount}/{result.totalQuestions} {isVi ? 'câu trả lời đúng' : 'correct answers'}</p>
                {result.totalQuestions > 0 && (result.correctCount ?? 0) / result.totalQuestions >= 0.7 ? (
                  <p style={{ color: '#15803d', fontWeight: 600 }}>
                    {isVi ? 'Đạt yêu cầu (≥ 70%) — Bài học đã hoàn thành và mở khóa bài tiếp theo!' : 'Passed (≥ 70%) — Next lesson unlocked!'}
                  </p>
                ) : (
                  <div style={{ textAlign: 'left', marginTop: 10, padding: 12, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <p style={{ color: '#b45309', margin: '0 0 6px', fontWeight: 600 }}>
                      {isVi ? 'Chưa đạt ngưỡng 70% để mở khóa bài tiếp theo.' : 'Score below 70%.'}
                    </p>
                    {failCount <= 1 ? (
                      <p className="muted-s" style={{ margin: 0 }}>
                        {isVi
                          ? 'Gợi ý lần 1: Hãy xem lại tài liệu giải thích thay thế (ví dụ minh họa) hoặc ôn các câu hỏi ở mức Bloom thấp hơn (Nhớ / Hiểu) trước khi làm lại.'
                          : 'Suggestion: Review alternative explanations or lower Bloom-level practice questions before retaking.'}
                      </p>
                    ) : (
                      <div>
                        <p className="muted-s" style={{ margin: '0 0 6px', color: '#92400e', fontWeight: 600 }}>
                          {isVi
                            ? 'Bổ trợ kiến thức nền (FR06 — Dưới ngưỡng từ lần thứ 2): Hệ thống truy ngược các bài tiên quyết cần củng cố:'
                            : 'Prerequisite remediation (FR06): Review prerequisite concepts:'}
                        </p>
                        {(() => {
                          const prereqs = nodeId && graphData
                            ? graphData.edges
                                .filter((e) => e.type === 'PREREQUISITE' && e.target === nodeId)
                                .map((e) => graphData.nodes.find((n) => n.id === e.source))
                                .filter((n): n is NonNullable<typeof n> => Boolean(n))
                            : [];
                          return prereqs.length > 0 ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {prereqs.map((p) => (
                                <Link key={p.id} className="btn btn-outline sm" to={`/courses/${courseId}/learn/${encodeURIComponent(p.id)}`}>
                                  Ôn nền tảng: {p.name}
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <Link className="btn btn-outline sm" to={`/courses/${courseId}/graph`}>
                              Mở lộ trình để xem bài tiên quyết cần bổ trợ
                            </Link>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                  {nodeId && (
                    <Link className="btn btn-outline sm" to={`/courses/${courseId}/learn/${encodeURIComponent(nodeId)}`}>
                      {isVi ? 'Quay lại bài học' : 'Back to lesson'}
                    </Link>
                  )}
                  {result.totalQuestions > 0 && (result.correctCount ?? 0) / result.totalQuestions >= 0.7 ? (
                    <Link className="btn btn-primary sm" to={`/courses/${courseId}/graph`}>
                      {isVi ? 'Xem lộ trình & bài tiếp theo' : 'View path & next lesson'}
                    </Link>
                  ) : (
                    canStart && (
                      <button type="button" className="btn btn-primary sm" disabled={busy} onClick={() => void retry()}>
                        {isVi ? 'Làm lại quiz' : 'Retake quiz'}
                      </button>
                    )
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
