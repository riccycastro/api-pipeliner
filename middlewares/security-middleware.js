const ipRangeCheck = require('ip-range-check')
const yaml = require('js-yaml')
const fssync = require('fs')
const createGuard = require('../guards/factory')

const SECURITY_CONFIG = yaml.load(fssync.readFileSync('security-config.yml'))

function securityMiddleware(req, res, next) {
    try {
        const key = req.header('x-key') || req.query.key || ''
        const clientIP = req.ip.replace(/^::ffff:/, '')

        // Validate API Key
        const securityConfig = SECURITY_CONFIG.keys[key]
        if (!securityConfig) {
            return res.status(401).json({error: 'Forbidden'})
        }

        try {
            createGuard(securityConfig.type)(securityConfig, req)
        } catch (error) {
            console.log(error.message)
            return res.status(401).json({error: 'Forbidden'})
        }

        // Validate IP Address
        let ipAllowed = securityConfig.allowedIPs.includes('*')
            || ipRangeCheck(clientIP, securityConfig.allowedIPs)

        if (!ipAllowed) {
            console.log('IP not allowed: ', clientIP)
            return res.status(403).json({error: 'Unauthorized'})
        }

        if (req.method === 'POST') {
            // Validate Command Permission
            const requestedAction = req.body.action

            const commandAllowed =
                securityConfig.allowedCommands.includes('*') ||
                securityConfig.allowedCommands.includes(requestedAction)
            if (!commandAllowed) {
                console.log('Command not permitted')
                return res.status(403).json({error: 'Unauthorized'})
            }
            req.securityContext = securityConfig
        }
        next()
    } catch (error) {
        console.error('Security middleware error:', error.message)
        res.status(500).json({error: 'Server error, please try again later!'})
    }
}

module.exports = securityMiddleware
