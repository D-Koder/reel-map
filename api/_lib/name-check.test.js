// Run with: node --test api/_lib/name-check.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { nameInPost } = require('./name-check');

const caption = 'Queen Victoria Christmas Night Market 25 Nov – 16 Dec (Wednesdays)';

test('a name written in the post is accepted, whatever its case or punctuation', () => {
  assert.equal(nameInPost('Queen Victoria Christmas Night Market', [caption]), true);
  assert.equal(nameInPost('queen-victoria christmas night market', [caption]), true);
  assert.equal(nameInPost('Café Lumière', ['Café Lumière, Le Marais']), true);
});

test('a name the post does not write is flagged', () => {
  assert.equal(nameInPost('The Night Market at QVM', [caption]), false);
  assert.equal(nameInPost('Biblio Cafe', ['The new café at State Library Victoria']), false);
});

test('a name found in the tagged account or location tag counts', () => {
  assert.equal(nameInPost('Biblio Cafe', ['State Library Victoria', 'biblio__cafe']), true);
  assert.equal(nameInPost('Biblio Cafe', ['State Library Victoria', '', 'biblio__cafe']), true);
});

test('texts are checked one at a time, so two texts never join into a match', () => {
  assert.equal(nameInPost('abcd', ['ab', 'cd']), false);
});

test('an empty name is not flagged', () => {
  assert.equal(nameInPost('', [caption]), true);
});
