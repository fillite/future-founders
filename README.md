# 🌍 미래를 만드는 사람들

타임 · 포춘이 주목한 인물에서 **미래에 큰 수익을 가져다줄 기업**을 먼저 찾기 위한 투자 스카우팅 아카이브.

## 어떻게 스스로 업데이트되나

브라우저는 보안(CORS) 때문에 뉴스 사이트를 직접 못 읽는다. 예전에는 무료 중계 프록시를 썼는데
서비스가 죽으면서 통째로 멈췄다. 그래서 **수집을 서버(GitHub Actions)로 옮겼다.**

```
매일 06:00 (한국시간)
  GitHub Actions ─▶ scripts/fetch-news.mjs ─▶ 구글 뉴스 RSS 45명분 수집
                                            ─▶ data/news.json 커밋
                     ▲ 서버라서 CORS 없음 = 중계 프록시 불필요

index.html 열 때
  ① 내장 데이터로 즉시 화면 표시 (오프라인에서도 동작)
  ② raw.githubusercontent.com 에서 news.json / people.json 을 받아 최신으로 덮어씀
```

내 PC를 켜둘 필요도, 명령 창을 띄울 필요도 없다. 바탕화면의
`미래를 만드는 사람들.bat` 을 더블클릭하면 항상 최신 뉴스가 붙어 있다.

## 파일

| 경로 | 역할 |
|---|---|
| `index.html` | 웹앱 본체 (단일 파일) |
| `data/people.json` | **인물 목록 원본** — 여기를 고치면 앱에 바로 반영 |
| `data/news.json` | 자동 수집된 인물별 최신 기사 (직접 수정하지 말 것) |
| `scripts/fetch-news.mjs` | 뉴스 수집기 (GitHub Actions가 실행) |
| `scripts/extract-people.mjs` | `index.html` 의 내장 목록 → `people.json` 추출 |
| `.github/workflows/update-news.yml` | 매일 자동 실행 설정 |

## 인물을 추가하려면

`data/people.json` 의 `people` 배열에 항목을 추가하고 커밋하면 된다.
푸시 즉시 뉴스 수집이 다시 돌고, 앱을 다시 열면 새 인물이 보인다.

```json
{
  "id": "고유id",
  "name": "한글 이름",
  "en": "English Name",
  "company": "기업명 (창업)",
  "region": "us | kr | cn | jp | eu | etc",
  "fields": ["AI"],
  "founded": "2025",
  "hot": true,
  "honors": ["수상/인정"],
  "desc": "왜 주목해야 하는가",
  "link": "https://"
}
```

## 수동으로 즉시 갱신하기

저장소 → **Actions** → *뉴스 자동 갱신* → **Run workflow**

## 한계

뉴스 수집은 자동이지만 **"누구를 목록에 넣을지"는 판단이 필요해 자동화하지 않았다.**
새 창업자 발굴은 사람이(또는 AI에게 요청해) 주기적으로 갱신한다.
