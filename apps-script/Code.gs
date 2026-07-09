/**
 * ABSENSI SMK MUHAMMADIYAH BOJONG — Backend Google Apps Script
 * ---------------------------------------------------------------
 * WAJIB diisi sebelum deploy:
 */
const FOTO_FOLDER_ID = 'ISI_ID_FOLDER_GOOGLE_DRIVE_DI_SINI';

const SHEETS = {
  GURU: 'Guru',
  SISWA: 'Siswa',
  PENGURUS: 'Pengurus',
  ADMIN: 'Admin',
  ABSEN_GURU: 'Absensi_Guru',
  ABSEN_SISWA: 'Absensi_Siswa',
  IZIN: 'Izin',
  PELANGGARAN: 'Pelanggaran',
  SETTINGS: 'Settings'
};

const HEADERS = {
  Guru: ['ID_Guru', 'Nama', 'PIN', 'Mapel', 'Aktif'],
  Siswa: ['ID_Siswa', 'Nama', 'Kelas', 'Barcode_ID', 'Aktif', 'Nama_Ortu', 'Telepon_Ortu'],
  Pengurus: ['ID_Pengurus', 'Nama', 'PIN', 'Jabatan', 'Aktif'],
  Admin: ['ID_Admin', 'Nama', 'PIN'],
  Absensi_Guru: ['Timestamp', 'ID_Guru', 'Nama', 'Status', 'Foto_URL', 'Lat', 'Lng', 'Jarak_Meter', 'Lokasi_Valid', 'Sumber'],
  Absensi_Siswa: ['Timestamp', 'ID_Siswa', 'Nama', 'Kelas', 'Status', 'Diinput_Oleh'],
  Izin: ['ID_Siswa', 'Nama', 'Kelas', 'Mulai', 'Batas_Waktu', 'Selesai', 'Telat', 'Status', 'ID_Pengurus'],
  Pelanggaran: ['Timestamp', 'ID_Siswa', 'Nama', 'Kelas', 'Jenis', 'Poin', 'Keterangan', 'Input_Oleh'],
  Settings: ['Key', 'Value']
};

// =========================================================
// SETUP — jalankan sekali dari editor Apps Script
// =========================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sheet.setFrozenRows(1);
    }
  });

  const admin = ss.getSheetByName(SHEETS.ADMIN);
  if (admin.getLastRow() < 2) {
    admin.appendRow(['ADM001', 'Admin Sekolah', '000000']);
  }

  const settings = ss.getSheetByName(SHEETS.SETTINGS);
  if (settings.getLastRow() < 2) {
    settings.appendRow(['Lokasi_Lat', '-7.0']);
    settings.appendRow(['Lokasi_Lng', '109.6']);
    settings.appendRow(['Radius_Meter', '150']);
    settings.appendRow(['Poin_Telat_Izin', '15']);
    settings.appendRow(['Jam_Masuk_Batas', '07:15']);
    settings.appendRow(['Poin_Telat_Masuk', '10']);
    // Kunci sel jam masuk sebagai teks polos supaya Sheets tidak otomatis
    // mengubahnya jadi nilai Waktu (yang bikin field ini rusak di admin).
    const jamRow = findRowIndexById(SHEETS.SETTINGS, 'Key', 'Jam_Masuk_Batas');
    if (jamRow !== -1) settings.getRange(jamRow, 2).setNumberFormat('@').setValue('07:15');
  }

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);

  SpreadsheetApp.getUi().alert('Setup selesai! Semua sheet sudah dibuat. Akun admin default: ADM001 / 000000');
}

