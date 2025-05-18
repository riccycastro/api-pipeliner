const apiKeyHandler = require('./api-key-guard')
const nonceHandler = require('./nonce-guard')

function createGuard(securityType) {
    switch (securityType) {
        case 'api-key':
            return apiKeyHandler
        case 'nonce':
            return nonceHandler
        default:
            throw new Error(`Invalid security type: ${securityType}`)
    }
}

module.exports = createGuard
