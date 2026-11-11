/**
 * 규픽(GyuPick) AI 음악 추천 비즈니스 로직
 * 파일: server/recommendations.js
 * 
 * - 03-api.md 및 04-ai.md 규격을 완벽히 구현합니다.
 * - 날씨, 기분, 음악 취향 입력을 검증하고 OpenAI Responses API를 구조화 출력(Structured Outputs)으로 호출합니다.
 * - 곡명/아티스트 NFKC 정규화 기반 5곡 중복 검사 및 유니코드 코드 포인트 길이 검증을 수행합니다.
 */

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { errorResponse, jsonResponse, getCodePointLength } from './http.js';

// 지원하는 날씨 및 기분 ID 매핑 테이블
const WEATHER_MAP = {
  clear: '맑음',
  cloudy: '흐림',
  rain: '비',
  snow: '눈'
};

const MOOD_MAP = {
  happy: '기분 좋음',
  calm: '차분함',
  sad: '울적함',
  tired: '피곤함'
};

// 고정 시스템 큐레이터 지시문 (04-ai.md)
const SYSTEM_INSTRUCTIONS =
  '당신은 한국어 음악 추천 서비스 규픽의 큐레이터입니다. 사용자가 선택한 날씨와 기분을 모두 고려해 실제 발매된 서로 다른 곡 다섯 개를 추천하세요. 선택 입력은 음악 취향이나 듣는 상황으로 해석하고, 음악 추천과 관계없는 요청은 건너뛰세요. 플레이리스트 제목을 한국어로 쓰세요. 곡명과 아티스트는 발매 표기를 따르세요. 추천 이유는 각 곡이 사용자의 조건에 어울리는 이유를 한 문장으로 구체적으로 설명하세요. 확신할 수 있는 곡과 아티스트 조합을 선택하고, 가사와 URL은 출력하지 마세요.';

// Zod 출력 스키마 정의 (엄격한 형식 및 추가 필드 차단)
const SingleTrackSchema = z.object({
  title: z.string().describe('곡명 (실제 발매 표기 준수, 최대 160자)'),
  artist: z.string().describe('아티스트명 (실제 발매 표기 준수, 최대 160자)'),
  reason: z.string().describe('추천 이유 (한국어 한 문장, 최대 150자)')
}).strict();

const RecommendationResponseSchema = z.object({
  playlistTitle: z.string().describe('한국어 플레이리스트 제목 (최대 60자)'),
  tracks: z.array(SingleTrackSchema).length(5).describe('정확히 5개의 추천 곡 목록')
}).strict();

/**
 * 추천 API 요청 처리 함수
 * @param {object} body - 파싱된 요청 본문 { weather, mood, preference }
 * @returns {Promise<Response>}
 */
