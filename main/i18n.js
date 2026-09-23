const MESSAGES = {
  en: {
    zip_bad_eocd: 'Invalid zip file (EOCD record not found).',
    zip_too_many_entries: 'Too many entries in the zip file.',
    zip_bad_central_entry: 'Invalid zip central directory entry.',
    zip_entry_invalid: 'Invalid or too large zip entry.',
    zip_entry_open_failed: 'Could not open zip entry (corrupt or too large): {msg}',
    zip_unsupported_method: 'Unsupported compression method: {method}',

    pack_invalid_path: 'Invalid file path: cannot escape the pack folder.',
    pack_invalid_name: 'Invalid pack name.',
    pack_old_delete_failed: 'Could not delete the old pack: {msg}',
    pack_no_cursor_to_save: 'No cursor found to save. Select a cursor first, or make sure Roblox cursors exist.',
    pack_no_roblox_cursor_files: "Roblox cursor files not found. Open Roblox first and make sure the cursors have been created.",
    pack_anim_controller_not_ready: 'The animation controller is not ready yet.',
    pack_no_anim_assigned: 'No .ani animation is assigned for the selected states.',
    pack_not_found: 'Pack not found.',
    pack_roblox_cursor_folder_not_found: 'Roblox cursor folder not found.',
    pack_file_invalid_png: '{file} is invalid or not a {size}x{size} PNG.',
    pack_no_applicable_cursor: 'No applicable cursor found inside the pack.',
    pack_no_valid_cursor_in_file: 'No valid cursor found in the file.',
    pack_nothing_to_export: 'No cursor to export.',

    update_not_supported: 'In-app updates are not supported on this install.',
    update_download_first: 'Download the update first.',
    update_loader_failed: 'Could not load the updater.',

    pack_not_found_named: 'Pack not found: {name}',
    cursor_type_invalid: 'Invalid cursor type: {kind}',
    background_invalid: 'Invalid background.',
    background_default_cannot_delete: 'Default backgrounds cannot be deleted.',
    background_invalid_path: 'Invalid background path.',
    shortcut_slot_invalid: 'Invalid shortcut slot.',
    shortcut_empty: 'Shortcut cannot be empty.',
    shortcut_register_failed: 'This shortcut could not be registered (invalid, or already used by another app): {key}',
    placeid_empty: 'placeId cannot be empty.',

    native_helper_timeout: 'The native helper did not respond in time (it may have crashed — check error.log).',
    native_helper_send_failed: 'Could not send the command to the native helper.',
    native_helper_not_found: 'Native animation helper (cursor_helper.exe) was not found or could not be started.\nThe app tried to auto-compile it but failed — likely no C++ compiler\n(MinGW g++ or MSVC cl.exe) is installed. Install one and restart the app, or\nrun "native\\build.bat" manually. Expected location: {path}',
    anim_state_invalid: 'Invalid state: {kind}',
    anim_file_not_found: 'ANI file not found: {path}',
    anim_no_ani_assigned: 'Assign a .ani file to this state first.',
    anim_pack_ani_path_invalid: 'Invalid .ani path inside the pack: {path}',

    cursor_source_not_found: 'Source file not found: {path}',
    cursor_verify_failed_after_copy: 'SHA-256 verification failed after copying.',
    cursor_roblox_folder_not_found: 'Roblox cursor folder not found. Roblox must be installed and have been run at least once.',
    cursor_file_invalid_size: '{file} is invalid or not the expected {size}x{size} PNG.',
    cursor_none_to_apply: 'No cursor to apply. Select at least one cursor first.',
    cursor_verify_failed_after_apply: '{file} could not be verified after being applied.',
    cursor_bundled_original_invalid: 'The built-in original {file} is invalid.',
    cursor_original_files_missing: 'Original cursor files are missing: {files}',
    cursor_type_invalid_plain: 'Invalid cursor type.',
    cursor_bundled_original_missing: 'Built-in original cursor file is missing: {file}',
    history_item_not_found: 'History item not found.',
    history_file_not_found: 'History file not found.',

    tray_no_saved_pack: 'No saved pack',
    tray_open: 'Open',
    tray_packs: 'Packs',
    tray_toggle_anim: 'Toggle Animation',
    tray_quit: 'Quit',

    png_data_missing: 'PNG data is missing or corrupt.',
    png_invalid: 'The cursor file is not a valid PNG.',
    png_ihdr_missing: 'PNG IHDR chunk not found.',
    png_wrong_size: '{target} must be {expected}x{expected}; got {actual}.'
  },
  tr: {
    zip_bad_eocd: 'Geçersiz zip dosyası (EOCD kaydı bulunamadı).',
    zip_too_many_entries: 'Zip dosyasında çok fazla girdi var.',
    zip_bad_central_entry: 'Geçersiz zip merkezi dizin girdisi.',
    zip_entry_invalid: 'Zip girdisi geçersiz veya çok büyük.',
    zip_entry_open_failed: 'Zip girdisi açılamadı (bozuk veya çok büyük): {msg}',
    zip_unsupported_method: 'Desteklenmeyen sıkıştırma yöntemi: {method}',

    pack_invalid_path: 'Geçersiz dosya yolu: paket klasörünün dışına çıkılamaz.',
    pack_invalid_name: 'Geçersiz paket adı.',
    pack_old_delete_failed: 'Eski paket silinemedi: {msg}',
    pack_no_cursor_to_save: 'Kaydedilecek cursor bulunamadı. Önce cursor seçin veya Roblox cursorlarının bulunduğundan emin olun.',
    pack_no_roblox_cursor_files: "Roblox cursor dosyaları bulunamadı. Önce Roblox'u açıp cursorların oluştuğundan emin olun.",
    pack_anim_controller_not_ready: 'Animasyon denetleyicisi henüz hazır değil.',
    pack_no_anim_assigned: 'Seçilen durumlar için atanmış bir .ani animasyonu bulunamadı.',
    pack_not_found: 'Paket bulunamadı.',
    pack_roblox_cursor_folder_not_found: 'Roblox imleç klasörü bulunamadı.',
    pack_file_invalid_png: '{file} geçersiz veya {size}x{size} PNG değil.',
    pack_no_applicable_cursor: 'Paketin içinde uygulanabilir cursor bulunamadı.',
    pack_no_valid_cursor_in_file: 'Dosyada geçerli bir imleç bulunamadı.',
    pack_nothing_to_export: 'Dışa aktarılacak imleç yok.',

    update_not_supported: 'Uygulama içi güncelleme bu kurulumda desteklenmiyor.',
    update_download_first: 'Önce güncellemeyi indirmelisin.',
    update_loader_failed: 'Güncelleyici yüklenemedi.',

    pack_not_found_named: 'Paket bulunamadı: {name}',
    cursor_type_invalid: 'Geçersiz imleç türü: {kind}',
    background_invalid: 'Geçersiz arkaplan.',
    background_default_cannot_delete: 'Varsayılan arkaplanlar silinemez.',
    background_invalid_path: 'Geçersiz arkaplan yolu.',
    shortcut_slot_invalid: 'Geçersiz kısayol slotu.',
    shortcut_empty: 'Kısayol boş olamaz.',
    shortcut_register_failed: 'Bu kısayol kaydedilemedi (geçersiz ya da başka bir uygulama kullanıyor): {key}',
    placeid_empty: 'placeId boş olamaz.',

    native_helper_timeout: 'Native yardımcı zamanında yanıt vermedi (helper çökmüş olabilir, error.log kontrol et).',
    native_helper_send_failed: 'Native yardımcıya komut gönderilemedi.',
    native_helper_not_found: 'Native animasyon yardımcı programı (cursor_helper.exe) bulunamadı veya başlatılamadı.\nUygulama otomatik derlemeyi denedi ama başarısız oldu — muhtemelen bir C++ derleyicisi\n(MinGW g++ veya MSVC cl.exe) kurulu değil. Birini kurup uygulamayı yeniden başlat, ya da\nelle "native\\build.bat" çalıştır. Beklenen konum: {path}',
    anim_state_invalid: 'Geçersiz durum: {kind}',
    anim_file_not_found: 'ANI dosyası bulunamadı: {path}',
    anim_no_ani_assigned: 'Önce bu durum için bir .ani dosyası ata.',
    anim_pack_ani_path_invalid: 'Paket içindeki .ani yolu geçersiz: {path}',

    cursor_source_not_found: 'Kaynak dosya bulunamadı: {path}',
    cursor_verify_failed_after_copy: 'Kopyalama sonrası SHA-256 doğrulaması başarısız.',
    cursor_roblox_folder_not_found: 'Roblox imleç klasörü bulunamadı. Roblox yüklü ve en az bir kez çalıştırılmış olmalı.',
    cursor_file_invalid_size: '{file} geçersiz veya beklenen {size}x{size} PNG değil.',
    cursor_none_to_apply: 'Uygulanacak imleç bulunamadı. Önce en az bir imleç seçin.',
    cursor_verify_failed_after_apply: '{file} uygulandıktan sonra doğrulanamadı.',
    cursor_bundled_original_invalid: 'Uygulama içindeki orijinal {file} geçersiz.',
    cursor_original_files_missing: 'Orijinal imleç dosyaları eksik: {files}',
    cursor_type_invalid_plain: 'Geçersiz imleç türü.',
    cursor_bundled_original_missing: 'Orijinal imleç dosyası eksik: {file}',
    history_item_not_found: 'Geçmiş öğesi bulunamadı.',
    history_file_not_found: 'Geçmiş dosyası bulunamadı.',

    png_data_missing: 'PNG verisi eksik veya bozuk.',
    tray_no_saved_pack: 'Kayıtlı paket yok',
    tray_open: 'Aç',
    tray_packs: 'Paketler',
    tray_toggle_anim: 'Animasyonu Aç/Kapat',
    tray_quit: 'Çıkış',
    png_invalid: 'İmleç dosyası geçerli bir PNG değil.',
    png_ihdr_missing: 'PNG IHDR bölümü bulunamadı.',
    png_wrong_size: '{target} {expected}x{expected} olmalı; alınan {actual}.'
  }
};

let currentLang = 'en';

function setLang(lang) {
  if (lang !== 'en' && lang !== 'tr') return;
  currentLang = lang;
}

function getLang() {
  return currentLang;
}

function t(key, vars) {
  const dict = MESSAGES[currentLang] || MESSAGES.en;
  let s = dict[key] ?? MESSAGES.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  }
  return s;
}

module.exports = { setLang, getLang, t };
