// 인물별 최신 뉴스를 받아 data/news.json 으로 저장한다.
// GitHub Actions(서버)에서 실행되므로 브라우저의 CORS 제약이 없다 = 중계 프록시 불필요.
//
// 구글 뉴스는 데이터센터 IP를 종종 503으로 막는다. 그래서 Bing 뉴스를 예비 소스로 두고,
// 구글이 연속 실패하면 자동으로 Bing 으로 갈아탄다(차단기). 둘 다 실패하면 이전 데이터를 유지한다.
import { readFileSync, writeFileSync } from 'node:fs';

const PER_PERSON = 4;        // 인물당 저장할 기사 수
const GAP_MS = 700;          // 요청 간격(+지터)
const TIMEOUT_MS = 15000;
const ATTEMPTS = 2;          // 소스별 시도 횟수
const TRIP_AFTER = 5;        // 한 소스가 연속 N회 실패하면 이후 건너뜀

const peopleFile = new URL('../data/people.json', import.meta.url);
const newsFile = new URL('../data/news.json', import.meta.url);
const { people } = JSON.parse(readFileSync(peopleFile, 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = ms => ms + Math.floor(Math.random() * 400);

const SOURCES = [
  {
    name: 'google',
    url: q => 'https://news.google.com/rss/search?q=' +
      encodeURIComponent(q) + '&hl=ko&gl=KR&ceid=KR:ko'
  },
  {
    name: 'bing',
    url: q => 'https://www.bing.com/news/search?q=' +
      encodeURIComponent(q) + '&format=RSS&setmkt=ko-KR'
  }
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ENT[e] ?? _);

const tagText = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};

function parseItems(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const t = tagText(b, 'title');
    const l = tagText(b, 'link');
    if (!t || !l) continue;
    const raw = tagText(b, 'pubDate');
    const dt = raw ? new Date(raw) : null;
    out.push({ t, l, d: dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : '', src });
  }
  return out;
}

async function fetchFrom(source, query) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(source.url(query), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; future-founders-bot/1.0)' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const xml = await res.text();
      const items = parseItems(xml, source.name);
      if (!items.length) throw new Error('기사 없음');
      return items;
    } catch (e) {
      if (attempt === ATTEMPTS) throw e;
      await sleep(2000 * attempt);
    }
  }
}

// 페이지와 동일한 검색어 규칙: 이름 + 회사명 첫 토큰
const queryFor = p => `${p.name} ${String(p.company).split(/[ ·(]/)[0]}`.trim();

// 수집 실패 시 기존 뉴스를 유지한다(하루 실패로 데이터가 사라지지 않게).
let previous = {};
try { previous = JSON.parse(readFileSync(newsFile, 'utf8')).items ?? {}; } catch {}

const items = {};
const streak = Object.fromEntries(SOURCES.map(s => [s.name, 0]));
const used = Object.fromEntries(SOURCES.map(s => [s.name, 0]));
let fresh = 0, kept = 0;
const failed = [];

for (const p of people) {
  const query = queryFor(p);
  let got = null, lastErr = '';

  for (const source of SOURCES) {
    if (streak[source.name] >= TRIP_AFTER) continue;   // 차단기 동작 중 → 이 소스 건너뜀
    try {
      got = await fetchFrom(source, query);
      streak[source.name] = 0;
      used[source.name]++;
      break;
    } catch (e) {
      lastErr = `${source.name}: ${e.message}`;
      streak[source.name]++;
      if (streak[source.name] === TRIP_AFTER) {
        console.log(`  ⚠ ${source.name} 연속 ${TRIP_AFTER}회 실패 — 이후 건너뜁니다`);
      }
    }
  }

  if (got) {
    items[p.id] = got.slice(0, PER_PERSON);
    fresh++;
    console.log(`✓ ${p.name.padEnd(12)} [${got[0].src}] ${got[0].t.slice(0, 42)}`);
  } else {
    if (previous[p.id]) { items[p.id] = previous[p.id]; kept++; }
    failed.push(p.name);
    console.log(`✗ ${p.name.padEnd(12)} ${lastErr}${previous[p.id] ? ' (이전 데이터 유지)' : ''}`);
  }
  await sleep(jitter(GAP_MS));
}

console.log(`\n신규 ${fresh}명 / 이전유지 ${kept}명 / 실패 ${failed.length}명`);
console.log('소스별 성공: ' + SOURCES.map(s => `${s.name} ${used[s.name]}`).join(', '));

if (!fresh) {
  console.error('\n수집 성공 0건 — news.json 을 덮어쓰지 않고 실패로 종료합니다.');
  process.exit(1);
}

writeFileSync(newsFile, JSON.stringify({
  updated: new Date().toISOString(),
  sources: used,
  people: people.length,
  fresh,
  items
}, null, 1) + '\n', 'utf8');

if (failed.length) console.log('실패 인물: ' + failed.join(', '));
console.log('news.json 저장 완료');
