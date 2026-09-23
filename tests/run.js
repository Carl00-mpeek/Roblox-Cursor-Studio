
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;

function findTestFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => path.join(dir, f));
}

const files = findTestFiles(TESTS_DIR);
if (!files.length) {
  console.log('Çalıştırılacak test bulunamadı (tests/*.test.js).');
  process.exit(1);
}

console.log(`${files.length} test dosyası bulundu.\n`);

let failed = 0;
const results = [];

for (const file of files) {
  const rel = path.relative(path.join(TESTS_DIR, '..'), file);
  console.log(`\n▶ ${rel}`);
  console.log('─'.repeat(60));
  const res = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    cwd: path.join(TESTS_DIR, '..')
  });
  const ok = res.status === 0 && !res.error;
  if (!ok) failed++;
  results.push({ file: rel, ok, status: res.status, error: res.error });
}

console.log('\n' + '='.repeat(60));
console.log('Özet:');
for (const r of results) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.file}${r.ok ? '' : ` (exit ${r.status}${r.error ? ', ' + r.error.message : ''})`}`);
}
console.log('='.repeat(60));

if (failed) {
  console.log(`\n${failed}/${files.length} test dosyası BAŞARISIZ.`);
  process.exit(1);
}
console.log(`\nTüm testler geçti (${files.length}/${files.length}).`);
process.exit(0);
