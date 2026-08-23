const { suggestOutfit } = require('./aiStylist');

async function run() {
  const result = await suggestOutfit({
    userRequest: '지금 10분 안에 입고 나갈 옷 골라줘.',
    occasion: '주말 카페 약속',
    temperatureCelsius: 26,
    closetSummary: '흰 반팔 티 2장, 연청바지 1개, 검정 슬랙스 1개, 베이지 셔츠 1장, 흰 스니커즈 1켤레'
  });

  if (!result) {
    throw new Error('응답이 비어 있습니다.');
  }

  console.log('연결 성공');
  console.log('--- AI 응답 ---');
  console.log(result);
}

run().catch((error) => {
  console.error('연결 실패');
  console.error(error.message);
  process.exit(1);
});
