/**
 * Lever MCP Server - Local Entry Point
 *
 * This runs the MCP server locally on your machine using "stdio" transport.
 * Stdio means Claude Desktop talks to this program directly (like two people
 * in the same room), rather than over the internet via a URL.
 *
 * To use this: set your LEVER_API_KEY in the .env file in this folder.
 * Claude Desktop will pick it up automatically.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Figure out where this file lives on disk, then look for .env right next to it.
// This works no matter where Claude Desktop launches the process from.
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");

// Load the .env file if it exists
try {
	const envFile = readFileSync(envPath, "utf-8");
	for (const line of envFile.split("\n")) {
		// Skip comments and blank lines
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		// Split on the first = sign only
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		// Only set if not already set in the environment
		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
} catch {
	// .env file not found — that's okay, we'll check for the key below
}

// Read the API key from the environment
const LEVER_API_KEY = process.env.LEVER_API_KEY;

// If no API key is found, stop immediately with a clear error message
if (!LEVER_API_KEY) {
	console.error("ERROR: LEVER_API_KEY environment variable is required.");
	console.error("Please create a .env file in the project folder with:");
	console.error("  LEVER_API_KEY=your_api_key_here");
	process.exit(1);
}

// Create the MCP server
const server = new McpServer({
	name: "Lever ATS (Local)",
	version: "2.0.0",
});

// Register all the Lever tools (search candidates, add notes, etc.)
registerAllTools(server, LEVER_API_KEY);

// Create the stdio transport — this is what lets Claude Desktop talk to this server
const transport = new StdioServerTransport();

// Connect the server to the transport and start listening
await server.connect(transport);

console.error("Lever MCP server running locally. Ready for Claude Desktop.");
