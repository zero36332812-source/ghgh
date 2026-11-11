# 06. 검증 및 완료 기준

이 문서는 규픽 구현 후 실행할 검증 절차를 정한다. 아래 항목은 구현 전 기준이며 실행 결과는 구현 후 기록한다.

## 실행 환경과 순서

1. Node.js 22 환경에서 의존성을 설치하고 `npx vercel dev`로 서버를 시작한다. 터미널이 출력한 주소에서 `/`와 `/api/feedback`이 같은 서버로 응답하는지 확인한다. Windows에서도 브라우저 개발자 도구로 아래 API 검증을 실행할 수 있다.
2. 테스트용 Supabase 프로젝트에 마이그레이션을 적용한다. 목록 순서와 저장 결과는 테스트 프로젝트에서만 검증한다. 아래 42개 데이터 검증은 피드백이 비어 있는 테스트 DB에서 시작한다.
3. 강제로 만들기 어려운 OpenAI 거절·시간 초과, Supabase 장애, 응답 유실은 테스트에서 외부 호출을 대신하는 가짜 응답으로 재현한다. 정상 경로와 고장 경로의 실제 사용 여부를 검증 기록에 구분한다. 테스트 전용 설정은 배포에 포함하지 않는다.
4. Vercel Preview의 환경 변수에 실제 OpenAI 테스트 키와 테스트 Supabase 연결 정보를 넣고 Preview로 배포한다. 실제 키가 없는 항목은 `미검증`으로 남긴다. Preview에 접속하려면 프로젝트 설정에 따라 배포 권한이 필요할 수 있다. 서비스 자체의 로그인 없는 이용은 배포 보호가 걸리지 않은 검증 주소에서도 확인한다.

## 화면 및 추천 검증

| ID | 실행 | 통과 기준 |
| --- | --- | --- |
| UI-01 | 데스크톱과 너비 320px, 360px의 모바일 화면에서 `/`를 열고 추천 영역부터 페이지 맨 아래까지 읽는다. | 날씨·기분 선택, 추천 버튼, 공개 피드백 폼과 목록을 사용할 수 있다. 가로 스크롤 없이 입력과 오류 문구가 보인다. 서비스 가입이나 로그인 절차 없이 두 기능을 이용한다. |
| UI-02 | 키보드 Tab, 방향키, Space, Enter로 폼을 조작한다. 필수 선택을 비우고 추천을 시도한다. | 초점 위치가 보이고 입력 요소의 이름을 읽을 수 있다. 누락한 값을 입력할 수 있도록 안내하며 추천 API를 호출하지 않는다. |
| REC-01 | 맑음·기분 좋음을 선택해 `추천받기`를 누른다. 네트워크 요청과 화면을 확인한다. | `clear`, `happy`를 담은 요청 한 건이 전송된다. 처리 중 중복 클릭으로 추가 호출이 발생하지 않는다. 성공하면 플레이리스트 제목과 서로 다른 5곡의 제목, 아티스트, 추천 이유가 보인다. 버튼 문구가 `다시 추천`으로 바뀐다. |
| REC-02 | 값 변경 없이 `다시 추천`을 누른다. 이어서 같은 조건의 재요청에 가짜 503 응답을 적용한다. | 같은 조건에서 새 POST가 전송된다. 성공하면 결과가 갱신된다. 재요청 실패 시 기존 결과와 새 오류 메시지가 함께 보이며 재시도할 수 있다. |
| REC-03 | 결과가 보이는 상태에서 날씨, 기분, `듣고 싶은 음악`을 하나씩 바꾼다. 새 요청 중에는 입력을 바꿔 본다. | 값을 변경할 때마다 기존 결과가 지워지고 `추천받기`가 표시된다. 처리 중에는 추천 입력이 잠긴다. |
| REC-04 | 가짜 OpenAI 응답으로 15초 시간 초과, 일시적 장애·사용량 제한, 잘못된 구조·거절·불완전한 응답을 각각 만든다. | 순서대로 API가 504, 503, 502를 응답한다. 화면에서 오류와 재시도 방법을 읽을 수 있다. 잘못된 곡 목록이나 외부 서비스의 오류 원문이 보이지 않는다. |
| REC-05 | 브라우저에서 API 연결을 끊거나 20초 넘게 응답을 멈추게 한다. 서버에서 OpenAI 환경 변수를 비운 사례도 검증한다. | 브라우저가 대기 상태에서 벗어나 재시도를 제공한다. 환경 변수 누락 시 API는 503 `CONFIG_UNAVAILABLE`을 반환하고 키 이름이나 값이 사용자 화면에 노출되지 않는다. |

