import { claimOnce, pushRecent, setJson } from './redis-store.js';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function persistRingEvent(summary, options = {}) {
  if (!summary?.requestId) throw new Error('Ring event is missing meta.request_id');

  const dedupeKey = `ring:dedupe:${summary.requestId}`;
  const claimed = await claimOnce(dedupeKey, DEDUPE_TTL_SECONDS, options);
  if (!claimed) return { duplicate: true };

  const record = {
    ...summary,
    receivedAt: new Date().toISOString()
  };

  try {
    await setJson(`ring:event:${summary.requestId}`, record, EVENT_TTL_SECONDS, options);
    await pushRecent('ring:events:recent', summary.requestId, 200, options);
    return { duplicate: false, record };
  } catch (error) {
    // Release the dedupe claim if persistence failed so Ring can retry safely.
    try {
      const { redisCommand } = await import('./redis-store.js');
      await redisCommand(['DEL', dedupeKey], options);
    } catch {
      // Preserve original persistence error.
    }
    throw error;
  }
}
