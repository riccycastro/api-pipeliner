# API Pipeliner

API Pipeliner is a lightweight, configurable API service that allows you to trigger and manage pipeline commands through HTTP requests. It's designed to simplify deployment, service management, and other operational tasks by providing a secure API interface for executing predefined commands.

## Features

- **Webhook API**: Trigger commands via HTTP POST requests
- **Job Management**: Track job status and view execution logs
- **Security**: API key authentication with IP restrictions and command-level access control
- **Configurable Commands**: Define custom commands with parameters
- **Background Execution**: Commands run asynchronously in worker threads
- **Logging**: Comprehensive logging for all executed commands

## Requirements

- Node.js (v14 or higher recommended)
- Docker (for Docker-related commands)
- Git (for git-related commands)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/api-pipeliner.git
   cd api-pipeliner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create configuration files:
   ```bash
   cp pipeline-config.dist.yml pipeline-config.yml
   cp security-config.dist.yml security-config.yml
   ```

4. Configure your environment variables (optional):
   ```bash
   touch .env
   ```

## Configuration

### Pipeline Configuration

Edit `pipeline-config.yml` to define the commands that can be executed through the API:

```yaml
commands:
  command-name:
    context: host
    execute:
      - command1
      - command2
    parameters: [param1, param2]
```

Each command can be:
- A list of shell commands
- A reference to a script file: `{ type: file, filename: 'script.sh' }`

#### Executing Shell Scripts

You can execute shell scripts by referencing them in your pipeline configuration:

```yaml
commands:
  deploy-service:
    context: host
    execute:
      - { type: file, filename: 'deploy_script.sh' }
```

**Shell Script Requirements:**

1. Place your shell scripts in the `data/commands/` directory of the project
2. The system will automatically make the script executable with `chmod +x` before execution
3. Scripts are executed using the bash shell

**Passing Parameters to Shell Scripts:**

Parameters from the `options` object in your API request are passed to the script as command-line arguments in the format `--key=value`:

```json
{
  "action": "deploy-service",
  "target": "my-service",
  "options": {
    "version": "1.2.3",
    "environment": "production"
  }
}
```

The above request would execute your script with the following arguments:
```
./deploy_script.sh --version=1.2.3 --environment=production
```

You can access these parameters in your shell script using standard argument parsing.

#### Using Slugs for Dynamic Command Execution

API Pipeliner supports the use of "slugs" (parameter placeholders) in command definitions, allowing for dynamic command execution. Slugs are denoted using the `$paramName` syntax and are automatically replaced with the corresponding parameter values at runtime.

**Benefits of Using Slugs:**

- Create more flexible and reusable command configurations
- Dynamically adjust command behavior based on input parameters
- Reduce the number of similar command definitions by parameterizing common elements

**How to Use Slugs:**

You can use slugs in any part of your command strings:

```yaml
commands:
  deploy-to-environment:
    context: host
    execute:
      - echo "Deploying to $environment environment"
      - docker-compose -f docker-compose.$environment.yml up -d
      - echo "Deployment to $environment complete"
    parameters: [environment]
```

**Examples:**

1. **Dynamic file paths:**
   ```yaml
   commands:
     process-data:
       context: host
       execute:
         - python scripts/process_$data_type.py --input=$input_file --output=$output_dir/$data_type-results.json
       parameters: [data_type, input_file, output_dir]
   ```

2. **Dynamic service selection:**
   ```yaml
   commands:
     manage-service:
       context: host
       execute:
         - docker $action $service_name
       parameters: [action, service_name]
   ```

3. **Dynamic script selection:**
   ```yaml
   commands:
     run-deployment:
       context: host
       execute:
         - { type: file, filename: '$deployment_type_deployer.sh' }
       parameters: [deployment_type]
   ```

When using slugs in file references, ensure that the resulting filename exists in the `data/commands/` directory.

**API Request Example:**

