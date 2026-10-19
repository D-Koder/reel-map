// Checks the AI caption reader (api/_lib/ai-place.js) on captions it hasn't seen in its examples.
// Usage: node --env-file=.env.local scripts/test-ai-place.js   (.env.local holds ANTHROPIC_API_KEY=...)
// Each case costs about $0.0001 with Claude Haiku 5.5.
const { aiPlace } = require('../api/_lib/ai-place');

const CASES = [
  {
    label: 'Japanese label line',
    post: {
      creator: 'tokyo.sweets.club',
      locationTag: '渋谷区',
      caption: '濃厚抹茶パフェ🍵 最高でした！\n店名：茶寮みどり\n住所：東京都渋谷区神南1-2-3\n#東京カフェ #抹茶',
    },
    expect: { kind: 'single', name: '茶寮みどり' },
  },
  {
    label: 'Reviewer thanks venue handle, no pin',
    post: {
      creator: 'brisbane.eats',
      caption: 'The fried chicken bao here is unreal 😮‍💨 thank you @baobox.westend for the invite! #brisbanefood',
    },
    expect: { kind: 'single', name: 'baobox.westend' },
  },
  {
    label: 'Spanish list, no slide',
    post: {
      creator: 'madrid.come',
      caption: 'Las 3 mejores churrerías de Madrid 🍫\n📍 Churrería El Sol – Calle Mayor 12\n📍 Chocolatería Luna – Calle Arenal 5\n📍 Casa Porras – Calle de Toledo 40',
    },
    expect: { kind: 'list', count: 3 },
  },
  {
    label: 'Order-only, Korean',
    post: {
      creator: 'mochi.studio.kr',
      caption: '추석 선물세트 예약 받아요 🎁\n프로필 링크로 주문해주세요\n픽업: 성수동 공유주방 (매장 없음)',
    },
    expect: { kind: 'order_only' },
  },
  {
    label: 'Traditional Chinese list, simplified spellings',
    post: {
      creator: 'sasa_finger_licking',
      caption: '🇨🇳上海4間必吃蟹黃系列🦀\n🥇 人和館｜蟹粉拌飯\n🥈 屋有鮮｜感謝貴客 綜合小籠\n🥉 裕興記｜金牌蟹黃大湯包\n' +
        '④萊萊小籠｜蟹粉鮮肉小籠\n\n#莎莎玩上海 #上海美食 #小籠包 #shanghai',
    },
    expect: { kind: 'list', count: 4, otherName: '人和馆' },
  },
  {
    label: 'Travel vlog, no venue',
    post: {
      creator: 'sam.travels',
      locationTag: 'Bali, Indonesia',
      caption: 'Day 4 in Bali 🌴 sunrise hike, then slept all afternoon lol. Best trip ever 💛 #bali #travel',
    },
    expect: { kind: 'none' },
  },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY to run this.');
    process.exit(1);
  }
  let passed = 0;
  for (const { label, post, expect } of CASES) {
    const result = await aiPlace(post);
    const names = result?.places.map((place) => place.name) ?? [];
    const ok = result && result.kind === expect.kind &&
      (!expect.name || names[0] === expect.name) &&
      (!expect.count || names.length === expect.count) &&
      (!expect.otherName || result.places[0]?.otherName === expect.otherName);
    if (ok) passed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    console.log(`      ${JSON.stringify(result)}`);
  }
  console.log(`\n${passed}/${CASES.length} passed`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main();
