# 03. API 요청과 응답

화면은 상대 경로로 API를 호출한다. 서버는 성공과 실패 모두 JSON으로 응답하며 `Cache-Control: no-store`를 설정한다. 아래 경로를 처리하는 함수만 `api/`에 둔다.

## 공통 입력 규칙

- POST는 `Content-Type: application/json`을 받는다. `charset` 같은 매개변수를 허용한다. 실제 읽은 본문이 8 KiB를 초과하면 읽기를 중단하고 `413`을 반환한다.
- POST의 최상위 값은 JSON 객체다. 표에 없는 필드, 필수 필드 누락, 잘못된 자료형과 JSON 구문 오류는 `400`이다.
- `preference`와 `body`는 `trim()` 적용 후 `Array.from(value).length`로 길이를 센다. 잘못된 유니코드 문자열과 NUL 문자는 `400`으로 처리한다.
- 지원하지 않는 메서드는 `405`와 지원 메서드를 담은 `Allow` 헤더를 반환한다. 응답 헤더와 브라우저 요청은 같은 사이트를 기준으로 구성한다.

## `POST /api/recommendations`

| 요청 필드 | 규칙 |
| --- | --- |
| `weather` | 필수 문자열. `clear` 맑음, `cloudy` 흐림, `rain` 비, `snow` 눈 |
| `mood` | 필수 문자열. `happy` 기분 좋음, `calm` 차분함, `sad` 울적함, `tired` 피곤함 |
| `preference` | 선택 문자열. 생략, 빈 문자열, 앞뒤 공백을 제거한 뒤 1~100자를 허용 |

```json
{
  "weather": "rain",
  "mood": "calm",
  "preference": "산책할 때 듣기 좋은 잔잔한 인디 음악"
}
```

`200`의 응답은 `playlistTitle` 문자열과 `tracks` 배열이다. `tracks`에는 `title`, `artist`, `reason` 문자열을 가진 곡이 정확히 다섯 개 들어간다. 형식, 길이, 중복 검사와 실패 처리는 [04-ai.md](04-ai.md)를 따른다.

## `POST /api/feedback`

| 요청 필드 | 규칙 |
| --- | --- |
| `submissionId` | 필수 문자열. 브라우저가 `crypto.randomUUID()`로 생성한 소문자 UUID v4 |
| `body` | 필수 문자열. 앞뒤 공백을 제거한 뒤 1~500자 |

처음 저장하면 `201`, 동일한 ID와 정리된 본문으로 재시도하면 `200`과 동일한 행을 반환한다. 같은 ID에 다른 본문을 보내면 `409`다. 성공 응답 형식은 아래와 같다.

```json
{
  "item": {
    "id": "c03d716d-f2e0-4694-a772-59e9d11597b9",
    "body": "비 오는 날 추천이 좋았어요.",
    "createdAt": "2026-11-11T09:00:00.123456Z"
  }
}
```

## `GET /api/feedback`

첫 요청은 쿼리 없이 보낸다. 이어지는 요청은 직전 응답의 `nextCursor`를 `?cursor=…`로 보낸다. `cursor`는 한 번만 지정할 수 있으며 빈 값은 유효하지 않다. `200`은 `{ "items": [], "nextCursor": null }` 형태다. `items`에는 위 `item` 형식의 행을 최대 20개 담는다. 다음 페이지가 있으면 `nextCursor`에 문자열을 넣고 마지막 페이지는 `null`을 넣는다. 목록이 비어 있을 때는 위의 빈 응답을 사용한다. 응답의 정렬과 커서 규칙은 [05-feedback.md](05-feedback.md)에 있다.

## 오류 응답

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "입력한 내용을 확인해 주세요."
  }
}
```

| HTTP | `error.code` | 조건 및 `error.message` |
| --- | --- | --- |
| `400` | `INVALID_INPUT` | 잘못된 JSON 또는 입력값. `입력한 내용을 확인해 주세요.` |
| `400` | `INVALID_CURSOR` | 잘못된 커서. `목록을 처음부터 다시 불러와 주세요.` |
| `405` | `METHOD_NOT_ALLOWED` | 지원하지 않는 메서드. `지원하지 않는 요청입니다.` |
| `409` | `FEEDBACK_CONFLICT` | 같은 전송 ID에 다른 본문. `피드백을 다시 보내 주세요.` |
| `413` | `PAYLOAD_TOO_LARGE` | 8 KiB를 넘는 본문. `요청이 너무 깁니다.` |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | JSON 형식이 아닌 요청. `요청 형식을 확인해 주세요.` |
| `502` | `AI_INVALID_RESPONSE` | 거절, 불완전한 응답 또는 형식 오류. `추천을 완성하지 못했어요. 다시 시도해 주세요.` |
| `503` | `AI_UNAVAILABLE` | OpenAI 호출 오류, 호출 제한 또는 할당량 부족. `지금은 추천을 받을 수 없어요. 잠시 후 다시 시도해 주세요.` |
| `503` | `FEEDBACK_UNAVAILABLE` | Supabase 저장 또는 조회 오류. `지금은 피드백을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.` |
| `503` | `CONFIG_UNAVAILABLE` | 해당 기능에 필요한 서버 설정 누락. `지금은 이 기능을 사용할 수 없어요.` |
| `504` | `AI_TIMEOUT` | OpenAI 응답 시간 초과. `추천 시간이 길어졌어요. 다시 시도해 주세요.` |
| `500` | `INTERNAL_ERROR` | 예상하지 못한 내부 오류. `문제가 발생했어요. 잠시 후 다시 시도해 주세요.` |

브라우저는 API 오류를 [02-ui.md](02-ui.md)의 영역별 안내에 연결한다. 응답이 없거나 JSON을 읽지 못하면 해당 영역의 재시도 메시지를 표시한다. 브라우저의 요청 제한 시간은 20초다. `INVALID_CURSOR`가 반환되면 목록 재시도 시 첫 페이지부터 다시 읽는다. `FEEDBACK_CONFLICT`가 반환되면 초안을 유지한 채 다음 수동 전송에서 새 UUID를 사용한다. 다른 전송 실패의 재시도에서는 같은 초안의 UUID를 유지한다.
