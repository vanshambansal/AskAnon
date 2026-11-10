import express from 'express';
import prisma from '../config/prisma.js';
import { clerk, requireIdentity, requireAuth, updateUserCache } from '../middleware/authMiddleware.js';
import { fail } from '../middleware/accessMiddleware.js';
const router = express.Router();
const profile = user => ({ ...user, can_switch_role: false });

router.post('/sync', requireIdentity, async (req, res, next) => {
  try {
    const requestedRole = req.body?.role;
    if (requestedRole && !['teacher', 'student'].includes(requestedRole)) fail(400, 'Choose Student or Teacher');
    if (req.user && requestedRole && requestedRole !== req.user.role) return res.status(403).json({ error: 'Your role was chosen at registration and cannot be changed here.', code: 'ROLE_IMMUTABLE' });
    if (!req.user && !requestedRole) return res.status(409).json({ error: 'Choose Student or Teacher to finish registration.', code: 'ROLE_REQUIRED' });
    // Identity and email come from Clerk, never from caller-supplied profile IDs.
    let details = req.user;
    if (!details) {
      const account = await clerk.users.getUser(req.clerkUserId);
      const email = account.emailAddresses.find(e => e.id === account.primaryEmailAddressId);
      if (!email || email.verification?.status !== 'verified') fail(403, 'Verify your primary email before continuing');
      details = { email: email.emailAddress, name: [account.firstName, account.lastName].filter(Boolean).join(' ') || account.username || null };
    }
    const role = req.user?.role || requestedRole;
    let user;
    try { user = await prisma.user.upsert({
      where: { clerk_user_id: req.clerkUserId },
      update: {},
      create: { clerk_user_id: req.clerkUserId, email: details.email, name: details.name, role }
    }); } catch (err) {
      if (err.code !== 'P2002' || req.user) throw err;
      const existing = await prisma.user.findUnique({ where: { email: details.email } });
      if (!existing) throw err;
      if (existing.clerk_user_id === req.clerkUserId) user = existing;
      else {
        // A verified email alone must not take over another active Clerk identity.
        let missing = false;
        try { await clerk.users.getUser(existing.clerk_user_id); }
        catch (lookupError) { if (lookupError.status === 404) missing = true; else throw lookupError; }
        if (!missing) return res.status(409).json({ error: 'This email already belongs to an existing account. Sign in with its original sign-in method.', code: 'EMAIL_IN_USE' });
        const linked = await prisma.user.updateMany({ where: { id: existing.id, clerk_user_id: existing.clerk_user_id }, data: { clerk_user_id: req.clerkUserId } });
        if (!linked.count) return res.status(409).json({ error: 'Your profile changed while signing in. Please retry.', code: 'PROFILE_RETRY' });
        user = { ...existing, clerk_user_id: req.clerkUserId };
      }
    }
    updateUserCache(user);
    res.json(profile(user));
  } catch (err) { next(err); }
});
router.get('/me', requireAuth, (req, res) => res.json(profile(req.user)));
export default router;
