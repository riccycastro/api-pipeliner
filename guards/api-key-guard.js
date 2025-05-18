function handle(securityConfig, req) {
    const key = req.header('x-api-key') || req.query.apiKey || ''

    if (securityConfig.key !== key) {
        throw new Error('Invalid API key: ' + key)
    }
}

module.exports = handle
