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

### Running the Test Client

Test the server functionality:
```bash
npm test
```

### Available Tools

1. `add_task`
   - Creates a new task in Freedcamp
   - Parameters:
     - `title` (required): Task title
     - `description` (optional): Task description
     - `priority` (optional): Task priority (0-3)
     - `due_date` (optional): Task due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): User ID to assign the task to

2. `update_task`
   - Updates an existing task
   - Parameters:
     - `task_id` (required): ID of the task to update
     - `title` (optional): New task title
     - `description` (optional): New task description
     - `priority` (optional): New task priority (0-3)
     - `due_date` (optional): New due date (YYYY-MM-DD)
     - `assigned_to_id` (optional): New user ID to assign the task to
     - `status` (optional): New task status (0=open, 1=completed, 2=closed)

3. `delete_task`
   - Deletes a task
   - Parameters:
     - `task_id` (required): ID of the task to delete

### IDE Integration

#### Cursor

1. Install the MCP extension for Cursor
2. Configure the extension to point to your server:
   ```json
   {
     "mcp.servers": [
       {
         "name": "Freedcamp",
         "command": "node",
         "args": ["dist/server.js"]
       }
     ]
   }
   ```

#### VS Code

1. Install the MCP extension for VS Code
2. Configure the extension to point to your server:
   ```json
   {
     "mcp.servers": [
       {
         "name": "Freedcamp",
         "command": "node",
         "args": ["dist/server.js"]
       }
     ]
   }
   ```

## Environment Variables

- `FREEDCAMP_API_KEY`: Your Freedcamp API key
- `FREEDCAMP_API_SECRET`: Your Freedcamp API secret
- `FREEDCAMP_PROJECT_ID`: The ID of the Freedcamp project to manage tasks in

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