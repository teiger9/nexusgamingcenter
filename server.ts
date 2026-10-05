import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Load Firebase configuration
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse firebase-applet-config.json:', err);
  }
}

const FOUNDING_SUPER_ADMIN_UID = 'c3Vip2TwMvZXhub5gjjVpjcsStI2';
const inFlightRemovals = new Set<string>();

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Nexus Gaming Center Backend', timestamp: Date.now() });
});

/**
 * Verifies caller's Firebase ID token via Identity Toolkit
 */
async function verifyIdToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const apiKey = firebaseConfig.apiKey || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.users && data.users.length > 0) {
      return {
        uid: data.users[0].localId,
        email: data.users[0].email || '',
      };
    }
    return null;
  } catch (err) {
    console.error('ID token verification error:', err);
    return null;
  }
}

/**
 * Super Admin Permanent Player Account Removal Endpoint
 * Enforces permissions, founding super admin protection, active game checks,
 * atomic username release, related data cleanup, and audit logging.
 */
app.post('/api/admin/remove-player', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid authentication token.',
    });
  }

  const idToken = authHeader.split(' ')[1];
  const caller = await verifyIdToken(idToken);
  if (!caller) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired authentication credentials.',
    });
  }

  const { targetUid, confirmationTag, reason, autoResolveConflicts } = req.body || {};

  if (!targetUid || typeof targetUid !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request: targetUid is required.',
    });
  }

  // Permission Checks:
  // 1. Founding Super Admin Protection
  if (targetUid === FOUNDING_SUPER_ADMIN_UID) {
    return res.status(403).json({
      success: false,
      error: 'Action Forbidden: The Founding Super Admin is permanently protected and cannot be removed.',
    });
  }

  // 2. Self-Removal Prevention
  if (caller.uid === targetUid) {
    return res.status(400).json({
      success: false,
      error: 'Action Forbidden: Super Administrators cannot remove their own account.',
    });
  }

  // Concurrency Lock: Prevent simultaneous removal of the same player
  if (inFlightRemovals.has(targetUid)) {
    return res.status(409).json({
      success: false,
      error: 'A removal operation is already in progress for this player. Please wait.',
    });
  }

  inFlightRemovals.add(targetUid);

  try {
    // We import dynamically or use client Firebase services initialized in node
    const { executePermanentPlayerRemoval, getPlayerRemovalSummary } = await import(
      './src/services/playerAccountRemovalService.js'
    ).catch(() => import('./src/services/playerAccountRemovalService.ts'));

    // Check caller role via Firestore
    const summary = await getPlayerRemovalSummary(caller.uid);
    const callerRole = summary?.role || 'PLAYER';
    const isSuper =
      callerRole === 'SUPER_ADMIN' || caller.uid === FOUNDING_SUPER_ADMIN_UID;

    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: 'Permission Denied: Only Super Administrators can permanently remove player accounts.',
      });
    }

    const result = await executePermanentPlayerRemoval({
      callerUid: caller.uid,
      callerRole,
      callerEmail: caller.email,
      callerName: summary?.gamerTag || 'Super Admin',
      targetUid,
      confirmationInput: confirmationTag || '',
      reason: reason || 'Super Admin permanent removal of player account',
      autoResolveConflicts: autoResolveConflicts !== false,
    });

    if (!result.success) {
      const isConflict = result.error?.includes('active match or lobby');
      return res.status(isConflict ? 400 : 400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.warn('Server permanent removal error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error during account removal.',
    });
  } finally {
    inFlightRemovals.delete(targetUid);
  }
});

/**
 * Super Admin Permanent Season Removal Endpoint
 * Requirements:
 * - Only SUPER_ADMIN allowed (Admin, Staff, Player strictly denied)
 * - Cannot remove active season ("You cannot remove an active season. Finalize or close the season first.")
 * - Exact confirmation string required
 * - Atomic cleanup of Season, ratings, overall stats, Hall of Fame entries, announcements.
 * - Completed match records and financial logs preserved for audit integrity.
 */
app.post('/api/admin/remove-season', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid authentication token.',
    });
  }

  const idToken = authHeader.split(' ')[1];
  const caller = await verifyIdToken(idToken);
  if (!caller) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired authentication credentials.',
    });
  }

  const { seasonId, confirmationInput } = req.body || {};

  if (!seasonId || typeof seasonId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request: seasonId is required.',
    });
  }

  try {
    const { getPlayerRemovalSummary } = await import(
      './src/services/playerAccountRemovalService.js'
    ).catch(() => import('./src/services/playerAccountRemovalService.ts'));

    const summary = await getPlayerRemovalSummary(caller.uid);
    const callerRole = summary?.role || 'PLAYER';
    const isSuper =
      callerRole === 'SUPER_ADMIN' || caller.uid === FOUNDING_SUPER_ADMIN_UID;

    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: 'Permission Denied: Only Super Administrators can permanently remove a season.',
      });
    }

    const { removeSeason } = await import(
      './src/services/seasonService.js'
    ).catch(() => import('./src/services/seasonService.ts'));

    const result = await removeSeason({
      seasonId,
      confirmationInput: confirmationInput || '',
      actor: {
        uid: caller.uid,
        role: callerRole,
        gamerTag: summary?.gamerTag || 'Super Admin',
      },
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.warn('Server season removal error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error during season removal.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, host: '0.0.0.0', port },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Nexus Gaming Center Full-Stack Server running on port ${port}`);
  });
}

startServer();
