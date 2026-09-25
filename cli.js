#!/usr/bin/env node

const fssync = require('fs')
const os = require('os')
const path = require('path')
const yaml = require('js-yaml')
const dotenv = require('dotenv')
const readline = require('readline/promises')
const {stdin, stdout} = require('process')
const {startJob} = require('./tools/run-job')

dotenv.config({path: path.join(__dirname, '.env')})
if (fssync.existsSync(path.join(__dirname, '.env.local'))) {
    dotenv.config({path: path.join(__dirname, '.env.local'), override: true})
}

function loadCommandConfig() {
    const configPath = path.join(__dirname, 'pipeline-config.yml')
    if (!fssync.existsSync(configPath)) {
        console.error('pipeline-config.yml not found. Run: cp pipeline-config.dist.yml pipeline-config.yml')
        process.exit(1)
    }
    return yaml.load(fssync.readFileSync(configPath))
}

async function askYesNo(rl, question, defaultValue) {
    const hint = defaultValue ? 'Y/n' : 'y/N'
    const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase()
    if (!answer) return defaultValue
    return answer === 'y' || answer === 'yes'
}

async function pickCommand(rl, commandConfig, preselected) {
    const commandNames = Object.keys(commandConfig.commands || {})
    if (commandNames.length === 0) {
        throw new Error('No commands defined in pipeline-config.yml')
    }

    if (preselected && commandNames.includes(preselected)) {
        return preselected
    }

    console.log('Available commands:')
    commandNames.forEach((name, i) => console.log(`  ${i + 1}) ${name}`))
    const answer = await rl.question(`Select a command [1-${commandNames.length}]: `)
    const command = commandNames[parseInt(answer, 10) - 1]
    if (!command) {
        throw new Error('Invalid selection')
    }
    return command
}

async function main() {
    const commandConfig = loadCommandConfig()
    const rl = readline.createInterface({input: stdin, output: stdout})

    try {
        const action = await pickCommand(rl, commandConfig, process.argv[2])

        const target = (await rl.question('Target / service name (optional): ')).trim()
        const branch = (await rl.question('Branch [main]: ')).trim() || 'main'
        const tag = (await rl.question('Tag (optional, leave blank to skip): ')).trim()
        const composer = await askYesNo(rl, 'Run composer install?', false)
        const migrations = await askYesNo(rl, 'Run migrations?', false)

        rl.close()

        const options = {branch, tag, composer, migrations, verbose: true}

        console.log(`\nStarting "${action}"${target ? ` on "${target}"` : ''}...\n`)

        const job = await startJob({
            action,
            target,
            options,
            triggered_by: `cli:${os.userInfo().username}`,
            commandConfig,
        })

        console.log(`Job ${job.jobId} started. Log file: ${job.logFile}\n`)

        const result = await job.completion

        console.log(`\nJob ${result.status === 'completed' ? 'completed successfully' : 'failed'} (exit code ${result.exitCode}).`)
        process.exit(result.exitCode || 0)
    } catch (err) {
        rl.close()
        console.error(`Error: ${err.message}`)
        process.exit(1)
    }
}

main()
