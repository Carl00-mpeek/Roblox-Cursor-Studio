# Animasyonlu İmleç — Native Helper

Bu klasör, "Premium Animated Cursor" özelliğinin native (Win32/C++)
yarısını içerir. Elektron tarafı sadece bir kumandadır; tüm ANI
çözümleme, çizim ve fare takibi burada, `cursor_helper.exe` içinde
çalışır.

## Neden native?

- `LoadCursorFromFileW()` ile gerçek Win32 kürsör yükleyicisini
  kullanmak, alfa kanalı/maske işini tamamen işletim sistemine
  bırakır → siyah kutu/alfa artefaktı riski ortadan kalkar.
- `DrawIconEx()` + katmanlı pencere (`UpdateLayeredWindow`,
  `WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_TOOLWINDOW|WS_EX_TOPMOST`)
  gerçek per-pixel alfa compositing sağlar; renk anahtarlama (color
  key) gibi kırılgan tekniklere gerek kalmaz.
- `QueryPerformanceCounter` tabanlı zamanlama, hem fare takibini hem
  kare ilerletmeyi CPU'yu yakmadan (yaklaşık 120Hz tavan, boşta daha
  seyrek) akıcı tutar.
- `ffi-napi`, `System.Windows.Forms`/`System.Drawing` üzerinden
  PowerShell `Add-Type` köprüsü YOK. Sadece `user32`, `gdi32`,
  `winmm` — her Windows kurulumunda hazır bulunan sistem DLL'leri.

## Derleme

Artık elle yapman gerekmiyor: `npm install` (yani `kur.bat` / `install.bat`)
çalıştığında `postinstall` adımı `scripts/build-native.js` üzerinden bu
klasördeki `build.bat`'ı **otomatik** çalıştırır ve `cursor_helper.exe`'yi
derler. Sistemde ne MinGW `g++` ne de MSVC `cl.exe` varsa, `build.bat` bu
adımda `winget` üzerinden MinGW-w64 (WinLibs) paketini **kendisi indirip
kurmayı** dener — bu yalnızca kurulum sırasında (internet erişimi
gerektirir, birkaç dakika sürebilir) devreye girer; uygulama çalışırken
yapılan otomatik yeniden deneme (aşağıya bakın) internete çıkmaz, sadece
zaten kurulu bir derleyici olup olmadığına bakar. Ayrıca uygulama,
Animasyonlu İmleç özelliği ilk kullanıldığında exe hâlâ yoksa aynı derlemeyi
kendiliğinden bir kez daha dener — bu yüzden derleyiciyi (winget kurulumu ya
da elle) kurup uygulamayı yeniden başlatman yeterli.

Elle derlemek istersen (ör. hata ayıklama için) yine de şu şekilde
çalıştırabilirsin:

```bat
cd native
build.bat
```

`build.bat` önce MinGW `g++`'ı, bulamazsa MSVC `cl.exe`'yi dener; ikisi de
yoksa ve `RBX_ALLOW_AUTO_INSTALL_COMPILER=1` ortam değişkeni ayarlıysa (kur
betikleri bunu otomatik ayarlar) `winget install -e --id
BrechtSanders.WinLibs.POSIX.UCRT` ile MinGW'yi kurup tekrar dener. Hiçbiri
işe yaramazsa betik hangi seçeneği kurman gerektiğini yazdırır (ör.
`winget`i elle çalıştırmak ya da MSYS2/MinGW-w64 kurmak). Çıktı:
`native\cursor_helper.exe` — Electron tarafı bu dosyayı otomatik bulup
başlatır (bkz. `main/animation/anim-controller.js` → `_helperPath()`); paketlenmiş
sürümde `package.json`'daki `asarUnpack` sayesinde asar dışında, doğrudan
çalıştırılabilir halde kalır. Bir derleyici hiç bulunamazsa `npm install`
yine de başarıyla tamamlanır — sadece Animasyonlu İmleç özelliği devre dışı
kalır, uygulamanın geri kalanı normal çalışır.

## Protokol (stdin/stdout, satır bazlı, JSON değil)

Basit ve kırılgan-olmayan bir sebeple JSON parser'a gerek duymayan,
`|` ile ayrılmış `anahtar=değer` protokolü kullanılıyor:

Electron → helper:
```
TARGET|proc=RobloxPlayerBeta.exe
SETANI|state=click|path=C:\cursors\click.ani|scale=1.0|speed=1.0|fps=0|hotx=-1|hoty=-1
CONFIG|state=click|scale=1.5
CLEAR|state=click
PING
EXIT
```

