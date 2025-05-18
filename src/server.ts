import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch, { FormData } from "node-fetch";
import { buildFreedcampAuthParams } from "./freedcamp.js";

// Define schemas for our tools
const addTaskSchema = z.object({
  api_key: z.string(),
  api_secret: z.string().optional(),
  project_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional()
});

const updateTaskSchema = z.object({
  api_key: z.string(),
  api_secret: z.string().optional(),
  task_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(), // YYYY-MM-DD
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.number().int().min(0).max(2).optional() // 0=open, 1=completed, 2=closed
});

const deleteTaskSchema = z.object({
  api_key: z.string(),
  api_secret: z.string().optional(),
  task_id: z.string()
});

const listTasksSchema = z.object({
  api_key: z.string(),
  api_secret: z.string().optional(),
  project_id: z.string(),
});

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
      name: "add_task",
      description: "Create a new task in Freedcamp",
      inputSchema: {
        type: "object",
        properties: {
          api_key: { type: "string", description: "Freedcamp API key" },
          api_secret: { type: "string", description: "Freedcamp API secret" },
          project_id: { type: "string", description: "Project ID to create task in" },
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          assigned_to_id: { type: "string", description: "User ID to assign task to" },
          priority: { type: "number", description: "Task priority (0-3)" }
        },
        required: ["api_key", "project_id", "title"]
      }
    }, {
      name: "update_task",
      description: "Update an existing task in Freedcamp",
      inputSchema: {
        type: "object",
        properties: {
          api_key: { type: "string", description: "Freedcamp API key" },
          api_secret: { type: "string", description: "Freedcamp API secret" },
          task_id: { type: "string", description: "ID of task to update" },
          title: { type: "string", description: "New task title" },
          description: { type: "string", description: "New task description" },
          due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
          assigned_to_id: { type: "string", description: "New user ID to assign task to" },
          priority: { type: "number", description: "New task priority (0-3)" },
          status: { type: "number", description: "New task status (0=open, 1=completed, 2=closed)" }
        },
        required: ["api_key", "task_id"]
      }
    }, {
      // name: "delete_task",
      // description: "Delete a task from Freedcamp",
      // inputSchema: {
      //   type: "object",
      //   properties: {
      //     api_key: { type: "string", description: "Freedcamp API key" },
      //     api_secret: { type: "string", description: "Freedcamp API secret" },
      //     task_id: { type: "string", description: "ID of task to delete" }
      //   },
      //   required: ["api_key", "task_id"]
      // },
      // (Temporarily disabled due to Freedcamp API issues)
      name: "list_tasks",
      description: "List tasks in a Freedcamp project",
      inputSchema: {
        type: "object",
        properties: {
          api_key: { type: "string", description: "Freedcamp API key" },
          api_secret: { type: "string", description: "Freedcamp API secret" },
          project_id: { type: "string", description: "Project ID to list tasks for" }
        },
        required: ["api_key", "project_id"]
      }
    }]
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Ensure arguments exist
  const arguments_ = request.params.arguments || {};

  if (request.params.name === "add_task") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = addTaskSchema.parse({
        api_key: arguments_.api_key || process.env.FREEDCAMP_API_KEY,
        api_secret: arguments_.api_secret || process.env.FREEDCAMP_API_SECRET,
        project_id: arguments_.project_id || process.env.FREEDCAMP_PROJECT_ID,
        ...arguments_
      });
      
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: args.api_key,
        api_secret: args.api_secret,
      });

      // Prepare task data
      const data: Record<string, any> = {
        project_id: args.project_id,
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
          content: [{ type: "text", text: `Error: ${json?.msg || resp.statusText}` }],
          data: json,
        };
      }

      // Extract the task ID from the response
      const taskId = json?.data?.tasks?.[0]?.id;
      return {
        content: [{ type: "text", text: `Task created with ID: ${taskId}` }],
        data: { task_id: taskId },
      };

    } catch (err: any) {
      console.error("Error calling Freedcamp API:", err);
      return {
        content: [{ type: "text", text: `Request failed: ${err.message}` }],
        data: err,
      };
    }
  }

  if (request.params.name === "update_task") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = updateTaskSchema.parse({
        api_key: arguments_.api_key || process.env.FREEDCAMP_API_KEY,
        api_secret: arguments_.api_secret || process.env.FREEDCAMP_API_SECRET,
        ...arguments_
      });
      console.log("Update task args:", args);
      
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: args.api_key,
        api_secret: args.api_secret,
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
          content: [{ type: "text", text: `Error: ${json?.msg || resp.statusText}` }],
          data: json,
        };
      }

      return {
        content: [{ type: "text", text: `Task updated: ${JSON.stringify(json?.data)}` }],
        data: json?.data,
      };

    } catch (err: any) {
      console.error("Error updating task:", err);
      return {
        content: [{ type: "text", text: `Request failed: ${err.message}` }],
        data: err,
      };
    }
  }

  // Delete task tool temporarily disabled due to Freedcamp API issues
  // if (request.params.name === "delete_task") {
  //   try {
  //     // Parse and validate arguments with environment variable fallbacks
  //     const args = deleteTaskSchema.parse({
  //       api_key: arguments_.api_key || process.env.FREEDCAMP_API_KEY,
  //       api_secret: arguments_.api_secret || process.env.FREEDCAMP_API_SECRET,
  //       ...arguments_
  //     });
  //     console.log("Delete task args:", args);
  //     // Prepare Freedcamp API auth params
  //     const authParams = buildFreedcampAuthParams({
  //       api_key: args.api_key,
  //       api_secret: args.api_secret,
  //     });
  //     console.log("Delete task auth params:", authParams);
  //     // Prepare form data
  //     const form = new FormData();
  //     form.append("data", JSON.stringify({})); // Empty data object
  //     for (const [k, v] of Object.entries(authParams)) {
  //       form.append(k, v);
  //     }
  //     // Make the API call
  //     const url = `https://freedcamp.com/api/v1/tasks/${args.task_id}/delete`;
  //     console.log("Making request to Freedcamp API with URL:", url);
  //     console.log("Request body:", {
  //       data: "{}",
  //       ...authParams
  //     });
  //     const resp = await fetch(url, {
  //       method: "POST",
  //       body: form as any,
  //     });
  //     const json = (await resp.json()) as any;
  //     console.log("Freedcamp API response:", json);
  //     if (!resp.ok || (json && json.http_code >= 400)) {
  //       return {
  //         content: [{ type: "text", text: `Error: ${json?.msg || resp.statusText}` }],
  //         data: json,
  //       };
  //     }
  //     return {
  //       content: [{ type: "text", text: `Task deleted successfully` }],
  //       data: json?.data,
  //     };
  //   } catch (err: any) {
  //     console.error("Error deleting task:", err);
  //     return {
  //       content: [{ type: "text", text: `Request failed: ${err.message}` }],
  //       data: err,
  //     };
  //   }
  // }

  if (request.params.name === "list_tasks") {
    try {
      // Parse and validate arguments with environment variable fallbacks
      const args = listTasksSchema.parse({
        api_key: arguments_.api_key || process.env.FREEDCAMP_API_KEY,
        api_secret: arguments_.api_secret || process.env.FREEDCAMP_API_SECRET,
        project_id: arguments_.project_id || process.env.FREEDCAMP_PROJECT_ID,
        ...arguments_
      });
      // Prepare Freedcamp API auth params
      const authParams = buildFreedcampAuthParams({
        api_key: args.api_key,
        api_secret: args.api_secret,
      });
      // Build query string
      const params = new URLSearchParams({
        ...authParams,
        project_id: args.project_id,
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
          content: [{ type: "text", text: `Error: ${json?.msg || resp.statusText}` }],
          data: json,
        };
      }
      // Return a summary of tasks
      const tasks = json?.data?.tasks || [];
      const summary = tasks.map((t: any) => `ID: ${t.id}, Title: ${t.title}`).join("\n");
      return {
        content: [{ type: "text", text: summary || "No tasks found." }],
        data: tasks,
      };
    } catch (err: any) {
      console.error("Error listing tasks:", err);
      return {
        content: [{ type: "text", text: `Request failed: ${err.message}` }],
        data: err,
      };
    }
  }

  // Handle unknown tool
  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
  };
});

// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("Freedcamp MCP server running on stdio");