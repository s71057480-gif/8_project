const http = require('http');
const path = require('path');
const fs = require('fs');
const {
  suggestOutfit,
  analyzeClosetImage,
} = require('./aiStylist');
const {
  getOrCreateUser,
  registerClosetEntry,
  buildClosetSummary,
  getLatestClosetImagePath,
  saveOutfit,
  deleteSavedOutfits,
  clearSavedOutfits,
  buildWeeklyPlan,
} = require('./serviceStore');

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleClosetRegister(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);

  let summary = body.summary || '';
  let items = Array.isArray(body.items) ? body.items : [];
  let seasonHint = body.seasonHint || '사계절';
  let imagePath = body.imagePath ? path.resolve(body.imagePath) : '';

  if (imagePath) {
    const analyzed = await analyzeClosetImage({
      imagePath,
      extraNote: body.note || '',
    });
    summary = analyzed.summary;
    items = analyzed.items;
    seasonHint = analyzed.seasonHint;
  }

  if (!summary) {
    throw new Error('summary 또는 imagePath가 필요합니다.');
  }

  const entry = registerClosetEntry(user, {
    summary,
    items,
    seasonHint,
    imagePath,
  });

  sendJson(res, 200, {
    message: '옷장 등록 완료',
    entry,
  });
}

async function handleRecommend(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);

  if (!body.userRequest) {
    throw new Error('userRequest는 필수입니다.');
  }

  const closetSummary = body.closetSummary || buildClosetSummary(user);
  const closetImagePath = body.useLatestClosetImage ? getLatestClosetImagePath(user) : '';

  const recommendation = await suggestOutfit({
    userRequest: body.userRequest,
    occasion: body.occasion,
    temperatureCelsius: body.temperatureCelsius,
    closetSummary,
    closetImagePath,
    preferences: user.preferences,
  });

  sendJson(res, 200, {
    message: '추천 완료',
    recommendation,
  });
}

async function handleSaveOutfit(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);

  if (!body.title || !body.recommendation) {
    throw new Error('title과 recommendation은 필수입니다.');
  }

  const saved = saveOutfit(user, {
    title: body.title,
    recommendation: body.recommendation,
  });

  sendJson(res, 200, {
    message: '코디 저장 완료',
    saved,
  });
}

async function handleDeleteOutfits(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);

  if (!Array.isArray(body.outfitIds) || body.outfitIds.length === 0) {
    throw new Error('outfitIds는 1개 이상 필요합니다.');
  }

  const deletedCount = deleteSavedOutfits(user, body.outfitIds);
  sendJson(res, 200, {
    message: '선택한 코디 삭제 완료',
    deletedCount,
  });
}

async function handleClearOutfits(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);
  const deletedCount = clearSavedOutfits(user);

  sendJson(res, 200, {
    message: '전체 코디 삭제 완료',
    deletedCount,
  });
}

async function handlePreferences(req, res) {
  const body = await parseJsonBody(req);
  const userId = body.userId || 'demo-user';
  const user = getOrCreateUser(userId);

  user.preferences = {
    avoidColors: Array.isArray(body.avoidColors) ? body.avoidColors : user.preferences.avoidColors,
    preferItems: Array.isArray(body.preferItems) ? body.preferItems : user.preferences.preferItems,
    preferStyles: Array.isArray(body.preferStyles) ? body.preferStyles : user.preferences.preferStyles,
  };

  sendJson(res, 200, {
    message: '선호 설정 저장 완료',
    preferences: user.preferences,
  });
}

function handleHistory(req, res, userId) {
  const user = getOrCreateUser(userId || 'demo-user');
  sendJson(res, 200, {
    message: '저장 코디 목록',
    outfits: user.savedOutfits,
  });
}

function handleWeeklyPlan(req, res, userId) {
  const user = getOrCreateUser(userId || 'demo-user');
  sendJson(res, 200, {
    message: '주간 코디 계획',
    weeklyPlan: buildWeeklyPlan(user),
  });
}

