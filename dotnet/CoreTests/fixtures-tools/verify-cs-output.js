// C# testinin ürettiği dosyaları Electron sürümünün JS kodu ile doğrular.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const [repo, dir] = process.argv.slice(2).map((p) => path.resolve(p));
const fmt = require(path.join(repo, 'main/packs/pack-format.js'));
const TARGETS = { arrow: 'ArrowFarCursor.png', click: 'ArrowCursor.png', text: 'IBeamCursor.png', shiftlock: 'MouseLockedCursor.png' };
let fail = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

const pack = fmt.deserializePack(fs.readFileSync(path.join(dir, 'pack_cs.rbxcursor')), TARGETS);
check(pack.manifestName === 'C# Paketi çöİ', 'JS, C# paketinin adını okur: ' + pack.manifestName);
check(Object.keys(pack.fileMap).length === 4, 'JS, C# paketindeki 4 PNG\'yi kabul eder');
check(pack.metaRaw && pack.metaRaw.anim.arrow && pack.metaRaw.anim.arrow.scale === 2, 'JS, C# paketinin pack-meta.json verisini okur');
check(Object.keys(pack.animFiles).length === 1, 'JS, C# paketindeki .ani dosyasını kabul eder');

for (const m of [0, 3, 5]) {
  const png = fs.readFileSync(path.join(dir, `transparent_${m}.png`));
  check(fmt.isStrictPng(png), `C# şeffaf PNG (marker ${m}) JS sıkı PNG doğrulamasından geçer`);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const idatLen = png.readUInt32BE(33);
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
  let ok = raw.length === h * (1 + w * 4);
  for (let y = 0; y < h && ok; y++) {
    if (raw[y * (1 + w * 4)] !== 0) ok = false;
    for (let i = 1; i <= w * 4; i++) if (raw[y * (1 + w * 4) + i] !== m) { ok = false; break; }
  }
  check(ok, `C# şeffaf PNG (marker ${m}) piksel verisi doğru (${w}x${h})`);
}
process.exit(fail ? 1 : 0);
