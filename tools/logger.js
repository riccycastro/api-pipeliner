const fs = require('fs')
const path = require('path')
const {getLogsDir} = require('../tools/dir')

const logToFile = (file, message, newLine = true) => {
    const content = `${message}${newLine ? '\n' : ''}`
    fs.appendFileSync(file, content)
    console.log(content)
}

/**
 * Creates a logger function for the specified context and job ID
 * @param {string} context - The context for the log messages
 * @param {string} jobId - The ID of the job
 * @returns {function} - A logger function
 */
function getLogger(context, jobId) {
    return function (message, newLine = true) {
        // Get the logs directory at the time the log entry is written
        const logsDir = getLogsDir()
        
        // Create the log file path using the current month's directory
        const logFile = path.join(logsDir, `${jobId}.log`)
        
        const timestamp = new Date().toISOString()
        logToFile(logFile, `[${timestamp}][${context}] ${message}`, newLine)
    }
}

module.exports = getLogger
