<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio bağımsız, topluluk yapımı bir araçtır — **Roblox Corporation ile bağlantısı yoktur**. Roblox’un belleğini okumaz, koduna enjekte olmaz. Yerel Roblox klasöründeki imleç görsellerini değiştirir; animasyonlu imleçlerde ise standart Windows API’leriyle ayrı bir overlay çizer. Roblox oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım riski sana aittir**.

---

# 🎨 RBX Cursor Studio

Roblox imleçlerini özelleştirmek için hafif bir Windows uygulaması — kendi stilin, arkadaşlarınla paylaşım, paketler arası anında geçiş.

**Güncel sürüm: 5.0.0**

## 🎬 Tanıtım videosu

<!-- 👇 YOUR_VIDEO_ID yerine videonun ID'sini yaz (ya da tam bağlantıyı yapıştır) -->
[▶️ Tanıtım videosunu izle](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

---

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
- **Tıklama sesi** *(beta)* — Roblox ön plandayken her sol tıkta kısa ses; native yardımcının yeniden derlenmesi gerekir (`native/build.bat`)
- **Discord Rich Presence** — Discord açıkken profilinde otomatik olarak “RBX Cursor Studio” görünür (kapatmak için Discord › Ayarlar › Etkinlik Gizliliği); `npm install` gerekir (`discord-rpc` eklenir)
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
Taşınabilir exe veya NSIS **Setup** yükleyici. Electron tabanlı; animasyonlu imleçler yalnızca gerektiğinde açılan küçük `cursor_helper.exe` ile çalışır. Kaynak açık, ticari olmayan lisans.

---

## 📥 İndir

- **Setup** — yükleyiciyi indir, kur, bitir  
- **Taşınabilir** — taşınabilir exe’yi indir ve çalıştır — kurulum yok  

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

**Windows:** hazır script’ler yeterli — terminale gerek yok (`install.bat` / `start.bat` / `exe_maker.bat`). Aşağısı manuel kurulum veya Windows dışı sistemler için.

**Gereksinimler:** Node.js 18+ ve npm. Animasyon için C++ derleyicisi (MinGW `g++` veya MSVC `cl.exe`). Yoksa `install.bat` bir kez MinGW-w64 indirebilir (~260 MB). Derleyici olmasa da uygulama çalışır; yalnızca animasyon kapalı kalır. Resmi Setup/Portable sürümlerde yardımcı zaten gömülü.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # geliştirme
npm run dist     # yükleyici + taşınabilir exe
```

---

### ✍️ Kod imzalama (opsiyonel)
Uygulama henüz imzalı değil. Bir kod imzalama sertifikan olunca electron-builder otomatik imzalar — ayar değişikliği gerekmez. `npm run dist` öncesinde şunları tanımla:

```bat
set CSC_LINK=C:\sertifika\yolu\certificate.pfx
set CSC_KEY_PASSWORD=parolan
```

GitHub Actions'ta bunları repository secret olarak sakla ve build adımında `CSC_LINK` / `CSC_KEY_PASSWORD` ortam değişkeni olarak geçir.

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
