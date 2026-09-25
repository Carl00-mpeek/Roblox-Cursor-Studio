<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio, bağımsız ve topluluk tarafından geliştirilmiş bir araçtır; **Roblox Corporation ile hiçbir bağlantısı yoktur**. Roblox'un belleğini okumaz, koduna müdahale etmez — yerel Roblox klasöründeki imleç görsellerini değiştirir ve (Animasyonlu İmleç özelliğinde) standart Windows API'leriyle ayrı bir overlay penceresi çizer. Roblox, oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım riski size aittir**.

# 🎨 RBX Cursor Studio

Roblox imleçlerini özelleştirmek için hafif bir Windows aracı.

**Güncel sürüm: 4.5.5**

## 🎬 Demo

[![RBX Cursor Studio Live Preview](https://img.youtube.com/vi/kKYbosdVFig/0.jpg)](https://www.youtube.com/watch?v=kKYbosdVFig)

## 🆕 4.5.5 ile Gelenler

**RBX Cursor Studio Güncellemesi**

Bu güncellemeyle programda daha stabil, güvenli ve gelişmiş bir deneyim sunuyoruz:

* 📜 Uygulama içindeki lisans/telif metni düzeltildi, artık kendi içinde çelişmiyor.
* ⚡ Roblox durumu kontrol edilirken oluşan kısa donmalar giderildi, program daha akıcı çalışıyor.
* 🔒 Paket ve oyun eşleştirme kısımlarında ek güvenlik önlemleri alındı; hatalı/kötü niyetli veri girişine karşı koruma güçlendirildi.
* 🛡️ Varsayılan imleçlere geri dönme işlemi artık daha güvenli: bir sorun varsa hiçbir şey yarım kalmadan işlem baştan durduruluyor.
* ⌨️ Hızlı geçiş (Quick Switch) kısayolları artık gerçekten çalışıp çalışmadığını kontrol ediyor, sessizce başarısız olmuyor.
* 🧹 Kullanılmayan dosyalar ve kod temizlendi, hata kayıt dosyasının sınırsız büyümesi engellendi.
* 🛠️ Kurulum dosyası oluşturma araçlarındaki yanlış mesaj düzeltildi.

### 🧪 BETA — 1024×1024 Yüksek Çözünürlük Desteği

Yeni **yüksek çözünürlük desteği** ile imleç paketleri artık **1024×1024 piksele kadar** kullanılabiliyor.

> ⚠️ **Bu özellik şu anda Beta aşamasındadır.** Bazı eski veya uyumsuz imleç paketlerinde beklenmeyen sonuçlar oluşabilir.

Bu güncelleme genel olarak programı daha sağlam ve güvenli hale getirmeye odaklanıyor. Yeni yüksek çözünürlük özelliği ise şimdilik **Beta olarak** sunuluyor.

## ✨ Özellikler

### 🖱️ İmleç Özelleştirme
Roblox'un tüm imleç türlerini (ok, uzak ok, I-beam, kilitli fare...) tek tek özelleştir ve seçtiğin görseli anında uygula. İmleçler 64×64 alana otomatik sığdırılır ve ortalanır; piksel netliği için yumuşatma kapalıdır.

### ✨ Animasyonlu İmleçler (.ANI)
> Otomatik durum tespiti sezgisel yöntemlere dayanır ve bazı oyunlarda ara sıra yanılabilir. Bir sorunla karşılaşırsan [issue aç](../../issues).

- Her durum için bir `.ani` dosyası ata — **Normal, Tıklama, Yazı, Shift Lock**
- Küçük bir native yardımcı tarafından, tıklamayı geçiren, her zaman üstte duran ve gerçek piksel bazlı alfaya sahip bir overlay olarak çizilir
- Durum başına boyut, hız ve FPS ayarı (240 FPS'e kadar), otomatik ortalama veya elle hotspot
- Ayarlanabilir fare takip aralığı; canlı bir rozetle otomatik durum geçişi
- Roblox açık olmasa bile herhangi bir animasyonu masaüstünde 6 saniye **önizle**
- Kısayolla (varsayılan `Ctrl+Alt+0`) tüm özelliği aç/kapat

> İlk animasyonu atadıktan sonra Roblox'u yeniden başlat, böylece güncellenmiş imleç dosyalarını yükler.

### 🎯 Gelişmiş İmleç Düzenleyici
Otomatik Boyutlandır + Ortala, Sadece Ortala ve Boyutu Sıfırla kısayolları; manuel yakınlaştırma kaydırıcısı (0.4x–3x); sürükle-bırak konumlandırma; ton kaydırıcılı Renklendir; ve tek tıkla Renk Varyasyonları.

### 📦 Paket Sistemi
İstediğin kadar paket oluştur, kaydet ve yönet. `.rbxcursor` / `.zip` olarak dışa aktarıp paylaş, ya da sürükle-bırak ile içe aktar. **Hızlı Paket Geçişi**, `Ctrl+Alt+1/2/3` ile Roblox içindeyken bile paketler arasında anında geçiş yapar.

### 🕹️ Oyuna Göre Otomatik Paket — 🧪 Deneysel, opt-in (varsayılan kapalı)
Bir Roblox oyununu kayıtlı paketlerinden birine eşle; o oyunu açtığında uygulama otomatik olarak o pakete geçsin. Bu, Roblox'un kendi yerel log dosyalarını (`%LOCALAPPDATA%\Roblox\logs`) **salt okunur** okuyarak çalışır — başka hiçbir şey yapmaz. Uygulama bu özellik için Roblox'un belleğini okumaz, sürecine enjekte olmaz ve ağ isteği atmaz. Bir paketi elle seçersen (menü, kısayol ya da tepsi simgesi), otomatik geçiş o oturum boyunca araya girmez.

### 🕓 Geçmiş
Daha önce seçtiğin her imleç, istediğin zaman tekrar uygulayabileceğin bir Geçmiş sekmesinde saklanır.

### 🖼️ Bağlamda Önizleme
Sahte bir Roblox ekranı üzerinde — HUD, OYNA butonu, sohbet kutusu ve Shift Lock dahil — imleçlerini gerçek boyutunda dene.

### 🔄 Otomatik Güncelleme Desteği
En yeni Roblox istemci klasörünü otomatik algılar. Otomatik Düzeltme açıkken, Roblox her güncellendiğinde kayıtlı imleçlerin yeniden kurulur. Orijinal imleçlerini tek tıkla yedekle ve geri yükle.

### 🌈 Toplu Renk Değiştirici
Boyut ve konuma dokunmadan, şu an aktif tüm imleçleri tek bir renk tonuyla boya.

### 🎬 Kişiselleştirme & ⚙️ Ayarlar
Uygulamanın arkaplanını değiştir, Türkçe/İngilizce arasında anında geçiş yap, Windows başlangıcında otomatik aç ve algılanan Roblox sürümünü Ayarlar'dan gör.

### 🔔 Güncellemeler
Açılışta GitHub'ın herkese açık "latest release" adresine **tek bir** sürüm sorusu gönderilir (kimlik/hesap verisi gönderilmez); yeni sürüm varsa Ayarlar'da ve sol üstteki sürüm etiketinde haber verilir.
Güncelleme varsa uygulama [Releases](../../releases) sayfasını açar; en son Kurulum veya Portable sürümünü kendin indirebilirsin.
Açılış kontrolü Ayarlar > Güncellemeler'den kapatılabilir.

### 💻 Platform ve Dağıtım
Taşınabilir exe ya da NSIS kurulum dosyası olarak dağıtılır. Electron tabanlı; animasyonlu imleçler yalnızca gerektiğinde başlayan küçük bir native yardımcıda (`cursor_helper.exe`) çalışır. Kaynak kodu açık ve ticari olmayan bir lisansla paylaşılır, sürümler VirusTotal ile taranmıştır.

## 📥 İndir

**Kurulum** — yükleyiciyi indir.
**Taşınabilir** — ZIP'i indirip çıkart, ardından içindeki `RBX Cursor Studio.exe` dosyasını çalıştır — kuruluma gerek yok.

> En güncel sürümü [Releases](../../releases) sayfasından indir — yalnızca bu depodan indir.

### ❓ Windows "bilgisayarınızı korudu" uyarısı gösteriyor
Uygulama henüz kod imzalı değil, bu yüzden yeterince kişi indirene kadar SmartScreen uyarı verebilir — bu tek başına kötü amaçlı yazılım anlamına gelmez. **Diğer bilgiler → Yine de çalıştır** ile devam edebilirsin. Kaynak kod ve VirusTotal taramaları aşağıda.

### ❓ Animasyonlu imleç görünmüyor
- Exclusive tam ekran tüm overlay'leri engeller (Discord/Steam'de de aynı) — Roblox'u pencereli ya da borderless tam ekrana al.
- İlk animasyonu atadıktan sonra Roblox'u yeniden başlat.
- Çizimin çalıştığını doğrulamak için Animasyonlu sekmesindeki **Önizle**'yi dene.
- Animasyonun kısayolla (varsayılan `Ctrl+Alt+0`) kapatılmadığından emin ol.

## 🔧 Kaynak Koddan Derleme

**Windows kullanıcıları için hazır script'ler yeterli — terminale gerek yok** (`kur.bat` / `baslat.bat` / `exe_yap.bat`). Aşağıdaki adımlar manuel kurulum veya Windows dışı sistemler içindir.

Gereksinimler: Node.js 18+ ve npm. Animasyonlu imleçler için ayrıca bir C++ derleyicisi (MinGW `g++` ya da MSVC `cl.exe`) gerekir — yoksa `kur.bat` MinGW-w64'ü otomatik indirir (~260 MB, tek seferlik). Derleyici olmadan da uygulama çalışır, yalnızca animasyonlu imleçler devre dışı kalır. Kurulum ve Taşınabilir sürümler derlenmiş yardımcıyı zaten içerir, bu yalnızca kaynaktan derlerken geçerlidir.

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # geliştirme modunda çalıştır
npm run dist     # yükleyici ve taşınabilir exe oluştur
```

## 🛡️ VirusTotal

En son sürüm VirusTotal ile taranmıştır:
> **Antivirüs uyarıları hakkında:** Bazı motorlar (özellikle ESET gibi sezgisel tarayıcılar) Setup sürümünü şüpheli olarak işaretleyebilir. Bu bir **yanlış pozitif (false positive)**. Uygulama Roblox’a enjekte olmaz, bellek okumaz ve gizli exe indirip çalıştırmaz — güncellemeler yalnızca GitHub Releases sayfasını açar. Kaynak kodu açıktır; istersen kendin derleyebilirsin. Antivirüs dosyayı karantinaya alırsa istisna ekle veya Portable sürümü kullan.


- [🔍 Kaynak](https://www.virustotal.com/gui/file/549cf7cdcdfce502611a5059f7b9e5c795d22839280d975ce15f8202ff8f6e84?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/b58c19a78d8b8aef6455347c2782c9b2f70231db8c9d31f9a051a97684666132)
- [🔍 Portable](https://www.virustotal.com/gui/file/384b845d747200897a83684684ba31298dfdc3f5d52a6a16b6a059126782fa0c)

## ☕ Projeyi Destekle

RBX Cursor Studio ücretsizdir — desteğin, güncellemelerin ve yeni özelliklerin devam etmesini sağlar.

[☕ Bana bir kahve ısmarla](https://buymeacoffee.com/rbxcursor)

## 📄 Lisans

[PolyForm Noncommercial License 1.0.0](LICENSE) ile lisanslanmıştır.
Gerekli Bildirim: Telif Hakkı (c) 2026 Demhat Dayan

Kişisel, eğitim amaçlı ve ticari olmayan kullanım için ücretsizdir. **Ticari kullanım, yeniden satış veya kâr amaçlı dağıtım**, yazılı izin olmadan yapılamaz.
