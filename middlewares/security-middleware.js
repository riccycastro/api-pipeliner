const ipRangeCheck = require('ip-range-check')
const yaml = require('js-yaml')
const fssync = require('fs')

const SECURITY_CONFIG = yaml.load(fssync.readFileSync('security-config.yml'));

function securityMiddleware(req, res, next) {
    try {
        const apiKey = req.header('x-api-key') || req.query.apiKey || ''
        const clientIP = req.ip.replace(/^::ffff:/, '')

        // Validate API Key
        const clientConfig = SECURITY_CONFIG.apiKeys.find(k => k.key === apiKey)
        if (!clientConfig) {
            console.log('Invalid API key: ', apiKey)
            return res.status(401).json({error: 'Forbidden'})
        }
        // Validate IP Address
        let ipAllowed = clientConfig.allowedIPs.includes('*')
            || ipRangeCheck(clientIP, clientConfig.allowedIPs)

        if (!ipAllowed) {
            console.log('IP not allowed: ', clientIP)
            return res.status(403).json({error: 'Unauthorized'})
        }

        if (req.method === 'POST') {
            // Validate Command Permission
            const requestedAction = req.body.action

            const commandAllowed =
                clientConfig.allowedCommands.includes('*') ||
                clientConfig.allowedCommands.includes(requestedAction)
            if (!commandAllowed) {
                console.log('Command not permitted')
                return res.status(403).json({error: 'Unauthorized'})
            }
            req.securityContext = clientConfig
        }
        next()
    } catch (error) {
        console.error('Security middleware error:', error.message)
        res.status(500).json({error: 'Server error, please try again later!'})
    }
}

module.exports = securityMiddleware
