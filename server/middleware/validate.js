import { z } from 'zod';

export function validateBody(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body);
      req.validatedBody = parsed;
      return next();
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid payload', errors: err.errors });
    }
  };
}

export function validateParsed(parsed) {
  return (req, res, next) => {
    try {
      const validated = parsed.parse(req.validatedBody || req.body);
      req.validatedBody = validated;
      return next();
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid payload', errors: err.errors });
    }
  };
}