function handleHome(req, res) {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>긴급 옷 코디 시작</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; margin: 24px; line-height: 1.5; }
      code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; max-width: 900px; }
      ul { margin-top: 8px; }
      a { color: #0a58ca; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>긴급 옷 코디 서비스 실행 중</h1>
      <p>핵심 화면 기반 서비스 페이지부터 시작하세요.</p>
      <p><a href="/app">핵심 화면 열기 (/app)</a></p>
      <p><a href="/test">간단 테스트 링크 (/test)</a></p>
      <p>아래는 API 목록입니다.</p>
      <ul>
        <li><code>GET /health</code></li>
        <li><code>POST /api/closet/register</code></li>
        <li><code>POST /api/recommend</code></li>
        <li><code>POST /api/outfits/save</code></li>
        <li><code>POST /api/preferences</code></li>
        <li><code>GET /api/outfits/history?userId=demo-user</code></li>
        <li><code>GET /api/weekly-plan?userId=demo-user</code></li>
      </ul>
    </div>
  </body>
</html>`;
  sendHtml(res, 200, html);
}

function handleAppPage(req, res) {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>긴급 옷 코디</title>
    <style>
      :root {
        --bg: #f4f7fb;
        --card: #ffffff;
        --line: #dde3ec;
        --text: #152238;
        --sub: #5f6c80;
        --primary: #1456d9;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background: radial-gradient(circle at 0% 0%, #eaf1ff, var(--bg) 45%);
        color: var(--text);
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 18px 14px 96px;
      }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .sub { color: var(--sub); margin: 0 0 14px; }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px;
        margin-bottom: 12px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      @media (max-width: 760px) {
        .grid { grid-template-columns: 1fr; }
      }
      label { display: block; font-size: 13px; margin-bottom: 5px; color: var(--sub); }
      input, select, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 9px;
        padding: 10px;
        font: inherit;
      }
      textarea { min-height: 86px; resize: vertical; }
      button {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        background: var(--primary);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      button.sub { background: #6c7fa8; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      .result {
        white-space: pre-wrap;
        background: #f8fbff;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
        min-height: 72px;
      }
      .tabs {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        background: #fff;
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        min-height: 76px;
      }
      .tab {
        background: transparent;
        color: var(--sub);
        border-radius: 0;
        padding: 16px 6px;
        font-size: 15px;
      }
      .tab.active { color: var(--primary); font-weight: 700; }
      .panel { display: none; }
      .panel.active { display: block; }
      ul.clean { margin: 0; padding-left: 18px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>긴급 옷 코디</h1>
      <p class="sub">핵심기능 + 부가기능 통합 화면</p>

      <section id="home" class="panel active card">
        <h3>홈 · 30초 코디 시작</h3>
        <div class="grid">
          <div>
            <label>요청</label>
            <input id="userRequest" value="지금 10분 안에 입을 코디 골라줘" />
          </div>
          <div>
            <label>상황</label>
            <select id="occasion">
              <option>출근</option>
              <option>학교</option>
              <option selected>약속</option>
              <option>운동</option>
              <option>기타</option>
            </select>
          </div>
          <div>
            <label>기온(도)</label>
            <input id="temp" type="number" value="26" />
          </div>
        </div>
        <div class="row" style="margin-top:10px;">
          <button id="runRecommend">코디 추천 받기</button>
          <button id="saveFromHome" class="sub">현재 추천 저장</button>
        </div>
        <h4>추천 결과</h4>
        <div id="recommendation" class="result">아직 추천 전</div>
      </section>

      <section id="closet" class="panel card">
        <h3>내 옷장 등록</h3>
        <div class="grid">
          <div>
            <label>옷장 요약</label>
            <textarea id="closetSummary">흰 반팔 티 2장, 연청바지 1개, 검정 슬랙스 1개, 베이지 셔츠 1장, 흰 스니커즈 1켤레</textarea>
          </div>
          <div>
            <label>아이템 목록(콤마 구분)</label>
            <textarea id="closetItems">흰 반팔 티,연청바지,검정 슬랙스,베이지 셔츠,흰 스니커즈</textarea>
          </div>
          <div>
            <label>계절 힌트</label>
            <select id="seasonHint">
              <option selected>여름</option>
              <option>겨울</option>
              <option>사계절</option>
            </select>
          </div>
        </div>
        <div class="row" style="margin-top:10px;">
          <button id="saveCloset">옷장 등록</button>
        </div>
        <div id="closetResult" class="result" style="margin-top:10px;">아직 등록 전</div>
      </section>

      <section id="saved" class="panel card">
        <h3>저장 코디</h3>
        <div class="row">
          <input id="saveTitle" style="max-width:320px;" value="오늘 코디" />
          <button id="saveOutfit">저장</button>
          <button id="loadHistory" class="sub">목록 새로고침</button>
        </div>
        <div id="history" class="result" style="margin-top:10px;">저장 목록 없음</div>
      </section>

      <section id="settings" class="panel card">
        <h3>부가기능 · 선호 설정</h3>
        <div class="grid">
          <div>
            <label>피할 색상(콤마 구분)</label>
            <input id="avoidColors" value="형광색" />
          </div>
          <div>
            <label>선호 아이템(콤마 구분)</label>
            <input id="preferItems" value="슬랙스" />
          </div>
          <div>
            <label>선호 스타일(콤마 구분)</label>
            <input id="preferStyles" value="깔끔한" />
          </div>
        </div>
        <div class="row" style="margin-top:10px;">
          <button id="savePrefs">선호 저장</button>
        </div>
        <div id="prefsResult" class="result" style="margin-top:10px;">아직 저장 전</div>
      </section>

      <section id="weekly" class="panel card">
        <h3>부가기능 · 주간 코디 계획</h3>
        <div class="row">
          <button id="loadWeekly">주간 계획 불러오기</button>
        </div>
        <div id="weeklyResult" class="result" style="margin-top:10px;">아직 조회 전</div>
      </section>

    </div>

    <nav class="tabs">
      <button class="tab active" data-target="home">홈</button>
      <button class="tab" data-target="closet">옷장</button>
      <button class="tab" data-target="saved">저장</button>
      <button class="tab" data-target="weekly">주간</button>
      <button class="tab" data-target="settings">설정</button>
    </nav>

    <script>
      const userId = 'demo-user';
      let latestRecommendation = '';

      function parseList(text) {
        return (text || '').split(',').map((v) => v.trim()).filter(Boolean);
      }

      async function api(path, method, body) {
        const res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '요청 실패');
        return data;
      }

      async function runRecommend() {
        const payload = {
          userId,
          userRequest: document.getElementById('userRequest').value,
          occasion: document.getElementById('occasion').value,
          temperatureCelsius: Number(document.getElementById('temp').value || 0),
          useLatestClosetImage: false,
        };
        const data = await api('/api/recommend', 'POST', payload);
        latestRecommendation = data.recommendation || '';
        document.getElementById('recommendation').textContent = latestRecommendation || '추천 결과 없음';
      }

      async function registerCloset() {
        const payload = {
          userId,
          summary: document.getElementById('closetSummary').value,
          items: parseList(document.getElementById('closetItems').value),
          seasonHint: document.getElementById('seasonHint').value,
        };
        const data = await api('/api/closet/register', 'POST', payload);
        document.getElementById('closetResult').textContent = '등록 완료: ' + (data.entry?.summary || '');
      }

      async function saveOutfitNow() {
        if (!latestRecommendation) {
          alert('먼저 홈에서 코디 추천을 받아주세요.');
          return;
        }
        const payload = {
          userId,
          title: document.getElementById('saveTitle').value || '오늘 코디',
          recommendation: latestRecommendation,
        };
        await api('/api/outfits/save', 'POST', payload);
        await loadHistory();
      }

      async function savePreferences() {
        const payload = {
          userId,
          avoidColors: parseList(document.getElementById('avoidColors').value),
          preferItems: parseList(document.getElementById('preferItems').value),
          preferStyles: parseList(document.getElementById('preferStyles').value),
        };
        const data = await api('/api/preferences', 'POST', payload);
        document.getElementById('prefsResult').textContent = '저장 완료: ' + JSON.stringify(data.preferences);
      }

      async function loadHistory() {
        const res = await fetch('/api/outfits/history?userId=' + encodeURIComponent(userId));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '조회 실패');
        if (!Array.isArray(data.outfits) || data.outfits.length === 0) {
          document.getElementById('history').textContent = '저장 코디 없음';
          return;
        }
        const text = data.outfits.map((o, i) => (i + 1) + '. ' + o.title + '\\n' + o.recommendation).join('\\n\\n');
        document.getElementById('history').textContent = text;
      }

      async function loadWeekly() {
        const res = await fetch('/api/weekly-plan?userId=' + encodeURIComponent(userId));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '조회 실패');
        const text = (data.weeklyPlan || []).map((d) => d.day + '일차: ' + d.suggestion).join('\\n');
        document.getElementById('weeklyResult').textContent = text || '주간 계획 없음';
      }

      function activateTab(target) {
        document.querySelectorAll('.panel').forEach((el) => {
          el.classList.toggle('active', el.id === target);
        });
        document.querySelectorAll('.tab').forEach((el) => {
          el.classList.toggle('active', el.dataset.target === target);
        });
      }

      document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.target));
      });

      document.getElementById('runRecommend').addEventListener('click', async () => {
        try { await runRecommend(); } catch (e) { alert(e.message); }
      });
      document.getElementById('saveFromHome').addEventListener('click', async () => {
        try { await saveOutfitNow(); } catch (e) { alert(e.message); }
      });
      document.getElementById('saveCloset').addEventListener('click', async () => {
        try { await registerCloset(); } catch (e) { alert(e.message); }
      });
      document.getElementById('saveOutfit').addEventListener('click', async () => {
        try { await saveOutfitNow(); } catch (e) { alert(e.message); }
      });
      document.getElementById('loadHistory').addEventListener('click', async () => {
        try { await loadHistory(); } catch (e) { alert(e.message); }
      });
      document.getElementById('savePrefs').addEventListener('click', async () => {
        try { await savePreferences(); } catch (e) { alert(e.message); }
      });
      document.getElementById('loadWeekly').addEventListener('click', async () => {
        try { await loadWeekly(); } catch (e) { alert(e.message); }
      });
    </script>
  </body>
</html>`;
  sendHtml(res, 200, html);
}

