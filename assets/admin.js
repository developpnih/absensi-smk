const user = requireRole('admin');

const MASTER_FIELDS = {
  Siswa: { idField: 'ID_Siswa', fields: [
    { key: 'ID_Siswa', label: 'ID Siswa', placeholder: 'SW001' },
    { key: 'Nama', label: 'Nama' },
    { key: 'Kelas', label: 'Kelas', placeholder: 'XII RPL 1' },
    { key: 'Barcode_ID', label: 'Kode Barcode/QR (kosongkan = otomatis)', placeholder: 'Otomatis = ID Siswa' },
    { key: 'Aktif', label: 'Aktif (TRUE/FALSE)', placeholder: 'TRUE' }
  ]},
  Guru: { idField: 'ID_Guru', fields: [
    { key: 'ID_Guru', label: 'ID Guru', placeholder: 'GR001' },
    { key: 'Nama', label: 'Nama' },
    { key: 'PIN', label: 'PIN (angka)' },
    { key: 'Mapel', label: 'Mapel' },
    { key: 'Aktif', label: 'Aktif (TRUE/FALSE)', placeholder: 'TRUE' }
  ]},
  Pengurus: { idField: 'ID_Pengurus', fields: [
    { key: 'ID_Pengurus', label: 'ID Pengurus', placeholder: 'PG001' },
    { key: 'Nama', label: 'Nama' },
    { key: 'PIN', label: 'PIN (angka)' },
    { key: 'Jabatan', label: 'Jabatan', placeholder: 'Ketua IPM' },
    { key: 'Aktif', label: 'Aktif (TRUE/FALSE)', placeholder: 'TRUE' }
  ]}
};
let currentMaster = 'Siswa';

let rekapMode = 'guru';

let rekapRowsCache = [];
let daftarGuruCache = [];

if (user) {
  document.getElementById('tglGuru').value = new Date().toISOString().slice(0, 10);
  document.getElementById('tglSiswa').value = new Date().toISOString().slice(0, 10);
  document.getElementById('suratTanggal').value = new Date().toISOString().slice(0, 10);
  const now = new Date();
  document.getElementById('rekapBulan').value = now.getMonth() + 1;
  document.getElementById('rekapTahun').value = now.getFullYear();
  initTabs();
  loadRingkasan();
  loadDaftarGuruManual();
}

// ---------- Tab utama ----------
function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
      onTabOpen(tab.dataset.tab);
    });
  });

  document.querySelectorAll('[data-master]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-master]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMaster = tab.dataset.master;
      renderFormMaster();
      loadMaster();
    });
  });

  document.getElementById('tglGuru').addEventListener('change', loadAbsenGuru);
  document.getElementById('tglSiswa').addEventListener('change', loadAbsenSiswa);
  document.getElementById('btnTambahPoin').addEventListener('click', tambahPoin);
  document.getElementById('btnTambahMaster').addEventListener('click', tambahMaster);
  document.getElementById('btnSimpanSettings').addEventListener('click', simpanSettings);
  document.getElementById('btnAbsenManual').addEventListener('click', absenManualAdmin);
  document.getElementById('btnMuatRekap').addEventListener('click', loadRekapBulanan);
  document.getElementById('btnDownloadRekap').addEventListener('click', downloadRekapBulananCSV);
  document.getElementById('btnAbsenGuruManual').addEventListener('click', absenGuruManual);
  document.getElementById('btnMuatSurat').addEventListener('click', muatDataSurat);
  document.getElementById('btnBuatSurat').addEventListener('click', buatPratinjauSurat);
  document.getElementById('btnCetakSurat').addEventListener('click', () => window.print());
  document.getElementById('btnMuatKartu').addEventListener('click', loadKartuSiswa);
  document.getElementById('btnCetakKartu').addEventListener('click', cetakKartuSiswa);

  document.querySelectorAll('[data-rekap]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-rekap]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      rekapMode = tab.dataset.rekap;
      document.getElementById('rekapKelasWrap').style.display = rekapMode === 'siswa' ? 'block' : 'none';
      document.getElementById('tabelRekapBulanan').innerHTML = '<p class="muted">Pilih bulan & tahun, lalu klik Tampilkan Rekap.</p>';
      rekapRowsCache = [];
      document.getElementById('btnDownloadRekap').disabled = true;
    });
  });

  renderFormMaster();
}

