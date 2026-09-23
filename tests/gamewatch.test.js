
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { pickNewestLogFile, extractNewLines } = require(ROOT + '/main/gamewatch/log-watcher');
const { parsePlaceIdFromLine, parsePlaceIdsFromLines } = require(ROOT + '/main/gamewatch/log-parser');

let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad = 1; };

ok(pickNewestLogFile([]) === null, 'boş liste -> null');
ok(pickNewestLogFile(null) === null, 'null -> null (savunma)');
ok(pickNewestLogFile([{ name: 'not-a-log.txt', mtimeMs: 100 }]) === null, '.log olmayanlar sayılmıyor');
{
  const entries = [
    { name: 'a.log', mtimeMs: 100 },
    { name: 'b.log', mtimeMs: 300 },
    { name: 'c.log', mtimeMs: 200 },
    { name: 'ignore.txt', mtimeMs: 999 }
  ];
  ok(pickNewestLogFile(entries) === 'b.log', 'en yüksek mtime\'a sahip .log seçildi (b.log)');
}

{
  const full = Buffer.from('satır1\nsatır2\n', 'utf-8');
  const r1 = extractNewLines(full, 0);
  ok(r1.lines.length === 2 && r1.lines[0] === 'satır1' && r1.lines[1] === 'satır2', 'offset 0: tüm satırlar okundu');
  ok(r1.nextOffset === full.length, 'nextOffset dosya boyutuna eşit');

  const grown = Buffer.from('satır1\nsatır2\nsatır3\n', 'utf-8');
  const r2 = extractNewLines(grown, r1.nextOffset);
  ok(r2.lines.length === 1 && r2.lines[0] === 'satır3', 'sadece yeni eklenen satır okundu (tailing)');

  const r3 = extractNewLines(grown, r2.nextOffset);
  ok(r3.lines.length === 0, 'yeni satır yokken boş liste döner');

  const r4 = extractNewLines(Buffer.from('x'), 999);
  ok(r4.lines.length === 1 && r4.lines[0] === 'x', 'offset dosya boyutunu aşınca 0\'dan başlar (savunma)');

  const withCrlf = Buffer.from('a\r\n\r\nb\r\n', 'utf-8');
  const r5 = extractNewLines(withCrlf, 0);
  ok(r5.lines.length === 2 && r5.lines[0] === 'a' && r5.lines[1] === 'b', '\\r\\n ve boş satırlar doğru işleniyor');
}

{
  ok(parsePlaceIdFromLine('herhangi bir satır, placeId=123456789') === null,
    'parser henüz gerçek örnekler olmadan hiçbir şey çıkarmıyor (kasıtlı — bkz. log-parser.js notu)');
  ok(parsePlaceIdsFromLines(['a', 'b', 'placeId: 42']).length === 0,
    'parsePlaceIdsFromLines de aynı nedenle boş dizi döner');
  ok(parsePlaceIdsFromLines(null).length === 0, 'geçersiz girdi çökmüyor, boş dizi');

  const fs = require('fs');
  const fixturesDir = path.join(ROOT, 'tests', 'fixtures', 'roblox-logs');
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.log'));
  ok(files.length === 0, 'tests/fixtures/roblox-logs altında henüz gerçek örnek YOK (bekleniyor)');
}

process.exit(bad);
