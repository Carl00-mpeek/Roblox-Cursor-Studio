# 🎨 RBX Cursor Studio — Roblox Cursor Changer & Customizer

Roblox imleçlerini özelleştirmek için hafif bir Windows uygulaması — kendi stilin, arkadaşlarınla paylaşım, paketler arası anında geçiş.

<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio bağımsız, topluluk yapımı bir araçtır — **Roblox Corporation ile bağlantısı yoktur**. Roblox’un belleğini okumaz, koduna enjekte olmaz. Yerel Roblox klasöründeki imleç görsellerini değiştirir; animasyonlu imleçlerde ise standart Windows API’leriyle ayrı bir overlay çizer. Roblox oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım riski sana aittir**.

---

**Güncel sürüm: 6.0.0**

## 🎬 Tanıtım videosu

<!-- 👇 YOUR_VIDEO_ID yerine videonun ID'sini yaz (ya da tam bağlantıyı yapıştır) -->
[▶️ Tanıtım videosunu izle](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

---

## 🆕 6.0.0 ile gelenler

- **Yerel Windows uygulaması olarak baştan yazıldı** (.NET Framework 4.8 / WPF), Electron yerine — tek süreç, tek ~3 MB'lık exe, çok daha düşük RAM ve işlemci kullanımı
- **Artık Node.js, npm veya C++ derleyicisi gerekmiyor** — animasyonlu imleç, tıklama sesi ve Discord durumu uygulamanın içinde
- Roblox algılama artık 5 saniyede bir PowerShell başlatmıyor; imleç izi yalnızca kapladığı küçük alanı yeniden çiziyor
- Klasik (alfa kanalsız) `.ani` imleçler artık doğru görünüyor; animasyon açıkken animasyonlu paket uygulanınca oluşan donma düzeltildi
- Tüm paketlerin, geçmişin ve ayarların otomatik taşınır — aynı veri klasörü ve `.rbxcursor` biçimi

## 🆕 5.0.0 ile gelenler

### 🖥️ Pencere
- **Kapatınca tepsiye küçült** — **Ayarlar › Genel**’de yeni anahtar: ✕ düğmesi uygulamayı kapatmak yerine sistem tepsisine küçültür. Kısayollar, paket değiştirici ve diğer otomasyonlar çalışmaya devam eder; geri açmak için tepsi simgesine tıkla, tamamen çıkmak için menüdeki *Çıkış*’ı kullan.

### 🎨 Temalar
- **Renk temaları** — uygulamanın vurgu rengini **Ayarlar › Genel**’den seç: mavi, mor, kırmızı, pembe veya sarı. Seçimin hatırlanır.

### 📦 Paketler
- **Favori, etiket ve arama** — sevdiğin paketleri yıldızla (en üste çıkar), etiket ekle, ada/etikete göre filtrele
- **Paylaş** düğmesi — paketi dışa aktarır ve önceden doldurulmuş bir GitHub Discussions gönderisi açar

### 🤖 Otomasyon & Efektler (Ayarlar'da yeni sekme)
- **Roblox açılınca son paketi uygula**
- **Zamanlı / rastgele paket değiştirici** — her N dakikada bir, rastgele ya da sırayla; istersen seçili paketlerle sınırlı
- **Cursor izi** *(beta)* — imlecinin arkasında efektler: klasik, yıldız, kıvılcım, duman, ateş, kalp, gökkuşağı (renk + uzunluk)
- **Tıklama sesi** *(beta)* — Roblox ön plandayken her sol tıkta kısa ses
- **Discord Rich Presence** — Discord açıkken profilinde otomatik olarak “RBX Cursor Studio” görünür (kapatmak için Discord › Ayarlar › Etkinlik Gizliliği)
- **Sürüm notları görüntüleyici** ve **ayar yedekleme / geri yükleme** (tek JSON dosyası)

### 🎯 Editör
- **Kontur ve gölge** aracı + tek tıkla **erişilebilirlik ön ayarı** (kalın, otomatik kontrastlı kontur)

---

## ✨ Özellikler

### 🖱️ İmleç özelleştirme
Roblox’un tüm imleç türlerini (ok, uzak ok, I-beam, kilitli fare…) tek tek özelleştir, anında uygula. Görseller 64×64 alana sığdırılır ve ortalanır; piksel kenarları keskin kalsın diye yumuşatma kapalıdır.

### ✨ Animasyonlu imleçler (.ANI)
> Otomatik durum tespiti sezgisel yöntemlere dayanır; bazı oyunlarda ara sıra yanılabilir. Tuhaf bir şey görürsen [issue aç](../../issues).

- Her durum için bir `.ani` ata — **Normal, Tıklama, Yazı, Shift Lock**  
- Küçük bir native yardımcı çizer: tıklama geçer, her zaman üstte, gerçek piksel alfa  
- Boyut, hız, FPS (240’a kadar), otomatik ortalama veya elle hotspot  
- Fare takip aralığı ayarlanabilir · durum aktifken canlı rozet  
- Roblox kapalıyken bile masaüstünde 6 saniye **önizle**  
- Kısayolla aç/kapat (varsayılan `Ctrl+Alt+0`)

> İlk animasyonu atadıktan sonra Roblox’u yeniden başlat ki yeni imleç dosyalarını alsın.

### 🎯 Dahili imleç düzenleyici
Otomatik Boyutlandır + Ortala, Sadece Ortala, Boyutu Sıfırla · yakınlaştırma 0.4x–3x · sürükle konumlandır · ton kaydırıcılı Renklendir · tek tıkla Renk Varyasyonları. Uygulamadan çıkmadan hızlı deneme için.

### 📦 Paket sistemi
İstediğin kadar paket oluştur ve yönet. `.rbxcursor` / `.zip` dışa aktar; buton veya sürükle-bırak ile içe aktar (tek veya çok dosya). **Hızlı Paket Geçişi** (`Ctrl+Alt+1/2/3`) Roblox açıkken de çalışır.

### 🕓 Geçmiş
Kaydettiğin imleçler Geçmiş’te durur — istediğin zaman tek tıkla geri uygula.

### 🖼️ Bağlamda önizleme
Sahte bir Roblox tarzı sahnede gerçek boyutta dene: HUD, OYNA butonu, sohbet kutusu, Shift Lock.

### 🔄 Roblox güncelleme desteği
En yeni istemci klasörünü otomatik bulur. Otomatik Düzeltme açıkken Roblox güncellenince kayıtlı imleçlerin geri gelir. Orijinalleri tek tıkla yedekle / geri yükle.

### 🌈 Toplu renk değiştirici
Aktif tüm imleçleri tek bir tonla boya — boyut ve konum yerinde kalır.

### 🎬 Kişiselleştirme ve ⚙️ ayarlar
Arkaplanı değiştir, renk teması seç (mavi, mor, kırmızı, pembe, sarı), Türkçe / İngilizce anında geç, Windows başlangıcında aç, kapatınca tepsiye küçült, algılanan Roblox sürümünü gör — hepsi Ayarlar’da.

### 💻 Platform
~3 MB'lık Setup kurulumu ya da tek bir taşınabilir exe. Windows 10/11 ile birlikte gelen .NET Framework 4.8 (WPF) ile yazılmış yerel bir Windows uygulaması: tek süreç, düşük RAM ve işlemci kullanımı. Animasyonlu imleç motoru uygulamanın içinde ve yalnızca gerektiğinde çalışır. Kaynak açık, ticari olmayan lisans.

---

## 📥 İndir

- **Setup** — `RBX Cursor Studio Setup <sürüm>.exe`: kullanıcın için kurar (yönetici izni gerekmez), Başlat menüsü / masaüstü kısayolu, `.rbxcursor` ilişkilendirmesi ve kaldırıcı ekler  
- **Taşınabilir** — `RBX Cursor Studio Portable <sürüm>.exe`: indir ve çalıştır, kurulum yok  
- Windows 10/11 gerekir (Windows 7 SP1+/8.1'de [.NET Framework 4.8](https://dotnet.microsoft.com/download/dotnet-framework/net48) kurulu olmalı)  
- Eski sürümdeki paketlerin, geçmişin ve ayarların otomatik olarak kullanılır  

> En güncel sürümü her zaman [Releases](../../releases) sayfasından al — yalnızca bu depodan indir.

### ❓ Windows “bilgisayarınızı korudu” diyor
Uygulama henüz kod imzalı değil; yeterince kişi çalıştırana kadar SmartScreen uyarı verebilir — bu tek başına zararlı yazılım demek değildir. **Diğer bilgiler → Yine de çalıştır**. Kaynak kodun tamamı bu depoda herkese açık.

### ❓ Animasyonlu imleç görünmüyor
- Exclusive tam ekran overlay’leri engeller (Discord/Steam gibi) — pencereli veya borderless dene  
- İlk animasyondan sonra Roblox’u yeniden başlat  
- Animasyon sekmesindeki **Önizle** ile çizimin çalıştığını kontrol et  
- Kısayolla kapatılmadığından emin ol (varsayılan `Ctrl+Alt+0`)

---

## 🔧 Kaynak koddan derleme

**Gereksinim:** [.NET SDK](https://dotnet.microsoft.com/download) 6 veya üstü. Windows'ta `build.bat` dosyasına çift tıklaman yeterli.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
dotnet build RBXCursorStudio/RBXCursorStudio.csproj -c Release
# → RBXCursorStudio/bin/Release/net48/RBXCursorStudio.exe
```

Visual Studio ile `RBXCursorStudio.sln` dosyasını da açabilirsin. `v*` ile başlayan bir tag push'larsan (örn. `v5.1.0`, `.csproj` içindeki `<Version>` ile aynı olmalı) GitHub Actions exe'yi derleyip bir Release'e ekler. Kodun düzeni için [ARCHITECTURE.md](ARCHITECTURE.md).

---

### ✍️ Kod imzalama (opsiyonel)
Uygulama henüz imzalı değil. Bir kod imzalama sertifikan olunca derlenen exe'yi `signtool sign /f certificate.pfx /p <parola> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 RBXCursorStudio.exe` ile imzalayabilirsin (GitHub Actions'ta sertifikayı ve parolayı repository secret olarak sakla).

## ☕ Projeyi destekle

RBX Cursor Studio ücretsiz. Desteğin güncellemelerin ve yeni özelliklerin devam etmesine yardım eder.

[☕ Bana bir kahve ısmarla](https://buymeacoffee.com/rbxcursor)

---

## 📄 Lisans

[PolyForm Noncommercial License 1.0.0](LICENSE.md) ile lisanslanmıştır.  
Gerekli Bildirim: Telif Hakkı (c) 2026 Demhat Dayan

Kişisel, eğitim ve ticari olmayan kullanım ücretsizdir. **Ticari kullanım, yeniden satış veya kâr amaçlı dağıtım** yazılı izin olmadan yapılamaz.

---

💬 Beğendiysen bir yıldız çok şey ifade eder. Hata veya fikir → issue aç.  
İyi oyunlar, güzel imleçler! 🖱️✨
