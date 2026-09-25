const express = require('express')
const fs = require('fs').promises
const fssync = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const dotenv = require('dotenv')
const {
    getJobsDir,
    findLogsFileRecursively,
    findJobFileRecursively
} = require('./tools/dir')
const {startJob} = require('./tools/run-job')

console.log('Loading environment variables...')
dotenv.config({path: path.join(__dirname, '.env')})
console.log('.env loaded.')

if (fssync.existsSync('.env.local')) {
    dotenv.config({path: path.join(__dirname, '.env.local'), override: true})
    console.log('.env.local loaded.')
} else {
    console.log('.env.local not found, skipping.')
}

const createRateLimitMiddleware = require('./middlewares/rate-limit-middleware')
const securityMiddleware = require('./middlewares/security-middleware.js')

// Load configs
const COMMAND_CONFIG = yaml.load(fssync.readFileSync('pipeline-config.yml'))

const app = express()
app.use(express.json())

// --- Security Middleware ---
app.use(securityMiddleware)

// Serve static files from the 'public' directory
app.use(express.static('public'))

// --- Submit a Job ---
app.post('/webhook', createRateLimitMiddleware(), async (req, res) => {
    console.log(req.body)

    const {action, target, options = {}, triggered_by} = req.body

    let job
    try {
        job = await startJob({action, target, options, triggered_by, commandConfig: COMMAND_CONFIG})
    } catch (e) {
        return res.status(400).json({error: e.message})
    }

    res.status(202).json({
        jobId: job.jobId,
        statusUrl: job.statusUrl,
        logUrl: job.logUrl,
    })
})

// --- List all jobs ---
app.get('/jobs', createRateLimitMiddleware({max: 30}), async (req, res) => {
    // Validate date format if provided (should be YYYYMM)
    let dateParam = req.query.date;
    if (dateParam && (dateParam.length !== 6 || isNaN(dateParam))) {
        return res.status(400).json({error: 'Date must be in YYYYMM format'});
    }
    
    const JOBS_DIR = getJobsDir(dateParam)

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
app.get('/jobs/:id', createRateLimitMiddleware({max: 60, windowMs: 60 * 1000}), async (req, res) => {
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
app.get('/jobs/:id/logs', createRateLimitMiddleware({max: 60, windowMs: 60 * 1000}), async (req, res) => {
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pipeline API running on port ${PORT}`)
})
