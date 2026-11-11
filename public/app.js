/**
 * 규픽(GyuPick) 프론트엔드 메인 스크립트
 * 파일: public/app.js
 *
 * ✅ 포함 기능:
 * 1. 최신 TOP 30 차트 렌더링 (2026-11-11 기준) - 클릭 시 선호도 입력창에 자동 입력
 * 2. 추천 폼 입력 검증 → POST /api/recommendations 호출 → 결과 렌더링
 * 3. 피드백 폼 제출 → POST /api/feedback 호출 → 성공 시 목록 상단에 추가
 * 4. 피드백 목록 로딩 → GET /api/feedback 호출 → 최신순 20개 렌더링
 */

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================
  // 1. UI 요소 참조 - HTML에서 각 요소를 가져옵니다
  // ============================================================

  // 추천 폼 관련 요소
  const recommendForm = document.getElementById('recommendation-form');
  const weatherRadios = document.querySelectorAll('input[name="weather"]');
  const moodRadios = document.querySelectorAll('input[name="mood"]');
  const preferenceInput = document.getElementById('preference-input');
  const preferenceCount = document.getElementById('preference-count');
  const weatherError = document.getElementById('weather-error');
  const moodError = document.getElementById('mood-error');
  const preferenceError = document.getElementById('preference-error');
  const recommendStatus = document.getElementById('recommend-status');
  const recommendSubmitBtn = document.getElementById('recommend-submit-btn');

  // 추천 결과 관련 요소
  const recommendationResult = document.getElementById('recommendation-result');
  const resultTitle = document.getElementById('result-title');
  const tracksList = document.getElementById('tracks-list');

  // 피드백 폼 관련 요소
  const feedbackForm = document.getElementById('feedback-form');
  const feedbackBody = document.getElementById('feedback-body');
  const feedbackCount = document.getElementById('feedback-count');
  const feedbackError = document.getElementById('feedback-error');
  const feedbackStatus = document.getElementById('feedback-status');
  const feedbackSubmitBtn = document.getElementById('feedback-submit-btn');

  // 피드백 목록 관련 요소
  const feedbackRetryBtn = document.getElementById('feedback-retry-btn');
  const feedbackListStatus = document.getElementById('feedback-list-status');
  const feedbackItems = document.getElementById('feedback-items');

  // ============================================================
  // 2. 상태 변수 선언
  // ============================================================

  let hasSuccessfulRecommendation = false;   // 추천 성공 여부
  let lastRecommendedConditions = null;       // 마지막 추천 조건 저장

  // 피드백 멱등성: 같은 UUID로 중복 제출을 방지합니다
  let currentSubmissionId = generateUUID();

  // 피드백 무한 스크롤 / 커서 페이징 상태
  const renderedFeedbackIds = new Set();  // 이미 렌더된 피드백 ID 중복 방지
  let nextFeedbackCursor = null;          // 다음 페이지 커서
  let isFetchingFeedback = false;         // 현재 피드백 로딩 중 여부
  let failedFeedbackCursor = null;        // 실패한 커서 저장 (재시도용)

  // 날짜 포맷터 (한국 시간대)
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // ============================================================
  // 3. 최신 TOP 30 차트 데이터 (2026-11-11 기준)
  // ============================================================
  const TOP_30_DATA = [
    { rank: 1,  title: "NEON",                           artist: "A2O LITE" },
    { rank: 2,  title: "꿈꾸던 어른이 되었나요?",           artist: "머무르" },
    { rank: 3,  title: "LOVE ATTACK",                    artist: "RESCENE" },
    { rank: 4,  title: "퇴사할게여 (Narr. 기안84)",        artist: "소연" },
    { rank: 5,  title: "체포하겠어",                       artist: "아일릿" },
    { rank: 6,  title: "With",                           artist: "RESCENE" },
    { rank: 7,  title: "연애의 조건 (Love Options)",       artist: "베스티" },
    { rank: 8,  title: "생각을 멈추다 보면",                artist: "최유리" },
    { rank: 9,  title: "Looks Can Kill",                 artist: "아이브" },
    { rank: 10, title: "갑자기",                          artist: "아이오아이" },
    { rank: 11, title: "BAD",                            artist: "ATEEZ" },
    { rank: 12, title: "Drowning",                       artist: "WOODZ" },
    { rank: 13, title: "REDRED",                         artist: "CORTIS" },
    { rank: 14, title: "사랑하게 될 거야",                  artist: "한로로" },
    { rank: 15, title: "소문의 낙원",                      artist: "AKMU" },
    { rank: 16, title: "만찬가",                          artist: "태연" },
    { rank: 17, title: "It's Me",                        artist: "아일릿" },
    { rank: 18, title: "Good Goodbye",                   artist: "화사" },
    { rank: 19, title: "내게 사랑이 뭐냐고 물어본다면",       artist: "로이킴" },
    { rank: 20, title: "Popcorn",                        artist: "도경수" },
    { rank: 21, title: "LEMONADE",                       artist: "aespa" },
    { rank: 22, title: "타임캡슐",                        artist: "다비치" },
    { rank: 23, title: "캐치 캐치",                       artist: "최예나" },
    { rank: 24, title: "봄 내음보다 너를",                   artist: "김나영" },
    { rank: 25, title: "어제보다 슬픈 오늘",                 artist: "우디" },
    { rank: 26, title: "BANG BANG",                      artist: "아이브" },
    { rank: 27, title: "0+0",                            artist: "한로로" },
    { rank: 28, title: "또다시 또다시",                    artist: "최유리" },
    { rank: 29, title: "기쁨, 슬픔, 아름다운 마음",          artist: "AKMU" },
    { rank: 30, title: "달리다",                          artist: "에이프릴" },
  ];

  // ============================================================
  // 4. 유틸리티 함수
  // ============================================================

  /**
   * UUID v4를 생성합니다 (브라우저 crypto API 우선 사용)
   * - 피드백 제출 시 중복 방지를 위한 고유 ID 생성에 사용합니다
   */
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().toLowerCase();
    }
    // crypto.randomUUID가 없는 구형 환경 대비 폴백
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 문자열의 유니코드 코드 포인트 길이를 반환합니다
   * - 이모지 등 2바이트 문자도 올바르게 1글자로 셉니다
   */
  function countCodePoints(str) {
    return str ? Array.from(str.trim()).length : 0;
  }

  // ============================================================
  // 5. TOP 30 차트 렌더링
  // ============================================================

  /**
   * TOP 30 차트 목록을 화면 왼쪽 사이드바에 렌더링합니다.
   * 각 항목을 클릭하면 "듣고 싶은 음악" 입력창에 곡명이 자동으로 채워집니다.
   */
  function renderChart() {
    const chartList = document.getElementById('top-chart-list');
    if (!chartList) return;

    chartList.innerHTML = ''; // 기존 항목 초기화

    TOP_30_DATA.forEach(song => {
      const li = document.createElement('li');
      li.className = 'chart-item';

      // 버튼 역할: 클릭 가능하게 만듭니다
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-label', `${song.rank}위 ${song.title} - ${song.artist} 선택`);

      // 차트 아이템 내부 HTML 구성
      li.innerHTML = `
        <span class="chart-rank ${song.rank <= 3 ? 'rank-top3' : ''}">${song.rank}</span>
        <div class="chart-info">
          <span class="chart-song-title"></span>
          <span class="chart-artist-name"></span>
        </div>
      `;

      // XSS 방지: textContent로 텍스트 삽입
      li.querySelector('.chart-song-title').textContent = song.title;
      li.querySelector('.chart-artist-name').textContent = song.artist;

      // 클릭 시 선호도 입력창에 "곡명 - 아티스트" 형태로 자동 입력
      const fillInput = () => {
        const text = `${song.title} - ${song.artist}`;
        preferenceInput.value = text;
        // 글자 수 카운터 업데이트
        const len = countCodePoints(text);
        preferenceCount.textContent = `${len} / 100자`;
        preferenceError.hidden = true;
        // 스크롤을 추천 폼으로 이동 (사용자 편의)
        preferenceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        preferenceInput.focus();
      };

      li.addEventListener('click', fillInput);
      // 키보드 접근성: Enter/Space 키로도 선택 가능
      li.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fillInput();
        }
      });

      chartList.appendChild(li);
    });
  }

  // 페이지 로드 시 차트 렌더링 실행
  renderChart();

  // ============================================================
  // 6. 추천 폼 처리 (날씨 & 기분 선택 → AI 추천 요청)
  // ============================================================

  // 추천 폼 선호도 입력창: 글자 수 실시간 업데이트
  preferenceInput.addEventListener('input', () => {
    const len = countCodePoints(preferenceInput.value);
    preferenceCount.textContent = `${len} / 100자`;
    if (len > 100) {
      preferenceError.textContent = '100자 이내로 입력해 주세요.';
      preferenceError.hidden = false;
    } else {
      preferenceError.hidden = true;
    }
  });

  /**
   * 추천 폼 제출 이벤트 핸들러
   * - 날씨, 기분, 선호도를 검증하고 /api/recommendations에 POST 요청을 보냅니다
   */
  recommendForm.addEventListener('submit', async e => {
    e.preventDefault(); // 기본 제출 동작(페이지 새로고침) 방지

    // ── 입력값 가져오기 ──
    const selectedWeather = [...weatherRadios].find(r => r.checked)?.value ?? '';
    const selectedMood = [...moodRadios].find(r => r.checked)?.value ?? '';
    const preferenceText = preferenceInput.value.trim();
    const preferenceLen = countCodePoints(preferenceText);

    // ── 유효성 검사 ──
    let hasError = false;

    if (!selectedWeather) {
      weatherError.textContent = '날씨를 선택해 주세요.';
      weatherError.hidden = false;
      hasError = true;
    } else {
      weatherError.hidden = true;
    }

    if (!selectedMood) {
      moodError.textContent = '기분을 선택해 주세요.';
      moodError.hidden = false;
      hasError = true;
    } else {
      moodError.hidden = true;
    }

    if (preferenceLen > 100) {
      preferenceError.textContent = '100자 이내로 입력해 주세요.';
      preferenceError.hidden = false;
      hasError = true;
    } else {
      preferenceError.hidden = true;
    }

    if (hasError) return;

    // ── 중복 제출 방지 ──
    // 같은 조건으로 추천 요청이 이미 왔다면 추가 요청 차단
    const conditionsKey = `${selectedWeather}|${selectedMood}|${preferenceText}`;
    if (hasSuccessfulRecommendation && lastRecommendedConditions === conditionsKey) {
      recommendStatus.textContent = '동일한 조건으로 이미 추천받았어요. 조건을 바꿔보세요!';
      recommendStatus.className = 'status-message info';
      return;
    }

    // ── API 호출 중 UI 비활성화 ──
    recommendSubmitBtn.disabled = true;
    recommendStatus.textContent = 'AI가 감성 플레이리스트를 고르는 중이에요... 🎵';
    recommendStatus.className = 'status-message loading';

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather: selectedWeather,
          mood: selectedMood,
          preference: preferenceText || undefined
        })
      });

      const data = await res.json();

      // 서버 응답은 { playlistTitle, tracks } 형태입니다
      if (res.ok && data.playlistTitle && data.tracks) {
        // ── 추천 성공 ──
        hasSuccessfulRecommendation = true;
        lastRecommendedConditions = conditionsKey;

        recommendStatus.textContent = '플레이리스트 준비 완료! 아래를 확인해 보세요 🎉';
        recommendStatus.className = 'status-message success';

        // 결과 카드에 플레이리스트 제목과 곡 목록 표시
        resultTitle.textContent = data.playlistTitle;
        tracksList.innerHTML = '';

        data.tracks.forEach((track, idx) => {
          const li = document.createElement('li');
          li.className = 'track-item';

          li.innerHTML = `
            <span class="track-number">${idx + 1}</span>
            <div class="track-info">
              <span class="track-title"></span>
              <span class="track-artist"></span>
            </div>
          `;
          // XSS 방지를 위해 textContent 사용
          li.querySelector('.track-title').textContent = track.title ?? '';
          li.querySelector('.track-artist').textContent = track.artist ?? '';

          tracksList.appendChild(li);
        });

        // 결과 카드 표시
        recommendationResult.hidden = false;
        recommendationResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

      } else {
        // ── 추천 실패 ──
        const errCode = data?.error?.code ?? 'UNKNOWN';
        let msg = '추천을 불러오지 못했어요. 다시 시도해 주세요.';
        if (errCode === 'CONFIG_UNAVAILABLE') {
          msg = 'AI 서비스 설정이 완료되지 않았어요. 관리자에게 문의해 주세요.';
        } else if (errCode === 'AI_UNAVAILABLE') {
          msg = 'AI 서비스에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
        }
        recommendStatus.textContent = msg;
        recommendStatus.className = 'status-message error';
      }

    } catch (err) {
      recommendStatus.textContent = '네트워크 오류가 발생했어요. 인터넷 연결을 확인해 주세요.';
      recommendStatus.className = 'status-message error';
    } finally {
      recommendSubmitBtn.disabled = false;
    }
  });

  // ============================================================
  // 7. 피드백 폼 처리 (피드백 작성 & 제출)
  // ============================================================

  // 피드백 텍스트 영역: 글자 수 실시간 업데이트
  feedbackBody.addEventListener('input', () => {
    const len = countCodePoints(feedbackBody.value);
    feedbackCount.textContent = `${len} / 500자`;
    if (len > 500) {
      feedbackError.textContent = '500자 이내로 입력해 주세요.';
      feedbackError.hidden = false;
    } else {
      feedbackError.hidden = true;
    }
  });

  /**
   * 피드백 폼 제출 이벤트 핸들러
   * - 입력 검증 → POST /api/feedback → 성공 시 목록 상단에 추가
   * - currentSubmissionId (UUID)로 중복 제출을 방지합니다 (멱등성)
   */
  feedbackForm.addEventListener('submit', async e => {
    e.preventDefault(); // 기본 제출 동작(페이지 새로고침) 방지

    // ── 입력값 가져오기 ──
    const bodyText = feedbackBody.value.trim();
    const bodyLen = countCodePoints(bodyText);

    // ── 유효성 검사 ──
    if (bodyLen < 1) {
      feedbackError.textContent = '피드백 내용을 입력해 주세요.';
      feedbackError.hidden = false;
      return;
    }
    if (bodyLen > 500) {
      feedbackError.textContent = '500자 이내로 입력해 주세요.';
      feedbackError.hidden = false;
      return;
    }
    feedbackError.hidden = true;

    // ── API 호출 중 UI 비활성화 ──
    feedbackSubmitBtn.disabled = true;
    feedbackStatus.textContent = '피드백을 저장하고 있어요...';
    feedbackStatus.className = 'status-message loading';

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: currentSubmissionId, // UUID: 중복 제출 방지
          body: bodyText
        })
      });

      const data = await res.json();

      if ((res.status === 201 || res.status === 200) && data.item) {
        // ── 피드백 저장 성공 ──
        feedbackStatus.textContent = '피드백이 성공적으로 저장됐어요! 감사합니다 💚';
        feedbackStatus.className = 'status-message success';

        // 목록 상단에 새 피드백 추가
        renderFeedbackItem(data.item, true);

        // 입력창 초기화
        feedbackBody.value = '';
        feedbackCount.textContent = '0 / 500자';

        // 다음 제출을 위해 새 UUID 발급 (멱등성 보장)
        currentSubmissionId = generateUUID();

      } else {
        // ── 피드백 저장 실패 ──
        const errCode = data?.error?.code ?? 'UNKNOWN';
        let msg = '피드백을 저장하지 못했어요. 다시 시도해 주세요.';

        if (errCode === 'FEEDBACK_CONFLICT') {
          // 같은 ID로 다른 내용을 보낸 경우 (거의 발생하지 않음)
          msg = '이미 다른 내용으로 제출된 피드백이에요. 페이지를 새로고침해 주세요.';
          currentSubmissionId = generateUUID(); // UUID 갱신
        } else if (errCode === 'CONFIG_UNAVAILABLE') {
          msg = '피드백 서비스가 현재 사용 불가능해요. 관리자에게 문의해 주세요.';
        } else if (errCode === 'FEEDBACK_UNAVAILABLE') {
          msg = '피드백 저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
        } else if (errCode === 'INVALID_INPUT') {
          msg = '입력 내용에 문제가 있어요. 내용을 확인해 주세요.';
        }

        feedbackStatus.textContent = msg;
        feedbackStatus.className = 'status-message error';
      }

    } catch (err) {
      feedbackStatus.textContent = '네트워크 오류가 발생했어요. 인터넷 연결을 확인해 주세요.';
      feedbackStatus.className = 'status-message error';
    } finally {
      feedbackSubmitBtn.disabled = false;
    }
  });

  // ============================================================
  // 8. 피드백 목록 로딩 및 렌더링
  // ============================================================

  /**
   * 피드백 항목 하나를 목록에 렌더링합니다.
   * @param {Object} item - { id, body, createdAt } 형태의 피드백 데이터
   * @param {boolean} prepend - true이면 목록 맨 위에 추가 (새 피드백), false이면 아래에 추가 (페이지 로딩)
   */
  function renderFeedbackItem(item, prepend = false) {
    // 중복 렌더링 방지
    if (renderedFeedbackIds.has(item.id)) return;
    renderedFeedbackIds.add(item.id);

    const li = document.createElement('li');
    li.className = 'feedback-item';
    li.dataset.id = item.id;

    // 날짜 포맷 (UTC → 한국 시간 변환)
    let dateStr = '';
    try {
      dateStr = dateFormatter.format(new Date(item.createdAt));
    } catch {
      dateStr = item.createdAt ?? '';
    }

    li.innerHTML = `
      <p class="feedback-body-text"></p>
      <time class="feedback-date" datetime=""></time>
    `;

    // XSS 방지: textContent와 setAttribute로 삽입
    li.querySelector('.feedback-body-text').textContent = item.body;
    const timeEl = li.querySelector('.feedback-date');
    timeEl.setAttribute('datetime', item.createdAt ?? '');
    timeEl.textContent = dateStr;

    if (prepend) {
      feedbackItems.prepend(li); // 새 피드백은 목록 맨 위에
    } else {
      feedbackItems.append(li); // 기존 피드백은 아래에 추가
    }
  }

  /**
   * GET /api/feedback 를 호출하여 피드백 목록을 불러옵니다.
   * @param {string|null} cursor - 페이지 커서 (null이면 첫 페이지)
   */
  async function fetchFeedbackList(cursor = null) {
    // 이미 로딩 중이면 중복 요청 방지
    if (isFetchingFeedback) return;
    isFetchingFeedback = true;
    failedFeedbackCursor = null;
    feedbackRetryBtn.hidden = true;

    // 로딩 중 메시지 표시 (첫 페이지일 때만)
    if (!cursor) {
      feedbackListStatus.textContent = '피드백을 불러오고 있어요...';
      feedbackListStatus.className = 'status-message loading';
    }

    try {
      // 커서가 있으면 URL 쿼리 파라미터로 추가
      const url = cursor ? `/api/feedback?cursor=${encodeURIComponent(cursor)}` : '/api/feedback';
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.items) {
        throw new Error(data?.error?.code ?? 'FEEDBACK_UNAVAILABLE');
      }

      const items = data.items;

      if (!cursor && items.length === 0) {
        // 첫 페이지인데 피드백이 없는 경우
        feedbackListStatus.textContent = '아직 등록된 피드백이 없어요. 첫 번째 피드백을 남겨보세요! 🌱';
        feedbackListStatus.className = 'status-message info';
      } else {
        // 피드백이 있으면 목록에 렌더링
        feedbackListStatus.textContent = '';
        feedbackListStatus.className = '';

        items.forEach(item => renderFeedbackItem(item, false));

        // 다음 페이지 커서 저장
        nextFeedbackCursor = data.nextCursor ?? null;
      }

    } catch (err) {
      // 오류 발생 시 에러 메시지와 재시도 버튼 표시
      failedFeedbackCursor = cursor;
      feedbackListStatus.textContent = '피드백 목록을 불러오지 못했어요.';
      feedbackListStatus.className = 'status-message error';
      feedbackRetryBtn.hidden = false;

    } finally {
      isFetchingFeedback = false;
    }
  }

  // 재시도 버튼 클릭 이벤트: 실패한 커서로 다시 요청합니다
  feedbackRetryBtn.addEventListener('click', () => {
    fetchFeedbackList(failedFeedbackCursor);
  });

  // ============================================================
  // 9. 페이지 최초 로드 시 초기화
  // ============================================================

  // 피드백 목록 첫 페이지 로딩 시작
  fetchFeedbackList(null);
});
