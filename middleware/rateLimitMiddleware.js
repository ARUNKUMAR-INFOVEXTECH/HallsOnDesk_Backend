const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: {
    message: "Too many attempts. Please try again after 1 minute."
  },
  standardHeaders: true, // Return rate limit info in standard headers
  legacyHeaders: false, // Disable legacy headers
});

module.exports = {
  authLimiter,
};
