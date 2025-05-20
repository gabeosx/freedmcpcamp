#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch, { FormData } from "node-fetch";
import { buildFreedcampAuthParams } from "./freedcamp.js";

// Define schemas for our tools
const addTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional()
});

const updateTaskSchema = z.object({
  task_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.number().int().min(0).max(2).optional() // 0=open, 1=completed, 2=closed
});

const deleteTaskSchema = z.object({
  task_id: z.string()
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
      description: "Create a new task in Freedcamp",
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
      description: "Update an existing task in Freedcamp",
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
      description: "Delete a task in Freedcamp",
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

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Ensure arguments exist
  const arguments_ = request.params.arguments || {};

  if (request.params.name === "freedcamp_add_task") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = addTaskSchema.parse(arguments_);
      
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });

      // Prepare task data
      const data: Record<string, any> = {
        project_id: process.env.FREEDCAMP_PROJECT_ID!,
        title: args.title,
      };
      if (args.description) data.description = args.description;
      if (args.due_date) data.due_date = args.due_date;
      if (args.assigned_to_id) data.assigned_to_id = args.assigned_to_id;
      if (typeof args.priority === "number") data.priority = args.priority;

      // Freedcamp expects form-data: 'data' field as JSON
      const form = new FormData();
      form.append("data", JSON.stringify(data));
      // Add auth params as form fields
      for (const [k, v] of Object.entries(authParams)) {
        form.append(k, v);
      }

      // Make the API call
      console.log("Making request to Freedcamp API...");
      const resp = await fetch("https://freedcamp.com/api/v1/tasks", {
        method: "POST",
        body: form as any, // node-fetch v3 FormData
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

      // Extract the task ID from the response
      const taskId = json?.data?.tasks?.[0]?.id;
      return {
        content: [
          { type: "text", text: `Task created with ID: ${taskId}` },
          { type: "text", text: JSON.stringify({ task_id: taskId }) }
        ]
      };

    } catch (err: any) {
      console.error("Error calling Freedcamp API:", err);
      return {
        content: [
          { type: "text", text: `Request failed: ${err.message}` },
          { type: "text", text: JSON.stringify(err) }
        ]
      };
    }
  }

  if (request.params.name === "freedcamp_update_task") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = updateTaskSchema.parse(arguments_);
      console.log("Update task args:", args);
      
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });
      console.log("Update task auth params:", authParams);

      // Prepare task data (excluding item_id)
      const data: Record<string, any> = {};
      if (args.title) data.title = args.title;
      if (args.description) data.description = args.description;
      if (args.due_date) data.due_date = args.due_date;
      if (args.assigned_to_id) data.assigned_to_id = args.assigned_to_id;
      if (typeof args.priority === "number") data.priority = args.priority;
      if (typeof args.status === "number") data.status = args.status;
      console.log("Update task data:", data);

      // Freedcamp expects form-data
      const form = new FormData();
      form.append("data", JSON.stringify(data));
      for (const [k, v] of Object.entries(authParams)) {
        form.append(k, v);
      }

      // Make the API call
      const url = `https://freedcamp.com/api/v1/tasks/${args.task_id}/edit`;
      console.log("Making request to Freedcamp API with URL:", url);
      console.log("Request body:", {
        data: JSON.stringify(data),
        ...authParams
      });
      
      const resp = await fetch(url, {
        method: "POST",
        body: form as any,
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

      return {
        content: [
          { type: "text", text: `Task updated.` },
          { type: "text", text: JSON.stringify(json?.data) }
        ]
      };

    } catch (err: any) {
      console.error("Error updating task:", err);
      return {
        content: [
          { type: "text", text: `Request failed: ${err.message}` },
          { type: "text", text: JSON.stringify(err) }
        ]
      };
    }
  }

  if (request.params.name === "freedcamp_delete_task") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = deleteTaskSchema.parse(arguments_);
      console.log("Delete task args:", args);
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: process.env.FREEDCAMP_API_KEY!,
        api_secret: process.env.FREEDCAMP_API_SECRET!,
      });
      console.log("Delete task auth params:", authParams);
      // Prepare form data
      const form = new FormData();
      form.append("data", JSON.stringify({})); // Empty data object
      for (const [k, v] of Object.entries(authParams)) {
        form.append(k, v);
      }
      // Make the API call
      const url = `https://freedcamp.com/api/v1/tasks/${args.task_id}/delete`;
      console.log("Making request to Freedcamp API with URL:", url);
      console.log("Request body:", {
        data: "{}",
        ...authParams
      });
      const resp = await fetch(url, {
        method: "POST",
        body: form as any,
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
      return {
        content: [
          { type: "text", text: `Task deleted successfully` },
          { type: "text", text: JSON.stringify(json?.data) }
        ]
      };
    } catch (err: any) {
      console.error("Error deleting task:", err);
      return {
        content: [
          { type: "text", text: `Request failed: ${err.message}` },
          { type: "text", text: JSON.stringify(err) }
        ]
      };
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