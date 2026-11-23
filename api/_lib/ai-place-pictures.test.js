// Run with: node --test api/_lib/ai-place-pictures.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { userContent } = require('./ai-place');

const realFetch = global.fetch;
function stubPictures(types = {}) {
  global.fetch = async (url) => {
    const type = types[url] ?? 'image/jpeg';
    if (!type) return { ok: false, headers: new Map() };
    return { ok: true, headers: new Map([['content-type', type]]), arrayBuffer: async () => Buffer.from('pixels').buffer };
  };
}

test('every downloaded picture is sent as bytes, in order, numbered, before the post text', async () => {
  stubPictures();
  const content = await userContent({ caption: 'Markets', imageUrls: ['https://a.test/1.jpg', 'https://a.test/2.jpg'] });
  const images = content.filter((block) => block.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(images[0].source.type, 'base64');
  assert.equal(images[0].source.media_type, 'image/jpeg');
  assert.equal(content[0].text, 'Picture 1 of 2:');
  assert.equal(content[2].text, 'Picture 2 of 2:');
  assert.match(content[content.length - 1].text, /Markets/);
  global.fetch = realFetch;
});

test('a picture that cannot be downloaded, or is not an image, is left out', async () => {
  stubPictures({ 'https://ok.test/b.jpg': 'image/png', 'https://bad.test/c.html': 'text/html' });
  const content = await userContent({ caption: 'x', imageUrls: ['http://plain.test/a.jpg', 'https://ok.test/b.jpg', 'https://bad.test/c.html', 'https://ok.test/b.jpg'] });
  assert.equal(content.filter((block) => block.type === 'image').length, 1);
  global.fetch = realFetch;
});

test('with no pictures the caption goes as plain text', async () => {
  assert.equal(typeof await userContent({ caption: 'Just text', imageUrls: [] }), 'string');
});
