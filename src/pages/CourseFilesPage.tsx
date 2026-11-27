import { FileText, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import { useAsync } from '../features/common/useAsync';
import { useLanguage } from '../features/i18n/LanguageContext';
import type { CourseFile } from '../types';

const ALLOWED_FILE = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|mp4|mov|zip)$/i;

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CourseFilesPage() {
  const { courseId = '' } = useParams();
  const { language } = useLanguage();
  const isVi = language === 'vi';
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, loading, error } = useAsync(() => api.getCourseFiles(courseId), [courseId]);
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [actionError, setActionError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data) setFiles(data);
  }, [data]);

  const selectFiles = (fileList?: FileList | null) => {
    setActionError('');
    if (!fileList || fileList.length === 0) {
      setSelectedFiles([]);
      return;
    }
    const valid: File[] = [];
    const invalidNames: string[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_FILE.test(file.name) || file.size === 0) {
        invalidNames.push(file.name);
      } else {
        valid.push(file);
      }
    }
    if (invalidNames.length > 0) {
      setActionError(
        isVi
          ? `Một số tệp không hợp lệ hoặc rỗng đã bị bỏ qua (${invalidNames.join(', ')}). Chỉ nhận PDF, Word, Excel, PowerPoint, MP4/MOV hoặc ZIP.`
          : `Skipped invalid or empty files (${invalidNames.join(', ')}). Accepted formats: PDF, Word, Excel, PowerPoint, MP4/MOV, or ZIP.`,
      );
    }
    setSelectedFiles(valid);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownload = async (file: CourseFile) => {
    setActionError('');
    try {
      await api.downloadCourseFile(courseId, file.id, file.name);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : (isVi ? 'Không thể tải tệp xuống.' : 'Download failed.'));
    }
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setActionError('');
    try {
      const uploadedList: CourseFile[] = [];
      for (const file of selectedFiles) {
        const uploaded = await api.uploadCourseFile(courseId, file);
        uploadedList.push(uploaded);
      }
      setFiles((current) => [...uploadedList.reverse(), ...current]);
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : (isVi ? 'Không thể tải tệp lên.' : 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="container course-files-page">
        <div className="assignments-heading">
          <div>
            <span className="profile-kicker">{courseId}</span>
            <h1>{isVi ? 'Tài liệu khóa học' : 'Course files'}</h1>
          </div>
          <span className="assignment-count"><FileText size={15} />{files.length}</span>
        </div>

        {error && <p className="form-error" role="alert">{error.message}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <form className="file-upload-card" onSubmit={upload}>
          <h2>{isVi ? 'Tải tài liệu mới lên' : 'Upload a course file'}</h2>
          <label className="file-dropzone" htmlFor="course-file-input">
            <Upload size={23} />
            <strong>{isVi ? 'Chọn một hoặc nhiều tệp từ thiết bị' : 'Choose one or more files from your device'}</strong>
            <span>{isVi ? 'PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), MP4/MOV, ZIP' : 'PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), MP4/MOV, ZIP'}</span>
            <input
              ref={inputRef}
              id="course-file-input"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.zip"
              onChange={(event) => selectFiles(event.target.files)}
            />
          </label>
          {selectedFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="file-selected">
                  <span><FileText size={15} />{file.name} · {formatBytes(file.size)}</span>
                  <button type="button" className="icon-plain" aria-label={isVi ? 'Bỏ chọn tệp' : 'Remove selected file'} onClick={() => removeSelectedFile(idx)}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="file-upload-actions">
            {import.meta.env.VITE_USE_MOCK_API !== 'false' && (
              <p className="muted">{isVi ? 'Chế độ mock chỉ lưu thông tin tệp; cần backend để lưu nội dung thật.' : 'Mock mode stores file metadata only; a backend is required to persist file contents.'}</p>
            )}
            <button type="submit" className="btn btn-primary" disabled={selectedFiles.length === 0 || uploading}>
              <Upload size={14} />{uploading ? (isVi ? 'Đang tải...' : 'Uploading...') : (isVi ? `Tải lên${selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}` : `Upload${selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}`)}
            </button>
          </div>
        </form>

        <section className="course-file-list" aria-labelledby="course-file-list-heading">
          <div className="course-file-list-heading">
            <h2 id="course-file-list-heading">{isVi ? 'Tệp đã tải lên' : 'Uploaded files'}</h2>
            <span>{files.length}</span>
          </div>
          {loading && <p className="muted">{isVi ? 'Đang tải danh sách tệp...' : 'Loading files...'}</p>}
          {!loading && !error && !files.length && (
            <p className="course-empty-section">{isVi ? 'Khóa học chưa có tài liệu.' : 'No files have been added to this course.'}</p>
          )}
          {files.map((file) => (
            <article className="course-file-row" key={file.id}>
              <span className="course-file-icon"><FileText size={17} /></span>
              <div className="course-file-copy">
                <strong>{file.name}</strong>
                <span>{file.mimeType} · {formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString(isVi ? 'vi-VN' : 'en-US')}</span>
              </div>
              {file.downloadUrl && (
                <button type="button" className="btn btn-outline sm" onClick={() => void handleDownload(file)}>
                  {isVi ? 'Tải xuống' : 'Download'}
                </button>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