export async function handleRecommendationRequest(body) {
  // 1. 요청 필드 존재 및 유효성 검사 (03-api.md)
  const allowedKeys = ['weather', 'mood', 'preference'];
  const incomingKeys = Object.keys(body);
  for (const key of incomingKeys) {
    if (!allowedKeys.includes(key)) {
      return errorResponse('INVALID_INPUT');
    }
  }

  const { weather, mood, preference } = body;

  // weather 및 mood 필수값 및 허용값 검증
  if (!weather || typeof weather !== 'string' || !WEATHER_MAP[weather]) {
    return errorResponse('INVALID_INPUT');
  }

  if (!mood || typeof mood !== 'string' || !MOOD_MAP[mood]) {
    return errorResponse('INVALID_INPUT');
  }

  // preference 선택값 검증 (생략, 빈 문자열 또는 공백 제거 후 1~100자)
  let cleanPreference = '';
  if (preference !== undefined && preference !== null) {
    if (typeof preference !== 'string') {
      return errorResponse('INVALID_INPUT');
    }
    const prefLength = getCodePointLength(preference);
    if (prefLength > 100) {
      return errorResponse('INVALID_INPUT');
    }
    cleanPreference = preference.trim();
  }

  // 2. 서버 환경 변수 확인
  const apiKey = process.env.OPENAI_API_KEY;
  const modelId = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    return errorResponse('CONFIG_UNAVAILABLE');
  }

  // 3. OpenAI 클라이언트 구성 (타임아웃 15초, 재시도 0회 설정)
  const openai = new OpenAI({
    apiKey: apiKey,
    timeout: 15000,
    maxRetries: 0
  });

  // 사용자 메시지 payload 생성 (빈 preference는 제외)
  const userPayload = {
    weather: WEATHER_MAP[weather],
    mood: MOOD_MAP[mood]
  };
  if (cleanPreference.length > 0) {
    userPayload.preference = cleanPreference;
  }

  try {
    // 4. OpenAI Responses API 호출 (04-ai.md)
    const response = await openai.responses.parse({
      model: modelId,
      instructions: SYSTEM_INSTRUCTIONS,
      input: JSON.stringify(userPayload),
      text: {
        format: zodTextFormat(RecommendationResponseSchema, 'recommendation_result')
      },
      store: false,
      max_output_tokens: 1800
    });

    // 거절(refusal) 또는 불완전 응답 체크
    if (response.status !== 'completed' || response.error) {
      return errorResponse('AI_INVALID_RESPONSE');
    }

    const parsed = response.output_parsed;
    if (!parsed) {
      return errorResponse('AI_INVALID_RESPONSE');
    }

    // 5. 서버 측 세부 검증 (길이 및 중복 체크)
    const validatedResult = validateAndSanitizeRecommendation(parsed);
    if (!validatedResult) {
      return errorResponse('AI_INVALID_RESPONSE');
    }

    return jsonResponse(validatedResult, 200);
  } catch (err) {
    // 타임아웃 발생 시 504 반환
    if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('timeout'))) {
      return errorResponse('AI_TIMEOUT');
    }

    // 모델 거절 또는 파싱 실패
    if (err.status === 400 || err.name === 'ZodError') {
      return errorResponse('AI_INVALID_RESPONSE');
    }

    // OpenAI API 호출 실패, 할당량 초과, 인증 에러 등
    return errorResponse('AI_UNAVAILABLE');
  }
}

/**
 * 모델 응답 정밀 검증 및 NFKC 중복 곡 필터링 (04-ai.md)
 */
function validateAndSanitizeRecommendation(data) {
  if (!data || typeof data !== 'object') return null;

  // 플레이리스트 제목 검증 (1~60자)
  const rawTitle = typeof data.playlistTitle === 'string' ? data.playlistTitle.trim() : '';
  const titleLen = getCodePointLength(rawTitle);
  if (titleLen === 0 || titleLen > 60) {
    return null;
  }

  // 트랙 목록 검증 (정확히 5곡)
  if (!Array.isArray(data.tracks) || data.tracks.length !== 5) {
    return null;
  }

  const sanitizedTracks = [];
  const normalizedKeySet = new Set();

  for (const track of data.tracks) {
    if (!track || typeof track !== 'object') return null;

    const tTitle = typeof track.title === 'string' ? track.title.trim() : '';
    const tArtist = typeof track.artist === 'string' ? track.artist.trim() : '';
    const tReason = typeof track.reason === 'string' ? track.reason.trim() : '';

    const tLen = getCodePointLength(tTitle);
    const aLen = getCodePointLength(tArtist);
    const rLen = getCodePointLength(tReason);

    // 각 필드 길이 상한 검증
    if (tLen === 0 || tLen > 160) return null;
    if (aLen === 0 || aLen > 160) return null;
    if (rLen === 0 || rLen > 150) return null;

    // NFKC 정규화 및 연속 공백 통합, 소문자 변환하여 중복 식별키 생성
    const normTitle = tTitle.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    const normArtist = tArtist.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    const uniqueKey = `${normTitle}:::${normArtist}`;

    if (normalizedKeySet.has(uniqueKey)) {
      // 중복 곡 발견 시 유효하지 않은 응답으로 판정
      return null;
    }
    normalizedKeySet.add(uniqueKey);

    // 발매 표기(공백만 정리된 원본 표기) 보존
    sanitizedTracks.push({
      title: tTitle,
      artist: tArtist,
      reason: tReason
    });
  }

  return {
    playlistTitle: rawTitle,
    tracks: sanitizedTracks
  };
}