Helper → Electron:
```
READY
STATE|state=click
LOADED|state=click|frames=8
CONFIGURED|state=click
CLEARED|state=click
ERR|msg=...
PONG
```

Not: yol veya diğer değerlerde `|`, `\r`, `\n` karakterleri boşlukla
değiştirilir (kaçış/escape yerine). Pratikte Windows dosya yollarında
bu karakterler bulunmaz.

## Durum (state) tespiti — nasıl çalışır ve sınırları

Roblox, Arrow/Click/Text/ShiftLock imleçlerini kendi motoru içinde
PNG doku olarak çizer; bu yüzden hangi durumun aktif olduğunu %100
kesin şekilde dışarıdan bilmenin garantili bir yolu yok. Helper, tümü
**herkese açık, kullanıcı-seviyesi** Win32 API'lerinden gelen
sinyalleri kullanır (bellek okuma, hook, Roblox'a özel bir şey YOK):

- **Click**: Roblox'un "tıklanabilir bir şeyin üstündeyim" imlecine
  (`ArrowCursor.png`) geçmesi. Tıklama okunmaz: ANI atanan durumların PNG'si
  tamamen şeffaf yapılırken içine gözle görülmeyen bir işaret değeri
  (alfa ≤ 5/255) yazılır (bkz. `main/png-lite.js`, `native/marker.h`).
  Helper, işletim sisteminin o an gösterdiği imlecin piksellerini
  `GetCursorInfo` + `GetIconInfo` ile okuyup bu işareti görünce hover durumunu
  bilir. İşaret henüz hiç görülmediyse (PNG yeni haliyle yüklenmesi için Roblox'u
  yeniden açmak gerekir) eski yönteme, yani sol fare tuşu basılıyken
  `GetAsyncKeyState`'e düşer.
- **Text**: (`IBeamCursor.png` işareti ya da) gerçek Win32 imleç şekli (`GetCursorInfo().hCursor`)
  standart `IDC_IBEAM` ile karşılaştırılır. Roblox'un metin girişi
  gerçek bir sistem I-beam'i tetikliyorsa güvenilir; tamamen kendi
  çizdiği bir arayüz elemanıysa bu sinyal hiç tetiklenmez ve o anda
  "arrow" animasyonu gösterilir.
- **ShiftLock**: Klavye tuşuna (Shift/Ctrl/Alt) hiç bakılmaz; çünkü bu
  tuşlar oyundan oyuna farklı iş yapar (koşma, çömelme...). Roblox, shift-lock
  açıkken işletim sistemi imlecini gizleyip pencerenin ortasına park eder. Bu
  yüzden "imleç gizli **ve** pencere ortasına yakın" = ShiftLock. İmleç gizli ama
  ortada değilse (sağ tuşla kamera sürükleme ya da imleci gizleyen bir oyun)
  overlay hiç çizilmez, tıpkı Roblox'un kendisi gibi.
- **Roblox'un kendi imleci görünürken**: İşletim sisteminin gösterdiği imleç
  gerçek, görünür bir resimse (ör. sadece arrow'a ANI atanmışken butonun
  üstündeki orijinal el), overlay çizilmez; böylece animasyon Roblox'un imlecinin
  altında akmaya devam etmez. Bu, yalnızca bir kez şeffaf/işaretli imleç
  başarıyla okunduktan sonra devreye girer; okuma başarısız olursa overlay yanlışlıkla
  gizlenmez.

Bu sınırlamalar bilinçli bir tasarım tercihidir: Roblox'un iç
belleğini okumak veya süreç enjeksiyonu yapmak yerine sadece herkese
açık pencere/girdi API'lerine dayanmak, hem daha güvenli hem de
Roblox güncellemelerine karşı daha dayanıklıdır.

## Statik PNG ile ilişkisi

Bir duruma ANI atandığında Electron tarafı (`anim-controller.js`) o
durumun Roblox PNG dosyasını **tamamen şeffaf** bir PNG ile değiştirip
uygular (bkz. `main/png-lite.js`) — böylece Roblox'un kendi çizdiği
statik görüntü görünmez olur ve native overlay tek görünen imleç
olur. ANI kaldırıldığında orijinal PNG saklanan yedekten geri yazılır.
ANI atanmamış durumlar hiç dokunulmadan gerçek statik imleçle çalışmaya
devam eder.
