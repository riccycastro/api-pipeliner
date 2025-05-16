const { workerData } = require('worker_threads')
const { exec } = require('child_process')
const getLogger = require('../tools/logger')

const { jobId, commandSpec, parameters, envVars } = workerData;

const logger = getLogger('WORKER', jobId)

logger(`Worker started for job ${jobId}`);

process.on('uncaughtException', err => {
    logger(`UNCAUGHT ERROR: ${err.stack}`);
    process.exit(1);
});

function replacePlaceholders(command, params) {
    return command.replace(/\$(\w+)/g, (_, key) => {
        if (!params[key]) throw new Error(`Missing parameter: ${key}`);
        return params[key];
    });
}

function interpolateEnv(str) {
    return str.replace(/\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (_, var1, var2) => {
        const key = var1 || var2;
        const value = envVars[key];
        if (value === undefined) {
            logToFile(`WARNING: Environment variable ${key} is undefined`);
            return '';
        }
        return value;
    });
}

async function run() {
    try {
        const commands = Array.isArray(commandSpec.execute)
            ? commandSpec.execute
            : [commandSpec.execute];

        for (const rawCmd of commands) {
            // Step 1: Replace custom parameters
            let cmd = replacePlaceholders(rawCmd, parameters);

            // Step 2: Replace environment variables
            cmd = interpolateEnv(cmd);

            logger(`Executing: ${cmd}`);

            await new Promise((resolve, reject) => {
                const child = exec(cmd, {
                    shell: '/bin/bash',
                    timeout: 600000 // 10 minutes
                });

                child.stdout.on('data', data =>
                    logger(`STDOUT: ${data.toString().trim()}`, false));

                child.stderr.on('data', data =>
                    logger(`STDERR: ${data.toString().trim()}`));

                child.on('exit', (code, signal) => {
                    if (code !== 0) {
                        logger(`Command failed with code ${code} (signal: ${signal})`);
                        reject(new Error(`Command failed: ${cmd}`));
                    } else {
                        logger(`Command succeeded`);
                        resolve();
                    }
                });
            });
        }

        logger(`All commands completed successfully`);
    } catch (err) {
        logger(`FATAL ERROR: ${err.message}\n${err.stack}`);
        process.exit(1);
    }
}

run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
