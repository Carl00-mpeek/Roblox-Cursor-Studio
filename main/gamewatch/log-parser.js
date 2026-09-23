
function parsePlaceIdFromLine(_line) {
  return null;
}

function parsePlaceIdsFromLines(lines) {
  if (!Array.isArray(lines)) return [];
  const out = [];
  for (const line of lines) {
    const id = parsePlaceIdFromLine(line);
    if (id) out.push(id);
  }
  return out;
}

module.exports = { parsePlaceIdFromLine, parsePlaceIdsFromLines };
