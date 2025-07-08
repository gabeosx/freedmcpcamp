import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fetch, { FormData } from "node-fetch";
import { buildFreedcampAuthParams } from "./freedcamp.js";

// Configuration interface for the MCP server
export interface FreedcampMcpConfig {
  apiKey: string;
  apiSecret: string;
  projectId: string;
}

// Define schemas for tools
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
  due_date: z.string().optional(),
  assigned_to_id: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.number().int().min(0).max(2).optional()
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

async function executeFreedcampRequest(url: string, method: string, authParams: Record<string, string>, bodyData?: Record<string, any>) {
  const form = new FormData();
  if (bodyData) {
    form.append("data", JSON.stringify(bodyData));
  }
  for (const [k, v] of Object.entries(authParams)) {
    form.append(k, v);
  }

  let requestUrl = url;
  let requestBody: any = form;
  if (method === "DELETE" && !bodyData) {
    const params = new URLSearchParams(authParams);
    requestUrl = `${url}?${params.toString()}`;
    requestBody = undefined;
  }

  console.log(`Making ${method} request to Freedcamp API: ${requestUrl}`);

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

async function processSingleAddTask(taskArgs: z.infer<typeof singleAddTaskSchema>, authParams: Record<string, string>, projectId: string) {
  try {
    const data: Record<string, any> = {
      project_id: projectId,
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

async function processSingleDeleteTask(taskArgs: z.infer<typeof singleDeleteTaskSchema>, authParams: Record<string, string>) {
  try {
    const url = `https://freedcamp.com/api/v1/tasks/${taskArgs.task_id}`;
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

const createMcpServer = (config: FreedcampMcpConfig) => {
  const server = new McpServer({
    name: "freedcamp-mcp",
    version: "1.0.0"
  });

  server.registerTool("freedcamp_add_task",
    {
      description: "Create new tasks in Freedcamp.",
      inputSchema: {
        tasks: z.array(singleAddTaskSchema)
      },
      annotations: {
        title: "Create Task"
      }
    },
    async (args) => {
      const tasksToAdd = args.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      });

      const results = await Promise.all(tasksToAdd.map((taskArg: any) => processSingleAddTask(taskArg, authParams, config.projectId)));
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    }
  );

  server.registerTool("freedcamp_update_task",
    {
      description: "Update tasks in Freedcamp.",
      inputSchema: {
        tasks: z.array(singleUpdateTaskSchema)
      },
      annotations: {
        title: "Update Task"
      }
    },
    async (args) => {
      const tasksToUpdate = args.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      });

      const results = await Promise.all(tasksToUpdate.map((taskArg: any) => processSingleUpdateTask(taskArg, authParams)));
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    }
  );

  server.registerTool("freedcamp_delete_task",
    {
      description: "Delete tasks in Freedcamp.",
      inputSchema: {
        tasks: z.array(singleDeleteTaskSchema)
      },
      annotations: {
        title: "Delete Task"
      }
    },
    async (args) => {
      const tasksToDelete = args.tasks;
      const authParams = buildFreedcampAuthParams({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      });

      const results = await Promise.all(tasksToDelete.map((taskArg: any) => processSingleDeleteTask(taskArg, authParams)));
      return { content: results.map(r => ({ type: "text", text: JSON.stringify(r) })) };
    }
  );

  server.registerTool("freedcamp_list_tasks",
    {
      description: "List all tasks in Freedcamp.",
      inputSchema: {},
      annotations: {
        title: "List Tasks"
      }
    },
    async () => {
      const authParams = buildFreedcampAuthParams({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      });

      const params = new URLSearchParams({
        ...authParams,
        project_id: config.projectId,
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
      return {
        content: [
          { type: "text", text: JSON.stringify(json?.data?.tasks || [], null, 2) },
        ]
      };
    }
  );

  return server;
};

export default createMcpServer;
