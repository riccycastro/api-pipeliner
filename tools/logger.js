const fs = require('fs')
const path = require('path')
const {getLogsDir} = require('../tools/dir')

const LOGS_DIR = getLogsDir()

fs.mkdirSync(path.dirname(LOGS_DIR), { recursive: true })

const logToFile = (file, message, newLine = true) => {

    const content = `${message}${newLine ? '\n' : ''}`
    fs.appendFileSync(file, content)
    console.log(content)
}

function getLogger(context, jobId) {
    const logFile = path.join(LOGS_DIR, `${jobId}.log`)

    return function (message, newLine = true) {
        const timestamp = new Date().toISOString()
        logToFile(logFile, `[${timestamp}][${context}] ${message}`, newLine)
    }
}

module.exports = getLogger