// ---------- Absen manual (Sakit/Izin/Alpa) dari Admin ----------
async function absenManualAdmin() {
  const idSiswa = document.getElementById('manualIdSiswa').value.trim();
  const keterangan = document.getElementById('manualKeterangan').value;
  const box = document.getElementById('manualAbsenResultAdmin');
  if (!idSiswa) { showToast('ID Siswa wajib diisi', true); return; }
  try {
    const hasil = await apiCall('absenManualSiswa', { idSiswa, keterangan, inputOleh: user.Nama });
    box.innerHTML = `<div class="scan-result ok" style="margin-top:12px;"><strong>${hasil.nama}</strong> (${hasil.kelas}) — tercatat <strong>${hasil.keterangan}</strong></div>`;
    document.getElementById('manualIdSiswa').value = '';
    loadAbsenSiswa();
  } catch (err) {
    box.innerHTML = `<div class="scan-result err" style="margin-top:12px;">${err.message}</div>`;
  }
}

// ---------- Rekap Bulanan ----------
async function loadRekapBulanan() {
  const box = document.getElementById('tabelRekapBulanan');
  const btnDownload = document.getElementById('btnDownloadRekap');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  btnDownload.disabled = true;
  rekapRowsCache = [];
  const bulan = document.getElementById('rekapBulan').value;
  const tahun = document.getElementById('rekapTahun').value;
  try {
    if (rekapMode === 'guru') {
      const rows = await apiCall('getRekapBulananGuru', { bulan, tahun });
      if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada data guru.</p>'; return; }
      rekapRowsCache = rows;
      box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Nama</th><th>Hari Masuk</th><th>Hari Pulang</th><th>Telat</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.Nama}</td><td>${r.Hadir}</td><td>${r.Pulang}</td><td>${r.Telat > 0 ? `<span class="badge badge-warn">${r.Telat}x</span>` : '0'}</td></tr>`).join('')}
      </tbody></table></div>`;
    } else {
      const kelas = document.getElementById('rekapKelas').value.trim();
      const rows = await apiCall('getRekapBulananSiswa', { bulan, tahun, kelas });
      if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada data siswa.</p>'; return; }
      rekapRowsCache = rows;
      box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Hadir</th><th>Telat</th><th>Sakit</th><th>Izin</th><th>Alpa</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.Nama}</td><td>${r.Kelas}</td><td>${r.Hadir}</td><td>${r.Telat > 0 ? `<span class="badge badge-warn">${r.Telat}x</span>` : '0'}</td><td>${r.Sakit}</td><td>${r.Izin}</td><td>${r.Alpa > 0 ? `<span class="badge badge-danger">${r.Alpa}</span>` : '0'}</td></tr>`).join('')}
      </tbody></table></div>`;
    }
    btnDownload.disabled = !rekapRowsCache.length;
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

