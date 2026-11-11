# 01. 프로젝트 생성과 배포

## 서비스 구성

브라우저는 HTML, CSS, JavaScript로 화면을 그린다. 같은 사이트의 `/api/…`로 요청하면 Vercel의 Node.js 함수가 OpenAI에 추천을 요청하거나 Supabase에서 피드백을 저장·조회한다. 브라우저의 요청에는 규픽의 입력값만 담긴다.

## 구현할 파일 구조

```text
gyupick/
├── AGENTS.md
├── PRD.md
├── docs/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── api/
│   ├── recommendations.js
│   └── feedback.js
├── server/
│   ├── http.js
│   ├── recommendations.js
│   └── feedback.js
├── supabase/
│   └── migrations/
│       └── 20261111000000_create_feedback.sql
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── vercel.json
```

`public/`은 브라우저에 제공할 파일, `api/`는 HTTP 진입점, `server/`는 입력 검사와 외부 연동 코드에 사용한다. 각 함수는 Vercel Node.js Web Handler인 `export default { async fetch(request) { … } }`로 작성하고 JSON `Response`를 반환한다.

## 로컬에서 실행

1. Node.js 22.x를 준비하고 프로젝트 루트에서 `npm init -y`를 실행한다. `package.json`에 `"private": true`, `"type": "module"`, `"engines": { "node": "22.x" }`를 설정한다.
2. `npm install openai zod @supabase/supabase-js`와 `npm install -D vercel`을 실행한다. 생성된 `package-lock.json`을 함께 관리하고 이후 설치는 `npm ci`를 사용한다.
3. `vercel.json`의 `functions`에서 `"api/*.js": { "maxDuration": 30 }`을 지정한다.
4. 테스트용 Supabase 프로젝트의 SQL Editor에서 [05-feedback.md](05-feedback.md)의 마이그레이션을 적용한다.
5. 아래 변수를 Vercel 프로젝트의 Development 환경에 등록한다. 프로젝트 루트에서 `npx vercel link`로 해당 프로젝트를 연결하고 `npx vercel dev`를 실행한다. 브라우저에서 터미널에 표시된 주소를 연다. 기본 주소는 `http://localhost:3000`이다.

Vercel의 Other 프리셋을 사용한다. Build Command를 비워 두고 정적 출력 디렉터리는 `public`으로 설정한다. Dev Command는 기본값을 유지한다. [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build), [Node.js 함수](https://vercel.com/docs/functions/runtimes/node-js), [로컬 개발 명령](https://vercel.com/docs/cli/dev), [함수 실행 시간 설정](https://vercel.com/docs/functions/configuring-functions/duration)

## 서버 환경 변수

| 이름 | 등록할 값 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API 프로젝트에서 발급한 키 |
| `OPENAI_MODEL` | 구조화 출력을 지원하는 모델 ID. 초기 설정값은 `gpt-4.1-mini` |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase 프로젝트의 `sb_secret_…` 키 |

`.env.example`에는 이름과 공개 가능한 예시값만 쓴다. `.gitignore`에 `node_modules/`, `.vercel/`, `.env*`를 넣고 `!.env.example`을 추가한다. 실제 키는 Vercel 프로젝트 설정과 서버에서만 다룬다. 프로젝트에 모델 접근 권한이 있는지는 첫 실연동 요청으로 확인한다. [OpenAI 모델 문서](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Supabase 키 문서](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel 환경 변수](https://vercel.com/docs/environment-variables)

## Vercel에 배포

1. Development와 Preview에는 테스트 Supabase 설정을 사용한다. Production에는 운영 Supabase 설정을 등록하고 동일한 마이그레이션을 적용한다.
2. `npx vercel deploy`로 Preview를 만든다. 출력된 HTTPS 주소에서 [06-verification.md](06-verification.md)의 Preview 검증을 수행한다.
3. Preview가 검증을 통과하면 `npx vercel deploy --prod`로 배포한다. 운영 URL에서 화면, 추천, 피드백 목록 조회가 동작하는지 확인한다. 환경 변수를 수정하면 새 배포로 적용한다. [Vercel CLI 배포](https://vercel.com/docs/projects/deploy-from-cli)
