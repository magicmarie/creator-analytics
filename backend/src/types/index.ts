import type { Platform } from './platforms';

/**
 * Core domain types
 */

export interface Creator {
  id: string;
  platform: Platform;
  handle: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  profile_url: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatorSnapshot {
  id: string;
  creator_id: string;
  captured_at: Date;
  followers: number;
  following: number | null;
  post_count: number;
  engagement_rate: number;
  total_views: bigint | null;
}

export interface Content {
  id: string;
  creator_id: string;
  platform: Platform;
  platform_content_id: string;
  title: string;
  url: string;
  published_at: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnail_url: string | null;
  ingested_at: Date;
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  budget: number | null;
  start_date: Date;
  end_date: Date | null;
  status: 'active' | 'completed' | 'draft';
  created_at: Date;
}

export interface TrackedCreator {
  id: string;
  platform: Platform;
  platform_id: string;
  handle: string;
  enabled: boolean;
  added_at: Date;
}

/**
 * Ingestion result tracking
 */
export interface IngestionResult {
  platform: Platform;
  creators_upserted: number;
  snapshots_written: number;
  content_upserted: number;
  errors: string[];
  duration_ms: number;
}

/**
 * API response types
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Re-export platform types to create a single source of truth for all types
 */
export type { Platform } from './platforms';
export { PLATFORMS, isPlatform, validatePlatform } from './platforms';
