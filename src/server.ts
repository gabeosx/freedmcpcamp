#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch, { FormData } from "node-fetch";
import { buildFreedcampAuthParams } from "./freedcamp.js";

// Define schemas for our tools
const singleAddTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional()
});
const addTaskSchema = z.object({
  tasks: z.array(singleAddTaskSchema)
});

const singleUpdateTaskSchema = z.object({
  task_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.number().int().min(0).max(2).optional() // 0=open, 1=completed, 2=closed
});
const updateTaskSchema = z.object({
  tasks: z.array(singleUpdateTaskSchema)
});

const singleDeleteTaskSchema = z.object({
  task_id: z.string()
});
const deleteTaskSchema = z.object({
  tasks: z.array(singleDeleteTaskSchema)
});

const listTasksSchema = z.object({});

// Create the server
const server = new Server({
  name: "freedcamp-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "freedcamp_add_task",
      description: "Create one or more new tasks in Freedcamp. Input is an object with a 'tasks' array containing task details.",
      inputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "Array of tasks to create in Freedcamp",
            items: {
              type: "object",
              properties: {
                title: { 
                  type: "string", 
                  description: "Required. The title of the task - should be clear and descriptive"
                },
                description: { 
                  type: "string", 
                  description: "Optional. Detailed description of what the task involves and any specific requirements"
                },
                due_date: { 
                  type: "string", 
                  description: "Optional. Due date for the task as a Unix timestamp string (e.g., '1735689600' for 2025-01-01)"
                },
                assigned_to_id: { 
                  type: "string", 
                  description: "Optional. User ID of the person to assign this task to. Must be a valid Freedcamp user ID"
                },
                priority: { 
                  type: "number", 
                  description: "Optional. Task priority level as an integer: 0 = Low, 1 = Normal, 2 = High, 3 = Urgent",
                  minimum: 0,
                  maximum: 3
                }
              },
              required: ["title"],
              additionalProperties: false
            },
            minItems: 1
          }
        },
        required: ["tasks"],
        additionalProperties: false
      }
    }, {
      name: "freedcamp_update_task",
      description: "Update one or more existing tasks in Freedcamp. Input is an object with a 'tasks' array containing task updates.",
      inputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "Array of task updates to apply in Freedcamp",
            items: {
              type: "object",
              properties: {
                task_id: { 
                  type: "string", 
                  description: "Required. The unique ID of the task to update. Must be a valid existing Freedcamp task ID"
                },
                title: { 
                  type: "string", 
                  description: "Optional. New title for the task - will replace the current title"
                },
                description: { 
                  type: "string", 
                  description: "Optional. New description for the task - will replace the current description"
                },
                due_date: { 
                  type: "string", 
                  description: "Optional. New due date for the task as a Unix timestamp string (e.g., '1735689600' for 2025-01-01)"
                },
                assigned_to_id: { 
                  type: "string", 
                  description: "Optional. User ID to reassign the task to. Must be a valid Freedcamp user ID"
                },
                priority: { 
                  type: "number", 
                  description: "Optional. New priority level as an integer: 0 = Low, 1 = Normal, 2 = High, 3 = Urgent",
                  minimum: 0,
                  maximum: 3
                },
                status: { 
                  type: "number", 
                  description: "Optional. New task status as an integer: 0 = Open, 1 = Completed, 2 = Closed",
                  minimum: 0,
                  maximum: 2
                }
              },
              required: ["task_id"],
              additionalProperties: false
            },
            minItems: 1
          }
        },
        required: ["tasks"],
        additionalProperties: false
      }
    }, {
      name: "freedcamp_list_tasks",
      description: "Retrieve a list of all tasks in the configured Freedcamp project. Returns task details including ID, title, status, and other metadata.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }, {
      name: "freedcamp_delete_task",
      description: "Permanently delete one or more tasks from Freedcamp. Input is an object with a 'tasks' array containing task IDs to delete.",
      inputSchema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "Array of tasks to permanently delete from Freedcamp",
            items: {
              type: "object",
              properties: {
                task_id: { 
                  type: "string", 
                  description: "Required. The unique ID of the task to delete. Must be a valid existing Freedcamp task ID. WARNING: This action cannot be undone"
                }
              },
              required: ["task_id"],
              additionalProperties: false
            },
            minItems: 1
          }
        },
        required: ["tasks"],
        additionalProperties: false
      }
    }]
  };
});

