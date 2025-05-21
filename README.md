# Freedcamp MCP Server

[![npm version](https://img.shields.io/npm/v/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![license](https://img.shields.io/npm/l/freedcamp-mcp)](./LICENSE)
[![build](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml/badge.svg)](https://github.com/gabeosx/freedmcpcamp/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/freedcamp-mcp)](https://www.npmjs.com/package/freedcamp-mcp)
[![node](https://img.shields.io/node/v/freedcamp-mcp)](https://nodejs.org/)
[![GitHub All Releases](https://img.shields.io/github/downloads/gabeosx/freedmcpcamp/total.svg)](https://github.com/gabeosx/freedmcpcamp/releases)

This is a Model Context Protocol (MCP) server implementation for Freedcamp task management. It provides tools for creating, updating, and deleting tasks in Freedcamp projects.

## Features

- Create new tasks with title, description, priority, due date, and assignee
- Update existing tasks including status changes
- Delete tasks
- Environment variable support for credentials
- Error handling and validation

## Prerequisites

- Node.js 17 or higher
- TypeScript
- Freedcamp account with API access
- API Key and Secret from Freedcamp
- Project ID from Freedcamp

## Installation

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

### Available Tools

1. `freedcamp_add_task`
   - Creates a new task in Freedcamp
   - Parameters:
     - `title` (required): Task title
     - `description` (optional): Task description
     - `priority` (optional): Task priority (0-3)
     - `due_date` (optional): Task due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): User ID to assign the task to

2. `freedcamp_update_task`
   - Updates an existing task
   - Parameters:
     - `task_id` (required): ID of the task to update
     - `title` (optional): New task title
     - `description` (optional): New task description
     - `priority` (optional): New task priority (0-3)
     - `due_date` (optional): New due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): New user ID to assign the task to
     - `status` (optional): New task status (0=open, 1=completed, 2=closed)

3. `freedcamp_list_tasks`
   - Lists all tasks in the configured Freedcamp project
   - No parameters required (uses project ID from environment variables)
   - Returns a list of tasks with their details

### IDE Integration

The server can be run directly using `npx` without cloning the repository.

#### Cursor

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

#### Roo

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
         },
         "alwaysAllow": [
           "freedcamp_add_task"
         ]
       }
     }
   }
   ```
   - You can use `"alwaysAllow"`Mon May 19 15:39:23 EDT 2025
Mon May 19 15:49:11 EDT 2025
