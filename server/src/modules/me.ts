import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { defaultSettings, parseSettings } from '@pixel/shared';
import type { Deps } from '../deps.js';
import { userSettings } from '../db/schema.js';
import { requireUser } from '../auth/guards.js';

export function registerMeRoutes(app: FastifyInstance, deps: Deps): void {
  // Settings are allowed before the privacy notice is confirmed (accessibility first).
  app.get('/api/me/settings', async (req) => {
    const u = requireUser(req);
    const row = deps.db.select().from(userSettings).where(eq(userSettings.userId, u.id)).get();
    return row ? parseSettings(JSON.parse(row.json)) : defaultSettings();
  });

  app.put('/api/me/settings', async (req) => {
    const u = requireUser(req);
    const settings = parseSettings(req.body); // invalid sections fall back to defaults
    const json = JSON.stringify(settings);
    const now = deps.clock.now();
    deps.db
      .insert(userSettings)
      .values({ userId: u.id, json, updatedAt: now })
      .onConflictDoUpdate({ target: userSettings.userId, set: { json, updatedAt: now } })
      .run();
    return settings;
  });
}
