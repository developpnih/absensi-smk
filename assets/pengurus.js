const user = requireRole('pengurus');
let mode = 'absen';
let absenStatus = 'Masuk';

if (user) {
  document.getElementById('namaPengurus').textContent = `Masuk sebagai ${user.Nama} (${user.Jabatan || 'Pengurus'})`;
  startCardScanner('scanner-view', onScan, msg => showToast(msg, true));
  refreshIzinAktif();
  setInterval(refreshIzinAktif, 15000);
  setInterval(updateCountdownTampilan, 1000);
}

document.querySelectorAll('[data-mode]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mode = tab.dataset.mode;
    document.getElementById('absenPanel').classList.toggle('hidden', mode !== 'absen');
    document.getElementById('izinMulaiPanel').classList.toggle('hidden', mode !== 'izinMulai');
    document.getElementById('scanResult').innerHTML = '';
  });
});

document.querySelectorAll('.absen-status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.absen-status-btn').forEach(b => {
      b.classList.remove('btn-primary', 'active');
      b.classList.add('btn-outline');
    });
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary', 'active');
    absenStatus = btn.dataset.status;
  });
});

async function onScan(barcode) {
  const resultBox = document.getElementById('scanResult');
  resultBox.innerHTML = `<div class="scan-result">Memproses kartu...</div>`;
  try {
    if (mode === 'absen') {
      const hasil = await apiCall('absenSiswaByBarcode', { barcode, status: absenStatus, idPengurus: user.ID_Pengurus });
      if (hasil.telat) {
        resultBox.innerHTML = `<div class="scan-result err"><strong>${hasil.nama}</strong><br/>${hasil.kelas} — TERLAMBAT, tercatat pukul ${formatJam(hasil.timestamp)} (+${hasil.poin} poin pelanggaran)</div>`;
      } else {
        resultBox.innerHTML = `<div class="scan-result ok"><strong>${hasil.nama}</strong><br/>${hasil.kelas} — Absen ${hasil.status} tercatat pukul ${formatJam(hasil.timestamp)}</div>`;
      }
    } else if (mode === 'izinMulai') {
      const durasi = parseInt(document.getElementById('durasiIzin').value, 10);
      const hasil = await apiCall('mulaiIzin', { barcode, durasiMenit: durasi, idPengurus: user.ID_Pengurus });
      resultBox.innerHTML = `<div class="scan-result ok"><strong>${hasil.nama}</strong><br/>${hasil.kelas} — Izin dimulai, kembali sebelum ${formatJam(hasil.batas)}</div>`;
      refreshIzinAktif();
    } else if (mode === 'izinSelesai') {
      const hasil = await apiCall('selesaiIzin', { barcode });
      if (hasil.telat) {
        resultBox.innerHTML = `<div class="scan-result err"><strong>${hasil.nama}</strong><br/>Kembali TERLAMBAT — poin pelanggaran +${hasil.poin}</div>`;
      } else {
        resultBox.innerHTML = `<div class="scan-result ok"><strong>${hasil.nama}</strong><br/>Kembali tepat waktu ✓</div>`;
      }
      refreshIzinAktif();
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="scan-result err">${err.message}</div>`;
  }
}

let izinAktifCache = [];
async function refreshIzinAktif() {
  try {
    izinAktifCache = await apiCall('getIzinAktif');
    renderIzinAktif();
  } catch (err) {
    document.getElementById('izinAktifList').innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

function renderIzinAktif() {
  const box = document.getElementById('izinAktifList');
  if (!izinAktifCache.length) {
    box.innerHTML = `<p class="muted">Tidak ada siswa yang sedang izin.</p>`;
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>Nama</th><th>Kelas</th><th>Batas Kembali</th><th>Sisa Waktu</th></tr></thead>
      <tbody>
        ${izinAktifCache.map(r => `
          <tr data-batas="${r.Batas_Waktu}">
            <td>${r.Nama}</td>
            <td>${r.Kelas}</td>
            <td>${formatJam(r.Batas_Waktu)}</td>
            <td class="timer-cell timer-chip">—</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  updateCountdownTampilan();
}

function updateCountdownTampilan() {
  document.querySelectorAll('tr[data-batas]').forEach(row => {
    const batas = new Date(row.dataset.batas).getTime();
    const sisaMs = batas - Date.now();
    const cell = row.querySelector('.timer-cell');
    if (!cell) return;
    if (sisaMs <= 0) {
      cell.textContent = 'Terlambat';
      cell.classList.add('late');
    } else {
      const m = Math.floor(sisaMs / 60000);
      const s = Math.floor((sisaMs % 60000) / 1000);
      cell.textContent = `${m}:${String(s).padStart(2, '0')}`;
      cell.classList.remove('late');
    }
  });
}
