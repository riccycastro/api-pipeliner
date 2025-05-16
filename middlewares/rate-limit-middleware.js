const rateLimit = require('express-rate-limit')

function createRateLimitMiddleware(options) {
    return rateLimit({
        windowMs: options?.windowMs || 60 * 1000 * 15, // 15 minutes
        max: options?.max || 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests, please try again later.'
    })
}

module.exports = createRateLimitMiddleware
