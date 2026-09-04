import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import webPush from 'web-push';
import { config } from './aws.js';
import {
  attachMatchBadges,
  adjustPlayerWallet,
  completeUserOnboarding,
  createAppreciationPost,
  createAppreciationComment,
  consumeAuthToken,
  createAuthToken,
  createCaptainExpense,
  createCollection,
  createExpense,
  createInvite,
  createMatch,
  createSignupUser,
  createTopupRequest,
  createTeam,
  creditPlayerWallet,
  creditPlayerWallets,
  cancelCollection,
  decideCollectionShare,
  decideTopupRequest,
  decideJoinRequest,
  addMemberToTeam,
  deletePushSubscription,
  deleteMatch,
  deleteTeam,
  deleteLocalTestTeams,
  ensureLocalData,
  getAuditEvents,
  getAsset,
  getAssetDownloadUrl,
  getCaptainDashboard,
  getCaptainMatchAward,
  getCollection,
  getExpensesForTeam,
  getExpenseById,
  getHomeData,
  getInvite,
  getLineup,
  getMatchDetail,
  getMatchesForTeam,
  getPlayerWallets,
  getTeam,
  getTeamMembership,
  getTeamMembers,
  getTeamWallet,
  getUserByLogin,
  getUserById,
  getUserTeams,
  isTeamManagerRole,
  isGlobalAdmin,
  listCollections,
  listInvites,
  listJoinRequests,
  listPlayerCandidatesForTeam,
  listPushSubscriptionsForUser,
  listTeamExpenses,
  listTopupRequests,
  listTeams,
  listUsers,
  getWalletForUser,
  getWalletTransactions,
  joinInvite,
  deleteAppreciationPost,
  uploadAppreciationMedia,
  getAppreciationPostDetail,
  getAppreciationPostParticipants,
  listAppreciationPosts,
  normalizePhone,
  putAvailability,
  getCaptainAvailabilityForMatch,
  putCaptainAvailability,
  putCaptainAvailabilityBulk,
  clearCaptainAvailability,
  markCollectionSharePaid,
  refundCollectionShare,
  requestAvailabilityForMatch,
  resetLocalData,
  saveLineup,
  saveCaptainMatchAward,
  savePushSubscription,
  setAppreciationLike,
  settleCollection,
  submitCollectionPayment,
  setCaptain,
  setMemberRole,
  setMemberStatus,
  stripKeys,
  updateUserPassword,
  updateExpenseStatus,
  updateMatch,
  updateSubmittedExpense,
  updateWalletTransaction,
  updateTeam,
  updateUserProfile,
  uploadUserProfilePhoto,
  uploadTeamWalletCardImage,
  verifyUserEmail,
  verifyUserPassword,
} from './store.js';

