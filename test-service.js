const { startServer } = require('./appServer');

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function run() {
  const server = await startServer(3010);
  const base = 'http://localhost:3010';

  try {
    await postJson(`${base}/api/closet/register`, {
      userId: 'demo-user',
      summary: '흰 반팔 티 2장, 연청바지 1개, 검정 슬랙스 1개, 베이지 셔츠 1장, 흰 스니커즈 1켤레',
      items: ['흰 반팔 티', '연청바지', '검정 슬랙스', '베이지 셔츠', '흰 스니커즈'],
      seasonHint: '여름',
    });

    await postJson(`${base}/api/preferences`, {
      userId: 'demo-user',
      avoidColors: ['형광색'],
      preferItems: ['슬랙스'],
      preferStyles: ['깔끔한'],
    });

    const recommendation = await postJson(`${base}/api/recommend`, {
      userId: 'demo-user',
      userRequest: '오늘 10분 안에 입을 코디 골라줘',
      occasion: '주말 카페 약속',
      temperatureCelsius: 26,
      useLatestClosetImage: false,
    });

    if (!recommendation.recommendation) {
      throw new Error('추천 결과가 비어 있습니다.');
    }

    await postJson(`${base}/api/outfits/save`, {
      userId: 'demo-user',
      title: '주말 카페 빠른 코디',
      recommendation: recommendation.recommendation,
    });

    const history = await getJson(`${base}/api/outfits/history?userId=demo-user`);
    const weekly = await getJson(`${base}/api/weekly-plan?userId=demo-user`);

    if (!Array.isArray(history.outfits) || history.outfits.length === 0) {
      throw new Error('저장 코디 히스토리가 비어 있습니다.');
    }
    if (!Array.isArray(weekly.weeklyPlan) || weekly.weeklyPlan.length !== 7) {
      throw new Error('주간 계획 생성 실패');
    }

    console.log('서비스 통합 테스트 성공');
    console.log('--- 추천 결과 ---');
    console.log(recommendation.recommendation);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('서비스 통합 테스트 실패');
  console.error(error.message);
  process.exit(1);
});
