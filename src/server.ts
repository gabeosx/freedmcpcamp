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
const addTaskSchema = z.union([singleAddTaskSchema, z.array(singleAddTaskSchema)]);

const singleUpdateTaskSchema = z.object({
  task_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.number().int().min(0).max(2).optional() // 0=open, 1=completed, 2=closed
});
const updateTaskSchema = z.union([singleUpdateTaskSchema, z.array(singleUpdateTaskSchema)]);

const singleDeleteTaskSchema = z.object({
  task_id: z.string()
});
const deleteTaskSchema = z.union([singleDeleteTaskSchema, z.array(singleDeleteTaskSchema)]);

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
      description: "Create a single new task or multiple new tasks in Freedcamp. Input can be a single task object or an array of task objects.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          assigned_to_id: { type: "string", description: "User ID to assign task to" },
          priority: { type: "number", description: "Task priority (0-3)" }
        },
        required: ["title"]
      }
    }, {
      name: "freedcamp_update_task",
      description: "Update a single existing task or multiple existing tasks in Freedcamp. Input can be a single task update object or an array of task update objects.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "ID of task to update" },
          title: { type: "string", description: "New task title" },
          description: { type: "string", description: "New task description" },
          due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
          assigned_to_id: { type: "string", description: "New user ID to assign task to" },
          priority: { type: "number", description: "New task priority (0-3)" },
          status: { type: "number", description: "New task status (0=open, 1=completed, 2=closed)" }
        },
        required: ["task_id"]
      }
    }, {
      name: "freedcamp_list_tasks",
      description: "List tasks in a Freedcamp project",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    }, {
      name: "freedcamp_delete_task",
      description: "Delete a single task or multiple tasks in Freedcamp. Input can be a single task ID object or an array of task ID objects.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "ID of task to delete" }
        },
        required: ["task_id"]
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
      const tasksToAdd = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];
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
      const tasksToUpdate = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];
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
      const tasksToDelete = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs];
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
      // Return a summary of tasks
      const tasks = json?.data?.tasks || [];
      const summary = tasks.map((t: any) => `ID: ${t.id}, Title: ${t.title}`).join("\n");
      return {
        content: [
          { type: "text", text: summary || "No tasks found." },
          { type: "text", text: JSON.stringify(tasks) }
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