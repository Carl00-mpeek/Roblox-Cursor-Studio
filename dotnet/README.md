# RBX Cursor Studio — .NET Framework 4.8 sürümü

Electron sürümünün (`main/`, `renderer/`, `native/`) baştan yazılmış, yerel (native) Windows
karşılığı. Arayüz WPF ile, animasyonlu imleç ve iz efekti doğrudan Win32 API'leriyle çizilir.

## Neden?

| | Electron sürümü | .NET 4.8 sürümü |
|---|---|---|
| Süreç sayısı | 4–6 (main, renderer, GPU, utility, iz efekti için ayrı renderer, `cursor_helper.exe`) | 1 |
| Çalışma zamanı | Paketin içinde Chromium + Node (~150 MB) | Windows 10/11 ile gelen .NET Framework 4.8 |
| Dağıtım | Setup / Portable (içinde Chromium; onlarca MB) | Tek `RBXCursorStudio.exe` (~3 MB) |
| Roblox durum kontrolü (5 sn'de bir) | Her seferinde `powershell.exe` başlatılır | Doğrudan süreç API'si (`QueryFullProcessImageName`) |
| İmleç izi | Ekranı kaplayan şeffaf Chromium penceresi + 30 ms'de bir JS köprüsü | Yalnızca izin kapladığı küçük alan kadar katmanlı pencere; fare durunca uyur |
| Animasyonlu imleç | Ayrı C++ süreci (`cursor_helper.exe`, derleyici gerekir) | Aynı süreçte bir arka plan iş parçacığı; sadece gerektiğinde çalışır |
| Discord RPC | `discord-rpc` npm paketi | Discord'un yerel IPC pipe'ı doğrudan |

Ek kaynak tasarrufları:
- Animasyon motoru yalnızca bir `.ani` atanmış **ve** overlay açıkken, tıklama sesi açıkken ya da
  önizleme sırasında çalışır; Roblox ön planda değilken 200 ms'de bir uyanır ve yüksek zamanlayıcı
  çözünürlüğünü (`timeBeginPeriod`) bırakır.
- Pencere tepsiye küçültülünce durum yoklaması durur, GC çalışır ve çalışma kümesi işletim
  sistemine geri verilir.
- İş istasyonu GC'si, arka plan GC iş parçacığı kapalı; arkaplan görseli ekran genişliğine göre
  küçültülerek çözülür.

## Uyumluluk

Veri klasörü (`%APPDATA%\RBXCursorStudio`), `config.json`, paketler, geçmiş, `anim/config.json` ve
`.rbxcursor` biçimi Electron sürümüyle **birebir aynıdır**. Eski sürümün paketleri ve ayarları
olduğu gibi açılır; iki sürüm birbirinin `.rbxcursor` dosyalarını okuyabilir
(bkz. `CoreTests` — Electron'un JS kodu ile iki yönlü çapraz test).

Tek fark: arayüz dili artık `localStorage` yerine `config.json` içindeki `language` alanında tutulur
(ilk açılışta İngilizce gelir, Ayarlar'dan değiştirilir).

## Derleme

Gereken: .NET SDK 6+ (Windows, Linux veya macOS'ta derlenebilir; çalıştırmak için Windows gerekir).

```bash
dotnet build dotnet/RBXCursorStudio/RBXCursorStudio.csproj -c Release
# çıktı: dotnet/RBXCursorStudio/bin/Release/net48/RBXCursorStudio.exe
```

`RBXCursorStudio.exe.config` dosyası GC ayarlarını içerir; exe'nin yanında durması önerilir
(yoksa uygulama yine çalışır, sadece varsayılan GC kullanılır). Orijinal imleçler, arkaplanlar ve
dil dosyası exe'nin içine gömülüdür.

GitHub Actions: **Actions → ".NET 4.8 sürümünü derle" → Run workflow** testleri çalıştırır ve exe'yi
indirilebilir artifact olarak üretir.

## Testler

```bash
node dotnet/CoreTests/fixtures-tools/make-fixtures.js . /tmp/fx      # Electron JS kodundan girdiler
dotnet run --project dotnet/CoreTests -c Release -- /tmp/fx           # C# tarafı karşılaştırma
node dotnet/CoreTests/fixtures-tools/verify-cs-output.js . /tmp/fx   # C# çıktısını JS ile doğrula
```

## Klasör yapısı

```
RBXCursorStudio/
  App.cs                  giriş noktası, tek örnek, servislerin başlatılması, tema
  Core/                   JSON, PNG/ZIP, config.json + veri yolları
  Roblox/                 sürüm/klasör algılama, imleç uygulama/yedek/geri alma, geçmiş, otomatik düzeltme
  Packs/                  .rbxcursor biçimi (güvenlik doğrulamalarıyla), paket yönetimi, zamanlayıcı
  Animation/              AnimEngine (eski cursor_helper.cpp'nin C# karşılığı) + AnimController
  Effects/                imleç izi, tıklama sesi
  Integrations/           Discord Rich Presence
  Services/               global kısayollar, tepsi, başlangıçta aç, dosya ilişkilendirme, güncelleme
  Imaging/                görsel çözme (.cur/.ico dahil), editör çizimi, renklendirme, kontur/gölge
  Native/                 Win32 P/Invoke + katmanlı overlay penceresi
  UI/                     WPF arayüzü (tema, ana pencere, görünümler, diyaloglar, ikonlar)
CoreTests/                arayüzden bağımsız çekirdek testleri (net8.0)
```
