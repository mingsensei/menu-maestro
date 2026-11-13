import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { uploadImages } from '../src/images.js';

function storage(failThumbnail = false) {
  const files = new Map();
  const removed = [];
  const client = { storage: { from: () => ({
    upload: async (name, bytes) => { if (failThumbnail && name.includes('-thumb')) return { error: new Error('storage failed') }; files.set(name, bytes); return { data: { path: name } }; },
    getPublicUrl: name => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/menu-images/${name}` } }),
    remove: async names => { removed.push(...names); for (const name of names) files.delete(name); return { error: null }; },
  }) } };
  return { client, files, removed };
}
test('processes an original into browser-compatible WebP and a smaller mobile thumbnail', async () => {
  const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#713a2e' } }).jpeg().toBuffer();
  const { client, files } = storage();
  const result = await uploadImages(client, original);
  const full = await sharp(files.get(result.imageUrl.split('/').at(-1))).metadata();
  const thumb = await sharp(files.get(result.thumbnailUrl.split('/').at(-1))).metadata();
  assert.deepEqual([full.width, full.height, full.format], [1200, 600, 'webp']);
  assert.deepEqual([thumb.width, thumb.height, thumb.format], [400, 200, 'webp']);
});
test('invalid images do not produce uploads and partial upload failures are rolled back', async () => {
  const invalid = storage();
  await assert.rejects(() => uploadImages(invalid.client, Buffer.from('not an image')), error => error.status === 400);
  assert.equal(invalid.files.size, 0);
  const original = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const partial = storage(true);
  await assert.rejects(() => uploadImages(partial.client, original));
  assert.equal(partial.files.size, 0);
  assert.equal(partial.removed.length, 2);
});
