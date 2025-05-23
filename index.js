const express = require('express')
const fs = require('fs').promises
const fssync = require('fs')
const path = require('path')
const {Worker} = require('worker_threads')
const uuid = require('uuid')
const yaml = require('js-yaml')
const dotenv = require('dotenv')
const {
    getJobsDir,
    findLogsFileRecursively,
    findJobFileRecursively
} = require('./tools/dir')
const getLogger = require('./tools/logger')

console.log('Loading environment variables...')
dotenv.config({path: path.join(__dirname, '.env')})
console.log('.env loaded.')

if (fssync.existsSync('.env.local')) {
    dotenv.config({path: path.join(__dirname, '.env.local'), override: true})
    console.log('.env.local loaded.')
} else {
    console.log('.env.local not found, skipping.')
}

const crypto = require('crypto')

console.log(
    crypto
        .createHmac('sha256', '7cf2012c-967a-4e2e-9827-ac508432db4e')
        .update('9827' + Math.floor(Date.now() / 1000) + '{"action":"restart-middleware","target":"acount-middleware","triggered_by":"riccycastro","options":{"environment":"dev","branch_or_tag":"master","composer":"Yes","migration":"Yes"}}')
        .digest('hex'),
    Math.floor(Date.now() / 1000)
)

const createRateLimitMiddleware = require('./middlewares/rate-limit-middleware')
const securityMiddleware = require('./middlewares/security-middleware.js')

// Load configs
const COMMAND_CONFIG = yaml.load(fssync.readFileSync('pipeline-config.yml'))

const app = express()
app.use(express.json())

// --- Security Middleware ---
app.use(securityMiddleware)

// --- Submit a Job ---
app.post('/webhook', createRateLimitMiddleware(), async (req, res) => {
    console.log(req.body)

    // Directories for job data and logs
    const JOBS_DIR = getJobsDir()

    const jobId = uuid.v4()
    const jobFile = path.join(JOBS_DIR, `${jobId}.json`)

    const logger = getLogger('MAIN', jobId)

    const {action, target, options = {}, triggered_by} = req.body

    const commandSpec = COMMAND_CONFIG.commands[action]
    if (!commandSpec) {
        return res.status(400).json({error: 'Invalid action specified'})
    }

    // Compose parameters for the command
    const parameters = {...options, service_name: target}

    // Save job metadata
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

    // Start background worker
    const worker = new Worker(path.join(__dirname, 'workers/command-worker.js'), {
        workerData: {
            jobId,
            commandSpec,
            parameters,
            jobFile,
            options,
            envVars: process.env,
        }
    })

    worker.on('exit', async code => {
        logger(`Worker exited with code ${code}`)

        // Update job status
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
    })

    worker.on('error', error => {
        logger(`Worker error: ${error.message}`)
    })

    res.status(202).json({
        jobId,
        statusUrl: `/jobs/${jobId}`,
        logUrl: `/jobs/${jobId}/logs`
    })
})

// --- List all jobs ---
app.get('/jobs', createRateLimitMiddleware({max: 30}), async (req, res) => {
    const JOBS_DIR = getJobsDir(req.query.date)

    try {
        const files = await fs.readdir(JOBS_DIR)
        const jobs = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async file => {
                    const content = await fs.readFile(path.join(JOBS_DIR, file), 'utf8')
                    return JSON.parse(content)
                })
        )
        jobs.sort((a, b) => new Date(b.created) - new Date(a.created))
        res.json(jobs)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
})

// --- Get job metadata ---
app.get('/jobs/:id', createRateLimitMiddleware({max: 3, windowMs: 60 * 1000}), async (req, res) => {
    try {
        const jonFilename = `${req.params.id}.json`
        const jobPath = await findJobFileRecursively(jonFilename)
        if (!jobPath) {
            res.status(404).json({error: 'Job not found'})
            return
        }

        const content = await fs.readFile(jobPath, 'utf8')
        res.json(JSON.parse(content))
    } catch (error) {
        res.status(404).json({error: 'Job not found'})
    }
})

// --- Get job logs ---
app.get('/jobs/:id/logs', createRateLimitMiddleware({max: 20, windowMs: 60 * 1000}), async (req, res) => {
    try {
        const logFilename = `${req.params.id}.log`
        const logPath = await findLogsFileRecursively(logFilename)

        if (!logPath) {
            res.status(404).json({error: 'No logs found for this job'})
            return
        }

        const logs = await fs.readFile(logPath, 'utf8')
        res.type('text/plain').send(logs)
    } catch (error) {
        res.status(404).json({error: 'Logs not found'})
    }
})

// --- Start server ---
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Pipeline API running on port ${PORT}`)
})