// =========================================================
// DIAGNOSTIK — jalankan manual dari editor Apps Script kalau
// ada masalah "Akses Ditolak: DriveApp" saat absen guru.
// =========================================================
function testDriveAccess() {
  if (!FOTO_FOLDER_ID || FOTO_FOLDER_ID === 'ISI_ID_FOLDER_GOOGLE_DRIVE_DI_SINI') {
    Logger.log('GAGAL: FOTO_FOLDER_ID belum diisi. Isi dulu di baris atas Code.gs.');
    return;
  }
  try {
    const folder = DriveApp.getFolderById(FOTO_FOLDER_ID);
    Logger.log('OK: Folder ditemukan -> ' + folder.getName());
  } catch (err) {
    Logger.log('GAGAL akses folder: ' + err.message);
    return;
  }
  try {
    const folder = DriveApp.getFolderById(FOTO_FOLDER_ID);
    const testFile = folder.createFile(Utilities.newBlob('test', 'text/plain', 'test-diagnostik.txt'));
    Logger.log('OK: Berhasil membuat file test di folder.');
    try {
      testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      Logger.log('OK: Sharing ANYONE_WITH_LINK berhasil.');
    } catch (errShare) {
      Logger.log('INFO: Sharing ANYONE_WITH_LINK ditolak kebijakan organisasi (' + errShare.message + '). Akan otomatis fallback ke DOMAIN_WITH_LINK saat absen guru.');
    }
    testFile.setTrashed(true); // bersihkan file test
    Logger.log('Selesai. File test sudah dihapus (masuk trash).');
  } catch (err) {
    Logger.log('GAGAL membuat file di folder: ' + err.message);
  }
}

