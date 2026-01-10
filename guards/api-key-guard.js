function handle(securityConfig, req) {
    const key = req.header('x-api-key') || req.query.apiKey || req.header('x-key') || req.query.key || ''

    if (securityConfig.apiKey !== key) {
        throw new Error('Invalid API key: ' + key)
    }
}

module.exports = handle
