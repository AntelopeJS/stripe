import { RedisClientType } from 'redis';
/**
 * Retrieves the initialized Redis client instance.
 * This is the main entry point for accessing Redis functionality.
 *
 * @returns A promise that resolves to the Redis client instance
 *
 * @example
 * ```typescript
 * import { GetClient } from '@ajs/redis/beta';
 *
 * // Basic key-value operations
 * async function storeUserData(userId: string, data: object) {
 *   const client = await GetClient();
 *   await client.set(`user:${userId}`, JSON.stringify(data));
 * }
 *
 * // Using Redis pub/sub
 * async function setupNotifications() {
 *   const client = await GetClient();
 *   const subscriber = client.duplicate();
 *
 *   await subscriber.subscribe('notifications', (message) => {
 *     console.log(`Received notification: ${message}`);
 *   });
 * }
 * ```
 */
export declare function GetClient(): Promise<RedisClientType>;
