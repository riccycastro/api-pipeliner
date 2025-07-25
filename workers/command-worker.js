const { workerData } = require('worker_threads')
const { exec } = require('child_process')
const getLogger = require('../tools/logger')
const {getCommandsDir, checkCommandFileExists} = require('../tools/dir')
const path = require('path')

const { jobId, commandSpec, parameters, envVars, options } = workerData

const logger = getLogger('WORKER', jobId)

logger(`Worker started for job ${jobId}`)

process.on('uncaughtException', err => {
    logger(`UNCAUGHT ERROR: ${err.stack}`)
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
            logToFile(`WARNING: Environment variable ${key} is undefined`)
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

                logger(`Executing: ${cmd}`)

                // Handle object command (e.g., file execution)
            } else if (
                typeof cmdEntry === 'object'
                && cmdEntry.type === 'file'
                && cmdEntry.filename
            ) {
                checkCommandFileExists(cmdEntry.filename)
                const filename = path.join(getCommandsDir(), cmdEntry.filename)

                // Ensure the file is executable
                await new Promise((resolve, reject) => {
                    exec(`chmod +x ${filename}`, (err) => {
                        if (err) return reject(err)
                        resolve()
                    });
                });

                const paramsString = Object.entries(options)
                    .map(([key, value]) => `--${key}=${value}`)
                    .join(' ');

                cmd = `${filename} ${paramsString}`
                logger(`Executing file: ${cmd}`)

            } else {
                throw new Error(`Unsupported command entry: ${JSON.stringify(cmdEntry)}`)
            }

            // Execute the command (either from string or object)
            await new Promise((resolve, reject) => {
                const child = exec(cmd, {
                    shell: '/bin/bash',
                    timeout: 600000 // 10 minutes
                });

                child.stdout.on('data', data =>
                    logger(`STDOUT: ${data.toString().trim()}`))

                child.stderr.on('data', data =>
                    logger(`STDERR: ${data.toString().trim()}`))

                child.on('exit', (code, signal) => {
                    if (code !== 0) {
                        logger(`Command failed with code ${code} (signal: ${signal})`)
                        reject(new Error(`Command failed: ${cmd}`))
                    } else {
                        logger(`Command succeeded`)
                        resolve()
                    }
                })
            })
        }

        logger(`All commands completed successfully`)
    } catch (err) {
        logger(`FATAL ERROR: ${err.message}\n${err.stack}`)
        process.exit(1)
    }
}

run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
