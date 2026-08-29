const fs = require('fs');
const path = require('path');

function toDataUrl(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const mimeType = mimeMap[extension] || 'image/jpeg';
  const fileBuffer = fs.readFileSync(imagePath);
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
}

function loadEnv(envPath = '.env') {
  const fullPath = path.resolve(envPath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getConfig() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').trim();
  const apiKey = (process.env.AZURE_OPENAI_API_KEY || '').trim();
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT || '').trim();

  const missing = [];
  if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
  if (!apiKey) missing.push('AZURE_OPENAI_API_KEY');
  if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT');

  if (missing.length > 0) {
    throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  }

  return { endpoint, apiKey, deployment };
}

function buildStylistPrompt() {
  return [
    '너는 긴급 옷 코디 AI다.',
    '사용자가 빠른 시간 안에 옷을 결정하도록 도와야 한다.',
    '사용자가 옷장 사진을 찍어 등록했다면, 사진 분석 내용(등록 요약)을 가장 우선으로 반영해 코디를 제안해라.',
    '답변은 한국어 존댓말로 자연스럽고 간단하게 작성해라.',
    '불필요하게 과장하거나 같은 표현을 반복하지 마라.',
    '답변은 2~3개 코디를 제시하고, 각 코디마다 이유를 한 줄로 설명해라.',
    '비난하거나 단정적인 표현은 피하고, 실용적으로 제안해라.',
    '매우 중요: 절대 마크다운을 사용하지 마라. **기호, *기호, #기호를 사용하면 안 된다. 순수 한글 텍스트만 사용해라.',
    '형식: 1번, 2번 이런 식으로 번호만 사용하고, 코디 이름과 아이템을 함께 쓰고, 이유를 짧게 덧붙여라.'
  ].join(' ');
}

function buildClosetAnalyzerPrompt() {
  return [
    '너는 옷장 등록 도우미 AI다.',
    '입력된 옷장 사진을 보고 사용 가능한 옷 아이템을 한국어로 요약해라.',
    '응답 형식은 반드시 JSON 문자열로만 반환한다.',
    'JSON 스키마: {"summary":"문장", "items":["아이템1","아이템2"], "seasonHint":"여름/겨울/사계절 중 하나"}',
    '모르면 추정이라고 밝히고 너무 확신하지 마라.'
  ].join(' ');
}

function buildPreferenceLines(preferences) {
  if (!preferences) return [];

  const lines = [];
  if (Array.isArray(preferences.avoidColors) && preferences.avoidColors.length > 0) {
    lines.push(`피해야 할 색상: ${preferences.avoidColors.join(', ')}`);
  }
  if (Array.isArray(preferences.preferItems) && preferences.preferItems.length > 0) {
    lines.push(`선호 아이템: ${preferences.preferItems.join(', ')}`);
  }
  if (Array.isArray(preferences.preferStyles) && preferences.preferStyles.length > 0) {
    lines.push(`선호 스타일: ${preferences.preferStyles.join(', ')}`);
  }
  return lines;
}

function removeMarkdown(text) {
  // 모든 마크다운 형식 제거
  if (typeof text !== 'string') return text;
  
  // **bold** → bold
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  // *italic* → italic
  text = text.replace(/\*(.+?)\*/g, '$1');
  // # 헤더 제거
  text = text.replace(/^#+\s+/gm, '');
  
  return text;
}

async function requestAzureOpenAI({ messages, temperature = 0.6, maxCompletionTokens = 400 }) {
  loadEnv();
  const { endpoint, apiKey, deployment } = getConfig();

  const payload = {
    model: deployment,
    messages,
    temperature,
    max_completion_tokens: maxCompletionTokens,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function suggestOutfit({
  userRequest,
  occasion,
  temperatureCelsius,
  closetSummary,
  closetImagePath,
  preferences,
}) {
  const context = [];
  context.push(`사용자 요청: ${userRequest}`);
  if (occasion) context.push(`상황: ${occasion}`);
  if (typeof temperatureCelsius === 'number') context.push(`기온: ${temperatureCelsius}도`);
  if (closetSummary) context.push(`등록된 옷장 정보(사진 분석 요약): ${closetSummary}`);
  context.push(...buildPreferenceLines(preferences));

  const userContent = [{ type: 'text', text: context.join('\n') }];

  if (closetImagePath) {
    const absoluteImagePath = path.resolve(closetImagePath);
    if (!fs.existsSync(absoluteImagePath)) {
      throw new Error(`옷장 이미지 파일을 찾을 수 없습니다: ${absoluteImagePath}`);
    }

    userContent.push({
      type: 'image_url',
      image_url: {
        url: toDataUrl(absoluteImagePath),
      },
    });
  }

  const response = await requestAzureOpenAI({
    messages: [
      { role: 'system', content: buildStylistPrompt() },
      { role: 'user', content: userContent },
    ],
    temperature: 0.6,
    maxCompletionTokens: 400,
  });

  return removeMarkdown(response);
}

async function analyzeClosetImage({ imagePath, extraNote }) {
  const absoluteImagePath = path.resolve(imagePath);
  if (!fs.existsSync(absoluteImagePath)) {
    throw new Error(`옷장 이미지 파일을 찾을 수 없습니다: ${absoluteImagePath}`);
  }

  const userParts = [
    {
      type: 'text',
      text: [
        '이 사진은 사용자 옷장 등록용 이미지다.',
        extraNote ? `추가 설명: ${extraNote}` : '',
        '아이템 목록과 한 줄 요약을 JSON 형식으로만 반환해라.'
      ].filter(Boolean).join('\n'),
    },
    {
      type: 'image_url',
      image_url: {
        url: toDataUrl(absoluteImagePath),
      },
    },
  ];

  const content = await requestAzureOpenAI({
    messages: [
      { role: 'system', content: buildClosetAnalyzerPrompt() },
      { role: 'user', content: userParts },
    ],
    temperature: 0.2,
    maxCompletionTokens: 500,
  });

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '옷장 이미지 분석 결과 요약 없음',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      seasonHint: parsed.seasonHint || '사계절',
      raw: content,
    };
  } catch (error) {
    return {
      summary: content || '옷장 이미지 분석 결과 요약 없음',
      items: [],
      seasonHint: '사계절',
      raw: content,
    };
  }
}

module.exports = {
  suggestOutfit,
  analyzeClosetImage,
  loadEnv,
};
