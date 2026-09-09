// 인물별 구글 뉴스 RSS를 받아 data/news.json 으로 저장한다.
// GitHub Actions(서버)에서 실행되므로 브라우저의 CORS 제약이 없다 = 중계 프록시 불필요.
import { readFileSync, writeFileSync } from 'node:fs';

const PER_PERSON = 4;      // 인물당 저장할 기사 수
const GAP_MS = 400;        // 요청 간격(구글 쪽 부담 최소화)
const TIMEOUT_MS = 15000;
const RETRIES = 3;

const peopleFile = new URL('../data/people.json', import.meta.url);
const newsFile = new URL('../data/news.json', import.meta.url);

const { people } = JSON.parse(readFileSync(peopleFile, 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ENT[e] ?? _);

function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
}

function parseItems(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const t = tagText(b, 'title');
    const l = tagText(b, 'link');
    if (!t || !l) continue;
    const raw = tagText(b, 'pubDate');
    const dt = raw ? new Date(raw) : null;
    out.push({
      t,
      l,
      d: dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : '',
      s: tagText(b, 'source')
    });
  }
  return out;
}

// 페이지와 동일한 검색어 규칙: 이름 + 회사명 첫 토큰
const queryFor = p => `${p.name} ${String(p.company).split(/[ ·(]/)[0]}`.trim();

async function fetchRss(query) {
  const url = 'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) + '&hl=ko&gl=KR&ceid=KR:ko';
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'future-founders-bot/1.0 (+github actions)' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const xml = await res.text();
      if (!xml.includes('<item')) throw new Error('기사 없음');
      return parseItems(xml);
    } catch (e) {
      if (attempt === RETRIES) throw e;
      await sleep(1200 * attempt);
    }
  }
}

// 수집 실패 시 기존 뉴스를 유지한다(하루 실패로 데이터가 사라지지 않게).
let previous = {};
try { previous = JSON.parse(readFileSync(newsFile, 'utf8')).items ?? {}; } catch {}

const items = {};
let ok = 0, kept = 0, failed = [];

for (const p of people) {
  const q = queryFor(p);
  try {
    const list = await fetchRss(q);
    if (list.length) {
      items[p.id] = list.slice(0, PER_PERSON);
      ok++;
      console.log(`✓ ${p.name.padEnd(12)} ${list.length}건 → ${list[0].t.slice(0, 45)}`);
    } else throw new Error('빈 결과');
  } catch (e) {
    if (previous[p.id]) { items[p.id] = previous[p.id]; kept++; }
    failed.push(p.name);
    console.log(`✗ ${p.name.padEnd(12)} ${e.message}${previous[p.id] ? ' (이전 데이터 유지)' : ''}`);
  }
  await sleep(GAP_MS);
}

if (!ok) {
  console.error('수집 성공 0건 — news.json 을 덮어쓰지 않고 종료합니다.');
  process.exit(1);
}

writeFileSync(newsFile, JSON.stringify({
  updated: new Date().toISOString(),
  source: 'Google News RSS',
  people: people.length,
  fresh: ok,
  items
}, null, 1) + '\n', 'utf8');

console.log(`\n완료 — 신규 ${ok}명 / 이전유지 ${kept}명 / 실패 ${failed.length}명`);
if (failed.length) console.log('실패: ' + failed.join(', '));
