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
    const user = await prisma.user.upsert({
      where: { clerk_user_id: req.clerkUserId },
      update: {},
      create: { clerk_user_id: req.clerkUserId, email: details.email, name: details.name, role }
    });
    updateUserCache(user);
    res.json(profile(user));
  } catch (err) { next(err); }
});
router.get('/me', requireAuth, (req, res) => res.json(profile(req.user)));
export default router;