const isPushConfigured = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
if (isPushConfigured) {
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

const cookieName = 'mytuskers_dev_session';
const isProduction = process.env.NODE_ENV === 'production';

const appUrl = (path) => {
  const origin = config.frontendOrigin || 'http://localhost:3100';
  return `${origin}${path}`;
};

const sendEmail = async ({ to, subject, text }) => {
  if (!config.resendApiKey) {
    console.log('Email not sent. Resend is not configured.');
    console.log(JSON.stringify({ to, from: config.emailFrom, subject, text }, null, 2));
    return { delivery: 'LOCAL_MOCK' };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to,
      subject,
      text,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Email could not be sent: ${body}`);
    error.status = 502;
    throw error;
  }
  return { delivery: 'EMAIL' };
};

const sendVerificationEmail = async (user, token) => {
  const verificationUrl = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const delivery = await sendEmail({
    to: user.email,
    subject: 'Verify your MyTuskers email',
    text: `Welcome to MyTuskers.\n\nVerify your email address using this link:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`,
  });
  return { verificationUrl, ...delivery };
};

const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const delivery = await sendEmail({
    to: user.email,
    subject: 'Reset your MyTuskers password',
    text: `Use this link to reset your MyTuskers password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request it, ignore this email.`,
  });
  return { resetUrl, ...delivery };
};

const sendPushNotification = async (subscription, payload) => {
  if (!isPushConfigured) {
    const error = new Error('Push delivery is not configured.');
    error.status = 503;
    throw error;
  }
  return webPush.sendNotification(subscription, JSON.stringify(payload));
};

const sendPushToUserIds = async (userIds, payload) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const subscriptionRows = (await Promise.all(uniqueUserIds.map(async (userId) => {
    const subscriptions = await listPushSubscriptionsForUser(userId);
    return subscriptions.map((subscription) => ({ userId, subscription }));
  }))).flat();

  const results = await Promise.allSettled(subscriptionRows.map(async ({ userId, subscription }) => {
    try {
      return await sendPushNotification(subscription.subscription, payload);
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        await deletePushSubscription(userId, subscription.endpoint);
      }
      throw error;
    }
  }));

  return {
    recipients: uniqueUserIds.length,
    subscriptions: subscriptionRows.length,
    sent: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
};

const moneyText = (minor) => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
}).format(Number(minor || 0) / 100);

const matchTitle = (team, match) => (
  match.opponent?.startsWith('Training') ? match.opponent : `${team?.name || 'Tuskers'} vs ${match.opponent}`
);

const matchPushUrl = (teamId, matchId) => `/matches/${matchId}?teamId=${encodeURIComponent(teamId)}`;

const activeTeamUserIds = async (teamId) => {
  const members = await getTeamMembers(teamId);
  return members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
};

const teamManagerUserIds = async (teamId, excludeUserId = '') => {
  const members = await getTeamMembers(teamId);
  return members
    .filter((member) => member.status === 'ACTIVE' && isTeamManagerRole(member.role) && member.userId !== excludeUserId)
    .map((member) => member.userId);
};

const notifyUsers = async (userIds, payload, context) => {
  try {
    const result = await sendPushToUserIds(userIds, payload);
    if (result.failed) console.warn('Some push notifications failed.', { context, result });
    return result;
  } catch (error) {
    console.error('Push notification workflow failed.', { context, error });
    return { recipients: 0, subscriptions: 0, sent: 0, failed: 1 };
  }
};

const notifyTeamManagers = async (teamId, actorUserId, payload, context) => {
  const managerIds = await teamManagerUserIds(teamId, actorUserId);
  return notifyUsers(managerIds, payload, context);
};

const parseCookies = (header = '') => Object.fromEntries(
  header.split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...value] = part.split('=');
      return [key, decodeURIComponent(value.join('='))];
    }),
);

const setSessionCookie = (res, userId) => {
  const sessionDays = 180;
  const token = jwt.sign({ sub: userId, aud: 'mytuskers-local' }, config.jwtSecret, { expiresIn: `${sessionDays}d` });
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(cookieName, { path: '/' });
};

const requireAuth = async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const header = req.headers.authorization;
    const token = cookies[cookieName] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) return res.status(401).json({ message: 'Sign in is required.' });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Invalid session.' });
    req.user = stripKeys(user);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
};

const requireTeamAccess = async (req, res, next) => {
  if (isGlobalAdmin(req.user)) {
    req.membership = {
      teamId: req.params.teamId,
      userId: req.user.userId,
      role: 'GLOBAL_ADMIN',
      status: 'ACTIVE',
    };
    return next();
  }
  const membership = await getTeamMembership(req.params.teamId, req.user.userId);
  if (!membership || membership.status !== 'ACTIVE') {
    return res.status(403).json({ message: 'You do not have access to this team.' });
  }
  req.membership = stripKeys(membership);
  return next();
};

const requireCaptainOrAdmin = async (req, res, next) => {
  await requireTeamAccess(req, res, () => {
    if (isTeamManagerRole(req.membership?.role)) return next();
    return res.status(403).json({ message: 'Captain access is required for this team.' });
  });
};

const requireGlobalAdmin = (req, res, next) => {
  if (isGlobalAdmin(req.user)) return next();
  return res.status(403).json({ message: 'Global admin access is required.' });
};

const formatIcsDate = (dateText) => new Date(dateText).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const isAllowedLocalDevOrigin = (origin) => {
  if (!origin || process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return false;
    if (url.port !== '3100') return false;
    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname.startsWith('192.168.')
      || url.hostname.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
      || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(url.hostname);
  } catch {
    return false;
  }
};

const isAllowedCloudFrontPreviewOrigin = (origin) => {
  if (!origin || process.env.NODE_ENV !== 'production' || config.frontendOrigin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.cloudfront.net');
  } catch {
    return false;
  }
};

export const createApp = async () => {
  await ensureLocalData();

  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === config.frontendOrigin || isAllowedLocalDevOrigin(origin) || isAllowedCloudFrontPreviewOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: process.env.NODE_ENV === 'production' ? 'mytuskers-api' : 'mytuskers-api-local' });
  });

  app.post('/v1/test-data/reset', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Not found.' });
    return res.json(await resetLocalData());
  });

  // In production CloudFront serves /feed-media/* from S3 and this never runs.
  // It exists so local development and the container stack resolve the same URL.
  app.get(/^\/(feed-media\/.+)$/, async (req, res, next) => {
    try {
      const asset = await getAsset(decodeURIComponent(req.params[0]));
      res.type(asset.contentType).set('cache-control', 'public, max-age=300').send(asset.body);
    } catch (error) {
      next(error);
    }
  });

  app.get(/^\/v1\/assets\/(.+)$/, async (req, res, next) => {
    try {
      const key = decodeURIComponent(req.params[0]);
      if (process.env.NODE_ENV === 'production' && !config.awsEndpoint) {
        return res.redirect(302, await getAssetDownloadUrl(key));
      }
      const asset = await getAsset(key);
      res.type(asset.contentType).send(asset.body);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/login', async (req, res, next) => {
    try {
      const login = String(req.body.username || req.body.email || '').trim();
      const user = await getUserByLogin(login);
      if (!user || !await verifyUserPassword(user, req.body.password)) {
        return res.status(401).json({ message: 'Invalid username or password.' });
      }
      setSessionCookie(res, user.userId);
      const teams = await getUserTeams(user.userId);
      return res.json({ user: stripKeys(user), teams });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/otp/request', (req, res) => {
    res.status(410).json({ message: 'SMS sign-in has been disabled. Use your username and password.' });
  });

  app.post('/v1/auth/otp/verify', (req, res) => {
    res.status(410).json({ message: 'SMS sign-in has been disabled. Use your username and password.' });
  });

  app.post('/v1/auth/signup', async (req, res, next) => {
    try {
      const user = await createSignupUser(req.body);
      const emailToken = await createAuthToken({
        userId: user.userId,
        email: user.email,
        purpose: 'EMAIL_VERIFY',
        ttlMinutes: 24 * 60,
      });
      const email = await sendVerificationEmail(user, emailToken);
      setSessionCookie(res, user.userId);
      const teams = await getUserTeams(user.userId);
      res.status(201).json({
        user: stripKeys(user),
        teams,
        message: 'Account created. Check your email to verify your address.',
        ...(isProduction ? {} : { verificationUrl: email.verificationUrl }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/verify-email/request', requireAuth, async (req, res, next) => {
    try {
      if (!req.user.email) return res.status(400).json({ message: 'This account does not have an email address.' });
      const token = await createAuthToken({
        userId: req.user.userId,
        email: req.user.email,
        purpose: 'EMAIL_VERIFY',
        ttlMinutes: 24 * 60,
      });
      const email = await sendVerificationEmail(req.user, token);
      res.json({
        message: 'Verification email sent.',
        ...(isProduction ? {} : { verificationUrl: email.verificationUrl }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/verify-email/confirm', async (req, res, next) => {
    try {
      const user = await verifyUserEmail(req.body.token);
      res.json({ message: 'Email verified.', user: stripKeys(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/password-reset/request', async (req, res, next) => {
    try {
      const user = await getUserByLogin(req.body.username || req.body.email);
      if (!user?.email) {
        return res.json({ message: 'If the account exists, a reset link was sent.' });
      }
      const token = await createAuthToken({
        userId: user.userId,
        email: user.email,
        purpose: 'PASSWORD_RESET',
        ttlMinutes: 60,
      });
      const email = await sendPasswordResetEmail(user, token);
      res.json({
        message: 'If the account exists, a reset link was sent.',
        ...(isProduction ? {} : { resetUrl: email.resetUrl }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/password-reset/confirm', async (req, res, next) => {
    try {
      const record = await consumeAuthToken(req.body.token, 'PASSWORD_RESET');
      await updateUserPassword(record.userId, req.body.password);
      res.json({ message: 'Password has been reset.' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/v1/me', requireAuth, async (req, res) => {
    const teams = await getUserTeams(req.user.userId);
    res.json({ user: req.user, teams });
  });

  app.patch('/v1/me', requireAuth, async (req, res, next) => {
    try {
      const user = await updateUserProfile(req.user.userId, req.body);
      const teams = await getUserTeams(req.user.userId);
      res.json({ user: stripKeys(user), teams });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/me/photo', requireAuth, async (req, res, next) => {
    try {
      const user = await uploadUserProfilePhoto(req.user.userId, req.body);
      const teams = await getUserTeams(req.user.userId);
      res.json({ user: stripKeys(user), teams });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/me/onboarding', requireAuth, async (req, res, next) => {
    try {
      const user = await completeUserOnboarding(req.user.userId);
      const teams = await getUserTeams(req.user.userId);
      res.json({ user: stripKeys(user), teams });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/me/teams', requireAuth, async (req, res) => {
    res.json({ teams: await getUserTeams(req.user.userId) });
  });

  app.get('/v1/push/config', requireAuth, async (req, res) => {
    res.json({
      supported: isPushConfigured,
      publicKey: isPushConfigured ? config.vapidPublicKey : '',
    });
  });

  app.post('/v1/push/subscriptions', requireAuth, async (req, res, next) => {
    try {
      const subscription = await savePushSubscription(req.user.userId, req.body);
      res.status(201).json({ subscription });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/push/subscriptions', requireAuth, async (req, res, next) => {
    try {
      await deletePushSubscription(req.user.userId, req.body?.endpoint || '');
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/push/test', requireAuth, async (req, res, next) => {
    try {
      const result = await sendPushToUserIds([req.user.userId], {
        title: 'MyTuskers notifications are on',
        body: 'You can now receive match and wallet updates on this device.',
        url: '/',
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/admin/push/test', requireAuth, requireGlobalAdmin, async (req, res, next) => {
    try {
      const targetType = String(req.body?.targetType || 'SELF').toUpperCase();
      let userIds = [];
      let targetLabel = 'your admin device';
      let url = '/';

      if (targetType === 'SELF') {
        userIds = [req.user.userId];
      } else if (targetType === 'USER') {
        const user = await getUserById(req.body?.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        userIds = [user.userId];
        targetLabel = user.preferredName || user.displayName || user.email || user.phone || 'selected user';
      } else if (targetType === 'TEAM') {
        const team = await getTeam(req.body?.teamId);
        if (!team) return res.status(404).json({ message: 'Team not found.' });
        const members = await getTeamMembers(team.teamId);
        userIds = members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
        targetLabel = team.name;
        url = `/?teamId=${encodeURIComponent(team.teamId)}`;
      } else {
        return res.status(400).json({ message: 'Notification target must be SELF, USER, or TEAM.' });
      }

      const result = await sendPushToUserIds(userIds, {
        title: 'MyTuskers test notification',
        body: `Admin test for ${targetLabel}.`,
        url,
      });
      return res.json({ ...result, targetType, targetLabel });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/admin/teams', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ teams: await listTeams() });
  });

  app.post('/v1/admin/teams', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.status(201).json({ team: await createTeam(req.body, req.user.userId) });
  });

  app.patch('/v1/admin/teams/:teamId', requireAuth, requireGlobalAdmin, async (req, res) => {
    const team = await updateTeam(req.params.teamId, req.body);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    return res.json({ team });
  });

  app.post('/v1/admin/teams/:teamId/wallet-card-image', requireAuth, requireGlobalAdmin, async (req, res, next) => {
    try {
      res.json({ team: await uploadTeamWalletCardImage(req.params.teamId, req.body, req.user.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/admin/teams/:teamId/archive', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ team: await updateTeam(req.params.teamId, { status: 'ARCHIVED' }) });
  });

  app.post('/v1/admin/teams/:teamId/restore', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ team: await updateTeam(req.params.teamId, { status: 'ACTIVE' }) });
  });

  app.delete('/v1/admin/teams/:teamId', requireAuth, requireGlobalAdmin, async (req, res) => {
    const result = await deleteTeam(req.params.teamId, req.user.userId);
    if (!result) return res.status(404).json({ message: 'Team not found.' });
    return res.json(result);
  });

  app.put('/v1/admin/teams/:teamId/captain', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ team: await setCaptain(req.params.teamId, req.body.userId, req.user.userId) });
  });

  app.get('/v1/admin/users', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ users: await listUsers() });
  });

  app.get('/v1/admin/audit', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json({ events: await getAuditEvents() });
  });

  app.delete('/v1/admin/test-data/local-teams', requireAuth, requireGlobalAdmin, async (req, res) => {
    res.json(await deleteLocalTestTeams());
  });

  app.get('/v1/invites/:token', async (req, res) => {
    const invite = await getInvite(req.params.token);
    if (!invite) return res.status(404).json({ message: 'Invite not found.' });
    return res.json({ invite });
  });

  app.post('/v1/invites/:token/join', requireAuth, async (req, res, next) => {
    try {
      res.json(await joinInvite(req.params.token, req.user.userId));
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/home', requireAuth, requireTeamAccess, async (req, res) => {
    res.json(await getHomeData(req.params.teamId, req.user.userId));
  });

  app.get('/v1/teams/:teamId/appreciation', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      // The mention picker only needs the roster on the first page.
      const isFirstPage = !req.query.cursor;
      const [feed, members] = await Promise.all([
        listAppreciationPosts(req.params.teamId, req.user.userId, {
          cursor: req.query.cursor,
          limit: req.query.limit,
        }),
        isFirstPage ? getTeamMembers(req.params.teamId) : [],
      ]);
      res.json({
        posts: feed.posts,
        nextCursor: feed.nextCursor,
        members: members.filter((member) => member.status === 'ACTIVE').map(stripKeys),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/appreciation/media', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      res.status(201).json({ media: await uploadAppreciationMedia(req.params.teamId, req.body) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/appreciation/:postId', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const post = await getAppreciationPostDetail(req.params.teamId, req.params.postId, req.user.userId);
      res.json({ post });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/teams/:teamId/appreciation/:postId', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      res.json(await deleteAppreciationPost(req.params.teamId, req.params.postId, {
        userId: req.user.userId,
        role: req.membership?.role,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/appreciation', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const post = await createAppreciationPost(req.params.teamId, req.user, req.body);
      const team = await getTeam(req.params.teamId);
      const recipientName = post.recipientDisplayName || 'a teammate';
      const authorName = post.authorDisplayName || req.user.preferredName || req.user.displayName || 'A teammate';
      const userIds = (await activeTeamUserIds(req.params.teamId)).filter((userId) => userId !== req.user.userId);
      await notifyUsers(userIds, {
        title: `Appreciation for ${recipientName}`,
        body: `${authorName}: ${post.shortDescription || post.message}`,
        url: `/?teamId=${encodeURIComponent(req.params.teamId)}`,
      }, { workflow: 'appreciation_created', teamId: req.params.teamId, postId: post.postId, teamName: team?.name });
      res.status(201).json({ post });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/appreciation/:postId/comments', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const comment = await createAppreciationComment(req.params.teamId, req.params.postId, req.user, req.body);
      const participants = await getAppreciationPostParticipants(req.params.teamId, req.params.postId);
      const notifyIds = [...new Set([
        participants?.authorUserId,
        participants?.recipientUserId,
        ...(participants?.commenterUserIds || []),
      ].filter((userId) => userId && userId !== req.user.userId))];
      if (notifyIds.length) {
        const authorName = req.user.preferredName || req.user.displayName || 'A teammate';
        await notifyUsers(notifyIds, {
          title: 'New comment on appreciation',
          body: `${authorName}: ${comment.message}`,
          url: `/?teamId=${encodeURIComponent(req.params.teamId)}`,
        }, { workflow: 'appreciation_comment_created', teamId: req.params.teamId, postId: req.params.postId });
      }
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/appreciation/:postId/like', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      res.json(await setAppreciationLike(req.params.teamId, req.params.postId, req.user.userId, true));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/teams/:teamId/appreciation/:postId/like', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      res.json(await setAppreciationLike(req.params.teamId, req.params.postId, req.user.userId, false));
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/captain/dashboard', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json(await getCaptainDashboard(req.params.teamId, req.user.userId));
  });

  app.get('/v1/teams/:teamId/members', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ members: await getTeamMembers(req.params.teamId) });
  });

  app.get('/v1/teams/:teamId/player-candidates', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ players: await listPlayerCandidatesForTeam(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/members', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.status(201).json({ member: await addMemberToTeam(req.params.teamId, req.body.userId, req.user.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/members/:userId/remove', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ membership: await setMemberStatus(req.params.teamId, req.params.userId, 'REMOVED', req.user.userId) });
  });

  app.post('/v1/teams/:teamId/members/:userId/restore', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ membership: await setMemberStatus(req.params.teamId, req.params.userId, 'ACTIVE', req.user.userId) });
  });

  app.patch('/v1/teams/:teamId/members/:userId/role', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.json({ membership: await setMemberRole(req.params.teamId, req.params.userId, req.body.role, req.user.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/invites', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ invites: await listInvites(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/invites', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.status(201).json({ invite: await createInvite(req.params.teamId, req.user.userId, req.body) });
  });

  app.get('/v1/teams/:teamId/join-requests', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ requests: await listJoinRequests(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/join-requests/:requestId/approve', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    const request = await decideJoinRequest(req.params.teamId, req.params.requestId, 'APPROVED', req.user.userId);
    if (!request) return res.status(404).json({ message: 'Join request not found.' });
    return res.json({ request });
  });

  app.post('/v1/teams/:teamId/join-requests/:requestId/reject', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    const request = await decideJoinRequest(req.params.teamId, req.params.requestId, 'REJECTED', req.user.userId);
    if (!request) return res.status(404).json({ message: 'Join request not found.' });
    return res.json({ request });
  });

  app.get('/v1/teams/:teamId/wallet/me', requireAuth, requireTeamAccess, async (req, res) => {
    res.json({ wallet: stripKeys(await getWalletForUser(req.params.teamId, req.user.userId)) });
  });

  app.get('/v1/teams/:teamId/wallet/me/transactions', requireAuth, requireTeamAccess, async (req, res) => {
    const wallet = await getWalletForUser(req.params.teamId, req.user.userId);
    const [team, transactions, expenses, members, topups] = await Promise.all([
      getTeam(req.params.teamId),
      getWalletTransactions(wallet.walletId),
      getExpensesForTeam(req.params.teamId, req.user.userId),
      getTeamMembers(req.params.teamId),
      listTopupRequests(req.params.teamId, req.user.userId),
    ]);
    res.json({ team: stripKeys(team), wallet: stripKeys(wallet), transactions, expenses, topups, members: members.filter((member) => member.status === 'ACTIVE') });
  });

  app.post('/v1/teams/:teamId/wallet/me/topups', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const request = await createTopupRequest(req.params.teamId, req.user.userId, req.body);
      const team = await getTeam(req.params.teamId);
      await notifyTeamManagers(req.params.teamId, req.user.userId, {
        title: 'Topup request submitted',
        body: `${req.user.preferredName || req.user.displayName || 'A player'} requested ${moneyText(request.amountMinor)} for ${team?.name || 'the team'}.`,
        url: '/captain/wallet',
      }, { workflow: 'topup_submitted', teamId: req.params.teamId, requestId: request.requestId });
      res.status(201).json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/expenses', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const result = await createExpense(req.params.teamId, req.user.userId, req.body);
      const team = await getTeam(req.params.teamId);
      await notifyTeamManagers(req.params.teamId, req.user.userId, {
        title: 'Expense submitted',
        body: `${req.user.preferredName || req.user.displayName || 'A player'} submitted ${result.expense.title} for ${moneyText(result.expense.amountMinor)}.`,
        url: '/captain/wallet',
      }, { workflow: 'expense_submitted', teamId: req.params.teamId, expenseId: result.expense.expenseId });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/expenses/:expenseId', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const expense = await getExpenseById(req.params.teamId, req.params.expenseId, req.user.userId, req.membership);
      if (!expense) return res.status(404).json({ message: 'Expense not found.' });
      return res.json({ expense });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/wallet', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ wallet: stripKeys(await getTeamWallet(req.params.teamId)) });
  });

  app.get('/v1/teams/:teamId/players/wallets', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ wallets: await getPlayerWallets(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/players/:userId/wallet/credits', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    const amountMinor = Number(req.body.amountMinor || 0);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      return res.status(400).json({ message: 'amountMinor must be a positive integer.' });
    }
    return res.json({ wallet: await creditPlayerWallet(req.params.teamId, req.params.userId, amountMinor, req.body.reason, req.user.userId) });
  });

  app.post('/v1/teams/:teamId/wallet/credits', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.status(201).json(await creditPlayerWallets(req.params.teamId, req.user.userId, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/players/:userId/wallet/adjustments', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.json({ wallet: await adjustPlayerWallet(req.params.teamId, req.params.userId, req.body.amountMinor, req.body.reason, req.user.userId) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/v1/teams/:teamId/players/:userId/wallet/transactions/:transactionId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const result = await updateWalletTransaction(req.params.teamId, req.params.userId, req.params.transactionId, req.body, req.user.userId);
      if (!result) return res.status(404).json({ message: 'Transaction not found.' });
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/topups', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ requests: await listTopupRequests(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/topups/:requestId/approve', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const existing = (await listTopupRequests(req.params.teamId)).find((request) => request.requestId === req.params.requestId);
      const result = await decideTopupRequest(req.params.teamId, req.params.requestId, 'APPROVED', req.user.userId);
      if (!result) return res.status(404).json({ message: 'Topup request not found.' });
      if (existing?.status === 'SUBMITTED' && result.request?.userId) {
        await notifyUsers([result.request.userId], {
          title: 'Topup approved',
          body: `Your ${moneyText(result.request.amountMinor)} topup request was approved.`,
          url: '/wallet',
        }, { workflow: 'topup_approved', teamId: req.params.teamId, requestId: req.params.requestId });
      }
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/topups/:requestId/reject', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    const result = await decideTopupRequest(req.params.teamId, req.params.requestId, 'REJECTED', req.user.userId);
    if (!result) return res.status(404).json({ message: 'Topup request not found.' });
    return res.json(result);
  });

  app.get('/v1/teams/:teamId/expenses', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ expenses: await listTeamExpenses(req.params.teamId) });
  });

  app.post('/v1/teams/:teamId/captain/expenses', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const result = await createCaptainExpense(req.params.teamId, req.user.userId, req.body);
      const paidByUser = await getUserById(result.expense.submittedByUserId);
      await notifyTeamManagers(req.params.teamId, req.user.userId, {
        title: 'Expense submitted',
        body: `${paidByUser?.preferredName || paidByUser?.displayName || 'A player'} has ${result.expense.title} waiting for review.`,
        url: '/captain/wallet',
      }, { workflow: 'captain_expense_submitted', teamId: req.params.teamId, expenseId: result.expense.expenseId });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/v1/teams/:teamId/expenses/:expenseId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const expense = await updateSubmittedExpense(req.params.teamId, req.params.expenseId, req.body, req.user.userId);
      if (!expense) return res.status(404).json({ message: 'Expense not found.' });
      return res.json({ expense });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/expenses/:expenseId/approve', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const existing = await getExpenseById(req.params.teamId, req.params.expenseId, req.user.userId, req.membership);
      const expense = await updateExpenseStatus(req.params.teamId, req.params.expenseId, 'APPROVED', req.user.userId);
      if (!expense) return res.status(404).json({ message: 'Expense not found.' });
      if (existing?.status === 'SUBMITTED' && expense.submittedByUserId) {
        await notifyUsers([expense.submittedByUserId], {
          title: 'Expense approved',
          body: `${expense.title} was approved for ${moneyText(expense.amountMinor)}.`,
          url: '/wallet',
        }, { workflow: 'expense_approved', teamId: req.params.teamId, expenseId: req.params.expenseId });
      }
      return res.json({ expense });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/expenses/:expenseId/reject', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.json({ expense: await updateExpenseStatus(req.params.teamId, req.params.expenseId, 'REJECTED', req.user.userId) });
  });

  app.get('/v1/teams/:teamId/collections', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const collections = await listCollections(req.params.teamId);
      if (isTeamManagerRole(req.membership.role) || isGlobalAdmin(req.user)) {
        return res.json({ collections });
      }
      const mine = collections
        .map((collection) => ({
          ...collection,
          shares: (collection.shares || []).filter((share) => share.userId === req.user.userId),
        }))
        .filter((collection) => collection.shares.length > 0);
      return res.json({ collections: mine });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const collection = await createCollection(req.params.teamId, req.user.userId, req.body);
      await Promise.all((collection.shares || []).map((share) => notifyUsers([share.userId], {
        title: 'Prepaid collection',
        body: `${collection.title} · ${moneyText(share.amountDueMinor)} due. Confirm when you have paid.`,
        url: `/collections/${collection.collectionId}`,
      }, { workflow: 'collection_created', teamId: req.params.teamId, collectionId: collection.collectionId, userId: share.userId })));
      res.status(201).json({ collection });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/collections/:collectionId', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      const collection = await getCollection(req.params.teamId, req.params.collectionId);
      if (!collection) return res.status(404).json({ message: 'Collection not found.' });
      const canManage = isTeamManagerRole(req.membership.role) || isGlobalAdmin(req.user);
      if (!canManage) {
        const myShare = (collection.shares || []).find((share) => share.userId === req.user.userId);
        if (!myShare) return res.status(404).json({ message: 'Collection not found.' });
        return res.json({ collection: { ...collection, shares: [myShare] } });
      }
      return res.json({ collection });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/shares/:userId/payments', requireAuth, requireTeamAccess, async (req, res, next) => {
    try {
      if (req.params.userId !== req.user.userId && !(isTeamManagerRole(req.membership.role) || isGlobalAdmin(req.user))) {
        return res.status(403).json({ message: 'You can only confirm your own payment.' });
      }
      const collection = await submitCollectionPayment(req.params.teamId, req.params.collectionId, req.params.userId, req.body);
      const share = (collection.shares || []).find((item) => item.userId === req.params.userId);
      await notifyTeamManagers(req.params.teamId, req.user.userId, {
        title: 'Prepaid payment submitted',
        body: `${req.user.preferredName || req.user.displayName || 'A player'} confirmed ${moneyText(share?.amountDueMinor)} for ${collection.title}.`,
        url: `/captain/collections/${collection.collectionId}`,
      }, { workflow: 'collection_payment_submitted', teamId: req.params.teamId, collectionId: collection.collectionId });
      return res.json({ collection });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/shares/:userId/decision', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const decision = String(req.body.decision || '').toUpperCase();
      const result = await decideCollectionShare(req.params.teamId, req.params.collectionId, req.params.userId, decision, req.user.userId);
      if (!result) return res.status(404).json({ message: 'Collection share not found.' });
      const amount = result.share?.amountDueMinor || result.share?.amountPrepaidMinor;
      if (decision === 'APPROVED') {
        await notifyUsers([req.params.userId], {
          title: 'Prepaid payment approved',
          body: `Your ${moneyText(amount)} for ${result.collection.title} is held for the purchase.`,
          url: `/collections/${result.collection.collectionId}`,
        }, { workflow: 'collection_approved', teamId: req.params.teamId, collectionId: result.collection.collectionId });
      } else {
        await notifyUsers([req.params.userId], {
          title: 'Prepaid payment rejected',
          body: `Your ${moneyText(amount)} payment for ${result.collection.title} was not approved. Check with your captain.`,
          url: `/collections/${result.collection.collectionId}`,
        }, { workflow: 'collection_rejected', teamId: req.params.teamId, collectionId: result.collection.collectionId });
      }
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/shares/:userId/mark-paid', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const result = await markCollectionSharePaid(req.params.teamId, req.params.collectionId, req.params.userId, req.user.userId);
      if (!result) return res.status(404).json({ message: 'Collection share not found.' });
      await notifyUsers([req.params.userId], {
        title: 'Prepaid payment approved',
        body: `Your ${moneyText(result.share?.amountPrepaidMinor)} for ${result.collection.title} is held for the purchase.`,
        url: `/collections/${result.collection.collectionId}`,
      }, { workflow: 'collection_marked_paid', teamId: req.params.teamId, collectionId: result.collection.collectionId });
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/settle', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const result = await settleCollection(req.params.teamId, req.params.collectionId, req.user.userId, req.body);
      await Promise.all((result.settledShares || []).map((share) => notifyUsers([share.userId], {
        title: 'Collection settled',
        body: `${result.collection.title} · ${moneyText(share.amountSpentMinor)} applied to the purchase.`,
        url: `/collections/${result.collection.collectionId}`,
      }, { workflow: 'collection_settled', teamId: req.params.teamId, collectionId: result.collection.collectionId, userId: share.userId })));
      await Promise.all((result.releaseNotices || []).map((notice) => notifyUsers([notice.userId], {
        title: 'Prepaid leftover released',
        body: `${moneyText(notice.amountMinor)} unused from ${result.collection.title} was added to your wallet.`,
        url: '/wallet',
      }, { workflow: 'collection_release', teamId: req.params.teamId, collectionId: result.collection.collectionId, userId: notice.userId })));
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/shares/:userId/refund', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const collection = await refundCollectionShare(req.params.teamId, req.params.collectionId, req.params.userId, req.user.userId);
      if (!collection) return res.status(404).json({ message: 'Collection not found.' });
      const share = (collection.shares || []).find((item) => item.userId === req.params.userId);
      await notifyUsers([req.params.userId], {
        title: 'Prepaid refunded',
        body: `Your prepaid for ${collection.title} was refunded.`,
        url: `/collections/${collection.collectionId}`,
      }, { workflow: 'collection_refunded', teamId: req.params.teamId, collectionId: collection.collectionId });
      return res.json({ collection, share });
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/collections/:collectionId/cancel', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const collection = await cancelCollection(req.params.teamId, req.params.collectionId, req.user.userId);
      if (!collection) return res.status(404).json({ message: 'Collection not found.' });
      return res.json({ collection });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/matches', requireAuth, requireTeamAccess, async (req, res) => {
    const matches = await getMatchesForTeam(req.params.teamId);
    const withBadges = await Promise.all(matches.map((match) => attachMatchBadges(match, req.user.userId)));
    res.json({ matches: withBadges });
  });

  app.post('/v1/teams/:teamId/matches', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    res.status(201).json({ match: await createMatch(req.params.teamId, req.body, req.user.userId) });
  });

  app.patch('/v1/teams/:teamId/matches/:matchId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const match = await updateMatch(req.params.teamId, req.params.matchId, req.body, req.user.userId);
      if (!match) return res.status(404).json({ message: 'Match not found.' });
      return res.json({ match });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/teams/:teamId/matches/:matchId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const result = await deleteMatch(req.params.teamId, req.params.matchId, req.user.userId);
      if (!result) return res.status(404).json({ message: 'Match not found.' });
      return res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/teams/:teamId/matches/:matchId/availability-request', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const match = await requestAvailabilityForMatch(req.params.teamId, req.params.matchId, req.user.userId, req.body);
      if (!match) return res.status(404).json({ message: 'Match not found.' });
      const team = await getTeam(req.params.teamId);
      await notifyUsers(await activeTeamUserIds(req.params.teamId), {
        title: 'Availability requested',
        body: `${team?.name || 'Your team'} needs your availability for ${matchTitle(team, match)}.`,
        url: matchPushUrl(req.params.teamId, req.params.matchId),
      }, { workflow: 'availability_requested', teamId: req.params.teamId, matchId: req.params.matchId });
      return res.json({ match });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/matches/:matchId', requireAuth, requireTeamAccess, async (req, res) => {
    const detail = await getMatchDetail(req.params.teamId, req.params.matchId, req.user.userId, req.membership);
    if (!detail) return res.status(404).json({ message: 'Match not found.' });
    return res.json(detail);
  });

  app.get('/v1/teams/:teamId/matches/:matchId/award', requireAuth, requireTeamAccess, async (req, res) => {
    res.json({ award: await getCaptainMatchAward(req.params.teamId, req.params.matchId) });
  });

  app.put('/v1/teams/:teamId/matches/:matchId/award', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const award = await saveCaptainMatchAward(req.params.teamId, req.params.matchId, req.body, req.user.userId);
      res.json({ award });
    } catch (error) {
      next(error);
    }
  });

  app.put('/v1/teams/:teamId/matches/:matchId/availability/me', requireAuth, requireTeamAccess, async (req, res) => {
    const allowed = new Set(['AVAILABLE', 'UNAVAILABLE', 'MAYBE']);
    const status = String(req.body?.status || '').toUpperCase();
    if (!allowed.has(status)) return res.status(400).json({ message: 'Invalid availability status.' });
    const availability = await putAvailability(req.params.teamId, req.params.matchId, req.user.userId, status, req.body.note);
    res.json({ availability });
  });

  // The captain's own availability list, separate from what players answer.
  app.get('/v1/teams/:teamId/matches/:matchId/captain-availability', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.json({ entries: await getCaptainAvailabilityForMatch(req.params.matchId) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/v1/teams/:teamId/matches/:matchId/captain-availability', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const entries = await putCaptainAvailabilityBulk(
        req.params.teamId,
        req.params.matchId,
        req.user.userId,
        req.body?.entries,
      );
      res.json({ entries });
    } catch (error) {
      next(error);
    }
  });

  app.put('/v1/teams/:teamId/matches/:matchId/captain-availability/:userId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const entry = await putCaptainAvailability(
        req.params.teamId,
        req.params.matchId,
        req.params.userId,
        req.user.userId,
        String(req.body?.status || '').toUpperCase(),
        req.body?.note,
      );
      res.json({ entry });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/teams/:teamId/matches/:matchId/captain-availability/:userId', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      res.json(await clearCaptainAvailability(
        req.params.teamId,
        req.params.matchId,
        req.params.userId,
        req.user.userId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.put('/v1/teams/:teamId/matches/:matchId/lineup/draft', requireAuth, requireCaptainOrAdmin, async (req, res) => {
    const match = await getMatchDetail(req.params.teamId, req.params.matchId, req.user.userId, req.membership);
    if (!match) return res.status(404).json({ message: 'Match not found.' });
    return res.json({ lineup: await saveLineup(req.params.teamId, req.params.matchId, req.body, req.user.userId, false) });
  });

  app.post('/v1/teams/:teamId/matches/:matchId/lineup/publish', requireAuth, requireCaptainOrAdmin, async (req, res, next) => {
    try {
      const existing = await getLineup(req.params.matchId);
      const lineup = await saveLineup(req.params.teamId, req.params.matchId, req.body.startingPlayers ? req.body : existing || {}, req.user.userId, true);
      const detail = await getMatchDetail(req.params.teamId, req.params.matchId, req.user.userId, req.membership);
      const team = await getTeam(req.params.teamId);
      await notifyUsers(await activeTeamUserIds(req.params.teamId), {
        title: 'Lineup published',
        body: `Team for ${matchTitle(team, detail?.match || {})} has been published.`,
        url: matchPushUrl(req.params.teamId, req.params.matchId),
      }, { workflow: 'lineup_published', teamId: req.params.teamId, matchId: req.params.matchId });
      return res.json({ lineup });
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/teams/:teamId/matches/:matchId/calendar.ics', requireAuth, requireTeamAccess, async (req, res) => {
    const detail = await getMatchDetail(req.params.teamId, req.params.matchId, req.user.userId, req.membership);
    if (!detail) return res.status(404).send('Match not found');
    const match = detail.match;
    const endAt = match.endAt || new Date(new Date(match.startAt).getTime() + 3 * 60 * 60 * 1000).toISOString();
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MyTuskers Local//EN',
      'BEGIN:VEVENT',
      `UID:${match.matchId}@mytuskers.local`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${formatIcsDate(match.startAt)}`,
      `DTEND:${formatIcsDate(endAt)}`,
      `SUMMARY:${match.opponent.startsWith('Training') ? match.opponent : `Tuskers vs ${match.opponent}`}`,
      `LOCATION:${match.venueName}`,
      `DESCRIPTION:${match.notes || 'MyTuskers match'}`,
      req.query.returnUrl ? `URL:${req.query.returnUrl}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    res.type('text/calendar').send(ics);
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error);
    res.status(error.status || 500).json({ message: error.message || 'The request could not be completed.' });
  });

  return app;
};
