/**
 * 규픽(GyuPick) 피드백 비즈니스 로직
 * 파일: server/feedback.js
 * 
 * - 03-api.md 및 05-feedback.md 규격을 완벽히 구현합니다.
 * - UUID v4 검증, 1~500자 유효성 검증, 멱등 저장(201 Created vs 동일 본문 200 OK vs 409 Conflict)
 * - Base64URL 복합 커서(createdAt, id) 검증 및 Supabase 최신순 20개 페이징 조회
 * - DB 쿼리당 5초 타임아웃 제한 적용
 */

import { createClient } from '@supabase/supabase-js';
import { errorResponse, jsonResponse, getCodePointLength } from './http.js';

// 소문자 UUID v4 정규식
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Base64URL 유효성 검사 정규식
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

// ISO 8601 UTC 날짜/시각 정규식 (0~6자리 소수 초 허용)
const UTC_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

/**
 * Supabase 클라이언트 생성 (세션 비활성화, 타임아웃 5초)
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey || url.includes('your-project-id') || secretKey.includes('your_secret_key')) {
    return null;
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * 피드백 등록 (POST /api/feedback)
 */
export async function handleCreateFeedback(body) {
  // 1. 요청 필드 검증 (submissionId, body 외 필드 금지)
  const allowedKeys = ['submissionId', 'body'];
  const incomingKeys = Object.keys(body);
  for (const key of incomingKeys) {
    if (!allowedKeys.includes(key)) {
      return errorResponse('INVALID_INPUT');
    }
  }

  const { submissionId, body: rawBody } = body;

  // submissionId: 소문자 UUID v4 필수
  if (typeof submissionId !== 'string' || !UUID_V4_REGEX.test(submissionId)) {
    return errorResponse('INVALID_INPUT');
  }

  // body: 1~500자 유니코드 코드 포인트 검증
  if (typeof rawBody !== 'string') {
    return errorResponse('INVALID_INPUT');
  }
  const bodyLen = getCodePointLength(rawBody);
  if (bodyLen < 1 || bodyLen > 500) {
    return errorResponse('INVALID_INPUT');
  }
  const trimmedBody = rawBody.trim();

  // Supabase 클라이언트 준비
  const supabase = getSupabaseClient();
  if (!supabase) {
    return errorResponse('CONFIG_UNAVAILABLE');
  }

  try {
    // 5초 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // INSERT 시도
    const { data: insertedData, error: insertError } = await supabase
      .from('feedback')
      .insert({
        id: submissionId,
        body: trimmedBody
      })
      .select('id, body, created_at')
      .single()
      .abortSignal(controller.signal);

    clearTimeout(timeoutId);

    // 성공한 경우 201 Created 반환
    if (!insertError && insertedData) {
      return jsonResponse(
        {
          item: formatFeedbackItem(insertedData)
        },
        201
      );
    }

    // 기본 키 중복(23505) 발생 시 중복 재시도 처리
    if (insertError && insertError.code === '23505') {
      const selectController = new AbortController();
      const selectTimeout = setTimeout(() => selectController.abort(), 5000);

      const { data: existingData, error: selectError } = await supabase
        .from('feedback')
        .select('id, body, created_at')
        .eq('id', submissionId)
        .single()
        .abortSignal(selectController.signal);

      clearTimeout(selectTimeout);

      if (selectError || !existingData) {
        return errorResponse('FEEDBACK_UNAVAILABLE');
      }

      // 본문이 동일한 경우 200 OK로 기존 행 반환 (멱등성 보장)
      if (existingData.body === trimmedBody) {
        return jsonResponse(
          {
            item: formatFeedbackItem(existingData)
          },
          200
        );
      }

      // 동일한 ID에 다른 본문인 경우 409 Conflict
      return errorResponse('FEEDBACK_CONFLICT');
    }

    // 그 외 DB 오류
    return errorResponse('FEEDBACK_UNAVAILABLE');
  } catch {
    return errorResponse('FEEDBACK_UNAVAILABLE');
  }
}

/**
 * 피드백 최신순 페이징 조회 (GET /api/feedback)
 */
export async function handleListFeedback(url) {
  const parsedUrl = new URL(url);
  const searchParams = parsedUrl.searchParams;

  // cursor 파라미터가 중복으로 주어졌는지 검사
  const allCursors = searchParams.getAll('cursor');
  if (allCursors.length > 1) {
    return errorResponse('INVALID_CURSOR');
  }

  const rawCursor = searchParams.get('cursor');
  let cursorData = null;

  // cursor가 제공된 경우 유효성 검사
  if (rawCursor !== null) {
    if (rawCursor === '' || rawCursor.length > 256 || !BASE64URL_REGEX.test(rawCursor)) {
      return errorResponse('INVALID_CURSOR');
    }

    try {
      // Base64URL -> UTF-8 JSON 파싱
      const base64 = rawCursor.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
      const parsed = JSON.parse(jsonStr);

      if (typeof parsed !== 'object' || parsed === null) {
        return errorResponse('INVALID_CURSOR');
      }

      const { createdAt, id } = parsed;
      if (typeof createdAt !== 'string' || !UTC_DATETIME_REGEX.test(createdAt)) {
        return errorResponse('INVALID_CURSOR');
      }
      if (typeof id !== 'string' || !UUID_V4_REGEX.test(id)) {
        return errorResponse('INVALID_CURSOR');
      }

      cursorData = { createdAt, id };
    } catch {
      return errorResponse('INVALID_CURSOR');
    }
  }

  // Supabase 클라이언트 준비
  const supabase = getSupabaseClient();
  if (!supabase) {
    return errorResponse('CONFIG_UNAVAILABLE');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // 21개까지 조회하여 다음 페이지 존재 여부 확인
    let query = supabase
      .from('feedback')
      .select('id, body, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21);

    // 커서 복합 필터 적용: created_at < t OR (created_at = t AND id < cursorId)
    if (cursorData) {
      query = query.or(
        `created_at.lt.${cursorData.createdAt},and(created_at.eq.${cursorData.createdAt},id.lt.${cursorData.id})`
      );
    }

    const { data, error } = await query.abortSignal(controller.signal);
    clearTimeout(timeoutId);

    if (error || !data) {
      return errorResponse('FEEDBACK_UNAVAILABLE');
    }

    const hasNextPage = data.length === 21;
    const itemsToReturn = hasNextPage ? data.slice(0, 20) : data;

    const formattedItems = itemsToReturn.map(formatFeedbackItem);

    // 다음 커서 생성
    let nextCursor = null;
    if (hasNextPage) {
      const lastItem = formattedItems[formattedItems.length - 1];
      const cursorObj = {
        createdAt: lastItem.createdAt,
        id: lastItem.id
      };
      const jsonString = JSON.stringify(cursorObj);
      nextCursor = Buffer.from(jsonString, 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }

    return jsonResponse(
      {
        items: formattedItems,
        nextCursor: nextCursor
      },
      200
    );
  } catch {
    return errorResponse('FEEDBACK_UNAVAILABLE');
  }
}

/**
 * DB 행을 API 응답 포맷으로 변환 (created_at -> createdAt, UTC 'Z' 표준화)
 */
function formatFeedbackItem(row) {
  let createdAtStr = row.created_at;
  if (typeof createdAtStr === 'string') {
    // Supabase의 '+00:00'을 'Z'로 변환하고 소수초 보존
    createdAtStr = createdAtStr.replace('+00:00', 'Z').replace('+00', 'Z');
  }

  return {
    id: row.id,
    body: row.body,
    createdAt: createdAtStr
  };
}

