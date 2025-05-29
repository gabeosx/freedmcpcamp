# Freedcamp MCP Server

[![npm version](https://img.shields.io/npm/v/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![license](https://img.shields.io/npm/l/freedcamp-mcp)](./LICENSE)
[![build](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml/badge.svg)](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![node](https://img.shields.io/node/v/freedcamp-mcp)](https://nodejs.org/)
[![GitHub All Releases](https://img.shields.io/github/downloads/gabeosx/freedmcpcamp/total.svg)](https://github.com/gabeosx/freedmcpcamp/releases)

This is a Model Context Protocol (MCP) server implementation for Freedcamp task management. It provides tools for creating, updating, listing, and deleting tasks in Freedcamp projects.

## Features

- Create new tasks with title, description, priority, due date, and assignee
- Update existing tasks including status changes (open/completed/closed)
- List all tasks in a project
- Delete tasks
- Batch operations for multiple tasks
- Environment variable support for secure credential management
- Comprehensive error handling and validation
- TypeScript implementation with Zod schema validation

## Prerequisites

- Node.js 17 or higher
- TypeScript
- Freedcamp account with API access
- API Key and Secret from Freedcamp (available in your Freedcamp account settings)
- Project ID from Freedcamp (found in your project URL or settings)

## Installation

### For use with MCP clients (Cursor, Claude Desktop, etc.)

Install the package globally:
```bash
npm install -g freedcamp-mcp
```

### For development or manual usage

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

### Building and Running the Server

First build the TypeScript code:
```bash
npm run build
```

Then start the server:
```bash
npm start
```

### Running the Test Harness

The project includes a comprehensive test harness that verifies all MCP functionality:

```bash
npm test
```

The test harness performs the following checks:
1. Server initialization with proper protocol version
2. Tool listing and capability verification
3. Task creation with various parameters
4. Task updates including status changes
5. Task listing and verification
6. Task deletion functionality

### Available Tools

#### 1. `freedcamp_add_task`
- **Purpose:** Creates one or more new tasks in Freedcamp
- **Input:** An object with a single key `tasks`, which is an **array** of task objects
- **Task Object Structure** (for each item in the `tasks` array):
  - `title` (required): Task title (string)
  - `description` (optional): Task description (string)
  - `priority` (optional): Task priority (0-3, where 0=lowest, 3=highest)
  - `due_date` (optional): Task due date (YYYY-MM-DD format)
  - `assigned_to_id` (optional): User ID to assign the task to (string)
- **Example Input:**
  ```json
  {
    "tasks": [
      { 
        "title": "Implement user authentication",
        "description": "Add JWT-based authentication system",
        "priority": 3,
        "due_date": "2024-02-15"
      },
      { 
        "title": "Update documentation",
        "description": "Update API documentation with new endpoints"
      }
    ]
  }
  ```

#### 2. `freedcamp_update_task`
- **Purpose:** Updates one or more existing tasks in Freedcamp
- **Input:** An object with a single key `tasks`, which is an **array** of task update objects
- **Task Update Object Structure** (for each item in the `tasks` array):
  - `task_id` (required): ID of the task to update (string)
  - `title` (optional): New task title (string)
  - `description` (optional): New task description (string)
  - `priority` (optional): New task priority (0-3)
  - `due_date` (optional): New due date (YYYY-MM-DD format)
  - `assigned_to_id` (optional): New user ID to assign the task to (string)
  - `status` (optional): New task status (0=open, 1=completed, 2=closed)
- **Example Input:**
  ```json
  {
    "tasks": [
      { 
        "task_id": "123456", 
        "status": 1,
        "title": "Completed user authentication"
      },
      { 
        "task_id": "789012", 
        "priority": 2,
        "due_date": "2024-02-20"
      }
    ]
  }
  ```

#### 3. `freedcamp_list_tasks`
- **Purpose:** Lists all tasks in the configured Freedcamp project
- **Input:** Empty object `{}` (no parameters required)
- **Output:** Returns a comprehensive list of tasks with their details including:
  - Task ID, title, description
  - Status, priority, due date
  - Assigned user information
  - Creation and modification dates
- **Example Input:**
  ```json
  {}
  ```

#### 4. `freedcamp_delete_task`
- **Purpose:** Deletes one or more tasks in Freedcamp
- **Input:** An object with a single key `tasks`, which is an **array** of task deletion objects
- **Task Deletion Object Structure** (for each item in the `tasks` array):
  - `task_id` (required): ID of the task to delete (string)
- **Example Input:**
  ```json
  {
    "tasks": [
      { "task_id": "123456" },
      { "task_id": "789012" }
    ]
  }
  ```

### Environment Configuration

The server requires the following environment variables:

- `FREEDCAMP_API_KEY`: Your Freedcamp API key
- `FREEDCAMP_API_SECRET`: Your Freedcamp API secret  
- `FREEDCAMP_PROJECT_ID`: The ID of the Freedcamp project to manage

These can be set in a `.env` file for local development or configured in your MCP client.

### Error Handling

The server provides comprehensive error handling:
- Validates all input parameters using Zod schemas
- Returns detailed error messages for API failures
- Handles network timeouts and connection issues
- Provides structured error responses for debugging

### MCP Client Integration

#### Cursor IDE

Add the following to your Cursor settings (`~/.cursor/mcp.json`):

```json
{
  "servers": {
    "freedcamp": {
      "command": "freedcamp-mcp",
      "env": {
        "FREEDCAMP_API_KEY": "your_api_key",
        "FREEDCAMP_API_SECRET": "your_api_secret", 
        "FREEDCAMP_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

#### Claude Desktop

Add the following to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "freedcamp": {
      "command": "freedcamp-mcp",
      "env": {
        "FREEDCAMP_API_KEY": "your_api_key",
        "FREEDCAMP_API_SECRET": "your_api_secret",
        "FREEDCAMP_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

## Development

### Project Structure

```
freedcamp-mcp/
├── src/
│   ├── server.ts          # Main MCP server implementation
│   ├── freedcamp.ts       # Freedcamp API authentication utilities
│   └── test-harness.ts    # Comprehensive test suite
├── dist/                  # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

### Building from Source

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Development mode with watch
npm run dev
```

### API Reference

The server implements the Model Context Protocol (MCP) specification and communicates via JSON-RPC over stdio. All tools follow the Freedcamp API v1 specification.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the test suite
6. Submit a pull request

## Support

For issues related to:
- **This MCP server**: Open an issue on this repository
- **Freedcamp API**: Consult the [Freedcamp API documentation](https://freedcamp.com/api)
- **MCP specification**: See the [Model Context Protocol documentation](https://spec.modelcontextprotocol.io/)