## API 입력과 피드백 검증

테스트 주소의 브라우저 개발자 도구 콘솔에서 아래 함수를 한 번 정의한다. POST 데이터는 JSON으로 보내며 HTTP 상태와 응답 본문을 함께 표시한다.

```js
const api = async (path, init = {}) => {
  const response = await fetch(path, init)
  const content = await response.text()
  try {
    return { status: response.status, data: JSON.parse(content) }
  } catch {
    return { status: response.status, data: content }
  }
}
const post = (path, body) => api(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const rec = '/api/recommendations'
const fb = '/api/feedback'
const sampleRec = { weather: 'rain', mood: 'sad', preference: '잔잔한 피아노' }
```

| ID | 실행 | 통과 기준 |
| --- | --- | --- |
| API-01 | `await post(rec, sampleRec)`를 실행한다. `weather`에 `clear`, `cloudy`, `rain`, `snow`, `mood`에 `happy`, `calm`, `sad`, `tired`를 넣은 경우도 가짜 AI 응답으로 확인한다. | 각 유효한 값이 허용된다. HTTP 200 응답에 비어 있지 않은 `playlistTitle`과 `title`, `artist`, `reason`을 가진 곡 5개가 있다. 동일한 제목·아티스트 조합이 반복되지 않는다. |
| API-02 | `await post(rec, { weather: 'fog', mood: 'calm' })`, `await post(rec, { weather: 'clear' })`, `await post(rec, { ...sampleRec, preference: '🌧'.repeat(101) })`를 각각 실행한다. 마지막 예시를 `preference: '  ' + '🌧'.repeat(100) + '  '`로 바꿔 실행한다. | 앞의 세 요청은 400이다. 마지막 예시는 앞뒤 공백을 제거한 100개 유니코드 코드 포인트를 허용한다. 선택 항목 `preference`를 생략해도 정상 처리된다. |
| API-03 | 두 POST 경로에 `Content-Type: application/json`과 `body: '{'`를 보낸다. 이어 `Content-Type: text/plain` 요청과 UTF-8 8,193바이트 JSON 요청을 각각 보낸다. `await api(rec)` 및 `await api(fb, { method: 'PUT' })`도 실행한다. | 순서대로 400, 415, 413, 405가 반환된다. 거부된 요청으로 OpenAI 호출이나 Supabase 저장이 발생하지 않는다. |
| API-04 | `await api(fb + '?cursor=broken-cursor')`를 실행한다. 빈 커서와 커서가 두 번 들어간 쿼리도 확인한다. | 세 경우 모두 400 `INVALID_CURSOR`다. 화면에서 목록을 다시 불러오면 첫 페이지부터 요청한다. |
| FB-01 | 아래 동일 UUID 재전송 예시를 실행한다. 피드백 검증용 Supabase의 `public.feedback` 테이블에서 해당 ID를 조회한다. | 첫 응답은 201, 같은 내용 재전송은 200, 같은 ID의 다른 내용은 409다. 첫 두 응답의 `item`이 일치하며 DB에는 앞뒤 공백을 제거한 본문과 서버 저장 시각을 가진 행 한 개가 있다. |
| FB-02 | 새 `submissionId`로 빈 본문, 공백만 있는 본문, `'🙂'.repeat(501)`을 각각 전송한다. UUID가 `invalid`인 요청과 정상 UUID에 `'🙂'.repeat(500)`인 요청도 보낸다. | 앞의 네 요청은 400이다. 마지막 요청은 201이며 화면과 서버의 길이 기준이 유니코드 코드 포인트 단위로 일치한다. |
| FB-03 | 화면에서 피드백을 작성하고 등록한다. 처리 중 버튼을 연타한다. 등록 완료 후 새로고침한다. | 폼에 전체 방문자에게 공개된다는 안내가 있다. 신규 등록은 한 건이며 저장 성공 뒤 입력이 지워진다. 목록이 첫 페이지부터 다시 읽히고 새 글이 맨 위에 보인다. 새로고침한 방문자도 같은 글을 볼 수 있다. |
| FB-04 | Supabase에 대한 저장 호출을 실패시키거나 5초 응답 제한을 넘기고 같은 폼을 확인한다. 별도 실행에서 DB에 저장된 뒤 브라우저 응답만 유실시키고 같은 글을 재전송한다. | 저장 장애는 503이며 입력이 유지된다. 응답 유실 뒤 동일 UUID 재시도로 DB 행이 추가되지 않는다. 저장 확인 뒤에는 입력을 지우고 목록을 갱신한다. |
| FB-05 | 목록의 두 번째 페이지를 읽는 도중 503을 반환한 뒤 재시도한다. 별도 실행에서 피드백 POST는 성공시키고 직후 목록의 첫 GET을 실패시킨다. | 다음 페이지 실패 시 기존 글과 실패 직전 커서가 유지된다. 재시도는 그 페이지부터 진행된다. 저장 성공 뒤 첫 GET이 실패하면 저장 완료와 목록 오류를 각각 알리고 목록 재시도로 복구한다. 글을 다시 저장하는 요청은 발생하지 않는다. |
| FB-06 | 새 테스트 프로젝트에서 아직 저장된 글 없이 화면을 연다. 이어 `<b>검증</b>`를 저장해 화면과 DOM을 살핀다. | 처음에는 빈 목록 안내가 보인다. 등록한 `<b>검증</b>` 문자열은 화면에 글자 그대로 보이며 본문에서 새 `<b>` 요소가 생기지 않는다. 본문 렌더링은 `textContent`를 사용한다. |

