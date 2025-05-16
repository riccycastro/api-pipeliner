const path = require('path')
const fssync = require('fs')
const fs = require('fs').promises

const currentDate = new Date()
let month = (currentDate.getMonth() + 1) + ''

if (month.length < 2) {
    month = '0' + month;
}

const year = currentDate.getFullYear()
const subDirectory = `${year}${month}`

function getJobsDir(date = null) {
    return getDir(`jobs/${date ? date : subDirectory}`)
}

function getBaseJobsDir() {
    return getDir(`jobs`)
}

function getLogsDir() {
    return getDir(`logs/${subDirectory}`)
}

function getBaseLogsDir() {
    return getDir(`logs`)
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
}
