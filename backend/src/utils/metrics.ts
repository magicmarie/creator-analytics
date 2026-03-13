/**
 * Metrics Calculation Utilities
 *
 * Pure functions for calculating creator analytics metrics.
 * Works with data from any platform (YouTube, GitHub, TikTok, etc.)
 */

/**
 * Calculate engagement rate from content metrics
 *
 * Formula: (total_likes + total_comments) / total_views
 *
 * @param content Array of content items with engagement metrics
 * @returns Engagement rate between 0 and 1 (0% to 100%)
 */
export function calculateEngagementRate(
  content: Array<{ views: number | null; likes: number | null; comments: number | null }>
): number {
  if (!content || content.length === 0) return 0;

  let totalViews = 0;
  let totalEngagements = 0;

  for (const item of content) {
    const views = item.views ?? 0;
    const likes = item.likes ?? 0;
    const comments = item.comments ?? 0;

    totalViews += views;
    totalEngagements += likes + comments;
  }

  if (totalViews === 0) return 0;

  // Cap at 1.0 (100%) for data quality
  return Math.min(totalEngagements / totalViews, 1);
}

/**
 * Calculate percentage change between two values
 */
export function percentDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Detect significant engagement drop (for alerts)
 */
export function isEngagementDrop(
  current: number,
  previous: number | null,
  thresholdPct = 20
): boolean {
  if (previous === null || previous === 0) return false;
  const delta = percentDelta(current, previous);
  return delta <= -thresholdPct;
}
