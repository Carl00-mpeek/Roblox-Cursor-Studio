// marker.h
// Saf (Windows'tan bagimsiz) yardimci: bir imlecin piksel verisinden
// "isaret degeri" (marker) cikarir.
//
// Neden var? Uygulama, ANI atanan durumlarin Roblox PNG'sini tamamen seffaf
// yapiyor. Seffaf PNG'ler birbirinden ayirt edilemedigi icin, Roblox'un
// "tiklanabilir seyin ustundeyim" (el) imlecine gectigini disaridan
// anlayamiyorduk. Cozum: seffaf PNG'nin butun piksellerine gozle gorulmeyecek
// kadar dusuk (alfa 3/255 gibi) durumuna ozel bir deger yaziyoruz. Helper,
// isletim sisteminin o an gosterdigi imlecin piksellerini okuyup bu degeri
// gorunce hangi Roblox imlecinin aktif oldugunu anliyor. Roblox'un bellegine
// dokunmak, hook, enjeksiyon YOK - sadece herkese acik GetCursorInfo/GetIconInfo.
//
// Donus degerleri:
//   kMarkerUnreadable (-2) = imlec okunamadi (GetIconInfo/GetDIBits basarisiz)
//   kMarkerReal       (-1) = gercek, gorunur bir imlec resmi (Roblox'un kendi imleci)
//   0                      = tam seffaf (isaretsiz) imlec, ornegin bosaltilmis ok
//   kMarkerHover      ( 3) = ArrowCursor.png  -> tiklanabilir seyin ustu (el)
//   kMarkerText       ( 5) = IBeamCursor.png  -> metin imleci
// (3 ve 5, package'daki main/anim-cursor.js MARKERS ile ayni olmali.)

#pragma once
#include <cstddef>
#include <cstdint>

static const int kMarkerUnreadable = -2;
static const int kMarkerReal = -1;
static const int kMarkerHover = 3;
static const int kMarkerText  = 5;

// px: 32-bit BGRA (ya da herhangi 4 kanalli) ham veri, len bayt.
// Herhangi bir bayt 15'ten buyukse gercek goruntulu imlec (kMarkerReal);
// aksi halde en buyuk bayt (0 = tam seffaf, 1..15 = isaret degeri).
static inline int ClassifyCursorPixels(const uint8_t* px, size_t len) {
    if (!px || len == 0) return kMarkerUnreadable;
    int mx = 0;
    for (size_t i = 0; i < len; i++) {
        int v = px[i];
        if (v > 15) return kMarkerReal;
        if (v > mx) mx = v;
    }
    return mx;
}
