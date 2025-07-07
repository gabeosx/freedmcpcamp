import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerToolHandlers } from "./tools.js"; // We'll create this function in tools.ts

export class FreedcampMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server({
      name: "freedcamp-mcp",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {} // Tool capabilities are often dynamic or based on registration
      }
    });
    this.registerTools();
  }

  private registerTools() {
    // The actual registration of ListTools and CallTool handlers,
    // along with specific tool logic, will be handled by registerToolHandlers
    registerToolHandlers(this.server);
  }

  public getServer(): Server {
    return this.server;
  }
}
