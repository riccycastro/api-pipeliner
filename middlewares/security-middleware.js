const ipRangeCheck = require('ip-range-check')
const yaml = require('js-yaml')
const fssync = require('fs')
const createGuard = require('../guards/factory')

const SECURITY_CONFIG = yaml.load(fssync.readFileSync('security-config.yml'))

function securityMiddleware(req, res, next) {
    try {
        let key = req.header('x-key') || req.query.key || ''
        let apiKey = req.header('x-api-key') || req.query.apiKey || ''

        // Support Basic Auth (fallback for browser users)
        if (!key && req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
            try {
                const authString = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf8');
                const authParts = authString.split(':');
                key = authParts[0];
                apiKey = authParts.slice(1).join(':');

                // Inject into headers so guards can find them
                req.headers['x-key'] = key;
                req.headers['x-api-key'] = apiKey;
            } catch (e) {
                console.error('Security middleware: Failed to parse Basic Auth header');
            }
        }

        const clientIP = req.ip.replace(/^::ffff:/, '')

        // Helper to send 401 with Browser Challenge for HTML requests
        const sendUnauthorized = (message = 'Forbidden') => {
            if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || (req.accepts && req.accepts('html')))) {
                res.setHeader('WWW-Authenticate', 'Basic realm="API Pipeliner Dashboard"');
                return res.status(401).send(message);
            }
            return res.status(401).json({error: message});
        };

        const securityConfig = SECURITY_CONFIG.keys[key]
        if (!securityConfig) {
            return sendUnauthorized('Forbidden');
        }

        try {
            createGuard(securityConfig.type)(securityConfig, req)
        } catch (error) {
            console.log(error.message)
            return sendUnauthorized('Invalid Credentials');
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
