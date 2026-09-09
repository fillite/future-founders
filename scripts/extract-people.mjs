// index.html 안의 SEED 배열을 그대로 뽑아 data/people.json 으로 저장한다.
// 인물 목록의 "원본"을 GitHub 쪽으로 옮기기 위한 1회성/재사용 도구.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const start = html.indexOf('const SEED=[');
if (start < 0) throw new Error('SEED 배열을 찾지 못했습니다.');

// 대괄호 깊이를 세어 배열의 끝을 정확히 찾는다(문자열 안의 괄호는 무시).
const from = html.indexOf('[', start);
let depth = 0, end = -1, quote = null;
for (let i = from; i < html.length; i++) {
  const c = html[i], prev = html[i - 1];
  if (quote) { if (c === quote && prev !== '\\') quote = null; continue; }
  if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) throw new Error('SEED 배열의 끝을 찾지 못했습니다.');

const people = eval(html.slice(from, end + 1));
if (!Array.isArray(people) || !people.length) throw new Error('SEED 파싱 결과가 비었습니다.');

const ids = people.map(p => p.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) throw new Error('중복된 id: ' + dupes.join(', '));

writeFileSync(
  new URL('../data/people.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString(), count: people.length, people }, null, 1) + '\n',
  'utf8'
);
console.log(`people.json 저장 완료 — ${people.length}명`);