function handleTestPage(req, res) {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>긴급 옷 코디 테스트</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; margin: 24px; line-height: 1.5; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 16px; max-width: 900px; }
      button { padding: 10px 16px; border: 0; border-radius: 8px; background: #222; color: #fff; cursor: pointer; }
      pre { background: #f5f5f5; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>긴급 옷 코디 테스트 링크</h1>
      <p>아래 버튼을 누르면 추천 API를 호출해서 결과를 보여줍니다.</p>
      <button id="run">테스트 실행</button>
      <h3>결과</h3>
      <pre id="result">대기 중...</pre>
    </div>
    <script>
      async function runTest() {
        const resultEl = document.getElementById('result');
        resultEl.textContent = '호출 중...';

        try {
          const response = await fetch('/api/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: 'demo-user',
              userRequest: '지금 10분 안에 입을 코디 골라줘',
              occasion: '주말 카페 약속',
              temperatureCelsius: 26
            })
          });

          const data = await response.json();
          if (!response.ok) {
            resultEl.textContent = '실패: ' + JSON.stringify(data, null, 2);
            return;
          }

          resultEl.textContent = '연결 성공\\n\\n' + (data.recommendation || '추천 결과 없음');
        } catch (error) {
          resultEl.textContent = '실패: ' + error.message;
        }
      }

      document.getElementById('run').addEventListener('click', runTest);
    </script>
  </body>
