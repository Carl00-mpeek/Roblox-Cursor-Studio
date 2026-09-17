<p align="center">
  <a href="README.md">🇬🇧 English</a> •
  <a href="README.tr.md">🇹🇷 Türkçe</a>
</p>

## ⚠️ Uyarı

RBX Cursor Studio bağımsız, topluluk tarafından geliştirilmiş bir araçtır ve **Roblox Corporation ile hiçbir bağlantısı, ortaklığı veya onayı yoktur**. "Roblox", Roblox Corporation'a ait bir ticari markadır. Bu araç yalnızca kendi cihazınızdaki yerel cursor dosyalarını değiştirir; Roblox oyun istemcisiyle etkileşime girmez, onu değiştirmez veya içine müdahale etmez.

# 🎨 RBX Cursor Studio

Roblox imleçlerini özelleştirmek için hafif bir Windows aracı.

![RBX Cursor Studio Ekran Görüntüsü](assets/screenshot.png)
*Örnek özel arkaplan ile gösterilmiştir — arkaplan kişiselleştirilebilir*

## ✨ Özellikler

### 🖱️ İmleç Özelleştirme
- Roblox'un tüm imleç türlerini (ok, uzak ok, I-beam, kilitli fare vb.) tek tek özelleştir
- Seçtiğin görseli tek tıkla anında Roblox'a uygula
- İmleçler 64×64 alana otomatik olarak dengeli biçimde sığdırılır ve ortalanır
- Piksel netliğini korumak için yumuşatma (anti-aliasing) kapalı tutulur

### 🎯 Gelişmiş İmleç Düzenleyici
- **Otomatik Boyutlandır + Ortala** — yüklenen görseli tek tıkla ideal boyuta getirir
- **Sadece Ortala** ve **Boyutu Sıfırla** kısayolları
- Kaydırma çubuğuyla manuel yakınlaştırma/uzaklaştırma (0.4x – 3x)
- Canvas üzerinde sürükle-bırak ile serbest konumlandırma
- **Renklendir** — siyah-beyaz bir imleci ton (hue) kaydırıcısıyla renkli hale getir
- **Renk Varyasyonları Oluştur** — tek tıkla aynı imlecin birden fazla renk seçeneğini üret

### 📦 Paket Sistemi
- İstediğin kadar imleç paketi oluştur, kaydet ve yönet
- Paketleri `.rbxcursor` / `.zip` olarak dışa aktar ve arkadaşlarınla paylaş
- Bir arkadaşının gönderdiği paket dosyasını sürükle-bırak ile içe aktar
- **Hızlı Paket Geçişi** — `Ctrl+Alt+1` / `Ctrl+Alt+2` / `Ctrl+Alt+3` kısayollarıyla, Roblox içindeyken bile kayıtlı paketler arasında anında geçiş yap

### 🕓 Geçmiş
- Daha önce seçtiğin tüm imleçleri ayrı bir Geçmiş sekmesinde görüntüle ve istediğin zaman tekrar uygula

### 🖼️ Bağlamda Önizleme
- Sahte bir Roblox ekranı (HUD, can/coin göstergesi, OYNA butonu, sohbet kutusu ve Shift Lock butonu dahil) üzerinde, gerçek boyutlarında imleç dene
- Shift Lock modunu simüle ederek imlecin o moddaki görünümünü test et

### 🔄 Otomatik Güncelleme Desteği
- En yeni Roblox istemci klasörünü otomatik olarak algılar
- Otomatik Düzeltme açıldığında, Roblox her güncellendiğinde kayıtlı imleçlerin **otomatik olarak yeniden kurulmasını** sağlar
- Orijinal Roblox imleçlerini yedekle ve tek tıkla geri yükle
- Roblox'un o an çalışıp çalışmadığını gösteren küçük, sürüklenebilir canlı durum rozeti

### 🎬 Kişiselleştirme
- Uygulamanın arkaplanını kendi görselinle değiştir, istediğinde varsayılana dön
- Uygulama genelinde sade ve modern, koyu temalı bir arayüz

