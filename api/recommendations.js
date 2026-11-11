/**
 * 규픽(GyuPick) 추천 API Vercel Serverless Function 진입점
 * 파일: api/recommendations.js
 * 
 * - Vercel Node.js Web Handler 규격: export default { async fetch(request) { ... } }
 * - POST /api/recommendations 경로 처리
 */

import { parseJsonBody, errorResponse } from '../server/http.js';
import { handleRecommendationRequest } from '../server/recommendations.js';

export default {
  async fetch(request) {
    // POST 메서드만 허용 (그 외는 405 Method Not Allowed)
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', null, { Allow: 'POST' });
    }

    // JSON 본문 파싱 및 크기(8 KiB) 검증
    const { data, error } = await parseJsonBody(request);
    if (error) {
      return error;
    }

    // 추천 로직 실행
    return handleRecommendationRequest(data);
  }
};

