const { workerData } = require('worker_threads')
const { exec } = require('child_process')
const getLogger = require('../tools/logger')
const {getCommandsDir, checkCommandFileExists} = require('../tools/dir')
const path = require('path')

const { jobId, commandSpec, parameters, envVars, options } = workerData

const verbose = !!(options && (options.verbose === true || options.verbose === 'true'))
const quiet = !!(options && (options.quiet === true || options.quiet === 'true'))

const logger = getLogger('WORKER', jobId, { verbose, quiet })

logger.info(`Worker started for job ${jobId}`)
logger.debug(`options=${JSON.stringify(options || {})}`)

process.on('uncaughtException', err => {
    logger.error(`UNCAUGHT ERROR: ${err.stack}`)
    process.exit(1)
});

function replacePlaceholders(command, params) {
    return command.replace(/\$(\w+)/g, (_, key) => {
        if (!params[key]) throw new Error(`Missing parameter: ${key}`)
        return params[key]
    })
}

function interpolateEnv(str) {
    return str.replace(/\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (_, var1, var2) => {
        const key = var1 || var2
        const value = envVars[key]
        if (value === undefined) {
            logger.warn(`Environment variable ${key} is undefined`)
            return ''
        }
        return value
    });
}

async function run() {
    try {
        const commands = Array.isArray(commandSpec.execute)
            ? commandSpec.execute
            : [commandSpec.execute]

        for (const cmdEntry of commands) {
            let cmd;

            // Handle string command
            if (typeof cmdEntry === 'string') {
                // Step 1: Replace custom parameters
                cmd = replacePlaceholders(cmdEntry, parameters)

                // Step 2: Replace environment variables
                cmd = interpolateEnv(cmd)

                logger.info(`Executing: ${cmd}`)

                // Handle object command (e.g., file execution)
            } else if (
                typeof cmdEntry === 'object'
                && cmdEntry.type === 'file'
                && cmdEntry.filename
            ) {
                const exists = checkCommandFileExists(cmdEntry.filename)
                if (!exists) {
                    throw new Error(`Command file not found: ${cmdEntry.filename}`)
                }
                const filename = path.join(getCommandsDir(), cmdEntry.filename)

                // Ensure the file is executable
                await new Promise((resolve, reject) => {
                    exec(`chmod +x ${filename}`, (err) => {
                        if (err) return reject(err)
                        resolve()
                    });
                });

                // Build CLI params from options, skipping known toggles we inject separately
                const skipKeys = new Set(['verbose', 'quiet', 'log-file', 'log_file'])
                const optPairs = Object.entries(options || {})
                    .filter(([key]) => !skipKeys.has(key))
                    .map(([key, value]) => `--${key}=${value}`)
                const injected = []
                if (verbose) injected.push('-v')
                if (quiet) injected.push('-q')
                const logFileArg = `--log-file=${logger.filePath}`
                injected.push(logFileArg)

                const paramsString = [...optPairs, ...injected].join(' ')

                cmd = `${filename} ${paramsString}`
                logger.info(`Executing file: ${cmd}`)

            } else {
                throw new Error(`Unsupported command entry: ${JSON.stringify(cmdEntry)}`)
            }

            // Execute the command (either from string or object)
            await new Promise((resolve, reject) => {
                const child = exec(cmd, {
                    shell: '/bin/bash',
                    timeout: 600000 // 10 minutes
                });

                child.stdout.on('data', data => {
                    const text = data.toString()
                    if (text.trim()) logger.debug(text.trim())
                })

                child.stderr.on('data', data => {
                    const text = data.toString()
                    if (text.trim()) logger.debug(text.trim())
                })

                child.on('exit', (code, signal) => {
                    if (code !== 0) {
                        logger.error(`Command failed with code ${code} (signal: ${signal})`)
                        reject(new Error(`Command failed: ${cmd}`))
                    } else {
                        logger.info(`Command succeeded`)
                        resolve()
                    }
                })
            })
        }

        logger.info(`All commands completed successfully`)
    } catch (err) {
        logger.error(`FATAL ERROR: ${err.message}\n${err.stack}`)
        process.exit(1)
    }
}

run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
