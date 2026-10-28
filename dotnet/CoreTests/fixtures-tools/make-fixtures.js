// Electron sürümünün JS kodunu kullanarak test girdileri ve beklenen sonuçları üretir.
// Kullanım: node make-fixtures.js <repo-kökü> <çıktı-klasörü>
const fs = require('fs');
const path = require('path');
const [repo, out] = process.argv.slice(2).map((p) => path.resolve(p));
const { buildZip } = require(path.join(repo, 'main/zip-lite.js'));
const fmt = require(path.join(repo, 'main/packs/pack-format.js'));
fs.mkdirSync(out, { recursive: true });

const TARGETS = { arrow: 'ArrowFarCursor.png', click: 'ArrowCursor.png', text: 'IBeamCursor.png', shiftlock: 'MouseLockedCursor.png' };
const orig = (f) => fs.readFileSync(path.join(repo, 'assets/originals', f));

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
function chunk(id, data) {
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(id, 'ascii'), u32(data.length), data, pad]);
}
function curFile(png, hx, hy) {
  const h = Buffer.alloc(6); h.writeUInt16LE(0, 0); h.writeUInt16LE(2, 2); h.writeUInt16LE(1, 4);
  const e = Buffer.alloc(16); e[0] = 32; e[1] = 32; e.writeUInt16LE(hx, 4); e.writeUInt16LE(hy, 6);
  e.writeUInt32LE(png.length, 8); e.writeUInt32LE(22, 12);
  return Buffer.concat([h, e, png]);
}
function makeAni(frames) {
  const anih = Buffer.alloc(36);
  [36, frames.length, frames.length, 32, 32, 32, 1, 6, 1].forEach((v, i) => anih.writeUInt32LE(v, i * 4));
  const fram = Buffer.concat([Buffer.from('fram', 'ascii'), ...frames.map((f) => chunk('icon', f))]);
  const body = Buffer.concat([Buffer.from('ACON', 'ascii'), chunk('anih', anih), chunk('rate', Buffer.concat([u32(6), u32(12)])), chunk('LIST', fram)]);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), u32(body.length), body]);
}

const png32 = orig('MouseLockedCursor.png');
const ani = makeAni([curFile(png32, 16, 16), curFile(png32, 4, 4)]);
const anis = {
  valid: ani,
  truncated: ani.subarray(0, ani.length - 30),
  badsig: Buffer.concat([Buffer.from('RIFX'), ani.subarray(4)]),
  noframes: makeAni([]),
  badicon: (() => { const b = Buffer.from(ani); const i = b.indexOf(Buffer.from('icon')); b.writeUInt16LE(7, i + 8 + 2); return b; })(),
  hugeoffset: (() => { const b = Buffer.from(ani); const i = b.indexOf(Buffer.from('icon')); b.writeUInt32LE(0xFFFFFF, i + 8 + 6 + 12); return b; })()
};
const expected = { ani: {}, png: {}, meta: [], json: {} };
for (const [k, v] of Object.entries(anis)) { fs.writeFileSync(path.join(out, `ani_${k}.ani`), v); expected.ani[k] = fmt.isValidAniBuffer(v); }

const pngs = {
  arrow: orig('ArrowFarCursor.png'),
  trailing: Buffer.concat([orig('ArrowCursor.png'), Buffer.from('EVIL')]),
  badcrc: (() => { const b = Buffer.from(orig('IBeamCursor.png')); b[b.length - 20] ^= 0xFF; return b; })(),
  notpng: Buffer.from('MZ this is not a png at all, padding padding padding padding')
};
for (const [k, v] of Object.entries(pngs)) { fs.writeFileSync(path.join(out, `png_${k}.png`), v); expected.png[k] = fmt.isStrictPng(v); }

const animFiles = { 'anim/arrow.ani': ani, 'anim/click.ani': ani };
const metaCases = [
  { animated: true, anim: { arrow: { ani: 'anim/arrow.ani', scale: 9, speed: '0.5', fps: 999.7, centerAuto: false, hotspotX: '12', hotspotY: -7 } }, global: { followMs: 100 } },
  { animated: true, anim: { arrow: { ani: '../../evil.ani' }, click: { ani: 'anim/click.ani', scale: 'abc' }, text: { ani: 'anim/CON.ani' } } },
  { animated: true, anim: { shiftlock: { ani: 'anim/missing.ani' } } },
  { animated: false, anim: { arrow: { ani: 'anim/arrow.ani' } } },
  { animated: true, anim: { click: { ani: 'anim\\click.ani', fps: 30.5, hotspotX: 5000 } }, global: { followMs: '3' } }
];
for (const m of metaCases) expected.meta.push({ raw: m, out: fmt.sanitizePackMeta(m, animFiles, Object.keys(TARGETS)) });

// JS üretimi bir paket (.rbxcursor), animasyon verisiyle
const meta = { animated: true, anim: { arrow: { ani: 'anim/arrow.ani', scale: 1.5, speed: 1, fps: 0, centerAuto: true, hotspotX: -1, hotspotY: -1 } }, global: { followMs: 8 }, favorite: true, tags: ['a', 'b'] };
const packBuf = fmt.serializePack({
  name: 'JS Paketi ğüş',
  cursorFiles: Object.values(TARGETS).map((f) => ({ file: f, data: orig(f) })),
  animMeta: { metaBuffer: Buffer.from(JSON.stringify(meta, null, 2)), aniEntries: [{ relPath: 'anim/arrow.ani', data: ani }] }
});
fs.writeFileSync(path.join(out, 'pack_js.rbxcursor'), packBuf);
// Zip slip denemesi içeren kötü niyetli paket
fs.writeFileSync(path.join(out, 'pack_evil.rbxcursor'), buildZip([
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ name: 'Evil' })) },
  { name: '../../ArrowFarCursor.png', data: orig('ArrowFarCursor.png') },
  { name: 'C:/x/ArrowCursor.png', data: orig('ArrowCursor.png') },
  { name: 'sub/IBeamCursor.png', data: orig('IBeamCursor.png') },
  { name: 'MouseLockedCursor.png', data: Buffer.from('not a png') },
  { name: 'anim/../x.ani', data: ani }
]));
const evil = fmt.deserializePack(fs.readFileSync(path.join(out, 'pack_evil.rbxcursor')), TARGETS);
expected.evil = { kinds: Object.keys(evil.fileMap).sort(), anim: Object.keys(evil.animFiles), name: evil.manifestName };

const cfgLike = { theme: 'red', clickSoundVolume: 0.6, windowBounds: { width: 1200, height: 760 }, list: [], obj: {}, neg: -1, big: 1700000000123, str: 'a"b\\c\n\tğ\u0001', nested: [1, [2, { x: null, y: true }]] };
fs.writeFileSync(path.join(out, 'json_input.json'), JSON.stringify(cfgLike));
expected.json.pretty = JSON.stringify(cfgLike, null, 2);
expected.json.lang = JSON.stringify(JSON.parse(fs.readFileSync(path.join(repo, 'dotnet/RBXCursorStudio/Resources/lang.json'), 'utf8')), null, 2);
fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify(expected, null, 2));
console.log('fixtures ok');
