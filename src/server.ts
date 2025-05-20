#!/usr/bin/env node

import pino from 'pino';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ApiError, ValidationError, ToolExecutionError } from './errors.js';
import { FreedcampClient, FreedcampTask } from './freedcampClient.js';
import { TaskPriority, TaskStatus } from './types.js';
// URLSearchParams was unused, removed.

// Initialize Pino logger
const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  process.stderr
);

// Environment variable checks
const { FREEDCAMP_API_KEY, FREEDCAMP_API_SECRET, FREEDCAMP_PROJECT_ID } =
  process.env;

if (!FREEDCAMP_API_KEY || !FREEDCAMP_API_SECRET || !FREEDCAMP_PROJECT_ID) {
  logger.fatal(
    'Missing one or more required environment variables: FREEDCAMP_API_KEY, FREEDCAMP_API_SECRET, FREEDCAMP_PROJECT_ID'
  );
  process.exit(1);
}

// Initialize Freedcamp Client
const freedcampClient = new FreedcampClient({
  apiKey: FREEDCAMP_API_KEY,
  apiSecret: FREEDCAMP_API_SECRET,
  projectId: FREEDCAMP_PROJECT_ID,
});

// Define schemas for our tools
const addTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
});

const updateTaskSchema = z.object({
  task_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

// const deleteTaskSchema = z.object({
//   task_id: z.string()
// });

const listTasksSchema = z.object({});

// Create the server
const server = new Server(
  {
    name: 'freedcamp-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'freedcamp_add_task',
        description: 'Create a new task in Freedcamp',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
            assigned_to_id: {
              type: 'string',
              description: 'User ID to assign task to',
            },
            priority: {
              type: 'number',
              description: 'Task priority (0=NORMAL, 1=LOW, 2=HIGH, 3=URGENT)',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'freedcamp_update_task',
        description: 'Update an existing task in Freedcamp',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'ID of task to update' },
            title: { type: 'string', description: 'New task title' },
            description: {
              type: 'string',
              description: 'New task description',
            },
            due_date: {
              type: 'string',
              description: 'New due date (YYYY-MM-DD)',
            },
            assigned_to_id: {
              type: 'string',
              description: 'New user ID to assign task to',
            },
            priority: {
              type: 'number',
              description:
                'New task priority (0=NORMAL, 1=LOW, 2=HIGH, 3=URGENT)',
            },
            status: {
              type: 'number',
              description: 'New task status (0=OPEN, 1=COMPLETED, 2=CLOSED)',
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'freedcamp_list_tasks',
        description: 'List tasks in a Freedcamp project',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool execution
server
  .setRequestHandler(CallToolRequestSchema, async (request) => {
    // Ensure arguments exist
    const arguments_ = request.params.arguments || {};

    if (request.params.name === 'freedcamp_add_task') {
      try {
        // Parse and validate arguments
        let args;
        try {
          args = addTaskSchema.parse(arguments_);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new ValidationError(
              'Invalid arguments for freedcamp_add_task',
              err.issues
            );
          }
          throw err; // Re-throw other errors to be caught by the centralized handler
        }

        const taskData = {
          title: args.title,
          description: args.description,
          due_date: args.due_date,
          assigned_to_id: args.assigned_to_id,
          priority: args.priority,
        };

        const createdTask = await freedcampClient.addTask(taskData); // Returns FreedcampTask

        if (!createdTask || !createdTask.id) {
          // Ensure we have a task and an ID
          throw new ToolExecutionError(
            'Task ID not found in Freedcamp API response after add'
          );
        }
        return {
          content: [
            { type: 'text', text: `Task created with ID: ${createdTask.id}` },
          ],
          data: { task_id: createdTask.id }, // Return the task_id as per original logic
        };
      } catch (err) {
        // Let the centralized error handler manage ApiError, ValidationError, ToolExecutionError
        if (
          err instanceof ApiError ||
          err instanceof ValidationError ||
          err instanceof ToolExecutionError
        ) {
          throw err;
        }
        // For any other unexpected error, wrap it in ToolExecutionError
        logger.error(err, 'Unexpected error in freedcamp_add_task');
        throw new ToolExecutionError(
          `Failed to add task due to an unexpected error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (request.params.name === 'freedcamp_update_task') {
      try {
        // Parse and validate arguments
        let args;
        try {
          args = updateTaskSchema.parse(arguments_);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new ValidationError(
              'Invalid arguments for freedcamp_update_task',
              err.issues
            );
          }
          throw err;
        }

        const taskData = {
          title: args.title,
          description: args.description,
          due_date: args.due_date,
          assigned_to_id: args.assigned_to_id,
          priority: args.priority,
          status: args.status,
        };

        // Remove undefined fields from taskData as Freedcamp API might interpret them
        // Type taskData more strictly to avoid `as keyof typeof taskData`
        const updatePayload: { [key: string]: string | number | undefined } = {
          ...taskData,
        };
        Object.keys(updatePayload).forEach(
          (key) => updatePayload[key] === undefined && delete updatePayload[key]
        );

        const updatedTask = await freedcampClient.updateTask(
          args.task_id,
          updatePayload as Partial<FreedcampTask>
        ); // Returns FreedcampTask

        return {
          // Original response stringified the result, which is now a FreedcampTask.
          content: [
            {
              type: 'text',
              text: `Task updated successfully. ID: ${updatedTask.id}`,
            },
          ],
          data: updatedTask, // Return the full updated task object
        };
      } catch (err) {
        if (
          err instanceof ApiError ||
          err instanceof ValidationError ||
          err instanceof ToolExecutionError
        ) {
          throw err;
        }
        logger.error(err, 'Unexpected error in freedcamp_update_task');
        throw new ToolExecutionError(
          `Failed to update task due to an unexpected error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // --- Delete Task Tool (Currently Disabled) ---
    // The 'freedcamp_delete_task' tool is currently disabled.
    // It was originally commented out due to unspecified 'Freedcamp API issues'.
    // Without access to current API documentation for task deletion or ability to test,
    // it remains disabled to prevent potential errors.
    // To enable this tool:
    // 1. Verify the correct Freedcamp API endpoint and parameters for task deletion.
    //    The last known endpoint was: POST /api/v1/tasks/{task_id}/delete
    // 2. Implement the logic using the FreedcampClient, similar to other tools.
    // 3. Add a corresponding method in FreedcampClient.
    // 4. Define `deleteTaskSchema` for input validation (currently commented out above).
    // 5. Add the tool definition to `ListToolsRequestSchema`.
    // 6. Add comprehensive tests in `src/test-harness.ts`.
    // ---
    // if (request.params.name === "freedcamp_delete_task") { // Ensure to use the correct tool name if re-enabled
    //   try {
    //     // const args = deleteTaskSchema.parse(arguments_); // Validate args if schema is re-enabled
    //     const args = deleteTaskSchema.parse({
    //       api_key: arguments_.api_key || process.env.FREEDCAMP_API_KEY,
    //       api_secret: arguments_.api_secret || process.env.FREEDCAMP_API_SECRET,
    //       ...arguments_
    //     });
    //     console.log("Delete task args:", args);
    //     // Prepare Freedcamp API auth params (if not using client that handles it)
    //     // const authParams = buildFreedcampAuthParams({
    //     //   api_key: args.api_key,
    //       api_secret: args.api_secret,
    //     });
    //     console.log("Delete task auth params:", authParams);
    //     // Prepare form data
    //     const form = new FormData();
    //     form.append("data", JSON.stringify({})); // Empty data object
    //     for (const [k, v] of Object.entries(authParams)) {
    //       form.append(k, v);
    //     }
    //     // Make the API call using freedcampClient
    //     // Example: await freedcampClient.deleteTask(args.task_id);
    //     // const url = `https://freedcamp.com/api/v1/tasks/${args.task_id}/delete`;
    //     // console.log("Making request to Freedcamp API with URL:", url);
    //     console.log("Request body:", {
    //       data: "{}",
    //       ...authParams
    //     });
    //     const resp = await fetch(url, {
    //       method: "POST",
    //       body: form as any,
    //     });
    //     // const json = (await resp.json()) as any;
    //     // console.log("Freedcamp API response:", json);
    //     // if (!resp.ok || (json && json.http_code >= 400)) {
    //     //   throw new ApiError(json?.msg || resp.statusText, resp.status, json);
    //     // }
    //     // return {
    //     //   content: [{ type: "text", text: `Task deleted successfully` }],
    //     //   data: { success: true }, // Or actual response data
    //     // };
    //   } catch (err) { // Adjust error handling as per existing patterns
    //     // if (err instanceof ApiError || err instanceof ValidationError || err instanceof ToolExecutionError) {
    //     //   throw err;
    //     // }
    //     // logger.error(err, "Error deleting task");
    //     // throw new ToolExecutionError(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`);
    //   }
    // }

    if (request.params.name === 'freedcamp_list_tasks') {
      try {
        // No arguments to parse for listTasksSchema
        try {
          listTasksSchema.parse(arguments_); // Still call parse for consistency, though it expects {}
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new ValidationError(
              'Invalid arguments for freedcamp_list_tasks',
              err.issues
            );
          }
          throw err;
        }

        const result = await freedcampClient.listTasks();

        // The client returns the 'data' part of the API response, which should be { tasks: [...] }
        // or similar structure based on Freedcamp's actual response for listing tasks.
        // Assuming result = { tasks: [...] } or result directly is the array.
        // The client's _request method returns json.data.
        // Freedcamp's /tasks GET endpoint returns { data: { tasks: [] } }
        // So freedcampClient.listTasks() will return an object like { tasks: [...] }
        // The client's listTasks method now directly returns FreedcampTask[]
        const tasks: FreedcampTask[] = await freedcampClient.listTasks();
        const summary = tasks
          .map((t: FreedcampTask) => `ID: ${t.id}, Title: ${t.title}`)
          .join('\n');

        return {
          content: [{ type: 'text', text: summary || 'No tasks found.' }],
          data: tasks, // Return the array of FreedcampTask objects
        };
      } catch (err) {
        if (
          err instanceof ApiError ||
          err instanceof ValidationError ||
          err instanceof ToolExecutionError
        ) {
          throw err;
        }
        logger.error(err, 'Unexpected error in freedcamp_list_tasks');
        throw new ToolExecutionError(
          `Failed to list tasks due to an unexpected error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Handle unknown tool
    logger.error(`Unknown tool: ${request.params.name}`);
    throw new ToolExecutionError(`Unknown tool: ${request.params.name}`);
  })
  .catch((err: any) => {
    // Centralized error handler for CallToolRequestSchema
    // The 'err: any' is acceptable here as this is a top-level catcher.
    // We check instanceof for specific error types.
    if (err instanceof ApiError) {
      logger.error(err, 'ApiError caught in central handler');
      return {
        content: [
          { type: 'text', text: `Freedcamp API Error: ${err.message}` },
        ],
        data: {
          errorCode: 'FREEDCAMP_API_ERROR',
          httpStatusCode: err.httpStatusCode,
          details: err.details,
        },
      };
    } else if (err instanceof ValidationError) {
      logger.error(err, 'ValidationError caught in central handler');
      return {
        content: [{ type: 'text', text: `Validation Error: ${err.message}` }],
        data: {
          errorCode: 'VALIDATION_ERROR',
          issues: err.issues,
        },
      };
    } else if (err instanceof ToolExecutionError) {
      logger.error(err, 'ToolExecutionError caught in central handler');
      return {
        content: [
          { type: 'text', text: `Tool Execution Error: ${err.message}` },
        ],
        data: {
          errorCode: 'TOOL_EXECUTION_ERROR',
        },
      };
    } else if (err instanceof z.ZodError) {
      // Catch ZodErrors that might not have been wrapped
      logger.error(err, 'ZodError caught in central handler');
      return {
        content: [{ type: 'text', text: `Invalid Input: ${err.message}` }],
        data: {
          errorCode: 'VALIDATION_ERROR',
          issues: err.issues,
        },
      };
    } else {
      logger.error(err, 'Unhandled error in CallToolRequestSchema handler');
      return {
        content: [
          {
            type: 'text',
            text: `An unexpected error occurred: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        data: {
          errorCode: 'UNEXPECTED_ERROR',
          // Optionally include err.stack or more details if appropriate for debugging,
          // but be cautious about exposing sensitive info.
          // message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  });

// Remove old console.log redirection
// const originalConsoleLog = console.log;
// global.console.log = (...args: any[]) => {
//   process.stderr.write(args.map(arg =>
//     typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
//   ).join(' ') + '\n');
// };

// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
