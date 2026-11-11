/**
 * 로컬 개발용 경량 Node.js 서버
 * 파일: server/local.js
 * 
 * - Windows 비관리자 환경에서 Vercel CLI의 symlink EPERM 권한 오류를 우회하여
 *   로컬에서 바로 화면과 API를 실행할 수 있도록 지원합니다.
 * - public/ 폴더의 정적 파일(html, css, js)과 api/ 의 Vercel Web Handler를 매핑합니다.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .env 파일 환경 변수 로드 (Node.js 20.6+ 내장 지원 또는 직접 파싱)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// API 핸들러 동적 import
const recommendationsHandler = (await import('../api/recommendations.js')).default;
const feedbackHandler = (await import('../api/feedback.js')).default;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = urlObj.pathname;

  // 1. API 라우팅 처리
  if (pathname === '/api/recommendations' || pathname === '/api/feedback') {
    // Node.js IncomingMessage를 Web API Request 객체로 변환
    const fullUrl = `http://${req.headers.host || 'localhost:3000'}${req.url}`;
    
    // 요청 바디 스트림 버퍼링
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : null;

    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer
    });

    try {
      const handler = pathname === '/api/recommendations' ? recommendationsHandler : feedbackHandler;
      const webResponse = await handler.fetch(webRequest);

      res.statusCode = webResponse.status;
      webResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const responseBuffer = await webResponse.arrayBuffer();
      res.end(Buffer.from(responseBuffer));
    } catch (err) {
      console.error('API Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: '문제가 발생했어요. 잠시 후 다시 시도해 주세요.'
        }
      }));
    }
    return;
  }

  // 2. public/ 정적 파일 서빙
  let filePath = path.join(rootDir, 'public', pathname === '/' ? 'index.html' : pathname);

  // 보안: public 폴더 상위 디렉터리 접근 방지
  if (!filePath.startsWith(path.join(rootDir, 'public'))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  }
});

const PORT = 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`> GyuPick 로컬 개발 서버가 준비되었습니다!`);
  console.log(`> 브라우저 접속 주소: http://localhost:${PORT}`);
});

