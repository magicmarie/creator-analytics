/**
 * Platform Type System - Single Source of Truth
 *
 * This module defines all supported platforms in one place.
 * Database constraints are generated from this list, ensuring
 * code and schema stay in sync.
 *
 * To add a new platform:
 * 1. Add it to the PLATFORMS array
 * 2. Run migrations (constraints auto-update)
 * 3. Implement platform-specific ingestion
 */

export const PLATFORMS = ['youtube', 'github'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * DB layer: Generate SQL CHECK constraint for platform column. Used in migration files to ensure database validation
 * In a database table, this ensures the platform column can only contain one of the allowed values.
 */
export function getPlatformCheckConstraint(): string {
  const values = PLATFORMS.map(p => `'${p}'`).join(',');
  return `CHECK (platform IN (${values}))`;
}

/**
 * Typescript layer: Type guard to validate platform at runtime
 */
export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && PLATFORMS.includes(value as Platform);
}

/**
 * App runtime layer: Validate and throw on invalid platform
 * Use this when you need a platform or fail
 */
export function validatePlatform(value: unknown): Platform {
  if (!isPlatform(value)) {
    throw new Error(
      `Invalid platform: "${value}". Must be one of: ${PLATFORMS.join(', ')}`
    );
  }
  return value;
}