// ---------- Download rekap bulanan sebagai CSV ----------
function downloadRekapBulananCSV() {
  if (!rekapRowsCache.length) return;
  const bulanNama = document.getElementById('rekapBulan').selectedOptions[0].textContent;
  const tahun = document.getElementById('rekapTahun').value;
  let headers, rows;
  if (rekapMode === 'guru') {
    headers = ['Nama', 'Hari Masuk', 'Hari Pulang', 'Telat'];
    rows = rekapRowsCache.map(r => [r.Nama, r.Hadir, r.Pulang, r.Telat]);
  } else {
    headers = ['Nama', 'Kelas', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alpa'];
    rows = rekapRowsCache.map(r => [r.Nama, r.Kelas, r.Hadir, r.Telat, r.Sakit, r.Izin, r.Alpa]);
  }
  const csvEscape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rekap_${rekapMode === 'guru' ? 'Guru' : 'Siswa'}_${bulanNama}_${tahun}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Absen Guru Manual (guru tidak bawa HP) ----------
async function loadDaftarGuruManual() {
  try {
    daftarGuruCache = await apiCall('crudList', { sheet: 'Guru' });
    const select = document.getElementById('manualIdGuru');
    select.innerHTML = '<option value="">-- pilih guru --</option>' +
      daftarGuruCache.map(g => `<option value="${g.ID_Guru}">${g.Nama} (${g.ID_Guru})</option>`).join('');
  } catch (err) {
    showToast('Gagal memuat daftar guru: ' + err.message, true);
  }
}

async function absenGuruManual() {
  const idGuru = document.getElementById('manualIdGuru').value;
  const status = document.getElementById('manualStatusGuru').value;
  const catatan = document.getElementById('manualCatatanGuru').value.trim();
  const box = document.getElementById('manualAbsenGuruResult');
  if (!idGuru) { showToast('Pilih guru terlebih dahulu', true); return; }
  try {
    const hasil = await apiCall('absenGuruManual', { idGuru, status, catatan, inputOleh: user.Nama });
    box.innerHTML = `<div class="scan-result ok" style="margin-top:12px;"><strong>${hasil.nama}</strong> — Absen <strong>${hasil.status}</strong> tercatat manual oleh admin.</div>`;
    document.getElementById('manualCatatanGuru').value = '';
    loadAbsenGuru();
  } catch (err) {
    box.innerHTML = `<div class="scan-result err" style="margin-top:12px;">${err.message}</div>`;
  }
}

// ---------- Kartu Siswa: QR otomatis dari Barcode_ID ----------
async function loadKartuSiswa() {
  const grid = document.getElementById('kartuGrid');
  const status = document.getElementById('kartuStatus');
  const btnCetak = document.getElementById('btnCetakKartu');
  btnCetak.disabled = true;
  grid.innerHTML = '';
  status.textContent = 'Memuat data siswa...';
  try {
    let rows = await apiCall('crudList', { sheet: 'Siswa' });
    const kelasFilter = document.getElementById('kartuKelas').value.trim().toLowerCase();
    if (kelasFilter) rows = rows.filter(s => String(s.Kelas || '').toLowerCase() === kelasFilter);
    rows = rows.filter(s => String(s.Aktif).toUpperCase() === 'TRUE');
    if (!rows.length) { status.textContent = 'Tidak ada siswa aktif yang cocok.'; return; }
    if (typeof QRCode === 'undefined') { status.textContent = 'Library QR gagal dimuat, cek koneksi internet.'; return; }

    status.textContent = `Membuat ${rows.length} kartu QR...`;
    for (const s of rows) {
      const kode = s.Barcode_ID || s.ID_Siswa;
      const kartu = document.createElement('div');
      kartu.className = 'kartu-siswa';
      kartu.innerHTML = `
        <canvas></canvas>
        <div class="kartu-info">
          <div class="kartu-sekolah">${NAMA_SEKOLAH}</div>
          <div class="kartu-nama">${s.Nama}</div>
          <div class="kartu-kelas">${s.Kelas || '-'}</div>
          <div class="kartu-id">${kode}</div>
        </div>
      `;
      grid.appendChild(kartu);
      const canvas = kartu.querySelector('canvas');
      await QRCode.toCanvas(canvas, String(kode), { width: 84, margin: 1 });
    }
    status.textContent = `${rows.length} kartu siap. Klik "Cetak Semua" untuk print.`;
    btnCetak.disabled = false;
  } catch (err) {
    status.textContent = 'Gagal memuat: ' + err.message;
  }
}

function cetakKartuSiswa() {
  document.body.classList.add('print-kartu');
  window.print();
  setTimeout(() => document.body.classList.remove('print-kartu'), 500);
}

// ---------- Surat Panggilan Orang Tua ----------
let dataSuratCache = null;

async function muatDataSurat() {
  const idSiswa = document.getElementById('suratIdSiswa').value.trim();
  const btnBuat = document.getElementById('btnBuatSurat');
  document.getElementById('cardPratinjauSurat').classList.add('hidden');
  btnBuat.disabled = true;
  if (!idSiswa) { showToast('ID Siswa wajib diisi', true); return; }
  try {
    dataSuratCache = await apiCall('getDetailPelanggaranSiswa', { idSiswa });
    showToast(`${dataSuratCache.siswa.Nama} — total poin: ${dataSuratCache.totalPoin}`);
    btnBuat.disabled = false;
  } catch (err) {
    showToast(err.message, true);
  }
}

function buatPratinjauSurat() {
  if (!dataSuratCache) return;
  const { siswa, list, totalPoin } = dataSuratCache;
  const tanggalSurat = new Date(document.getElementById('suratTanggal').value || new Date()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jadwal = document.getElementById('suratJadwal').value.trim() || '(isi jadwal pertemuan)';
  const kepsek = document.getElementById('suratKepsek').value.trim() || '(Nama Kepala Sekolah)';

  const html = `
    <h3>${NAMA_SEKOLAH}</h3>
    <h4 style="font-weight:normal;font-size:0.95rem;">SURAT PANGGILAN ORANG TUA / WALI SISWA</h4>
    <p style="text-align:center;">Nomor: ..... / SP / ${new Date(document.getElementById('suratTanggal').value || new Date()).getFullYear()}</p>
    <p>Dengan hormat,</p>
    <p>Sehubungan dengan catatan pelanggaran tata tertib sekolah, kami mengundang Bapak/Ibu orang tua/wali dari siswa:</p>
    <table>
      <tr><td style="width:35%;">Nama Siswa</td><td>: ${siswa.Nama}</td></tr>
      <tr><td>Kelas</td><td>: ${siswa.Kelas}</td></tr>
      <tr><td>Nama Orang Tua/Wali</td><td>: ${siswa.Nama_Ortu || '..................................'}</td></tr>
      <tr><td>No. Telepon</td><td>: ${siswa.Telepon_Ortu || '..................................'}</td></tr>
      <tr><td>Total Poin Pelanggaran</td><td>: <strong>${totalPoin}</strong></td></tr>
    </table>
    <p>untuk hadir memenuhi panggilan pada:</p>
    <p style="text-align:center;"><strong>${jadwal}</strong></p>
    <p>Rincian pelanggaran yang tercatat adalah sebagai berikut:</p>
    ${list.length ? `<table>
      <thead><tr><th>Tanggal</th><th>Jenis Pelanggaran</th><th>Poin</th></tr></thead>
      <tbody>${list.map(r => `<tr><td>${new Date(r.Timestamp).toLocaleDateString('id-ID')}</td><td>${r.Jenis}</td><td>${r.Poin}</td></tr>`).join('')}</tbody>
    </table>` : '<p class="muted">Belum ada rincian pelanggaran tercatat.</p>'}
    <p>Demikian surat panggilan ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.</p>
    <div class="letter-signature">
      <div>
        <p>Orang Tua/Wali,</p>
        <div class="line">(..............................)</div>
      </div>
      <div>
        <p>${tanggalSurat}<br/>Kepala Sekolah,</p>
        <div class="line">${kepsek}</div>
      </div>
    </div>
  `;
  document.getElementById('printArea').innerHTML = html;
  document.getElementById('cardPratinjauSurat').classList.remove('hidden');
  document.getElementById('cardPratinjauSurat').scrollIntoView({ behavior: 'smooth' });
}

function onTabOpen(tab) {
  if (tab === 'ringkasan') loadRingkasan();
  if (tab === 'absenGuru') loadAbsenGuru();
  if (tab === 'absenSiswa') loadAbsenSiswa();
  if (tab === 'poin') loadPoin();
  if (tab === 'master') loadMaster();
  if (tab === 'settings') loadSettings();
}

// ---------- Ringkasan ----------
async function loadRingkasan() {
  try {
    const [rekapGuru, rekapSiswa, izinAktif] = await Promise.all([
      apiCall('getRekapAbsensiGuru', {}),
      apiCall('getRekapAbsensiSiswa', {}),
      apiCall('getIzinAktif')
    ]);
    document.getElementById('statGuruMasuk').textContent = rekapGuru.filter(r => r.Status === 'Masuk').length;
    document.getElementById('statSiswaMasuk').textContent = rekapSiswa.filter(r => r.Status === 'Masuk' || r.Status === 'Telat').length;
    document.getElementById('statIzinAktif').textContent = izinAktif.length;
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Absen Guru ----------
async function loadAbsenGuru() {
  const box = document.getElementById('tabelAbsenGuru');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  try {
    const rows = await apiCall('getRekapAbsensiGuru', { tanggal: document.getElementById('tglGuru').value });
    if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
    box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Jam</th><th>Nama</th><th>Status</th><th>Jarak</th><th>Lokasi</th><th>Foto</th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td>${formatJam(r.Timestamp)}</td>
        <td>${r.Nama}</td>
        <td>${r.Status}</td>
        <td>${r.Jarak_Meter}m</td>
        <td><span class="badge ${r.Lokasi_Valid === true || r.Lokasi_Valid === 'TRUE' ? 'badge-ok' : 'badge-danger'}">${r.Lokasi_Valid === true || r.Lokasi_Valid === 'TRUE' ? 'Valid' : 'Di luar area'}</span></td>
        <td><a href="${r.Foto_URL}" target="_blank">Lihat</a></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

// ---------- Absen Siswa ----------
async function loadAbsenSiswa() {
  const box = document.getElementById('tabelAbsenSiswa');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  try {
    const rows = await apiCall('getRekapAbsensiSiswa', { tanggal: document.getElementById('tglSiswa').value });
    if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
    box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Jam</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Dicatat oleh</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${formatJam(r.Timestamp)}</td><td>${r.Nama}</td><td>${r.Kelas}</td><td>${r.Status === 'Telat' ? '<span class="badge badge-warn">Telat</span>' : r.Status}</td><td>${r.Diinput_Oleh || '-'}</td></tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

// ---------- Poin Pelanggaran ----------
async function tambahPoin() {
  const idSiswa = document.getElementById('poinIdSiswa').value.trim();
  const jenis = document.getElementById('poinJenis').value.trim();
  const poin = parseFloat(document.getElementById('poinNilai').value);
  const keterangan = document.getElementById('poinKet').value.trim();
  if (!idSiswa || !jenis) { showToast('ID Siswa dan jenis pelanggaran wajib diisi', true); return; }
  try {
    await apiCall('addPelanggaran', { idSiswa, jenis, poin, keterangan, inputOleh: user.Nama });
    showToast('Pelanggaran berhasil dicatat');
    document.getElementById('poinIdSiswa').value = '';
    document.getElementById('poinJenis').value = '';
    document.getElementById('poinKet').value = '';
    loadPoin();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadPoin() {
  const box = document.getElementById('tabelPoin');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  try {
    const rows = await apiCall('getPoinSiswa');
    const sorted = rows.filter(r => r.Total_Poin > 0).sort((a, b) => b.Total_Poin - a.Total_Poin);
    if (!sorted.length) { box.innerHTML = '<p class="muted">Belum ada poin pelanggaran tercatat.</p>'; return; }
    box.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Total Poin</th></tr></thead><tbody>
      ${sorted.map(r => `<tr><td>${r.Nama}</td><td>${r.Kelas}</td><td><span class="badge ${r.Total_Poin >= 50 ? 'badge-danger' : r.Total_Poin >= 20 ? 'badge-warn' : 'badge-idle'}">${r.Total_Poin}</span></td></tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

// ---------- Data Master ----------
function renderFormMaster() {
  const conf = MASTER_FIELDS[currentMaster];
  document.getElementById('formMaster').innerHTML = conf.fields.map(f =>
    `<div class="field"><label>${f.label}</label><input id="mf_${f.key}" placeholder="${f.placeholder || ''}" /></div>`
  ).join('');
}

async function tambahMaster() {
  const conf = MASTER_FIELDS[currentMaster];
  const data = {};
  conf.fields.forEach(f => (data[f.key] = document.getElementById('mf_' + f.key).value.trim()));
  if (!data[conf.idField] || !data.Nama) { showToast('ID dan Nama wajib diisi', true); return; }
  try {
    await apiCall('crudAdd', { sheet: currentMaster, data });
    showToast('Data berhasil ditambahkan');
    conf.fields.forEach(f => (document.getElementById('mf_' + f.key).value = ''));
    loadMaster();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadMaster() {
  const box = document.getElementById('tabelMaster');
  box.innerHTML = '<p class="muted">Memuat...</p>';
  try {
    const conf = MASTER_FIELDS[currentMaster];
    const rows = await apiCall('crudList', { sheet: currentMaster });
    if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
    box.innerHTML = `<div class="table-scroll"><table><thead><tr>${conf.fields.filter(f => f.key !== 'PIN').map(f => `<th>${f.label}</th>`).join('')}<th>Aksi</th></tr></thead><tbody>
      ${rows.map(r => `<tr>${conf.fields.filter(f => f.key !== 'PIN').map(f => `<td>${r[f.key] ?? ''}</td>`).join('')}
        <td><button class="btn btn-danger" style="padding:6px 12px;font-size:0.8rem;" onclick="hapusMaster('${r[conf.idField]}')">Hapus</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">Gagal memuat: ${err.message}</p>`;
  }
}

async function hapusMaster(idValue) {
  if (!confirm('Yakin hapus data ini?')) return;
  const conf = MASTER_FIELDS[currentMaster];
  try {
    await apiCall('crudDelete', { sheet: currentMaster, idField: conf.idField, idValue });
    showToast('Data dihapus');
    loadMaster();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Settings ----------
// Backend sudah dibetulkan supaya selalu kirim "HH:mm", tapi fungsi ini tetap
// jaga-jaga kalau ada data lama di Sheet yang masih berupa nilai jam mentah
// (mis. "1899-12-30T00:32:56.000Z") supaya tidak tampil rusak di form.
function toJamInputValue(raw) {
  if (!raw) return '';
  const s = String(raw);
  const cocok = s.match(/(\d{1,2}):(\d{2})/);
  if (!cocok) return '';
  return ('0' + cocok[1]).slice(-2) + ':' + cocok[2];
}

async function loadSettings() {
  try {
    const s = await apiCall('getSettings');
    document.getElementById('setLat').value = s.Lokasi_Lat || '';
    document.getElementById('setLng').value = s.Lokasi_Lng || '';
    document.getElementById('setRadius').value = s.Radius_Meter || '';
    document.getElementById('setPoinIzin').value = s.Poin_Telat_Izin || '';
    document.getElementById('setJamMasuk').value = toJamInputValue(s.Jam_Masuk_Batas);
    document.getElementById('setPoinTelatMasuk').value = s.Poin_Telat_Masuk || '';
  } catch (err) {
    showToast(err.message, true);
  }
}

async function simpanSettings() {
  try {
    await apiCall('updateSettings', {
      Lokasi_Lat: document.getElementById('setLat').value,
      Lokasi_Lng: document.getElementById('setLng').value,
      Radius_Meter: document.getElementById('setRadius').value,
      Poin_Telat_Izin: document.getElementById('setPoinIzin').value,
      Jam_Masuk_Batas: document.getElementById('setJamMasuk').value,
      Poin_Telat_Masuk: document.getElementById('setPoinTelatMasuk').value
    });
    showToast('Pengaturan disimpan');
  } catch (err) {
    showToast(err.message, true);
  }
}
