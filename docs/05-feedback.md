# 05. Supabase 피드백 저장과 조회

사용자는 로그인 없이 규픽의 API를 통해 공개 피드백을 남기고 읽는다. 글 본문과 등록 시각은 화면 아래에 표시한다. 서버는 `@supabase/supabase-js`의 `createClient`에 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 전달한다. 세션 저장과 자동 갱신을 끄고 브라우저 인증 정보를 Supabase에 전달하지 않는다. [Supabase API 키와 서버 SDK](https://supabase.com/docs/guides/getting-started/api-keys)

## 테이블 마이그레이션

아래 SQL을 `supabase/migrations/20261111000000_create_feedback.sql`에 저장하고 Supabase SQL Editor에서 환경별로 한 번 적용한다. Supabase 프로젝트에서 Data API와 `public` 스키마 노출을 사용하며 `feedback`의 직접 접근은 아래 권한으로 제어한다.

```sql
begin;

create table public.feedback (
  id uuid primary key,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index feedback_newest_idx
  on public.feedback (created_at desc, id desc);

alter table public.feedback enable row level security;
revoke all on table public.feedback from public, anon, authenticated, service_role;
grant select, insert on table public.feedback to service_role;

commit;
```

RLS는 데이터베이스의 행 접근 제어다. 이 테이블에는 `anon`과 `authenticated`에 허용하는 정책을 만들지 않는다. 서버 전용 키는 `service_role`로 요청하므로 테이블의 `SELECT`와 `INSERT`를 부여한다. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Data API 권한](https://supabase.com/docs/guides/api/securing-your-api)

## 저장과 재시도

1. 브라우저는 처음 전송할 때 `crypto.randomUUID()`로 `submissionId`를 만든다. 같은 초안을 다시 보내는 동안에는 이 값을 유지하고, 정리된 본문을 바꾸면 새 ID를 만든다. 처리가 끝날 때까지 중복 클릭을 막는다.
2. 서버는 [03-api.md](03-api.md)의 규칙으로 입력을 검증하고 `id = submissionId`와 정리된 `body`를 INSERT한다. `created_at`은 DB가 설정한다. 저장된 `id`, `body`, `created_at`을 읽어 응답한다.
3. 기본 키가 이미 있어 `23505`가 발생하면 같은 ID를 조회한다. 정리된 본문이 같으면 기존 글을 `200`으로 반환하고, 다르면 `409`를 반환한다. 기존 본문과 등록 시각을 덮어쓰지 않는다.
4. Supabase 요청에 쿼리당 5초 제한을 적용한다. 응답 유실로 사용자에게 실패가 표시되어도 같은 ID로 다시 보내면 저장된 행을 확인할 수 있다. 저장 오류는 `503`으로 반환하고 브라우저에서 작성 내용을 유지한다.

## 최신순 전체 조회

1. Supabase에서 `created_at DESC, id DESC` 순으로 21개까지 읽는다. 시각이 같으면 UUID 내림차순으로 순서를 정한다.
2. 다음 요청의 커서가 가리키는 DB 시각과 ID를 각각 `t`, `id`라고 하면 `created_at < t OR (created_at = t AND feedback.id < id)`인 행만 읽는다. Supabase `.or()`에 넘기는 값은 검증한 시각과 UUID만 사용한다. [Supabase 복합 필터](https://supabase.com/docs/reference/javascript/or)
3. 화면에는 최대 20개를 보낸다. 21번째 행이 존재하면 반환한 20번째 행의 `createdAt`과 `id`로 다음 커서를 만든다. 그 외에는 `nextCursor: null`을 보낸다.
4. 커서는 `{ "createdAt": "…", "id": "…" }`의 UTF-8 JSON을 Base64URL로 인코딩한 문자열이다. 256자 이하와 Base64URL 문자 집합을 확인한 뒤 디코딩한다. 객체의 두 필드, 유효한 UTC 날짜·시각과 0~6자리 소수 초, 소문자 UUID v4를 검사한 뒤 조회에 사용한다. Supabase UTC 시각의 `+00:00` 접미사는 `Z`로 바꾸고 소수 초는 그대로 보존한다. 정렬과 커서 계산에 JavaScript `Date`로 다시 포맷한 값을 사용하지 않는다.
5. 화면은 `nextCursor`가 `null`이 될 때까지 자동으로 다음 페이지를 이어 읽는다. 이미 표시한 ID는 한 번만 렌더링한다. 조회 오류는 표시된 항목과 실패한 커서를 유지하고 수동으로 재시도한다. `INVALID_CURSOR`는 재시도 시 처음부터 다시 읽는다.
6. 등록에 성공하면 입력을 비우고 `등록했어요.`를 표시한다. 이전 목록 요청을 취소하거나 응답을 무시하고 첫 페이지부터 다시 읽는다. 새 첫 페이지가 성공하면 이전 목록을 교체한다. 첫 페이지 갱신에 실패하면 기존 글을 유지하고 목록 영역에 별도 오류를 표시한다.
