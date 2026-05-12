import type { RequestHandler } from "express";

/**
 * Gates a route behind the `admin` role. Must be mounted after
 * `requireAuth` — depends on `req.user` being populated.
 *
 * Returns 403 (not 401) so the SPA can distinguish "you need to sign in"
 * from "you're signed in but can't see this".
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
};
