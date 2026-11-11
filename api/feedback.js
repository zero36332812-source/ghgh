/**
 * 규픽(GyuPick) 피드백 API Vercel Serverless Function 진입점
 * 파일: api/feedback.js
 * 
 * - Vercel Node.js Web Handler 규격: export default { async fetch(request) { ... } }
 * - POST /api/feedback : 피드백 등록 및 중복 방지 재시도
 * - GET /api/feedback  : 최신순 페이징 목록 조회
 */

import { parseJsonBody, errorResponse } from '../server/http.js';
import { handleCreateFeedback, handleListFeedback } from '../server/feedback.js';

export default {
  async fetch(request) {
    const method = request.method;

    // 1. GET: 피드백 목록 페이징 조회
    if (method === 'GET') {
      return handleListFeedback(request.url);
    }

    // 2. POST: 피드백 등록
    if (method === 'POST') {
      const { data, error } = await parseJsonBody(request);
      if (error) {
        return error;
      }
      return handleCreateFeedback(data);
    }

    // 3. 지원하지 않는 메서드인 경우 405 반환
    return errorResponse('METHOD_NOT_ALLOWED', null, { Allow: 'GET, POST' });
  }
};

