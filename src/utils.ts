import crypto from 'crypto';

export const generateId = () => crypto.randomBytes(3).toString('hex').toUpperCase();