API-03에서 정확히 8,193바이트인 유효 JSON을 만드는 예시다. 요청 바이트 수를 판단할 때 `TextEncoder`의 UTF-8 길이를 사용한다.

```js
const json = JSON.stringify(sampleRec)
const largeJson = json + ' '.repeat(8193 - new TextEncoder().encode(json).length)
const jsonHeaders = { 'Content-Type': 'application/json' }
await api(rec, { method: 'POST', headers: jsonHeaders, body: '{' })
await api(rec, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: json })
await api(rec, { method: 'POST', headers: jsonHeaders, body: largeJson })
```

FB-01의 같은 UUID 재전송 예시다. 각 실행에서 새 `submissionId`를 사용한다.

```js
const submissionId = crypto.randomUUID()
await post(fb, { submissionId, body: '  검증용 피드백입니다.  ' })
await post(fb, { submissionId, body: '검증용 피드백입니다.' })
await post(fb, { submissionId, body: '같은 ID로 바뀐 내용' })
```

## Supabase 및 전체 목록 검증

| ID | 실행 | 통과 기준 |
| --- | --- | --- |
| DB-01 | 테스트 Supabase의 SQL Editor에서 RLS·권한 검증 쿼리를 실행한다. | `rls_enabled`, `anon_denied`, `authenticated_denied`, `server_can_read_and_insert`가 모두 `true`다. 공개 목록을 읽고 글을 쓰는 방문자는 Vercel API를 이용한다. |
| DB-02 | 비어 있는 테스트 DB에 아래 SQL로 같은 시각을 가진 42행을 넣고 화면을 새로고침한다. 개발자 도구의 네트워크 탭에서 연속 GET 응답을 확인한다. | 클릭 없이 20개, 20개, 2개를 차례로 받는다. `nextCursor`가 `null`인 세 번째 응답 뒤 자동 조회가 끝난다. 전체 42개 ID가 한 번씩 나타나고 UI 순서가 SQL 정렬 결과와 같다. |
| DB-03 | DB-02 상태에서 폼으로 새 글을 등록한다. | 새 행의 `created_at`은 서버에서 정해지며 기존 42행보다 최신이다. 새로 읽은 목록 첫 글이 새 행이고, 끝까지 43개를 중복 없이 볼 수 있다. |

