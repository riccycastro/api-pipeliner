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
        if (!clientConfig) return res.status(401).json({error: 'Invalid API key'})

        // Validate IP Address
        let ipAllowed = clientConfig.allowedIPs.includes('*')
            || ipRangeCheck(clientIP, clientConfig.allowedIPs)

        if (!ipAllowed) return res.status(403).json({error: 'unauthorized'})

        if (req.method === 'POST') {
            // Validate Command Permission
            const requestedAction = req.body.action

            const commandAllowed =
                clientConfig.allowedCommands.includes('*') ||
                clientConfig.allowedCommands.includes(requestedAction)
            if (!commandAllowed)
                return res.status(403).json({error: 'Command not permitted'})

            req.securityContext = clientConfig
        }
        next()
    } catch (error) {
        console.error('Security middleware error:', error.message)
        res.status(500).json({error: 'Security middleware error'})
    }
}

module.exports = securityMiddleware
