# Technology Stack

## Core Technologies

- **Runtime**: Node.js >= 17.0.0
- **Language**: TypeScript 5.3.3 with ES2022 target
- **Module System**: ES Modules (type: "module")
- **Build Tool**: TypeScript Compiler (tsc)

## Key Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **zod**: Runtime type validation and schema definition
- **node-fetch**: HTTP client for API requests
- **dotenv**: Environment variable management
- **express**: HTTP server for REST transport

## Development Tools

- **husky**: Git hooks for code quality
- **commitlint**: Conventional commit enforcement
- **standard-version**: Automated versioning and changelog

## Build System

### Common Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Start STDIO transport server
npm start

# Start HTTP transport server
npm run start:http

# Development with watch mode
npm run dev

# Run comprehensive tests
npm test
npm run test:http

# Environment-specific HTTP server
npm run start:http:test  # Uses .env file
```

### Build Process

1. TypeScript compilation: `src/` → `dist/`
2. Post-build: Make executables chmod +x
3. Output: Executable binaries in `dist/server.js` and `dist/http-server.js`

## Architecture Patterns

- **Modular Design**: Separate concerns (server, MCP logic, Freedcamp API)
- **Transport Abstraction**: Support both STDIO and HTTP transports
- **Schema-First**: Zod schemas define API contracts
- **Environment-Based Config**: All credentials via environment variables
- **Error-First**: Comprehensive error handling and validation

## Deployment

- **Docker**: Multi-stage build with Alpine Linux
- **Docker Compose**: Production-ready orchestration
- **Health Checks**: Built-in health monitoring endpoints
- **Security**: Non-root user execution in containers