RLS·권한 검증 쿼리다. `has_table_privilege`에서 쉼표로 나열한 권한 중 하나라도 있으면 `true`이므로 공개 역할에서는 결과를 반전한다. 서버 역할은 필요한 두 권한을 따로 확인한다.

```sql
select
  c.relrowsecurity as rls_enabled,
  not has_table_privilege('anon', 'public.feedback', 'SELECT, INSERT, UPDATE, DELETE') as anon_denied,
  not has_table_privilege('authenticated', 'public.feedback', 'SELECT, INSERT, UPDATE, DELETE') as authenticated_denied,
  has_table_privilege('service_role', 'public.feedback', 'SELECT')
    and has_table_privilege('service_role', 'public.feedback', 'INSERT') as server_can_read_and_insert
from pg_class c
where c.oid = 'public.feedback'::regclass;
```

다음 SQL은 **피드백이 비어 있는 테스트 프로젝트**에서만 사용한다. 검증을 마치고 이 42행을 지울 때는 아래와 같은 시각과 접두사를 함께 조건으로 사용한다.

```sql
insert into public.feedback (id, body, created_at)
select gen_random_uuid(), '검증용 동일시각 #' || n,
  timestamptz '2020-01-01 00:00:00+00'
from generate_series(1, 42) as sample(n);

select id, body, created_at
from public.feedback
order by created_at desc, id desc;
```

## Vercel Preview 확인

| ID | 실행 | 통과 기준 |
| --- | --- | --- |
| DEP-01 | Node.js 22, Other 프리셋, 정적 출력 `public`을 확인한 뒤 Preview HTTPS URL을 연다. 브라우저에서 CSS·JS, `/api/recommendations`, `/api/feedback` 요청을 확인한다. | 정적 화면과 API가 동일한 HTTPS 호스트에서 동작한다. 페이지 소스와 전달되는 JS·요청·응답에 OpenAI와 Supabase 비밀키가 없다. |
| DEP-02 | 실제 OpenAI 연결로 비·울적함을 선택하고 `잔잔한 피아노`를 입력한다. 맑음·기분 좋음도 별도로 실행한다. 두 결과의 곡명과 아티스트 조합을 음악 서비스 검색에서 수동 확인한다. | 각각 200 응답과 5곡이 화면에 표시된다. 각 곡의 실재 여부와 아티스트 일치를 기록하고 추천 이유가 입력 조건과 이어지는지 확인한다. |
| DEP-03 | Preview에서 실제 테스트 Supabase 연결로 등록한 글을 새 비공개 브라우저 창에서 확인한다. | 서비스 로그인 없이 글을 등록하고 읽을 수 있다. 새 창에서도 최신 글이 맨 위에 보인다. DB 행과 화면 본문이 일치한다. |

검증 기록에는 항목 ID, 실행 환경, 외부 서비스의 실제 호출 여부, 결과, 실패 시 재현 방법을 남긴다. 완료 판정에는 기능별 테스트 통과와 Preview 실제 연동 확인이 모두 필요하다.
