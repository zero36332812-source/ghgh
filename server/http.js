/**
 * 규픽(GyuPick) 공통 HTTP 유틸리티 모듈
 * 파일: server/http.js
 * 
 * - 03-api.md 명세에 따른 일관된 JSON 응답 및 에러 처리를 담당합니다.
 * - 본문 크기(최대 8 KiB) 제한, Content-Type 검증, Cache-Control 헤더 등을 제어합니다.
 */

// 오류 코드 및 기본 메시지/HTTP 상태 코드 정의
export const ERROR_DEFINITIONS = {
  INVALID_INPUT: {
    status: 400,
    code: 'INVALID_INPUT',
    message: '입력한 내용을 확인해 주세요.'
  },
  INVALID_CURSOR: {
    status: 400,
    code: 'INVALID_CURSOR',
    message: '목록을 처음부터 다시 불러와 주세요.'
  },
  METHOD_NOT_ALLOWED: {
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
    message: '지원하지 않는 요청입니다.'
  },
  FEEDBACK_CONFLICT: {
    status: 409,
    code: 'FEEDBACK_CONFLICT',
    message: '피드백을 다시 보내 주세요.'
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: '요청이 너무 깁니다.'
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: '요청 형식을 확인해 주세요.'
  },
  AI_INVALID_RESPONSE: {
    status: 502,
    code: 'AI_INVALID_RESPONSE',
    message: '추천을 완성하지 못했어요. 다시 시도해 주세요.'
  },
  AI_UNAVAILABLE: {
    status: 503,
    code: 'AI_UNAVAILABLE',
    message: '지금은 추천을 받을 수 없어요. 잠시 후 다시 시도해 주세요.'
  },
  FEEDBACK_UNAVAILABLE: {
    status: 503,
    code: 'FEEDBACK_UNAVAILABLE',
    message: '지금은 피드백을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.'
  },
  CONFIG_UNAVAILABLE: {
    status: 503,
    code: 'CONFIG_UNAVAILABLE',
    message: '지금은 이 기능을 사용할 수 없어요.'
  },
  AI_TIMEOUT: {
    status: 504,
    code: 'AI_TIMEOUT',
    message: '추천 시간이 길어졌어요. 다시 시도해 주세요.'
  },
  INTERNAL_ERROR: {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: '문제가 발생했어요. 잠시 후 다시 시도해 주세요.'
  }
};

/**
 * 표준 성공 JSON Response 객체 생성
 */
export function jsonResponse(data, status = 200, customHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...customHeaders
  });

  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

/**
 * 규격화된 에러 Response 객체 생성
 */
export function errorResponse(errorKey, overrideMessage = null, customHeaders = {}) {
  const def = ERROR_DEFINITIONS[errorKey] || ERROR_DEFINITIONS.INTERNAL_ERROR;
  const message = overrideMessage || def.message;

  return jsonResponse(
    {
      error: {
        code: def.code,
        message: message
      }
    },
    def.status,
    customHeaders
  );
}

/**
 * POST 요청의 Content-Type 및 최대 8 KiB 본문 크기 검증 후 JSON 파싱
 */
export async function parseJsonBody(request, maxBytes = 8192) {
  const contentType = request.headers.get('content-type') || '';
  // application/json 확인 (charset 매개변수 등 허용)
  if (!contentType.toLowerCase().includes('application/json')) {
    return { error: errorResponse('UNSUPPORTED_MEDIA_TYPE') };
  }

  // 스트림 또는 ArrayBuffer로 최대 8 KiB 읽기
  const reader = request.body ? request.body.getReader() : null;
  if (!reader) {
    return { error: errorResponse('INVALID_INPUT') };
  }

  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        // 8 KiB 초과 시 즉시 읽기 중단하고 413 반환
        await reader.cancel();
        return { error: errorResponse('PAYLOAD_TOO_LARGE') };
      }
      chunks.push(value);
    }
  } catch {
    return { error: errorResponse('INVALID_INPUT') };
  }

  // 버퍼 결합 및 문자열 디코딩
  const combinedBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(combinedBuffer);

  // NUL 문자(\u0000) 검사
  if (text.includes('\u0000')) {
    return { error: errorResponse('INVALID_INPUT') };
  }

  try {
    const json = JSON.parse(text);
    // 최상위 값은 반드시 JSON 객체여야 함 (배열이나 원시값 불가)
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return { error: errorResponse('INVALID_INPUT') };
    }
    return { data: json };
  } catch {
    return { error: errorResponse('INVALID_INPUT') };
  }
}

/**
 * 유니코드 코드 포인트 기준 길이 계산
 */
export function getCodePointLength(str) {
  if (typeof str !== 'string') return 0;
  return Array.from(str.trim()).length;
}

