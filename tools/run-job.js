const fs = require('fs').promises
const path = require('path')
const {Worker} = require('worker_threads')
const uuid = require('uuid')
const {getJobsDir} = require('./dir')
const getLogger = require('./logger')

/**
 * Creates a job, writes its metadata, and spawns the worker that executes it.
 * Resolves once the job has been recorded and the worker started (not once it finishes).
 * @returns {Promise<{jobId: string, statusUrl: string, logUrl: string, logFile: string, completion: Promise}>}
 */
async function startJob({action, target, options = {}, triggered_by, commandConfig}) {
    const commandSpec = commandConfig.commands[action]
    if (!commandSpec) {
        throw new Error('Invalid action specified')
    }

    const JOBS_DIR = getJobsDir()
    const jobId = uuid.v4()
    const jobFile = path.join(JOBS_DIR, `${jobId}.json`)
    const logger = getLogger('MAIN', jobId)

    const parameters = {...options, service_name: target}

    const jobMeta = {
        id: jobId,
        created: new Date().toISOString(),
        status: 'processing',
        triggered_by,
        action,
        target,
        options,
    }
    await fs.writeFile(jobFile, JSON.stringify(jobMeta, null, 2))

    const worker = new Worker(path.join(__dirname, '../workers/command-worker.js'), {
        workerData: {
            jobId,
            commandSpec,
            parameters,
            jobFile,
            options,
            envVars: process.env,
        }
    })

    const completion = new Promise(resolve => {
        worker.on('exit', async code => {
            logger(`Worker exited with code ${code}`)

            const status = code === 0 ? 'completed' : 'failed'
            try {
                const jobRaw = await fs.readFile(jobFile, 'utf8')
                const job = JSON.parse(jobRaw)
                job.status = status
                job.completed = new Date().toISOString()
                await fs.writeFile(jobFile, JSON.stringify(job, null, 2))
            } catch (e) {
                // Ignore update errors
            }

            resolve({jobId, status, exitCode: code, logFile: logger.filePath})
        })

        worker.on('error', error => {
            logger(`Worker error: ${error.message}`)
        })
    })

    return {
        jobId,
        statusUrl: `/jobs/${jobId}`,
        logUrl: `/jobs/${jobId}/logs`,
        logFile: logger.filePath,
        completion,
    }
}

module.exports = {startJob}
