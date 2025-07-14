# Project Structure

## Root Directory

```
freedcamp-mcp/
├── src/                    # TypeScript source code
├── dist/                   # Compiled JavaScript output
├── tasks/                  # Task management and planning
├── .kiro/                  # Kiro AI configuration
├── .cursor/                # Cursor IDE configuration
├── .husky/                 # Git hooks
├── .github/                # GitHub workflows and templates
└── node_modules/           # Dependencies
```

## Source Code Organization (`src/`)

- **`server.ts`**: STDIO transport entry point with environment setup
- **`http-server.ts`**: HTTP transport server with Express
- **`mcpServer.ts`**: Core MCP server implementation and tool definitions
- **`freedcamp.ts`**: Freedcamp API client and authentication logic
- **`test-harness.ts`**: STDIO transport test suite
- **`test-harness-http.ts`**: HTTP transport test suite

## Configuration Files

### Build & Runtime
- **`package.json`**: Dependencies, scripts, and metadata
- **`tsconfig.json`**: TypeScript compilation settings
- **`Dockerfile`**: Container build instructions
- **`docker-compose.yml`**: Multi-service orchestration

### Development Tools
- **`.gitignore`**: Version control exclusions
- **`.env`**: Environment variables (not committed)
- **`commitlint.config.cjs`**: Commit message standards

### IDE Integration
- **`.cursor/mcp.json`**: Cursor MCP server configuration
- **`.kiro/steering/`**: AI assistant guidance documents

## Task Management (`tasks/`)

- **`tasks.json`**: Structured task definitions and dependencies
- **`task_*.txt`**: Individual task descriptions and requirements

## Architecture Principles

### Separation of Concerns
- **Transport Layer**: `server.ts`, `http-server.ts` handle protocol specifics
- **Business Logic**: `mcpServer.ts` implements MCP tools and validation
- **External API**: `freedcamp.ts` manages third-party integration
- **Testing**: Separate test harnesses for each transport method

### Configuration Management
- Environment variables for all runtime configuration
- No hardcoded credentials or URLs
- Separate configs for development and production

### Build Artifacts
- Source maps disabled for production builds
- Executable permissions set post-build
- Clean separation between source and compiled code

## File Naming Conventions

- **kebab-case**: For files and directories
- **camelCase**: For TypeScript variables and functions
- **PascalCase**: For TypeScript classes and interfaces
- **UPPER_CASE**: For environment variables and constants