// =========================================================
// ENTRY POINTS
// =========================================================
function doPost(e) {
  return handleRequest(e);
}
function doGet(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  let out;
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    if (typeof ACTIONS[action] !== 'function') throw new Error('Aksi tidak dikenal: ' + action);
    const data = ACTIONS[action](payload);
    out = { ok: true, data: data };
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// =========================================================
// HELPERS SHEET
// =========================================================
function sh(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects(name) {
  const sheet = sh(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function findRowIndexById(name, idField, idValue) {
  const sheet = sh(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = headers.indexOf(idField);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][col]) === String(idValue)) return r + 1; // 1-based row
  }
  return -1;
}

function appendObject(name, obj) {
  const sheet = sh(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function todayStr(d) {
  return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function saveFotoToDrive(base64, idGuru, status) {
  if (!base64) return '';
  if (!FOTO_FOLDER_ID || FOTO_FOLDER_ID === 'ISI_ID_FOLDER_GOOGLE_DRIVE_DI_SINI') {
    throw new Error('FOTO_FOLDER_ID belum diisi di Code.gs. Isi dengan ID folder Google Drive, lalu deploy ulang (New version).');
  }
  const clean = base64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Utilities.base64Decode(clean);
  const blob = Utilities.newBlob(bytes, 'image/jpeg', `${idGuru}_${status}_${Date.now()}.jpg`);

  let folder;
  try {
    folder = DriveApp.getFolderById(FOTO_FOLDER_ID);
  } catch (err) {
    throw new Error('FOTO_FOLDER_ID salah atau folder tidak ditemukan/tidak bisa diakses: ' + err.message);
  }

  const file = folder.createFile(blob);

  // Coba bagikan link foto. Kalau kebijakan Google Workspace/organisasi melarang
  // "Anyone with link", turunkan ke "Anyone in domain with link". Kalau itu juga
  // gagal, foto tetap tersimpan (tidak batalkan proses absen hanya karena sharing gagal).
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (errAnyone) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (errDomain) {
      // Sharing ditolak kebijakan organisasi. Foto tetap tersimpan di Drive,
      // hanya saja linknya mungkin butuh dibuka lewat akun pemilik Drive/domain sekolah.
    }
  }
  return file.getUrl();
}

function getSettingsMap() {
  const rows = sheetToObjects(SHEETS.SETTINGS);
  const map = {};
  rows.forEach(r => {
    let v = r.Value;
    // Google Sheets kadang otomatis mengubah teks jam (mis. "07:15") jadi nilai
    // waktu asli (Date jam 1899-12-30). Kalau itu terjadi, ubah balik jadi
    // string "HH:mm" supaya perbandingan jam & tampilan di admin tetap benar.
    if (v instanceof Date) {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    }
    map[r.Key] = v;
  });
  return map;
}

// Pastikan nilai jam selalu dalam format "HH:mm" (2 digit, zero-padded)
// supaya perbandingan string ("14:05" > "07:15") selalu akurat.
function normalizeJam(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

// =========================================================
// ACTIONS
// =========================================================
const ACTIONS = {

  // ---------- LOGIN ----------
  login: function (p) {
    const sheetName = { guru: SHEETS.GURU, pengurus: SHEETS.PENGURUS, admin: SHEETS.ADMIN }[p.role];
    if (!sheetName) throw new Error('Role tidak valid');
    const idField = { guru: 'ID_Guru', pengurus: 'ID_Pengurus', admin: 'ID_Admin' }[p.role];
    const rows = sheetToObjects(sheetName);
    const found = rows.find(r => String(r[idField]) === String(p.id) && String(r.PIN) === String(p.pin));
    if (!found) throw new Error('ID atau PIN salah');
    if (p.role !== 'admin' && String(found.Aktif).toUpperCase() !== 'TRUE') throw new Error('Akun tidak aktif, hubungi admin');
    delete found.PIN;
    return found;
  },

  // ---------- ABSEN GURU (dengan foto & lokasi) ----------
  absenGuru: function (p) {
    const settings = getSettingsMap();
    const jarak = Math.round(haversineMeters(p.lat, p.lng, parseFloat(settings.Lokasi_Lat), parseFloat(settings.Lokasi_Lng)));
    const valid = jarak <= parseFloat(settings.Radius_Meter || 150);
    const fotoUrl = saveFotoToDrive(p.foto, p.idGuru, p.status);
    appendObject(SHEETS.ABSEN_GURU, {
      Timestamp: new Date(), ID_Guru: p.idGuru, Nama: p.nama, Status: p.status,
      Foto_URL: fotoUrl, Lat: p.lat, Lng: p.lng, Jarak_Meter: jarak, Lokasi_Valid: valid, Sumber: 'HP Guru'
    });
    return { valid: valid, jarak: jarak };
  },

  // ---------- FITUR BARU: ABSEN GURU MANUAL OLEH ADMIN ----------
  // Dipakai kalau guru tidak bawa HP / tidak bisa absen mandiri.
  absenGuruManual: function (p) {
    if (!p.idGuru || !p.status) throw new Error('ID Guru dan status wajib diisi');
    const guruRows = sheetToObjects(SHEETS.GURU);
    const guru = guruRows.find(g => String(g.ID_Guru) === String(p.idGuru));
    if (!guru) throw new Error('ID Guru tidak ditemukan');
    appendObject(SHEETS.ABSEN_GURU, {
      Timestamp: new Date(), ID_Guru: p.idGuru, Nama: guru.Nama, Status: p.status,
      Foto_URL: '', Lat: '', Lng: '', Jarak_Meter: 0, Lokasi_Valid: 'Manual',
      Sumber: 'Manual oleh ' + (p.inputOleh || 'Admin') + (p.catatan ? (' — ' + p.catatan) : '')
    });
    return { nama: guru.Nama, status: p.status };
  },

  statusGuruHariIni: function (p) {
    const rows = sheetToObjects(SHEETS.ABSEN_GURU).filter(r =>
      String(r.ID_Guru) === String(p.idGuru) && todayStr(new Date(r.Timestamp)) === todayStr()
    );
    return {
      sudahMasuk: rows.some(r => r.Status === 'Masuk'),
      sudahPulang: rows.some(r => r.Status === 'Pulang')
    };
  },

  getRekapAbsensiGuru: function (p) {
    const tgl = p.tanggal || todayStr();
    return sheetToObjects(SHEETS.ABSEN_GURU)
      .filter(r => todayStr(new Date(r.Timestamp)) === tgl)
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  },

  getRekapAbsensiSiswa: function (p) {
    const tgl = p.tanggal || todayStr();
    return sheetToObjects(SHEETS.ABSEN_SISWA)
      .filter(r => todayStr(new Date(r.Timestamp)) === tgl)
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  },

  // ---------- REKAP BULANAN ----------
  getRekapBulananGuru: function (p) {
    const bulan = parseInt(p.bulan, 10);
    const tahun = parseInt(p.tahun, 10);
    const settings = getSettingsMap();
    const batasJam = (settings.Jam_Masuk_Batas || '07:15');
    const rows = sheetToObjects(SHEETS.ABSEN_GURU).filter(r => {
      const d = new Date(r.Timestamp);
      return d.getMonth() + 1 === bulan && d.getFullYear() === tahun;
    });
    const guruRows = sheetToObjects(SHEETS.GURU);
    const perGuru = {};
    guruRows.forEach(g => { perGuru[g.ID_Guru] = { Nama: g.Nama, Hadir: 0, Pulang: 0, Telat: 0 }; });
    rows.forEach(r => {
      if (!perGuru[r.ID_Guru]) perGuru[r.ID_Guru] = { Nama: r.Nama, Hadir: 0, Pulang: 0, Telat: 0 };
      const d = new Date(r.Timestamp);
      if (r.Status === 'Masuk') {
        perGuru[r.ID_Guru].Hadir++;
        const jamStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
        if (jamStr > batasJam) perGuru[r.ID_Guru].Telat++;
      }
      if (r.Status === 'Pulang') perGuru[r.ID_Guru].Pulang++;
    });
    return Object.values(perGuru).filter(g => g.Hadir > 0 || g.Pulang > 0);
  },

  getRekapBulananSiswa: function (p) {
    const bulan = parseInt(p.bulan, 10);
    const tahun = parseInt(p.tahun, 10);
    const kelasFilter = (p.kelas || '').trim().toLowerCase();
    const rows = sheetToObjects(SHEETS.ABSEN_SISWA).filter(r => {
      const d = new Date(r.Timestamp);
      return d.getMonth() + 1 === bulan && d.getFullYear() === tahun;
    });
    const perSiswa = {};
    rows.forEach(r => {
      if (kelasFilter && String(r.Kelas || '').toLowerCase() !== kelasFilter) return;
      if (!perSiswa[r.ID_Siswa]) perSiswa[r.ID_Siswa] = { Nama: r.Nama, Kelas: r.Kelas, Hadir: 0, Telat: 0, Sakit: 0, Izin: 0, Alpa: 0 };
      if (r.Status === 'Telat') {
        perSiswa[r.ID_Siswa].Hadir++;
        perSiswa[r.ID_Siswa].Telat++;
        return;
      }
      const key = r.Status === 'Masuk' ? 'Hadir' : r.Status;
      if (perSiswa[r.ID_Siswa][key] !== undefined) perSiswa[r.ID_Siswa][key]++;
    });
    return Object.values(perSiswa);
  },

  // ---------- ABSEN SISWA ----------
  absenManualSiswa: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.ID_Siswa) === String(p.idSiswa));
    if (!siswa) throw new Error('ID Siswa tidak ditemukan');
    const sudahAda = sheetToObjects(SHEETS.ABSEN_SISWA).some(r =>
      String(r.ID_Siswa) === String(p.idSiswa) && todayStr(new Date(r.Timestamp)) === todayStr()
    );
    if (sudahAda) throw new Error(siswa.Nama + ' sudah tercatat absen hari ini');
    appendObject(SHEETS.ABSEN_SISWA, {
      Timestamp: new Date(), ID_Siswa: p.idSiswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
      Status: p.keterangan, Diinput_Oleh: p.inputOleh || ''
    });
    return { nama: siswa.Nama, kelas: siswa.Kelas, keterangan: p.keterangan };
  },

  absenSiswaByBarcode: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.Barcode_ID) === String(p.barcode));
    if (!siswa) throw new Error('Kartu tidak terdaftar');

    const now = new Date();
    let statusTercatat = p.status;
    let telat = false;
    let poin = 0;

    // Kalau absen "Masuk" dan sudah lewat Jam_Masuk_Batas, catat sebagai "Telat"
    // dan otomatis tambahkan poin pelanggaran (Poin_Telat_Masuk di Pengaturan).
    if (p.status === 'Masuk') {
      const settings = getSettingsMap();
      const batasJam = settings.Jam_Masuk_Batas || '07:15';
      const jamSekarang = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
      if (jamSekarang > batasJam) {
        telat = true;
        statusTercatat = 'Telat';
        poin = parseFloat(settings.Poin_Telat_Masuk || 10);
        appendObject(SHEETS.PELANGGARAN, {
          Timestamp: now, ID_Siswa: siswa.ID_Siswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
          Jenis: 'Terlambat masuk sekolah', Poin: poin, Keterangan: 'Otomatis (tercatat pukul ' + jamSekarang + ')', Input_Oleh: 'Sistem'
        });
      }
    }

    appendObject(SHEETS.ABSEN_SISWA, {
      Timestamp: now, ID_Siswa: siswa.ID_Siswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
      Status: statusTercatat, Diinput_Oleh: 'Pengurus ' + (p.idPengurus || '')
    });
    return { nama: siswa.Nama, kelas: siswa.Kelas, status: statusTercatat, telat: telat, poin: poin, timestamp: now };
  },

  // ---------- IZIN ----------
  mulaiIzin: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.Barcode_ID) === String(p.barcode));
    if (!siswa) throw new Error('Kartu tidak terdaftar');
    const now = new Date();
    const batas = new Date(now.getTime() + (p.durasiMenit || 15) * 60000);
    appendObject(SHEETS.IZIN, {
      ID_Siswa: siswa.ID_Siswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
      Mulai: now, Batas_Waktu: batas, Selesai: '', Telat: '', Status: 'Aktif', ID_Pengurus: p.idPengurus || ''
    });
    return { nama: siswa.Nama, kelas: siswa.Kelas, batas: batas };
  },

  selesaiIzin: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.Barcode_ID) === String(p.barcode));
    if (!siswa) throw new Error('Kartu tidak terdaftar');
    const sheet = sh(SHEETS.IZIN);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    let rowIdx = -1;
    for (let r = values.length - 1; r >= 1; r--) {
      if (String(values[r][headers.indexOf('ID_Siswa')]) === String(siswa.ID_Siswa) && values[r][headers.indexOf('Status')] === 'Aktif') {
        rowIdx = r + 1;
        break;
      }
    }
    if (rowIdx === -1) throw new Error(siswa.Nama + ' tidak sedang izin');
    const now = new Date();
    const batas = new Date(values[rowIdx - 1][headers.indexOf('Batas_Waktu')]);
    const telat = now > batas;
    sheet.getRange(rowIdx, headers.indexOf('Selesai') + 1).setValue(now);
    sheet.getRange(rowIdx, headers.indexOf('Telat') + 1).setValue(telat);
    sheet.getRange(rowIdx, headers.indexOf('Status') + 1).setValue('Selesai');

    let poin = 0;
    if (telat) {
      const settings = getSettingsMap();
      poin = parseFloat(settings.Poin_Telat_Izin || 15);
      appendObject(SHEETS.PELANGGARAN, {
        Timestamp: now, ID_Siswa: siswa.ID_Siswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
        Jenis: 'Terlambat kembali dari izin', Poin: poin, Keterangan: 'Otomatis', Input_Oleh: 'Sistem'
      });
    }
    return { nama: siswa.Nama, telat: telat, poin: poin };
  },

  getIzinAktif: function () {
    return sheetToObjects(SHEETS.IZIN).filter(r => r.Status === 'Aktif');
  },

  // ---------- POIN PELANGGARAN ----------
  addPelanggaran: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.ID_Siswa) === String(p.idSiswa));
    if (!siswa) throw new Error('ID Siswa tidak ditemukan');
    appendObject(SHEETS.PELANGGARAN, {
      Timestamp: new Date(), ID_Siswa: p.idSiswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
      Jenis: p.jenis, Poin: p.poin || 0, Keterangan: p.keterangan || '', Input_Oleh: p.inputOleh || ''
    });
    return { nama: siswa.Nama };
  },

  getPoinSiswa: function () {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const pelanggaran = sheetToObjects(SHEETS.PELANGGARAN);
    const perSiswa = {};
    siswaRows.forEach(s => { perSiswa[s.ID_Siswa] = { ID_Siswa: s.ID_Siswa, Nama: s.Nama, Kelas: s.Kelas, Total_Poin: 0 }; });
    pelanggaran.forEach(r => {
      if (!perSiswa[r.ID_Siswa]) perSiswa[r.ID_Siswa] = { ID_Siswa: r.ID_Siswa, Nama: r.Nama, Kelas: r.Kelas, Total_Poin: 0 };
      perSiswa[r.ID_Siswa].Total_Poin += parseFloat(r.Poin) || 0;
    });
    return Object.values(perSiswa);
  },

  // ---------- FITUR BARU: DETAIL PELANGGARAN UNTUK SURAT PANGGILAN ----------
  getDetailPelanggaranSiswa: function (p) {
    const siswaRows = sheetToObjects(SHEETS.SISWA);
    const siswa = siswaRows.find(s => String(s.ID_Siswa) === String(p.idSiswa));
    if (!siswa) throw new Error('ID Siswa tidak ditemukan');
    const list = sheetToObjects(SHEETS.PELANGGARAN)
      .filter(r => String(r.ID_Siswa) === String(p.idSiswa))
      .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    const total = list.reduce((sum, r) => sum + (parseFloat(r.Poin) || 0), 0);
    return {
      siswa: {
        ID_Siswa: siswa.ID_Siswa, Nama: siswa.Nama, Kelas: siswa.Kelas,
        Nama_Ortu: siswa.Nama_Ortu || '', Telepon_Ortu: siswa.Telepon_Ortu || ''
      },
      list: list,
      totalPoin: total
    };
  },

  // ---------- DATA MASTER (CRUD) ----------
  crudList: function (p) {
    return sheetToObjects(p.sheet);
  },

  crudAdd: function (p) {
    const idField = HEADERS[p.sheet][0];
    if (findRowIndexById(p.sheet, idField, p.data[idField]) !== -1) throw new Error('ID sudah dipakai, gunakan ID lain');
    // Kalau menambah Siswa dan Barcode_ID dikosongkan, otomatis pakai ID_Siswa sebagai kode barcode/QR.
    if (p.sheet === 'Siswa' && !p.data.Barcode_ID) {
      p.data.Barcode_ID = p.data.ID_Siswa;
    }
    appendObject(p.sheet, p.data);
    return { ok: true };
  },

  crudDelete: function (p) {
    const rowIdx = findRowIndexById(p.sheet, p.idField, p.idValue);
    if (rowIdx === -1) throw new Error('Data tidak ditemukan');
    sh(p.sheet).deleteRow(rowIdx);
    return { ok: true };
  },

  // ---------- SETTINGS ----------
  getSettings: function () {
    return getSettingsMap();
  },

  updateSettings: function (p) {
    const sheet = sh(SHEETS.SETTINGS);
    Object.keys(p).forEach(key => {
      const isJam = key === 'Jam_Masuk_Batas';
      const value = isJam ? normalizeJam(p[key]) : p[key];
      const rowIdx = findRowIndexById(SHEETS.SETTINGS, 'Key', key);
      if (rowIdx !== -1) {
        const cell = sheet.getRange(rowIdx, 2);
        // Paksa format sel jadi teks polos (bukan Waktu) supaya Google Sheets
        // tidak otomatis mengubah "07:15" jadi nilai jam tiap kali disimpan.
        if (isJam) cell.setNumberFormat('@');
        cell.setValue(value);
      } else {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1, 1, 2).setValues([[key, value]]);
        if (isJam) sheet.getRange(newRow, 2).setNumberFormat('@');
      }
    });
    return { ok: true };
  }
};
