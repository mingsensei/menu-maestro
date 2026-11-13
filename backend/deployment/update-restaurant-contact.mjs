import { access, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createKnowledgeStore, defaultKnowledgePath } from '../src/knowledge.js';

const email = 'litalianoriverside@gmail.com';
const owner = 'Mr. Darin';
export function updatedRestaurantContact(content) {
  const parts = content.split(/(?=^##\s)/m);
  const index = parts.findIndex(part => /^##[^\n]*(?:liên hệ|contact)/iu.test(part));
  const facts = `Email: ${email}.\nChủ nhà hàng: ${owner}.`;
  if (index < 0) return `${content.trimEnd()}\n\n## Địa chỉ và liên hệ\n${facts}\n`;
  if (parts[index].includes(`Email: ${email}.`) && parts[index].includes(`Chủ nhà hàng: ${owner}.`)) return content;
  parts[index] = parts[index].replace(/^(?:[-*]\s*)?(?:Email|E-mail|Chủ nhà hàng|Owner)\s*:[^\n]*(?:\n|$)/gmi, '').trimEnd() + `\n${facts}\n\n`;
  return parts.join('');
}

export async function migrateRestaurantContact(path = defaultKnowledgePath) {
  // Apply this approved fact update once; later admin edits survive deployments.
  const marker = `${path}.contact-v1.done`;
  try { await access(marker); return false; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const store = createKnowledgeStore(path);
  const current = await store.read();
  const content = updatedRestaurantContact(current.content);
  if (content !== current.content) await store.save({ version: current.version, content });
  await writeFile(marker, 'restaurant-contact-v1\n', { flag: 'wx', mode: 0o600 });
  return content !== current.content;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrateRestaurantContact(process.env.KNOWLEDGE_BASE_PATH || defaultKnowledgePath);
  console.log('Restaurant contact knowledge is up to date.');
}