```json
{
  "action": "run-deployment",
  "target": "my-service",
  "options": {
    "deployment_type": "script"
  }
}
```

This would execute the script `script_deployer.sh` from the `data/commands/` directory.

#### Using Environment Variables in Commands

API Pipeliner allows you to use environment variables in your command definitions. Environment variables are useful for:

- Storing configuration values that shouldn't be hardcoded
- Referencing values that might change between environments
- Keeping sensitive information out of your command definitions

**Syntax for Environment Variables:**

You can reference environment variables in your commands using two formats:
- `${VAR_NAME}` - Using curly braces (recommended for clarity)
- `$VAR_NAME` - Direct reference

**How Environment Variables are Processed:**

1. Environment variables are loaded from:
   - The system environment
   - The `.env` file in the project root
   - The `.env.local` file (if it exists, overrides previous values)

2. When a command is executed, any environment variable references are replaced with their actual values.

3. If an environment variable is undefined, a warning is logged and the reference is replaced with an empty string.

**Examples:**

1. **Docker Compose Commands:**
   ```yaml
   commands:
     deploy-service:
       context: host
       execute:
         - docker compose -f ${COMPOSE_FILE} --profile=${COMPOSE_PROFILE} --env-file=${COMPOSE_ENV_FILE} up -d service
   ```

2. **Path References:**
   ```yaml
   commands:
     backup-data:
       context: host
       execute:
         - tar -czf ${BACKUP_DIR}/backup-$(date +%Y%m%d).tar.gz ${DATA_DIR}
   ```

3. **Combined with Parameter Slugs:**
   ```yaml
   commands:
     deploy-to-environment:
       context: host
       execute:
         - docker compose -f ${COMPOSE_DIR}/docker-compose.$environment.yml up -d
       parameters: [environment]
   ```

**Environment Variables in Shell Scripts:**

When executing shell scripts, environment variables are automatically available within the script's environment. You can access them using standard shell syntax:

```bash
#!/bin/bash
echo "Deploying to ${ENVIRONMENT}"
echo "Using Docker Compose file: ${COMPOSE_FILE}"
```

**Best Practices:**

1. Use environment variables for configuration that might change between environments
2. Use parameter slugs for values that should be provided at runtime
3. Set default values in your scripts for optional environment variables
4. Document required environment variables in your project documentation

### Security Configuration

Edit `security-config.yml` to define API keys and their permissions:

```yaml
keys:
  your-api-key-id:
    allowedCommands: ['command1', 'command2']
    allowedIPs: ['127.0.0.1/32', '192.168.1.0/24']
    secret: 'your-secret-key'
    type: 'nonce'
```

Security types:
- `nonce`: Requires a nonce-based authentication
- `api-key`: Simple API key authentication

### Environment Variables

Create a `.env` file with the following variables:
- `PORT`: The port to run the API server (default: 3000)
- `COMPOSE_FILE`: Path to docker-compose file (for docker-compose commands)
- `COMPOSE_PROFILE`: Docker compose profile to use
- `COMPOSE_ENV_FILE`: Environment file for docker-compose

## Usage

### Starting the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run prod
```

### API Endpoints

#### Trigger a Command

```
POST /webhook
```

Request body:
```json
{
  "action": "command-name",
  "target": "service-name",
  "options": {
    "param1": "value1",
    "param2": "value2"
  },
  "triggered_by": "user-name"
}
```

Headers:
```
X-API-Key: your-api-key
```

Response:
```json
{
  "jobId": "uuid",
  "statusUrl": "/jobs/uuid",
  "logUrl": "/jobs/uuid/logs"
}
```

#### List All Jobs

```
GET /jobs
```

#### Get Job Status

```
GET /jobs/:id
```

#### Get Job Logs

```
GET /jobs/:id/logs
```

## Security Considerations

- Always use HTTPS in production
- Regularly rotate API keys
- Limit IP ranges to trusted networks
- Use the principle of least privilege when assigning command permissions

## License

[MIT License](LICENSE)