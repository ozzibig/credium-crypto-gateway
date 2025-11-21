const express = require('express');
const router = express.Router();

/**
 * GET /api/auth/me
 * Returns current user info from validated JWT token
 * Requires: Authorization header with Bearer token (validated by middleware)
 */
router.get('/me', (req, res) => {
  // req.user is populated by authenticateSupabaseToken middleware
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
