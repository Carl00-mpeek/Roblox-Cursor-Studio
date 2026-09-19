<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Sorumluluk Reddi

RBX Cursor Studio, bağımsız ve topluluk tarafından yapılmış bir araçtır; Roblox Corporation ile **hiçbir bağlantısı, onayı veya ortaklığı yoktur**. "Roblox", Roblox Corporation'a ait bir ticari markadır.

Bu araç Roblox oyun istemcisinin kodu veya çalıştırılabilir dosyalarıyla etkileşime girmez, onları değiştirmez ve içlerine enjeksiyon yapmaz. Yalnızca yerel Roblox klasörünüzdeki cursor görsellerini değiştirir. Roblox, oyun dosyalarının değiştirilmesini resmi olarak desteklemez, bu yüzden **kullanım tamamen kendi sorumluluğunuzdadır**.

# 🎨 RBX Cursor Studio

Roblox cursor'larını özelleştirmek için hafif bir Windows aracı.

![RBX Cursor Studio Ekran Görüntüsü](assets/screenshot.tr.png)
*Özel bir arka planla gösterilmiştir. Arka planlar tamamen özelleştirilebilir.*

## ✨ Özellikler

### 🖱️ Cursor Özelleştirme
- Her Roblox cursor tipini ayrı ayrı özelleştir (ok, uzak ok, I-beam, fare kilitli vb.)
- Seçimini tek tıkla anında Roblox'a uygula
- Cursor'lar 64×64 tuval içinde otomatik olarak sığdırılır ve ortalanır
- Piksel kenarlarının net kalması için yumuşatma kapalıdır

### 🎯 Dahili Cursor Editörü
- **Otomatik Sığdır + Ortala**: içe aktardığın görseli tek tıkla ideal boyuta getirir
- **Sadece Ortala** ve **Boyutu Sıfırla** kısayolları
- İnce ayar için manuel yakınlaştırma kaydırıcısı (0.4x – 3x)
- Tuval üzerinde sürükle-bırak ile konumlandırma
- **Renklendir**: renkli bir cursor'un tonunu kaydırıcıyla değiştir (saf siyah veya beyazın tonu olmadığı için renklendirilemez)
- **Renk Varyasyonları Oluştur**: aynı cursor'dan tek tıkla birden fazla renk seçeneği üret

### 📦 Cursor Paketleri
- İstediğin kadar cursor paketi oluştur, kaydet ve yönet
- Paketleri `.rbxcursor` / `.zip` dosyası olarak dışa aktarıp arkadaşlarınla paylaş
- Sana gönderilen bir paketi sürükle-bırak ile içe aktar
- **Hızlı Paket Geçişi**: Roblox açıkken bile `Ctrl+Alt+1` / `Ctrl+Alt+2` / `Ctrl+Alt+3` ile kayıtlı paketler arasında anında geçiş yap

### 🕓 Geçmiş
- Daha önce seçtiğin tüm cursor'lara Geçmiş sekmesinden göz at ve istediğin zaman yeniden uygula

### 🖼️ Bağlam İçi Önizleme
- Cursor'larını sahte bir Roblox ekranında gerçek boyutunda test et (HUD, can/coin sayaçları, PLAY butonu, sohbet kutusu ve Shift Lock düğmesi dahil)
- Shift Lock modunu simüle ederek cursor'ın o durumda nasıl davrandığını gör

### 🔄 Otomatik Güncelleme Yönetimi
- En yeni Roblox istemci klasörünü otomatik olarak bulur
- Otomatik Yeniden Yükleme açıkken, kayıtlı cursor'ların **Roblox her güncellendiğinde otomatik olarak yeniden uygulanır**
- Orijinal Roblox cursor'larını yedekle ve tek tıkla geri yükle
- Küçük, sürüklenebilir bir canlı durum rozeti Roblox'un şu an çalışıp çalışmadığını gösterir

### 🌈 Toplu Renk Değiştirici
- **Rengi Değiştir**: şu an aktif olan tüm cursor'ları (Normal, Tıklama, Metin, Shift Lock) tek bir tonla aynı anda yeniden renklendir (saf siyah veya beyaz cursor'lar değişmez)
- Sadece rengi değiştirir, boyut veya konuma dokunmaz, yeniden ortalama gerekmez
- Canlı önizleme kaydırıcısı ve hızlı renk seçme şeridi
- Uygularken tüm cursor'lar anında kaydedilir ve Roblox'a yüklenir

