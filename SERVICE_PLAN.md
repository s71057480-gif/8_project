# 긴급 옷 코디 서비스 설계서

## 1) 핵심 기능 명세

### A. 옷장 등록
- 목적: 사용자의 실제 보유 옷 정보를 추천에 반영
- 입력:
  - imagePath(선택): 옷장 사진 파일 경로
  - summary(선택): 사용자가 직접 입력한 요약
  - items(선택): 아이템 배열
  - seasonHint(선택): 계절 힌트
- 처리:
  - imagePath가 있으면 AI가 사진 분석 후 summary/items/seasonHint 생성
  - summary만 있어도 등록 가능
- 출력:
  - 등록 완료 메시지
  - entry id, createdAt, 요약 정보

### B. 빠른 코디 추천
- 목적: 10~30초 안에 바로 입을 코디 추천
- 입력:
  - userRequest(필수): 예) 지금 10분 안에 입을 코디 골라줘
  - occasion(선택): 출근/약속/학교 등
  - temperatureCelsius(선택): 현재 기온
  - closetSummary(선택): 수동 요약
  - useLatestClosetImage(선택): 최근 옷장 이미지 반영 여부
- 처리:
  - 옷장 요약 + 선호 설정 + 상황 + 기온 기반으로 AI 추천
- 출력:
  - 추천 결과 텍스트(2~3개 조합 + 이유)

### C. 오늘 코디 저장
- 목적: 선택한 코디 재사용
- 입력:
  - title(필수)
  - recommendation(필수)
- 출력:
  - 저장 완료 메시지
  - saved id, createdAt

## 2) 부가기능 명세

### A. 선호 설정
- 목적: 개인 취향 반영
- 입력:
  - avoidColors: 피할 색상 배열
  - preferItems: 선호 아이템 배열
  - preferStyles: 선호 스타일 배열
- 출력:
  - 저장된 preferences

### B. 저장 코디 히스토리
- 목적: 과거 코디 조회
- 출력:
  - 저장 코디 목록

### C. 주간 코디 계획
- 목적: 7일 코디 빠른 준비
- 처리:
  - 최근 저장 코디 기반 7일 추천 구성
- 출력:
  - day 1~7 suggestion

## 3) API 설계

### 1. 헬스체크
- GET /health
- 응답: { ok: true }

### 2. 옷장 등록
- POST /api/closet/register
- 요청 예시:
{
  "userId": "demo-user",
  "summary": "흰 반팔 티 2장, 연청바지 1개",
  "items": ["흰 반팔 티", "연청바지"],
  "seasonHint": "여름"
}
- 또는 imagePath 사용:
{
  "userId": "demo-user",
  "imagePath": "./closet.jpg",
  "note": "여름 옷 위주"
}

### 3. 코디 추천
- POST /api/recommend
- 요청 예시:
{
  "userId": "demo-user",
  "userRequest": "지금 10분 안에 입을 코디 골라줘",
  "occasion": "주말 카페 약속",
  "temperatureCelsius": 26,
  "useLatestClosetImage": false
}

### 4. 코디 저장
- POST /api/outfits/save
- 요청 예시:
{
  "userId": "demo-user",
  "title": "주말 카페 빠른 코디",
  "recommendation": "추천 텍스트"
}

### 5. 선호 설정
- POST /api/preferences
- 요청 예시:
{
  "userId": "demo-user",
  "avoidColors": ["형광색"],
  "preferItems": ["슬랙스"],
  "preferStyles": ["깔끔한"]
}

### 6. 저장 코디 조회
- GET /api/outfits/history?userId=demo-user

### 7. 주간 계획 조회
- GET /api/weekly-plan?userId=demo-user

## 4) 화면 흐름(핵심 + 부가기능)

### 화면 1: 홈
- CTA: 30초 코디 시작
- 보조: 날씨/오늘 일정

### 화면 2: 옷장 등록
- 사진 촬영/업로드
- 수동 요약 입력(선택)
- 등록 완료

### 화면 3: 추천 결과
- 2~3개 코디 + 이유
- 버튼: 오늘 코디 저장

### 화면 4: 선호 설정(부가기능)
- 피할 색/선호 아이템/선호 스타일 설정

### 화면 5: 저장 코디
- 과거 코디 목록
- 다시 입기

### 화면 6: 주간 계획(부가기능)
- 7일 추천 확인

## 5) 실행 방법

### 서버 실행
- 명령: node appServer.js
- 주소: http://localhost:3000

### 통합 테스트
- 명령: node test-service.js
- 기대 출력:
  - 서비스 통합 테스트 성공
  - 추천 결과 텍스트

## 6) 현재 구현 파일
- aiStylist.js: Azure OpenAI 호출, 코디 추천, 옷장 사진 분석
- serviceStore.js: 사용자/옷장/코디/선호 데이터 메모리 저장
- appServer.js: 핵심/부가기능 API 서버
- test-service.js: 통합 테스트
