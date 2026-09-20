<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio, bağımsız ve topluluk tarafından geliştirilmiş bir araçtır; **Roblox Corporation ile hiçbir bağlantısı yoktur**. Roblox'un belleğini okumaz, koduna müdahale etmez — yerel Roblox klasöründeki imleç görsellerini değiştirir ve (Animasyonlu İmleç özelliğinde) standart Windows API'leriyle ayrı bir overlay penceresi çizer. Roblox, oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım riski size aittir**.

# 🎨 RBX Cursor Studio

Roblox imleçlerini özelleştirmek için hafif bir Windows aracı.

**Güncel sürüm: 4.0.0**

![RBX Cursor Studio Ekran Görüntüsü]

## 🆕 4.0.0 ile Gelenler

- 🎨 **Bambaşka bir tasarım** — arayüzün tamamı yepyeni bir görünüm ve düzene geçti
- ✨ Özel bir görsel atadığın imleç kartlarının etrafında artık yumuşak bir parıltı efekti var
- 🖼️ Bağlamda Önizleme sahnesinde küçük bir cila (OYNA butonu, sohbet kutusu, Shift Lock)

## ✨ Özellikler

### 🖱️ İmleç Özelleştirme
Roblox'un tüm imleç türlerini (ok, uzak ok, I-beam, kilitli fare...) tek tek özelleştir ve seçtiğin görseli anında uygula. İmleçler 64×64 alana otomatik sığdırılır ve ortalanır; piksel netliği için yumuşatma kapalıdır.

### ✨ Animasyonlu İmleçler (.ANI) — 🧪 Beta
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

- [🔍 Kaynak](https://www.virustotal.com/gui/file/d6164ae95c241574d51e8ae521035cb12dbc00a99e30169d805f5ea60930262f?nocache=1)
- [🔍 Setup](https://www.virustotal.com/gui/file/931ff40b0d11505572b12e221d5063987da2312b91bbf7bde741a47b1fd42131?nocache=1)
- [🔍 Portable](https://virustotal.com/gui/file/0f88aa46f2d5400cc87f80cb897c2c1133e76265f2dbbc20ed9f7e9909974057?nocache=1)

## ☕ Projeyi Destekle

RBX Cursor Studio ücretsizdir — desteğin, güncellemelerin ve yeni özelliklerin devam etmesini sağlar.

[☕ Bana bir kahve ısmarla](https://buymeacoffee.com/rbxcursor)

## 📄 Lisans

[PolyForm Noncommercial License 1.0.0](LICENSE) ile lisanslanmıştır.
Gerekli Bildirim: Telif Hakkı (c) 2026 Demhat Dayan

Kişisel, eğitim amaçlı ve ticari olmayan kullanım için ücretsizdir. **Ticari kullanım, yeniden satış veya kâr amaçlı dağıtım**, yazılı izin olmadan yapılamaz.