### 🎬 Kişiselleştirme
- Uygulamanın arka planını kendi görselinle değiştir ya da varsayılana döndür
- Baştan sona temiz, modern, koyu temalı arayüz

### ⚙️ Ayarlar
- Anında dil değiştirme ile **Türkçe ve İngilizce** arayüz
- **Windows açılışında otomatik başlatma** seçeneği
- Ayarlar ekranından algılanan Roblox sürümünü görüntüleme

### 💻 Platform ve Dağıtım
- Hem **portable çalıştırılabilir dosya** hem de **NSIS kurulum dosyası** olarak mevcut
- Electron üzerine kurulu, hafif ve arka planda sıfır ek yük
- Kaynaktan derlemek için hazır `.bat` betikleri (`kur.bat` / `baslat.bat` / `exe_yap.bat`)
- Kaynak kodu herkese açık (ticari olmayan lisans, aşağıya bak), sürümler VirusTotal ile taranmıştır
- Oyunun koduna veya çalıştırılabilir dosyalarına dokunmaz, yalnızca Roblox klasöründeki cursor görsellerini değiştirir

## 📥 İndirme

### Setup
RBX Cursor Studio'yu bilgisayarına kurmak için kurulum dosyasını indir.

### Portable
Kurulum yapmadan kullanmak için portable sürümü indir: ZIP'i çıkar, çıkan klasördeki `RBX Cursor Studio.exe` dosyasını çalıştır. Kurulum gerekmez.

> En son sürümü [Releases](../../releases) sayfasından indir. Yalnızca bu deponun Releases sayfasından indir.

### ❓ Windows "Bilgisayarınızı korudu" uyarısı veriyor, neden?

Uygulama yeni ve dijital olarak imzalı olmadığı için Windows SmartScreen, yeterince indirme sayısına ulaşana kadar uyarı gösterebilir. Bu, tek başına zararlı yazılım göstergesi değildir.

Çalıştırmak için: **Ek bilgi → Yine de çalıştır**

Kaynak kodun tamamı bu sayfada görülebilir, her dosyanın VirusTotal tarama sonucu da aşağıdaki bölümde bağlantılıdır.

## 🔧 Kaynaktan Derleme

**Windows kullanıcıları için hazır betikler yeterlidir, terminal gerekmez.**
Aşağıdaki adımlar manuel kurulum veya Windows dışı sistemler içindir.

> 🇹🇷 Türkçe kullanıcılar için: `kur.bat` / `baslat.bat` / `exe_yap.bat`

Gereksinimler: Node.js 18+ ve npm

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # geliştirme modunda çalıştır
npm run dist     # kurulum dosyasını ve portable exe'yi derle
```

## 🛡️ VirusTotal

En son sürüm VirusTotal ile taranmıştır.

- [🔍 Kaynak için VirusTotal tarama sonuçlarını gör](https://www.virustotal.com/gui/file/1754a25acff19696e9c0a3533ae03a47a7ab21587bcb4fd3dcc570ef348d94e8?nocache=1)
- [🔍 Setup için VirusTotal tarama sonuçlarını gör](https://www.virustotal.com/gui/file/be9ee436b7a9a99e062b47f55d5e17690ec3a16ed35925c5633b96c46cc78edd?nocache=1)
- [🔍 Portable için VirusTotal tarama sonuçlarını gör](https://www.virustotal.com/gui/file/cfa3b29517a9660bfdd7dc92d99e0572c65bb8facd7a94d0ba2fa011afdb0dcf?nocache=1)

## ☕ Projeyi Destekle

RBX Cursor Studio'yu beğendiysen, küçük bir bağışla projeyi destekleyebilirsin.

[☕ Projeyi Destekle](https://buymeacoffee.com/rbxcursor)

## 📄 Lisans

Bu proje [PolyForm Noncommercial License 1.0.0](LICENSE) ile lisanslanmıştır.
Required Notice: Copyright (c) 2026 Demhat Dayan

Kişisel, eğitim amaçlı ve ticari olmayan kullanım için ücretsizdir. **Ticari kullanım, satış veya kâr amaçlı yeniden dağıtım** yazılı izin olmadan yasaktır.