### ⚙️ Ayarlar
- **Türkçe / İngilizce** arayüz, anlık dil değişimi
- **Windows başlangıcında otomatik açılma** seçeneği
- O an algılanan Roblox sürümünü Ayarlar ekranından görüntüleme

### 💻 Platform ve Dağıtım
- Hem taşınabilir (portable) exe hem de NSIS kurulum dosyası olarak dağıtılır
- Electron tabanlı, hafif ve arka planda gereksiz kaynak tüketmeyen bir yapı
- Kaynak koddan derlemek isteyenler için hazır `.bat` script'leri (`kur.bat` / `baslat.bat` / `exe_yap.bat`)
- %100 açık kaynak, sürümler VirusTotal ile taranmıştır
- Roblox'un oyun istemcisine asla müdahale etmez — yalnızca yerel imleç dosyalarını değiştirir

## 📥 İndir

### Kurulum
RBX Cursor Studio'yu bilgisayarına kurmak için yükleyiciyi indir.

### Taşınabilir (Portable)
Uygulamayı kurmadan taşınabilir sürümü kullan.

> En güncel sürümü [Releases](../../releases) sayfasından indirebilirsin.

## 🔧 Kaynak Koddan Derleme

### Taşınabilir
ZIP dosyasını indir ve çıkart, ardından çıkarttığın klasördeki `RBX Cursor Studio.exe` dosyasını çalıştır — kuruluma gerek yok.

**Windows kullanıcıları için: hazır script'ler yeterli — terminale gerek yok.**
Aşağıdaki adımlar manuel kurulum veya Windows dışı sistemler içindir.

> 🇹🇷 Türkçe kullanıcılar için: `kur.bat` / `baslat.bat` / `exe_yap.bat`

Gereksinimler: Node.js 18+ ve npm

```bash
git clone https://github.com/Carl00-mpeek/Roblox-Cursor-Studio.git
cd Roblox-Cursor-Studio
npm install
npm start        # geliştirme modunda çalıştır
npm run dist     # yükleyici ve taşınabilir exe oluştur
```

## 🛡️ VirusTotal

En son sürüm VirusTotal ile taranmıştır.

- [🔍 VirusTotal tarama sonuçlarını görüntüle](https://www.virustotal.com/gui/file/84e62bef7871c4ab44ca101b21ac84b84cea73d73513b36072f14e1c4accfb19?nocache=1)
- [🔍 Setup için VirusTotal tarama sonuçlarını görüntüle](https://www.virustotal.com/gui/file/ec33797c40e25e2f620e631eb58119b4f1f0d69c2e52c1c891b7fc7f2cab5fbf?nocache=1)

> **⚠️ VirusTotal Uyarısı**
> Bu dosya, **2/68** güvenlik sağlayıcısı tarafından (DeepInstinct ve Zillya) **yanlış pozitif (false positive)** olarak işaretlenmiştir.
> Bu durum, yeni derlenmiş ve imzalanmamış Electron uygulamalarında ve yükleyicilerinde sıkça karşılaşılan bir durumdur. "Downloader.Offloader" etiketi genellikle setup'ın normal dosya çıkartma davranışından kaynaklanır.
>
> **Diğer tüm büyük antivirüs motorları dosyayı temiz olarak raporlamaktadır.**
> Kaynak kod tamamen açık kaynaklıdır ve uygulama herhangi bir kötü amaçlı davranış içermemektedir.

## ☕ Projeyi Destekle

RBX Cursor Studio'yu beğendiysen, projeyi küçük bir bağışla destekleyebilirsin.

[☕ Projeyi Destekle](https://buymeacoffee.com/rbxcursor)

## 📄 Lisans

Bu proje [PolyForm Noncommercial License 1.0.0](LICENSE) ile lisanslanmıştır.
Gerekli Bildirim: Telif Hakkı (c) 2026 Demhat Dayan

Kişisel, eğitim amaçlı ve ticari olmayan kullanım için ücretsizdir. **Ticari kullanım, yeniden satış veya
kâr amaçlı dağıtım**, yazılı izin olmadan yapılamaz.
