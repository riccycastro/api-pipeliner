const crypto = require('crypto')

function handle(securityConfig, req) {
    const clientNonce = req.header('x-client-nonce') || req.query.clientNonce || ''
    const clientNonceTimestamp = req.header('x-client-nonce-timestamp') || req.query.clientNonceTimestamp || 0
    const clientHash = req.header('x-hmac') || req.query.hmac || ''

    if (!isFresh(clientNonceTimestamp)) {
        throw new Error('Invalid client nonce timestamp: ' + clientNonceTimestamp)
    }

    const serverHash = crypto
        .createHmac('sha256', securityConfig.secret)
        .update(clientNonce + clientNonceTimestamp + JSON.stringify(req.body))
        .digest('hex')

    if (serverHash !== clientHash) {
        throw new Error('Invalid HMAC: ' + clientHash)
    }
}

function isFresh(clientNonceTimestamp) {
    const currentTime = Math.floor(Date.now() / 1000)
    return currentTime - clientNonceTimestamp <= 300 // 5 minutes
}

module.exports = handle