</html>`;
  sendHtml(res, 200, html);
}

function handleWebsite(req, res) {
  const htmlPath = path.join(__dirname, 'site.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  sendHtml(res, 200, html);
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const pathname = requestUrl.pathname;

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && pathname === '/') {
        handleWebsite(req, res);
        return;
      }

      if (req.method === 'GET' && pathname === '/test') {
        handleTestPage(req, res);
        return;
      }

      if (req.method === 'GET' && pathname === '/app') {
        handleWebsite(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/closet/register') {
        await handleClosetRegister(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/recommend') {
        await handleRecommend(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/outfits/save') {
        await handleSaveOutfit(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/outfits/delete') {
        await handleDeleteOutfits(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/outfits/clear') {
        await handleClearOutfits(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/preferences') {
        await handlePreferences(req, res);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/outfits/history') {
        handleHistory(req, res, requestUrl.searchParams.get('userId'));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/weekly-plan') {
        handleWeeklyPlan(req, res, requestUrl.searchParams.get('userId'));
        return;
      }

      notFound(res);
    } catch (error) {
      sendJson(res, 400, {
        error: error.message || '요청 처리 중 오류가 발생했습니다.',
      });
    }
  });
}

function startServer(port = 3000) {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

module.exports = {
  createServer,
  startServer,
};

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  startServer(port).then(() => {
    console.log(`서비스 실행: http://localhost:${port}`);
  });
}
