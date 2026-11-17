import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategories, getCategoryById } from '../server/database.js';

test('GET categories data returns all four categories with servicesCount', () => {
  assert.deepEqual(getCategories(), [
    { id: 1, name: 'Стрижки и укладки', servicesCount: 5 },
    { id: 2, name: 'Маникюр и педикюр', servicesCount: 5 },
    { id: 3, name: 'Брови и ресницы', servicesCount: 4 },
    { id: 4, name: 'Спа-процедуры', servicesCount: 4 },
  ]);
});

test('GET category by id returns matching category', () => {
  assert.deepEqual(getCategoryById(1), {
    id: 1, name: 'Стрижки и укладки', servicesCount: 5,
  });
});

test('unknown category id returns null (for HTTP 404 response)', () => {
  assert.equal(getCategoryById(999), null);
  assert.equal(getCategoryById(Number.NaN), null);
});
