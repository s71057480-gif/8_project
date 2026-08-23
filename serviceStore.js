const { randomUUID } = require('crypto');

const store = {
  users: {
    'demo-user': {
      id: 'demo-user',
      preferences: {
        avoidColors: [],
        preferItems: [],
        preferStyles: [],
      },
      closetEntries: [],
      savedOutfits: [],
    },
  },
};

function getOrCreateUser(userId = 'demo-user') {
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      preferences: {
        avoidColors: [],
        preferItems: [],
        preferStyles: [],
      },
      closetEntries: [],
      savedOutfits: [],
    };
  }
  return store.users[userId];
}

function registerClosetEntry(user, entry) {
  const next = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  user.closetEntries.push(next);
  return next;
}

function buildClosetSummary(user) {
  if (user.closetEntries.length === 0) {
    return '';
  }

  return user.closetEntries
    .slice(-5)
    .map((entry) => entry.summary)
    .filter(Boolean)
    .join(' | ');
}

function getLatestClosetImagePath(user) {
  for (let i = user.closetEntries.length - 1; i >= 0; i -= 1) {
    const item = user.closetEntries[i];
    if (item.imagePath) return item.imagePath;
  }
  return '';
}

function saveOutfit(user, outfit) {
  const normalizedTitle = String(outfit.title || '').trim();
  const normalizedRecommendation = String(outfit.recommendation || '').trim();

  const next = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...outfit,
    title: normalizedTitle || '오늘 코디',
    recommendation: normalizedRecommendation,
  };
  user.savedOutfits.unshift(next);
  return next;
}

function deleteSavedOutfits(user, outfitIds) {
  const idSet = new Set((outfitIds || []).filter(Boolean));
  const before = user.savedOutfits.length;
  user.savedOutfits = user.savedOutfits.filter((item) => !idSet.has(item.id));
  return before - user.savedOutfits.length;
}

function clearSavedOutfits(user) {
  const deletedCount = user.savedOutfits.length;
  user.savedOutfits = [];
  return deletedCount;
}

function buildWeeklyPlan(user) {
  const base = user.savedOutfits.slice(0, 3);
  const fallback = [
    '흰 티 + 청바지 + 스니커즈',
    '셔츠 + 슬랙스 + 로퍼',
    '가벼운 아우터 + 티 + 면바지',
  ];

  const list = [];
  for (let day = 1; day <= 7; day += 1) {
    const source = base[(day - 1) % (base.length || 1)];
    list.push({
      day,
      suggestion: source?.title || fallback[(day - 1) % fallback.length],
    });
  }

  return list;
}

module.exports = {
  getOrCreateUser,
  registerClosetEntry,
  buildClosetSummary,
  getLatestClosetImagePath,
  saveOutfit,
  deleteSavedOutfits,
  clearSavedOutfits,
  buildWeeklyPlan,
};
