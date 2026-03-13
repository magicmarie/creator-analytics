import CircuitBreaker from 'opossum';
import { logger } from './logger';

/**
 * Circuit Breaker Utilities
 *
 * Protects external API calls from cascading failures
 * When an API is down/slow, circuit "opens" and fails fast instead of hanging
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

export interface CircuitBreakerOptions {
  timeout?: number;                // Request timeout in ms (default: 10000)
  errorThresholdPercentage?: number; // % errors to trip circuit (default: 50)
  resetTimeout?: number;           // Time before trying half-open (default: 30000)
  name?: string;                   // Circuit name for logging
}

/**
 * Create a circuit breaker for an async function
 *
 * Example usage:
 * ```typescript
 * const fetchYouTube = createCircuitBreaker(
 *   async (channelId: string) => {
 *     return await axios.get(`https://youtube.com/.../${channelId}`);
 *   },
 *   { name: 'youtube-api', errorThresholdPercentage: 50 }
 * );
 *
 * // Use it:
 * const data = await fetchYouTube.fire('UC123');
 * ```
 *
 * @param fn Async function to protect
 * @param options Circuit breaker configuration
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  const opts = {
    timeout: 10000,              // 10 seconds
    errorThresholdPercentage: 50, // Open after 50% errors
    resetTimeout: 30000,          // Try recovery after 30s
    ...options,
  };

  const breaker = new CircuitBreaker(fn, opts);
  const name = opts.name || fn.name || 'anonymous';

  // Event: Circuit opened (too many failures)
  breaker.on('open', () => {
    logger.warn({ breaker: name }, 'Circuit breaker OPENED - requests will fail fast');
  });

  // Event: Circuit half-opened (testing recovery)
  breaker.on('halfOpen', () => {
    logger.info({ breaker: name }, 'Circuit breaker HALF-OPEN - testing recovery');
  });

  // Event: Circuit closed (recovered)
  breaker.on('close', () => {
    logger.info({ breaker: name }, 'Circuit breaker CLOSED - service recovered');
  });

  // Event: Request succeeded
  breaker.on('success', () => {
    logger.debug({ breaker: name }, 'Circuit breaker request succeeded');
  });

  // Event: Request failed
  breaker.on('failure', (error) => {
    logger.warn({ breaker: name, error: error.message }, 'Circuit breaker request failed');
  });

  // Event: Request timed out
  breaker.on('timeout', () => {
    logger.warn({ breaker: name, timeout: opts.timeout }, 'Circuit breaker request timed out');
  });

  // Event: Request rejected (circuit open)
  breaker.on('reject', () => {
    logger.warn({ breaker: name }, 'Circuit breaker rejected request (circuit is open)');
  });

  return breaker as CircuitBreaker<Parameters<T>, ReturnType<T>>;
}

/**
 * Get circuit breaker status
 *
 * @param breaker Circuit breaker instance
 * @returns Status information
 */
export function getCircuitStatus(breaker: CircuitBreaker<any, any>) {
  const stats = breaker.stats;

  return {
    name: breaker.name,
    state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    stats: {
      fires: stats.fires,
      successes: stats.successes,
      failures: stats.failures,
      timeouts: stats.timeouts,
      rejects: stats.rejects,
      latencyMean: stats.latencyMean,
    },
  };
}

/**
 * Create multiple circuit breakers for different services
 *
 * Example:
 * ```typescript
 * const breakers = createServiceBreakers({
 *   youtube: async (id) => fetchYouTubeChannel(id),
 *   github: async (user) => fetchGitHubUser(user),
 * });
 *
 * await breakers.youtube.fire('UC123');
 * await breakers.github.fire('octocat');
 * ```
 */
export function createServiceBreakers<
  T extends Record<string, (...args: any[]) => Promise<any>>
>(
  services: T,
  defaultOptions: CircuitBreakerOptions = {}
): { [K in keyof T]: CircuitBreaker<Parameters<T[K]>, ReturnType<T[K]>> } {
  const breakers = {} as any;

  for (const [name, fn] of Object.entries(services)) {
    breakers[name] = createCircuitBreaker(fn, {
      ...defaultOptions,
      name,
    });
  }

  return breakers;
}