// Helper function to execute Freedcamp API requests
async function executeFreedcampRequest(url: string, method: string, authParams: Record<string, string>, bodyData?: Record<string, any>) {
  const form = new FormData();
  if (bodyData) {
    form.append("data", JSON.stringify(bodyData));
  }
  for (const [k, v] of Object.entries(authParams)) {
    form.append(k, v);
  }

  // For DELETE requests, Freedcamp expects auth params in query string if no body
  let requestUrl = url;
  let requestBody: any = form;
  if (method === "DELETE" && !bodyData) {
    const params = new URLSearchParams(authParams);
    requestUrl = `${url}?${params.toString()}`;
    requestBody = undefined; // No body for DELETE if params are in query
  }
  
  console.log(`Making ${method} request to Freedcamp API: ${requestUrl}`);
  if (requestBody) {
    // console.log("Request body:", bodyData ? { data: JSON.stringify(bodyData), ...authParams } : authParams);
  }

  const resp = await fetch(requestUrl, {
    method: method,
    body: requestBody,
  });
  const json = (await resp.json()) as any;
  console.log("Freedcamp API response:", json);

  if (!resp.ok || (json && json.http_code >= 400)) {
    return { error: json?.msg || resp.statusText, details: json };
  }
  return { success: true, data: json?.data };
}

// Helper to process a single task addition
async function processSingleAddTask(taskArgs: z.infer<typeof singleAddTaskSchema>, authParams: Record<string, string>) {
  try {
    const data: Record<string, any> = {
      project_id: process.env.FREEDCAMP_PROJECT_ID!,
      title: taskArgs.title,
    };
    if (taskArgs.description) data.description = taskArgs.description;
    if (taskArgs.due_date) data.due_date = taskArgs.due_date;
    if (taskArgs.assigned_to_id) data.assigned_to_id = taskArgs.assigned_to_id;
    if (typeof taskArgs.priority === "number") data.priority = taskArgs.priority;

    const result = await executeFreedcampRequest("https://freedcamp.com/api/v1/tasks", "POST", authParams, data);

    if (result.error) {
      return { type: "text", text: `Error adding task "${taskArgs.title}": ${result.error}`, details: result.details };
    }
    const taskId = result.data?.tasks?.[0]?.id;
    return { type: "text", text: `Task "${taskArgs.title}" created with ID: ${taskId}`, task_id: taskId };
  } catch (err: any) {
    console.error(`Error processing add task "${taskArgs.title}":`, err);
    return { type: "text", text: `Failed to add task "${taskArgs.title}": ${err.message}`, error_details: err };
  }
}

// Helper to process a single task update
async function processSingleUpdateTask(taskArgs: z.infer<typeof singleUpdateTaskSchema>, authParams: Record<string, string>) {
  try {
    const data: Record<string, any> = {};
    if (taskArgs.title) data.title = taskArgs.title;
    if (taskArgs.description) data.description = taskArgs.description;
    if (taskArgs.due_date) data.due_date = taskArgs.due_date;
    if (taskArgs.assigned_to_id) data.assigned_to_id = taskArgs.assigned_to_id;
    if (typeof taskArgs.priority === "number") data.priority = taskArgs.priority;
    if (typeof taskArgs.status === "number") data.status = taskArgs.status;

    const url = `https://freedcamp.com/api/v1/tasks/${taskArgs.task_id}/edit`;
    const result = await executeFreedcampRequest(url, "POST", authParams, data);

    if (result.error) {
      return { type: "text", text: `Error updating task ID "${taskArgs.task_id}": ${result.error}`, task_id: taskArgs.task_id, details: result.details };
    }
    return { type: "text", text: `Task ID "${taskArgs.task_id}" updated.`, task_id: taskArgs.task_id, data: result.data };
  } catch (err: any) {
    console.error(`Error processing update for task ID "${taskArgs.task_id}":`, err);
    return { type: "text", text: `Failed to update task ID "${taskArgs.task_id}": ${err.message}`, task_id: taskArgs.task_id, error_details: err };
  }
}

