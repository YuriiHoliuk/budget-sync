/**
 * Chunk a date range into periods of max specified days.
 * Returns array of { from, to } date pairs.
 */
export function chunkDateRange(
  from: Date,
  to: Date,
  maxDaysPerChunk: number = 31,
): Array<{ from: Date; to: Date }> {
  const chunks: Array<{ from: Date; to: Date }> = [];
  const maxMs = maxDaysPerChunk * 24 * 60 * 60 * 1000;

  let currentFrom = new Date(from);

  while (currentFrom < to) {
    const chunkEnd = new Date(
      Math.min(currentFrom.getTime() + maxMs, to.getTime()),
    );
    chunks.push({
      from: new Date(currentFrom),
      to: chunkEnd,
    });
    currentFrom = chunkEnd;
  }

  return chunks;
}
