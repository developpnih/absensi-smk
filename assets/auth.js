/**
 * Session sederhana berbasis localStorage.
 * Tidak simpan PIN, cuma data user + role setelah login berhasil.
 */
const SESSION_KEY = 'absensi_session';

function saveSession(role, user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ role, user, loginAt: Date.now() }));
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

/** Panggil di awal tiap halaman dashboard untuk memastikan role sesuai */
function requireRole(expectedRole) {
  const session = getSession();
  if (!session || session.role !== expectedRole) {
    window.location.href = 'index.html';
    return null;
  }
  return session.user;
}
