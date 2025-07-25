const path = require('path')
const fssync = require('fs')
const fs = require('fs').promises

/**
 * Gets the year and month in format YYYYMM for the given date or current date
 * @param {string|Date|null} date - Optional date parameter, can be:
 *                                 - string in YYYYMM format
 *                                 - Date object
 *                                 - null (will use current date)
 * @returns {string} - Year and month in format YYYYMM
 */
function getYearMonthSubdirectory(date = null) {
    // If date is already a string in YYYYMM format, return it directly
    if (typeof date === 'string' && date.length === 6 && !isNaN(date)) {
        return date
    }
    
    // Otherwise, use the date object or create a new one for current date
    const targetDate = date || new Date()
    let month = (targetDate.getMonth() + 1) + ''
    
    if (month.length < 2) {
        month = '0' + month;
    }
    
    const year = targetDate.getFullYear()
    return `${year}${month}`
}

/**
 * Gets the jobs directory path with year/month subdirectory
 * @param {string|Date|null} date - Optional date parameter, can be:
 *                                 - string in YYYYMM format
 *                                 - Date object
 *                                 - null (will use current date)
 * @returns {string} - Path to the jobs directory
 */
function getJobsDir(date = null) {
    return getDir(`jobs/${getYearMonthSubdirectory(date)}`)
}

function getBaseJobsDir() {
    return getDir(`jobs`)
}

/**
 * Gets the logs directory path with year/month subdirectory
 * @param {string|Date|null} date - Optional date parameter, can be:
 *                                 - string in YYYYMM format
 *                                 - Date object
 *                                 - null (will use current date)
 * @returns {string} - Path to the logs directory
 */
function getLogsDir(date = null) {
    return getDir(`logs/${getYearMonthSubdirectory(date)}`)
}

function getBaseLogsDir() {
    return getDir(`logs`)
}

function getCommandsDir() {
    return getDir(`commands`)
}

function checkCommandFileExists(filename) {
    return fssync.existsSync(path.join(getCommandsDir(), filename))
}

function getDir(directoryName) {
    const dir = path.join(getDataDir(), directoryName)

    fssync.mkdirSync(dir, {recursive: true})

    return dir
}

function getDataDir() {
    const dataDir = path.join(__dirname, '../data')

    fssync.mkdirSync(path.dirname(dataDir), {recursive: true})

    return dataDir
}

async function findLogsFileRecursively(filename) {
    return findFileRecursively(getBaseLogsDir(), filename);
}

async function findJobFileRecursively(filename) {
    return findFileRecursively(getBaseJobsDir(), filename)
}

// Helper function to find a file recursively
async function findFileRecursively(dir, filename) {
    const files = await fs.readdir(dir, {withFileTypes: true});

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            const found = await findFileRecursively(fullPath, filename);
            if (found) return found;
        } else if (file.name === filename) {
            return fullPath;
        }
    }

    return null;
}

module.exports = {
    getJobsDir,
    findJobFileRecursively,
    getLogsDir,
    findLogsFileRecursively,
    getCommandsDir,
    checkCommandFileExists,
}
