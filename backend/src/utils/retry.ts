import { logger } from './logger';

/**
 * Retry Utilities with Exponential Backoff
 *
 * Used for resilient API calls to external services (YouTube, GitHub, etc.)
 * Automatically retries failed requests with increasing delays
 */

export interface RetryOptions {
  maxRetries?: number;      // Maximum number of retry attempts (default: 3)
  initialDelay?: number;    // Initial delay in ms (default: 1000)
  backoffFactor?: number;   // Multiplier for each retry (default: 2)
  maxDelay?: number;        // Maximum delay cap in ms (default: 30000)
}

/**
 * Retry a function with exponential backoff
 *
 * Example delays with defaults:
 * - Attempt 1: Immediate
 * - Attempt 2: 1000ms (1s)
 * - Attempt 3: 2000ms (2s)
 * - Attempt 4: 4000ms (4s)
 *
 * @param fn Async function to retry
 * @param options Retry configuration
 * @returns Result of successful function call
 * @throws Error from last failed attempt
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffFactor = 2,
    maxDelay = 30000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: lastError.message,
          },
          'Max retries reached'
        );
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(backoffFactor, attempt), maxDelay);

      logger.debug(
        {
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          delay,
          error: lastError.message,
        },
        'Retrying after error'
      );

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError!;
}

/**
 * Retry with jitter to prevent thundering herd
 *
 * Adds randomness to delay to prevent all clients retrying at same time
 *
 * @param fn Async function to retry
 * @param options Retry configuration
 * @returns Result of successful function call
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffFactor = 2,
    maxDelay = 30000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay with jitter (random variation)
      const baseDelay = Math.min(initialDelay * Math.pow(backoffFactor, attempt), maxDelay);
      const jitter = Math.random() * baseDelay * 0.3; // ±30% variation
      const delay = baseDelay + jitter;

      logger.debug({ attempt: attempt + 1, delay: Math.round(delay) }, 'Retrying with jitter');

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
