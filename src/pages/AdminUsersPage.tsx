import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppHeader } from '../features/layout/AppHeader';
import type { AdminUser, Role } from '../types';

const roleLabels: Record<Role, string> = {
  admin: 'Quản trị viên',
  teacher: 'Giảng viên',
  student: 'Sinh viên',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<Role>('student');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await api.getAdminUsers());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const resetPassword = async () => {
    if (!passwordTarget) return;
    if (temporaryPassword.length < 8 || !/[A-Z]/.test(temporaryPassword) || !/[0-9]/.test(temporaryPassword)) {
      setError('Mật khẩu tạm thời cần ít nhất 8 ký tự, gồm 1 chữ hoa và 1 chữ số.');
      return;
    }
    setBusyId(passwordTarget.id);
    setError('');
    setActionMessage('');
    try {
      await api.resetAdminUserPassword(passwordTarget.id, temporaryPassword);
      setActionMessage(`Đã đặt lại mật khẩu cho ${passwordTarget.email}. Người dùng sẽ phải đổi mật khẩu khi đăng nhập.`);
      setPasswordTarget(null);
      setTemporaryPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đặt lại mật khẩu.');
    } finally {
      setBusyId('');
    }
  };

  const startEditUser = (user: AdminUser) => {
    setPasswordTarget(null);
    setEditTarget(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setError('');
    setActionMessage('');
  };

  const saveEditUser = async () => {
    if (!editTarget) return;
    if (!editName.trim() || !editEmail.trim() || !editEmail.includes('@')) {
      setError('Vui lòng nhập họ tên và email hợp lệ.');
      return;
    }
    setBusyId(editTarget.id);
    setError('');
    setActionMessage('');
    try {
      const updated = await api.updateAdminUser(editTarget.id, {
        fullName: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActionMessage(`Đã cập nhật thông tin tài khoản ${updated.email}.`);
      setEditTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật tài khoản.');
    } finally {
      setBusyId('');
    }
  };

  const toggleUserActive = async (user: AdminUser) => {
    if (user.role === 'admin') return;
    setBusyId(user.id);
    setError('');
    setActionMessage('');
    try {
      const updated = await api.updateAdminUser(user.id, { active: !user.active });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActionMessage(
        updated.active
          ? `Đã kích hoạt lại tài khoản ${updated.email}.`
          : `Đã khóa tài khoản ${updated.email}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đổi trạng thái tài khoản.');
    } finally {
      setBusyId('');
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (user.role === 'admin') return;
    if (!window.confirm(`Xóa tài khoản ${user.email}? Thao tác này không thể hoàn tác.`)) return;
    setBusyId(user.id);
    setError('');
    setActionMessage('');
    try {
      await api.deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setActionMessage(`Đã xóa tài khoản ${user.email}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa tài khoản.');
    } finally {
      setBusyId('');
    }
  };

  const filteredUsers = users.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="page">
      <AppHeader />
      <main className="container admin-container">
        <div className="admin-heading">
          <div>
            <span className="profile-kicker">Quản trị</span>
            <h1 className="page-title">Người dùng</h1>
            <p className="muted">{users.length} tài khoản</p>
          </div>
          <Link className="btn btn-primary" to="/admin">Tạo tài khoản</Link>
        </div>
        <label className="field admin-search">
          <span>Tìm theo tên hoặc email</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập từ khóa..." />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {actionMessage && <p className="admin-success" role="status">{actionMessage}</p>}
        {editTarget && (
          <section className="dashboard-section admin-form">
            <h2 className="admin-card-title">Chỉnh sửa tài khoản · {editTarget.email}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="field">
                <span>Họ tên</span>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </label>
              <label className="field">
                <span>Vai trò</span>
                <select
                  value={editRole}
                  disabled={editTarget.role === 'admin'}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                >
                  <option value="student">Sinh viên</option>
                  <option value="teacher">Giảng viên</option>
                  {editTarget.role === 'admin' && <option value="admin">Quản trị viên</option>}
                </select>
              </label>
            </div>
            <div className="admin-row-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-primary sm" type="button" disabled={busyId === editTarget.id} onClick={() => void saveEditUser()}>Lưu thay đổi</button>
              <button className="btn btn-outline sm" type="button" onClick={() => setEditTarget(null)}>Hủy</button>
            </div>
          </section>
        )}
        {passwordTarget && (
          <section className="dashboard-section admin-form">
            <h2 className="admin-card-title">Đặt lại mật khẩu · {passwordTarget.email}</h2>
            <label className="field">
              <span>Mật khẩu tạm thời</span>
              <input type="password" autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} />
            </label>
            <p className="muted">Chia sẻ mật khẩu qua kênh an toàn; người dùng sẽ phải đổi mật khẩu khi đăng nhập.</p>
            <div className="admin-row-actions">
              <button className="btn btn-primary sm" type="button" disabled={busyId === passwordTarget.id} onClick={() => void resetPassword()}>Đặt lại</button>
              <button className="btn btn-outline sm" type="button" onClick={() => { setPasswordTarget(null); setTemporaryPassword(''); }}>Hủy</button>
            </div>
          </section>
        )}
        <section className="dashboard-section admin-table-wrap">
          {loading ? <p className="muted">Đang tải người dùng...</p> : filteredUsers.length === 0 ? (
            <p className="muted">Không tìm thấy người dùng.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td><span className={`admin-role ${user.role}`}>{roleLabels[user.role]}</span></td>
                    <td>
                      <span className={`pill-badge ${user.active ? 'green' : 'muted'}`}>
                        {user.active ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="admin-row-actions">
                      <button className="btn btn-outline sm" type="button" disabled={busyId === user.id} onClick={() => startEditUser(user)}>
                        Sửa
                      </button>
                      <button
                        className="btn btn-outline sm"
                        type="button"
                        disabled={busyId === user.id || user.role === 'admin'}
                        onClick={() => void toggleUserActive(user)}
                      >
                        {user.active ? 'Khóa' : 'Kích hoạt'}
                      </button>
                      <button className="btn btn-outline sm" type="button" disabled={busyId === user.id} onClick={() => { setEditTarget(null); setPasswordTarget(user); setError(''); setActionMessage(''); }}>
                        Đặt lại mật khẩu
                      </button>
                      <button className="btn btn-danger sm" type="button" disabled={busyId === user.id || user.role === 'admin'} onClick={() => void deleteUser(user)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
