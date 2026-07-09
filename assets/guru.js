const user = requireRole('guru');
let fotoBase64 = null;
let posisi = null;

if (user) {
  document.getElementById('namaGuru').textContent = user.Nama;
  document.getElementById('tanggalHariIni').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  initCamera();
  initLokasi();
  refreshStatus();
  initAbsenManual();
  initFiturBK();
}

// ---------- Kamera ----------
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const previewImg = document.getElementById('previewImg');
const btnAmbilFoto = document.getElementById('btnAmbilFoto');
const btnUlangFoto = document.getElementById('btnUlangFoto');

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
  } catch (err) {
    showToast('Tidak bisa akses kamera: ' + err.message, true);
  }
}

btnAmbilFoto.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
  previewImg.src = fotoBase64;
  previewImg.classList.remove('hidden');
  video.classList.add('hidden');
  btnAmbilFoto.classList.add('hidden');
  btnUlangFoto.classList.remove('hidden');
  evaluasiTombol();
});

btnUlangFoto.addEventListener('click', () => {
  fotoBase64 = null;
  previewImg.classList.add('hidden');
  video.classList.remove('hidden');
  btnAmbilFoto.classList.remove('hidden');
  btnUlangFoto.classList.add('hidden');
  evaluasiTombol();
});

// ---------- Lokasi ----------
function initLokasi() {
  if (!navigator.geolocation) {
    document.getElementById('lokasiInfo').textContent = 'Perangkat tidak mendukung GPS.';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      posisi = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById('lokasiInfo').innerHTML = `📍 Lokasi terdeteksi <span class="badge badge-ok">akurasi ${Math.round(pos.coords.accuracy)}m</span>`;
      evaluasiTombol();
    },
    err => {
      document.getElementById('lokasiInfo').innerHTML = `<span class="badge badge-danger">Gagal ambil lokasi: ${err.message}</span>`;
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function evaluasiTombol() {
  const siap = !!fotoBase64 && !!posisi;
  document.getElementById('btnMasuk').disabled = !siap;
  document.getElementById('btnPulang').disabled = !siap;
}

// ---------- Status hari ini ----------
async function refreshStatus() {
  try {
    const status = await apiCall('statusGuruHariIni', { idGuru: user.ID_Guru });
    const box = document.getElementById('statusBadges');
    box.innerHTML = `
      <span class="badge ${status.sudahMasuk ? 'badge-ok' : 'badge-idle'}">${status.sudahMasuk ? '✓ Sudah Masuk' : 'Belum Masuk'}</span>
      <span class="badge ${status.sudahPulang ? 'badge-ok' : 'badge-idle'}" style="margin-left:6px;">${status.sudahPulang ? '✓ Sudah Pulang' : 'Belum Pulang'}</span>
    `;
    document.getElementById('btnMasuk').classList.toggle('hidden', status.sudahMasuk);
    document.getElementById('btnPulang').classList.toggle('hidden', status.sudahPulang || !status.sudahMasuk);
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Kirim absen ----------
async function kirimAbsen(status) {
  if (!fotoBase64 || !posisi) return;
  const btn = status === 'Masuk' ? document.getElementById('btnMasuk') : document.getElementById('btnPulang');
  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  try {
    const hasil = await apiCall('absenGuru', {
      idGuru: user.ID_Guru,
      nama: user.Nama,
      status,
      foto: fotoBase64,
      lat: posisi.lat,
      lng: posisi.lng
    });
    if (hasil.valid) {
      showToast(`Absen ${status} berhasil (jarak ${hasil.jarak}m dari sekolah)`);
    } else {
      showToast(`Absen ${status} tercatat, TAPI di luar radius sekolah (${hasil.jarak}m)`, true);
    }
    refreshStatus();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.textContent = status === 'Masuk' ? 'Absen Masuk' : 'Absen Pulang';
  }
}

document.getElementById('btnMasuk').addEventListener('click', () => kirimAbsen('Masuk'));
document.getElementById('btnPulang').addEventListener('click', () => kirimAbsen('Pulang'));

// ---------- Absen manual (Sakit/Izin/Alpa) ----------
let daftarSiswa = [];

async function initAbsenManual() {
  try {
    daftarSiswa = await apiCall('crudList', { sheet: 'Siswa' });
    renderOpsiSiswa(daftarSiswa);
  } catch (err) {
    showToast('Gagal memuat daftar siswa: ' + err.message, true);
  }

  document.getElementById('cariSiswa').addEventListener('input', e => {
    const kata = e.target.value.toLowerCase();
    const hasil = daftarSiswa.filter(s =>
      (s.Nama || '').toLowerCase().includes(kata) || (s.Kelas || '').toLowerCase().includes(kata)
    );
    renderOpsiSiswa(hasil);
  });

  document.querySelectorAll('.ket-btn').forEach(btn => {
    btn.addEventListener('click', () => kirimAbsenManual(btn.dataset.ket));
  });
}

function renderOpsiSiswa(list) {
  const select = document.getElementById('pilihSiswa');
  select.innerHTML =
    '<option value="">-- pilih siswa --</option>' +
    list.map(s => `<option value="${s.ID_Siswa}">${s.Nama} — ${s.Kelas}</option>`).join('');
}

// ---------- Fitur khusus Guru Mapel BK: lihat & unduh poin pelanggaran siswa ----------
let poinBKCache = [];

function initFiturBK() {
  const mapel = (user.Mapel || '').toLowerCase();
  if (!mapel.includes('bk')) return; // hanya tampil untuk guru dengan Mapel mengandung "BK"

  document.getElementById('cardBK').classList.remove('hidden');
  loadPoinBK();

  document.getElementById('cariPoinBK').addEventListener('input', e => {
    renderTabelPoinBK(filterPoinBK(e.target.value));
  });
  document.getElementById('btnDownloadPoinBK').addEventListener('click', downloadPoinBKCSV);
}

async function loadPoinBK() {
  const box = document.getElementById('tabelPoinBK');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  try {
    poinBKCache = (await apiCall('getPoinSiswa')).sort((a, b) => b.Total_Poin - a.Total_Poin);
    renderTabelPoinBK(poinBKCache);
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

function filterPoinBK(kata) {
  const k = (kata || '').toLowerCase();
  return poinBKCache.filter(r => (r.Nama || '').toLowerCase().includes(k) || (r.Kelas || '').toLowerCase().includes(k));
}

function renderTabelPoinBK(rows) {
  const box = document.getElementById('tabelPoinBK');
  if (!rows.length) { box.innerHTML = '<p class="muted">Tidak ada data.</p>'; return; }
  box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Total Poin</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.Nama}</td><td>${r.Kelas}</td><td><span class="badge ${r.Total_Poin >= 50 ? 'badge-danger' : r.Total_Poin >= 20 ? 'badge-warn' : 'badge-idle'}">${r.Total_Poin}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}

function downloadPoinBKCSV() {
  if (!poinBKCache.length) { showToast('Belum ada data untuk diunduh', true); return; }
  const headers = ['ID Siswa', 'Nama', 'Kelas', 'Total Poin'];
  const rows = poinBKCache.map(r => [r.ID_Siswa, r.Nama, r.Kelas, r.Total_Poin]);
  const csvEscape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Poin_Pelanggaran_Siswa_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function kirimAbsenManual(keterangan) {
  const idSiswa = document.getElementById('pilihSiswa').value;
  const resultBox = document.getElementById('manualAbsenResult');
  if (!idSiswa) {
    showToast('Pilih siswa terlebih dahulu', true);
    return;
  }
  try {
    const hasil = await apiCall('absenManualSiswa', { idSiswa, keterangan, inputOleh: user.Nama });
    resultBox.innerHTML = `<div class="scan-result ok"><strong>${hasil.nama}</strong> (${hasil.kelas}) — tercatat <strong>${hasil.keterangan}</strong></div>`;
    document.getElementById('pilihSiswa').value = '';
  } catch (err) {
    resultBox.innerHTML = `<div class="scan-result err">${err.message}</div>`;
  }
}