// Helper to process a single task deletion
async function processSingleDeleteTask(taskArgs: z.infer<typeof singleDeleteTaskSchema>, authParams: Record<string, string>) {
  try {
    const url = `https://freedcamp.com/api/v1/tasks/${taskArgs.task_id}`;
    // For DELETE, authParams are added to query string by executeFreedcampRequest if bodyData is undefined
    const result = await executeFreedcampRequest(url, "DELETE", authParams);

    if (result.error) {
      return { type: "text", text: `Error deleting task ID "${taskArgs.task_id}": ${result.error}`, task_id: taskArgs.task_id, details: result.details };
    }
    return { type: "text", text: `Task ID "${taskArgs.task_id}" deleted successfully.`, task_id: taskArgs.task_id, data: result.data };
  } catch (err: any) {
    console.error(`Error processing delete for task ID "${taskArgs.task_id}":`, err);
    return { type: "text", text: `Failed to delete task ID "${taskArgs.task_id}": ${err.message}`, task_id: taskArgs.task_id, error_details: err };
  }
}


// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Ensure arguments exist
  const arguments_ = request.params.arguments || {};
  const results: Array<Record<string, any>> = [];

  if (request.params.name === "freedcamp_add_task") {
    try {
      const parsedArgs = addTaskSchema.parse(arguments_);
      const tasksToAdd = parsedArgs.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });

      for (const taskArg of tasksToAdd) {
        const result = await processSingleAddTask(taskArg, authParams);
        results.push(result);
      }
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    } catch (err: any) {
      console.error("Error in freedcamp_add_task handler:", err);
      return { content: [{ type: "text", text: `Handler error: ${err.message}`, details: JSON.stringify(err) }] };
    }
  }

  if (request.params.name === "freedcamp_update_task") {
    try {
      const parsedArgs = updateTaskSchema.parse(arguments_);
      const tasksToUpdate = parsedArgs.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });

      for (const taskArg of tasksToUpdate) {
        const result = await processSingleUpdateTask(taskArg, authParams);
        results.push(result);
      }
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    } catch (err: any) {
      console.error("Error in freedcamp_update_task handler:", err);
      return { content: [{ type: "text", text: `Handler error: ${err.message}`, details: JSON.stringify(err) }] };
    }
  }

  if (request.params.name === "freedcamp_delete_task") {
    try {
      const parsedArgs = deleteTaskSchema.parse(arguments_);
      const tasksToDelete = parsedArgs.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });

      for (const taskArg of tasksToDelete) {
        const result = await processSingleDeleteTask(taskArg, authParams);
        results.push(result);
      }
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    } catch (err: any) {
      console.error("Error in freedcamp_delete_task handler:", err);
      return { content: [{ type: "text", text: `Handler error: ${err.message}`, details: JSON.stringify(err) }] };
    }
  }

  if (request.params.name === "freedcamp_list_tasks") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = listTasksSchema.parse(arguments_);
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });
      // Build query string
      const params = new URLSearchParams({
        ...authParams,
        project_id: process.env.FREEDCAMP_PROJECT_ID!,
      });
      const url = `https://freedcamp.com/api/v1/tasks/?${params.toString()}`;
      console.log("Making request to Freedcamp API with URL:", url);
      const resp = await fetch(url, {
        method: "GET",
      });
      const json = (await resp.json()) as any;
      console.log("Freedcamp API response:", json);
      if (!resp.ok || (json && json.http_code >= 400)) {
        return {
          content: [
            { type: "text", text: `Error: ${json?.msg || resp.statusText}` },
            { type: "text", text: JSON.stringify(json) }
          ]
        };
      }
      // Return the actual tasks data
      const tasks = json?.data?.tasks || [];
      return {
        content: [
          { type: "text", text: JSON.stringify(tasks, null, 2) }
        ]
      };
    } catch (err: any) {
      console.error("Error listing tasks:", err);
      return {
        content: [
          { type: "text", text: `Request failed: ${err.message}` },
          { type: "text", text: JSON.stringify(err) }
        ]
      };
    }
  }

  // Handle unknown tool
  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
  };
});

// Redirect console.log to stderr so it doesn't interfere with JSON responses
const originalConsoleLog = console.log;
console.log = (...args) => {
  process.stderr.write(args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
};

// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);