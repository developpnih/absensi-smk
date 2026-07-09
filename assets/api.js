/**
 * Pemanggil API ke backend Google Apps Script.
 * Pakai Content-Type text/plain supaya browser tidak mengirim preflight
 * OPTIONS (Apps Script Web App tidak selalu menangani OPTIONS dengan baik).
 */
async function apiCall(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan pada server');
  return json.data;
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function formatJam(date) {
  return new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
