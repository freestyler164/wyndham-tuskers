import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config.js';

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token is required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user?.role || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

export const userHasScope = (user, scope) => (
  Array.isArray(user?.scopes) && user.scopes.includes(scope)
);

export const requireAdminOrScope = (scope) => (req, res, next) => {
  if (req.user?.role === 'admin' || userHasScope(req.user, scope)) {
    next();
    return;
  }

  res.status(403).json({ message: 'You do not have access to this section.' });
};
