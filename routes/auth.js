const express = require('express');
const passport = require('passport');
const router = express.Router();

const isConfigured = () =>
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  !process.env.GOOGLE_CLIENT_ID.includes('YOUR_CLIENT');

router.get('/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    configured: isConfigured(),
    user: req.user
      ? {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar,
          role: req.user.role,
          department: req.user.department
        }
      : null
  });
});

router.get('/google', (req, res, next) => {
  if (!isConfigured()) return res.redirect('/login.html?error=not_configured');
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', {
    successRedirect: '/',
    failureRedirect: '/login.html?error=auth_failed'
  })(req, res, next);
});

router.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login.html'));
});

module.exports = router;
