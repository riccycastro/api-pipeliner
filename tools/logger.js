const fs = require('fs')
const path = require('path')
const {getLogsDir} = require('../tools/dir')

function getLogFilePath(jobId) {
    const logsDir = getLogsDir()
    return path.join(logsDir, `${jobId}.log`)
}

function appendToFile(file, message, newLine = true) {
    const content = `${message}${newLine ? '\n' : ''}`
    fs.appendFileSync(file, content)
}

/**
 * Creates a leveled logger for the specified context and job ID
 * Levels: INFO, WARN, ERROR, DEBUG
 * - Writes all levels to the per-job log file
 * - Prints to console:
 *   - ERROR always to STDERR
 *   - INFO/WARN to STDOUT (suppressed when quiet=true)
 *   - DEBUG only when verbose=true
 * @param {string} context
 * @param {string} jobId
 * @param {object} [opts]
 * @param {boolean} [opts.verbose=false]
 * @param {boolean} [opts.quiet=false]
 * @returns {function & {info:Function, warn:Function, error:Function, debug:Function, filePath:string, options:object}}
 */
function getLogger(context, jobId, opts = {}) {
    const options = {
        verbose: false,
        quiet: false,
        ...opts,
    }

    const filePath = getLogFilePath(jobId)

    function emit(level, message, newLine = true) {
        const timestamp = new Date().toISOString()
        const line = `[${timestamp}][${level}][${context}] ${message}`
        appendToFile(filePath, line, newLine)

        // Console routing
        if (level === 'ERROR') {
            // Always show errors on STDERR
            process.stderr.write(`${line}${newLine ? '\n' : ''}`)
        } else if (level === 'DEBUG') {
            if (options.verbose) {
                process.stdout.write(`${line}${newLine ? '\n' : ''}`)
            }
        } else {
            if (!options.quiet) {
                process.stdout.write(`${line}${newLine ? '\n' : ''}`)
            }
        }
    }

    // Backward-compatible callable (defaults to INFO)
    const logFn = function(message, newLine = true) {
        emit('INFO', message, newLine)
    }
    logFn.info = (msg, nl = true) => emit('INFO', msg, nl)
    logFn.warn = (msg, nl = true) => emit('WARN', msg, nl)
    logFn.error = (msg, nl = true) => emit('ERROR', msg, nl)
    logFn.debug = (msg, nl = true) => emit('DEBUG', msg, nl)
    logFn.filePath = filePath
    logFn.options = options

    return logFn
}

module.exports = getLogger
