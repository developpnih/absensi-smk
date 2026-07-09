/**
 * Wrapper scan kartu barcode pakai kamera HP.
 * Butuh library html5-qrcode (dimuat lewat CDN di setiap halaman yang perlu scan).
 * Support banyak format barcode (CODE_128, EAN, dst) sekaligus QR jika kartu pakai QR.
 */
let _html5QrCode = null;
let _scanLock = false;

function startCardScanner(elementId, onDetected, onError) {
  if (typeof Html5Qrcode === 'undefined') {
    onError && onError('Library scanner belum dimuat. Cek koneksi internet.');
    return;
  }
  _html5QrCode = new Html5Qrcode(elementId, {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.QR_CODE
    ],
    verbose: false
  });

  _html5QrCode
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 140 } },
      decodedText => {
        if (_scanLock) return; // cegah scan ganda beruntun
        _scanLock = true;
        onDetected(decodedText.trim());
        setTimeout(() => (_scanLock = false), 1800);
      },
      () => {} // error per-frame, diabaikan (biasanya cuma "no barcode found")
    )
    .catch(err => onError && onError('Tidak bisa akses kamera: ' + err));
}

function stopCardScanner() {
  if (_html5QrCode) {
    _html5QrCode.stop().catch(() => {});
    _html5QrCode = null;
  }
}
