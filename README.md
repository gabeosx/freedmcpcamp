# Freedcamp MCP Server

[![npm version](https://img.shields.io/npm/v/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![license](https://img.shields.io/npm/l/freedcamp-mcp)](./LICENSE)
[![build](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml/badge.svg)](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![node](https://img.shields.io/node/v/freedcamp-mcp)](https://nodejs.org/)
[![GitHub All Releases](https://img.shields.io/github/downloads/gabeosx/freedmcpcamp/total.svg)](https://github.com/gabeosx/freedmcpcamp/releases)

This is a Model Context Protocol (MCP) server implementation for Freedcamp task management. It provides tools for creating, updating, listing, and deleting tasks in Freedcamp projects with support for bulk operations.

**Available Transport Methods:**
- **STDIO Transport** - Traditional MCP transport for IDE integrations (Claude Desktop, Cursor, etc.)
- **HTTP Transport** - Modern REST API with Server-Sent Events for web applications and cloud deployments

## Features

- Create multiple tasks in a single operation with title, description, priority, due date, and assignee
- Update existing tasks including status changes
- List all tasks in a project
- Delete tasks permanently
- Bulk operations support for all task management operations
- Environment variable support for credentials
- Comprehensive error handling and validation

## Prerequisites

- Node.js 17 or higher
- TypeScript
- Freedcamp account with API access
- API Key and Secret from Freedcamp
- Project ID from Freedcamp

## Installation (for manual invocation only, not necessary for usage with an IDE or other MCP desktop client)

1. Clone the repository:
```bash
git clone <repository-url>
cd freedcamp-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Freedcamp credentials:
```bash
FREEDCAMP_API_KEY=your_api_key
FREEDCAMP_API_SECRET=your_api_secret
FREEDCAMP_PROJECT_ID=your_project_id
```

## Usage

### Running the Server

First build the TypeScript code:
```bash
npm run build
```

#### STDIO Transport (Default)
This is the traditional transport method used by IDEs and MCP clients:
```bash
npm start
```

#### HTTP Transport
For containerized deployments and HTTP-based integrations:

**Development (with .env file):**
```bash
npm run start:http:test
```

**Production (with environment variables):**
```bash
npm run start:http
```

**Direct execution:**
```bash
# With environment variables
FREEDCAMP_API_KEY=your_key FREEDCAMP_API_SECRET=your_secret FREEDCAMP_PROJECT_ID=your_project npm run start:http

# Or using npx
npx freedcamp-mcp --http
```

The HTTP server will start on port 3000 (or the port specified by the `PORT` environment variable) and provide:
- **MCP endpoint**: `http://localhost:3000/mcp`
- **Health check**: `http://localhost:3000/health`

**HTTP Transport Features:**
- Stateless operation - each request is independent
- JSON responses with proper error handling
- CORS support for web applications
- Built-in health monitoring
- Suitable for load balancing and clustering

### Docker Deployment

For production deployments, you can use Docker to run the HTTP transport:

#### Using Docker Compose (Recommended)

1. Create a `.env` file with your Freedcamp credentials:
```bash
FREEDCAMP_API_KEY=your_api_key
FREEDCAMP_API_SECRET=your_api_secret
FREEDCAMP_PROJECT_ID=your_project_id
```

2. Start the service:
```bash
docker-compose up -d
```

#### Using Docker directly

```bash
# Build the image
docker build -t freedcamp-mcp .

# Run the container
docker run -d \
  --name freedcamp-mcp \
  -p 3000:3000 \
  -e FREEDCAMP_API_KEY=your_api_key \
  -e FREEDCAMP_API_SECRET=your_api_secret \
  -e FREEDCAMP_PROJECT_ID=your_project_id \
  freedcamp-mcp
```

The containerized server provides the same MCP functionality via HTTP transport, making it suitable for:
- Cloud deployments
- Kubernetes environments
- Load-balanced setups
- Integration with HTTP-based MCP clients

### Running the Test Harness

The project includes comprehensive test harnesses that verify all MCP functionality for both transport methods:

**STDIO Transport Test:**
```bash
npm test
```

**HTTP Transport Test:**
```bash
npm run test:http
```

Both test harnesses perform the following checks:
1. Server initialization with proper protocol version
2. Tool listing and capability verification
3. Single task creation, update, and deletion
4. Bulk task operations (create, update, delete)
5. Task listing and verification
6. Error handling and edge cases

**Note:** The HTTP test harness requires the HTTP server to be running. Use `npm run start:http:test` to start the server with test environment variables loaded.

### Available Tools

1. **`freedcamp_add_task`**
   - Creates one or more new tasks in Freedcamp
   - Input: Object with `tasks` array containing task details
   - Task Parameters:
     - `title` (required): Task title - should be clear and descriptive
     - `description` (optional): Detailed description of what the task involves
     - `priority` (optional): Task priority level (0=Low, 1=Normal, 2=High, 3=Urgent)
     - `due_date` (optional): Due date as Unix timestamp string (e.g., '1735689600' for 2025-01-01)
     - `assigned_to_id` (optional): User ID to assign the task to (must be valid Freedcamp user ID)

2. **`freedcamp_update_task`**
   - Updates one or more existing tasks in Freedcamp
   - Input: Object with `tasks` array containing task updates
   - Task Parameters:
     - `task_id` (required): ID of the task to update (must be valid existing Freedcamp task ID)
     - `title` (optional): New task title
     - `description` (optional): New task description
     - `priority` (optional): New task priority (0=Low, 1=Normal, 2=High, 3=Urgent)
     - `due_date` (optional): New due date as Unix timestamp string
     - `assigned_to_id` (optional): User ID to reassign the task to
     - `status` (optional): New task status (0=Open, 1=Completed, 2=Closed)

3. **`freedcamp_list_tasks`**
   - Retrieves all tasks in the configured Freedcamp project
   - No parameters required (uses project ID from environment variables)
   - Returns task details including ID, title, status, and other metadata

4. **`freedcamp_delete_task`**
   - Permanently deletes one or more tasks from Freedcamp
   - Input: Object with `tasks` array containing task IDs to delete
   - Task Parameters:
     - `task_id` (required): ID of the task to delete (WARNING: This action cannot be undone)

### Example Usage

**Creating multiple tasks:**
```json
{
  "tasks": [
    {
      "title": "Setup project structure",
      "description": "Initialize the basic project folder structure",
      "priority": 2,
      "due_date": "1735689600"
    },
    {
      "title": "Implement authentication",
      "description": "Add user login and registration functionality",
      "priority": 3,
      "assigned_to_id": "12345"
    }
  ]
}
```

**Updating multiple tasks:**
```json
{
  "tasks": [
    {
      "task_id": "67890",
      "status": 1,
      "description": "Updated: Added OAuth integration"
    },
    {
      "task_id": "67891",
      "priority": 3,
      "due_date": "1735776000"
    }
  ]
}
```

**Deleting multiple tasks:**
```json
{
  "tasks": [
    {
      "task_id": "67892"
    },
    {
      "task_id": "67893"
    }
  ]
}
```

### IDE Integration

The server can be run directly using `npx` without cloning the repository. Choose between STDIO transport (traditional) or HTTP transport (modern) based on your needs.

#### Cursor

**Option 1: STDIO Transport (Default)**
1. Open (or create) `.cursor/mcp.json` in your project root.
2. Add your Freedcamp MCP server configuration:
   ```json
   {
     "mcpServers": {
       "freedcamp": {
         "command": "npx",
         "args": ["freedcamp-mcp"],
         "env": {
           "FREEDCAMP_API_KEY": "your_api_key",
           "FREEDCAMP_API_SECRET": "your_api_secret",
           "FREEDCAMP_PROJECT_ID": "your_project_id"
         }
       }
     }
   }
   ```
3. Restart Cursor or reload MCP servers.

**Option 2: HTTP Transport**
1. First, start the HTTP server (in a separate terminal):
   ```bash
   npx freedcamp-mcp --http
   # Or with environment variables:
   FREEDCAMP_API_KEY=your_key FREEDCAMP_API_SECRET=your_secret FREEDCAMP_PROJECT_ID=your_project npx freedcamp-mcp --http
   ```
2. Configure Cursor to use HTTP transport:
   ```json
   {
     "mcpServers": {
       "freedcamp": {
         "transport": "http",
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```
3. Restart Cursor or reload MCP servers.

#### Claude Desktop

**Option 1: STDIO Transport (Default)**
1. Open (or create) `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%/Claude/claude_desktop_config.json` on Windows.
2. Add your Freedcamp MCP server configuration:
   ```json
   {
     "mcpServers": {
       "freedcamp": {
         "command": "npx",
         "args": ["freedcamp-mcp"],
         "env": {
           "FREEDCAMP_API_KEY": "your_api_key",
           "FREEDCAMP_API_SECRET": "your_api_secret",
           "FREEDCAMP_PROJECT_ID": "your_project_id"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop.

**Option 2: HTTP Transport**
1. Start the HTTP server:
   ```bash
   npx freedcamp-mcp --http
   ```
2. Configure Claude Desktop to use HTTP transport:
   ```json
   {
     "mcpServers": {
       "freedcamp": {
         "transport": "http",
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```
3. Restart Claude Desktop.

#### Roo

**Option 1: STDIO Transport (Default)**
1. Open (or create) your Roo MCP config file (commonly `roo.mcp.json` or similar).
2. Add your Freedcamp MCP server configuration:
   ```json
   {
     "mcpServers": {
       "Freedcamp": {
         "transport": "stdio",
         "command": "npx",
         "args": ["freedcamp-mcp"],
         "env": {
           "FREEDCAMP_API_KEY": "your_api_key",
           "FREEDCAMP_API_SECRET": "your_api_secret",
           "FREEDCAMP_PROJECT_ID": "your_project_id"
         }
       }
     }
   }
   ```

**Option 2: HTTP Transport**
1. Start the HTTP server:
   ```bash
   npx freedcamp-mcp --http
   ```
2. Configure Roo to use HTTP transport:
   ```json
   {
     "mcpServers": {
       "Freedcamp": {
         "transport": "http",
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```

## API Reference

For detailed information about Freedcamp's API, visit: https://freedcamp.com/api-docs

## License

MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.