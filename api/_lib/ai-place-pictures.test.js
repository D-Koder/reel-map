// Run with: node --test api/_lib/ai-place-pictures.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { userContent } = require('./ai-place');

test('every picture is sent, in order, numbered, before the post text', () => {
  const content = userContent({ caption: 'Markets', imageUrls: ['https://a.test/1.jpg', 'https://a.test/2.jpg'] });
  const images = content.filter((block) => block.type === 'image').map((block) => block.source.url);
  assert.deepEqual(images, ['https://a.test/1.jpg', 'https://a.test/2.jpg']);
  assert.equal(content[0].text, 'Picture 1 of 2:');
  assert.equal(content[2].text, 'Picture 2 of 2:');
  assert.match(content[content.length - 1].text, /Markets/);
});

test('pictures that are not web addresses, or repeats, are not sent', () => {
  const content = userContent({ caption: 'x', imageUrls: ['http://plain.test/a.jpg', 'https://ok.test/b.jpg', 'https://ok.test/b.jpg'] });
  assert.equal(content.filter((block) => block.type === 'image').length, 1);
});

test('with no pictures the caption goes as plain text', () => {
  assert.equal(typeof userContent({ caption: 'Just text', imageUrls: [] }), 'string');
});
