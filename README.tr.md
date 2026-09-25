<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio bağımsız, topluluk yapımı bir araçtır — **Roblox Corporation ile bağlantısı yoktur**. Roblox’un belleğini okumaz, koduna enjekte olmaz. Yerel Roblox klasöründeki imleç görsellerini değiştirir; animasyonlu imleçlerde ise standart Windows API’leriyle ayrı bir overlay çizer. Roblox oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım riski sana aittir**.

---

# 🎨 RBX Cursor Studio

Roblox imleçlerini özelleştirmek için hafif bir Windows uygulaması — kendi stilin, arkadaşlarınla paylaşım, paketler arası anında geçiş.

**Güncel sürüm: 4.6.0**

![RBX Cursor Studio Ekran Görüntüsü]

---

## 🆕 4.6.0 ile gelenler

Bu sürüm “birkaç küçük düzeltme”den ibaret değil — güncelleme, paket paylaşımı ve animasyon tarafı ciddi şekilde toparlandı.

### 🔄 Daha akıllı güncelleme
- Kurulum dosyası artık net: **Setup** adıyla geliyor  
- Güncelleme indikten sonra eski indirme dosyaları **otomatik silinir** — bilgisayarda çöp birikmez  
- **Şimdi Kontrol Et** → güncelleme varsa **İndir ve Kur** hemen çıkar  
- Ayarlarda güncelleme bölümü **geçmişin hemen üstünde**; kaçırılmaz

### 🎬 Animasyonlu imleçler — artık Beta değil
- **Beta** yazısı kalktı; özellik günlük kullanıma hazır  
- Animasyonu **kapatınca imlecin kaybolması** sorunu giderildi  
- Aç/kapa daha stabil; Roblox’ta imleç görünürlüğü korunur

### 📦 Paketler — paylaşımın yeni hali
- **`.rbxcursor` dosyasına çift tıkla** → **Pakete Kaydet** veya **Sadece Uygula**  
- **Toplu içe aktar** · seçtiklerini **toplu dışa aktar** (klasöre ayrı dosyalar)  
- Sürükle-bırak ile **birden fazla dosya** desteklenir  
- Güvenlik sıkılaştı: yalnızca gerçek **PNG** imleçler ve geçerli **`.ani`** animasyonlar kabul edilir

### 🎨 Görünüm ve his
- Güncelleme ayarları daha kolay bulunur  
- Paket ekranı daha pratik (içe aktar, toplu dışa aktar, çoklu sürükle-bırak)  
- Animasyon sayfası “deneme” değil, **bitmiş ürün** gibi durur  
- Özel görsel atadığın imleç kartlarında yumuşak **parıltı** hâlâ yerinde  
- Bağlamda Önizleme sıcak duruyor: OYNA, sohbet kutusu, Shift Lock — gerçek boyutta dene

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
Arkaplanı değiştir, Türkçe / İngilizce anında geç, Windows başlangıcında aç, algılanan Roblox sürümünü gör — hepsi Ayarlar’da.

### 💻 Platform
Taşınabilir exe veya NSIS **Setup** yükleyici. Electron tabanlı; animasyonlu imleçler yalnızca gerektiğinde açılan küçük `cursor_helper.exe` ile çalışır. Kaynak açık, ticari olmayan lisans; sürümler VirusTotal ile taranır.

---

## 📥 İndir

- **Setup** — yükleyiciyi indir, kur, bitir  
- **Taşınabilir** — ZIP’i aç, `RBX Cursor Studio.exe` çalıştır — kurulum yok  

> En güncel sürümü her zaman [Releases](../../releases) sayfasından al — yalnızca bu depodan indir.

### ❓ Windows “bilgisayarınızı korudu” diyor
Uygulama henüz kod imzalı değil; yeterince kişi çalıştırana kadar SmartScreen uyarı verebilir — bu tek başına zararlı yazılım demek değildir. **Diğer bilgiler → Yine de çalıştır**. Kaynak ve VirusTotal aşağıda.

### ❓ Animasyonlu imleç görünmüyor
- Exclusive tam ekran overlay’leri engeller (Discord/Steam gibi) — pencereli veya borderless dene  
- İlk animasyondan sonra Roblox’u yeniden başlat  
- Animasyon sekmesindeki **Önizle** ile çizimin çalıştığını kontrol et  
- Kısayolla kapatılmadığından emin ol (varsayılan `Ctrl+Alt+0`)

---

## 🔧 Kaynak koddan derleme

**Windows:** hazır script’ler yeterli — terminale gerek yok (`kur.bat` / `baslat.bat` / `exe_yap.bat`). Aşağısı manuel kurulum veya Windows dışı sistemler için.

**Gereksinimler:** Node.js 18+ ve npm. Animasyon için C++ derleyicisi (MinGW `g++` veya MSVC `cl.exe`). Yoksa `kur.bat` bir kez MinGW-w64 indirebilir (~260 MB). Derleyici olmasa da uygulama çalışır; yalnızca animasyon kapalı kalır. Resmi Setup/Portable sürümlerde yardımcı zaten gömülü.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # geliştirme
npm run dist     # yükleyici + taşınabilir exe
```

---

## 🛡️ VirusTotal

En son sürüm VirusTotal ile taranmıştır:

- [🔍 Kaynak](https://www.virustotal.com/gui/file/4fd0d51507ff8fd0d4e89e654aaf7ff092be8c01ff290dd2ff0eba44a08cc99a?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/011116e8dc7858e404fc3f0b38fdd036cdc5670139adeff256b6a127c0710fe7)
- [🔍 Portable](https://www.virustotal.com/gui/file/5f57e0ea46a9c675d688da277fac457cdc62e496c7374ee6fcac2a1f0917119c?nocache=1)

### 🇹🇷 Yanlış Pozitif Bildirimi

> **Yanlış Pozitif Uyarısı**
>
> Bazı antivirüs programları Roblox Cursor Studio'yu yanlışlıkla malware veya Trojan olarak algılayabilir. Bu tespitlerin, uygulamanın Electron tabanlı yapısı, native bileşenleri ve otomatik güncelleme sistemi nedeniyle oluşan yanlış pozitifler olduğu düşünülmektedir.
>
> Roblox Cursor Studio kasıtlı olarak malware, spyware, şifre hırsızı, keylogger veya başka bir zararlı yazılım içermez.
>
> Antivirüs programınız uygulamayı algılarsa, programı **resmî GitHub deposundan** indirdiğinizden emin olun ve tespiti antivirüs sağlayıcınıza **false positive (yanlış pozitif)** olarak bildirmeyi düşünebilirsiniz.


---

## ☕ Projeyi destekle

RBX Cursor Studio ücretsiz. Desteğin güncellemelerin ve yeni özelliklerin devam etmesine yardım eder.

[☕ Bana bir kahve ısmarla](https://buymeacoffee.com/rbxcursor)

---

## 📄 Lisans

[PolyForm Noncommercial License 1.0.0](LICENSE) ile lisanslanmıştır.  
Gerekli Bildirim: Telif Hakkı (c) 2026 Demhat Dayan

Kişisel, eğitim ve ticari olmayan kullanım ücretsizdir. **Ticari kullanım, yeniden satış veya kâr amaçlı dağıtım** yazılı izin olmadan yapılamaz.

---

💬 Beğendiysen bir yıldız çok şey ifade eder. Hata veya fikir → issue aç.  
İyi oyunlar, güzel imleçler! 🖱️✨
