# Freedcamp MCP Server

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

1. `mcp/add_task`
   - Creates a new task in Freedcamp
   - Parameters:
     - `title` (required): Task title
     - `description` (optional): Task description
     - `priority` (optional): Task priority (0-3)
     - `due_date` (optional): Task due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): User ID to assign the task to

2. `mcp/update_task`
   - Updates an existing task
   - Parameters:
     - `task_id` (required): ID of the task to update
     - `title` (optional): New task title
     - `description` (optional): New task description
     - `priority` (optional): New task priority (0-3)
     - `due_date` (optional): New due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): New user ID to assign the task to
     - `status` (optional): New task status (0=open, 1=completed, 2=closed)

3. `mcp/list_tasks`
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
           "mcp/add_task"
         ]
       }
     }
   }
   ```
   - You can use `"alwaysAllow"` to always permit certain tools.

3. Restart Roo or reload MCP servers.

#### VS Code

1. Install the MCP extension for VS Code
2. Configure the extension to point to your server:
   ```json
   {
     "mcp.servers": [
       {
         "name": "Freedcamp",
         "command": "npx",
         "args": ["freedcamp-mcp"],
         "env": {
           "FREEDCAMP_API_KEY": "your_api_key",
           "FREEDCAMP_API_SECRET": "your_api_secret",
           "FREEDCAMP_PROJECT_ID": "your_project_id"
         }
       }
     ]
   }
   ```

### API Key Security

When setting up API keys in your IDE:

1. **Never commit IDE settings containing API keys**: Add your IDE's settings files (like `.vscode/settings.json` or `.cursor/settings.json`) to `.gitignore`
2. **Use environment variables when possible**: For development outside the IDE, use `.env` files
3. **Rotate API keys regularly**: Update your API keys periodically for security
4. **Use separate API keys**: Consider using different API keys for development and production

## Environment Variables

- `FREEDCAMP_API_KEY`: Your Freedcamp API key (required)
- `FREEDCAMP_API_SECRET`: Your Freedcamp API secret (required)
- `FREEDCAMP_PROJECT_ID`: The ID of the Freedcamp project to manage tasks in (required)

## Error Handling

The server includes comprehensive error handling:
- Validates all input parameters using Zod schemas
- Provides descriptive error messages
- Handles API errors gracefully
- Returns appropriate error responses to the client

## Development

### Building

```bash
npm run build
```

For development with watch mode:
```bash
npm run dev
```

### Testing

The project uses a TypeScript-based test harness that verifies:
- Server initialization and protocol compliance
- Tool availability and functionality
- Task management operations (create, update, list)
- Error handling and validation
- Environment variable configuration

Run the tests with:
```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT 