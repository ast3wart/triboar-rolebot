import axios from 'axios';
import { config } from '../config.js';
import logger from '../logger.js';

export class BackendService {
  constructor() {
    this.apiUrl = config.backend.apiUrl;
    this.apiToken = config.backend.apiToken;
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all active subscribers from backend
   * Returns: { discordId, stripeCustomerId, expiresAt }[]
   */
  async getActiveSubscribers() {
    try {
      const response = await this.client.get('/api/lists/subscribed');
      logger.info({ count: response.data.list?.length || 0 }, 'Fetched active subscribers');
      return response.data.list || [];
    } catch (err) {
      logger.error({ err }, 'Failed to get active subscribers from backend');
      return [];
    }
  }

  /**
   * Get users in grace period from backend
   * Returns: { discordId, stripeCustomerId, subscriptionExpiredAt, graceEndsAt }[]
   */
  async getGracePeriodUsers() {
    try {
      const response = await this.client.get('/api/lists/grace');
      logger.info({ count: response.data.list?.length || 0 }, 'Fetched grace period users');
      return response.data.list || [];
    } catch (err) {
      logger.error({ err }, 'Failed to get grace period users from backend');
      return [];
    }
  }

  /**
   * Move user to grace period (subscription ended, but within 7 days)
   */
  async moveToGracePeriod(userId, discordId) {
    try {
      await this.client.post('/api/admin/grace-period/add', {
        userId,
        discordId,
      });
      logger.info({ userId, discordId }, 'Moved user to grace period');
      return true;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to move user to grace period');
      return false;
    }
  }

  /**
   * Remove user from grace period (subscription renewed)
   */
  async removeFromGracePeriod(userId, discordId) {
    try {
      await this.client.post('/api/admin/grace-period/remove', {
        userId,
        discordId,
      });
      logger.info({ userId, discordId }, 'Removed user from grace period');
      return true;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to remove user from grace period');
      return false;
    }
  }

  /**
   * Remove user from grace period permanently (expired, not renewed)
   */
  async expireGracePeriod(userId, discordId) {
    try {
      await this.client.post('/api/admin/grace-period/expire', {
        userId,
        discordId,
      });
      logger.info({ userId, discordId }, 'Expired grace period user');
      return true;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to expire grace period');
      return false;
    }
  }

  /**
   * Update DM preference for grace period user
   * @param {string} discordId - Discord user ID
   * @param {boolean} enabled - Whether to enable grace period DMs
   */
  async setGracePeriodDMPreference(discordId, enabled) {
    try {
      // Look up user by discordId to get database userId
      const response = await this.client.get('/api/admin/users/search', {
        params: { discord_id: discordId, limit: 1 },
      });

      const user = response.data.users?.[0];
      if (!user) {
        logger.warn({ discordId }, 'User not found when updating DM preference');
        return false;
      }

      await this.client.put(`/api/admin/users/${user.id}/grace-dm-preference`, {
        dmEnabled: enabled,
      });
      logger.info({ discordId, userId: user.id, enabled }, 'Updated grace period DM preference');
      return true;
    } catch (err) {
      logger.error({ err, discordId }, 'Failed to update DM preference');
      return false;
    }
  }

  /**
   * Log bot action to backend audit logs
   */
  async logBotAction(userId, action, details = {}) {
    try {
      await this.client.post('/api/admin/audit-log', {
        userId,
        eventType: `bot.${action}`,
        payload: details,
      });
    } catch (err) {
      logger.error({ err, userId, action }, 'Failed to log bot action');
    }
  }
}
