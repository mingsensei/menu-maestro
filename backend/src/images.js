import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { HttpError, unwrap } from './errors.js';

const bucket = 'menu-images';
export async function uploadImages(client, bytes) {
  let full, thumb;
  try {
    let image;
    const brand = bytes.subarray(8, 12).toString();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      const { default: decode } = await import('heic-decode');
      const images = await decode.all({ buffer: bytes });
      try {
        if (!images[0] || images[0].width * images[0].height > 40000000) throw new Error('Image is too large');
        const { data, width, height } = await images[0].decode();
        image = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
      } finally { images.dispose(); }
    } else image = sharp(bytes, { limitInputPixels: 40000000, failOn: 'error' }).rotate();
    [full, thumb] = await Promise.all([
      image.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      image.clone().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    ]);
  } catch { throw new HttpError(400, 'Cannot decode this image or it exceeds 40 megapixels. Please try a smaller JPEG, PNG, WebP, AVIF or HEIC image.'); }
  const names = [`${randomUUID()}.webp`, `${randomUUID()}-thumb.webp`];
  try {
    // Sequential uploads let us roll back a partial upload deterministically.
    unwrap(await client.storage.from(bucket).upload(names[0], full, { contentType: 'image/webp', cacheControl: '31536000' }));
    unwrap(await client.storage.from(bucket).upload(names[1], thumb, { contentType: 'image/webp', cacheControl: '31536000' }));
  } catch (error) { await client.storage.from(bucket).remove(names); throw error; }
  return { imageUrl: client.storage.from(bucket).getPublicUrl(names[0]).data.publicUrl, thumbnailUrl: client.storage.from(bucket).getPublicUrl(names[1]).data.publicUrl };
}

export async function optimizeItem(client, item, supabaseUrl) {
  if (!item.image_url) return null;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
  // Only read this project's own storage; never fetch arbitrary image URLs on the server.
  if (!item.image_url.startsWith(prefix)) return null;
  const path = decodeURIComponent(item.image_url.slice(prefix.length).split('?')[0]);
  const blob = unwrap(await client.storage.from(bucket).download(path));
  if (path.endsWith('.webp') && blob.size <= 400 * 1024 && item.thumbnail_url) return null;
  const images = await uploadImages(client, Buffer.from(await blob.arrayBuffer()));
  unwrap(await client.from('menu_items').update({ image_url: images.imageUrl, thumbnail_url: images.thumbnailUrl }).eq('id', item.id));
  return images;
}
