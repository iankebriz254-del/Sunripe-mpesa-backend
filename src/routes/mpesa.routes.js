const express = require('express');
const rateLimit = require('express-rate-limit');
const { initiatePayment, handleCallback, getStatus } = require('../controllers/mpesa.controller');

const router = express.Router();

// Limit how often a single IP can trigger STK pushes — protects the
// till from being spammed with payment prompts.
const stkLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { error: 'Too many payment attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/stkpush', stkLimiter, initiatePayment);
router.post('/callback', handleCallback); // called by Safaricom — no rate limit / no auth
router.get('/status/:checkoutRequestId', getStatus);

module.exports = router;
