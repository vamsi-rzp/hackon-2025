/**
 * Universal MCP Gateway Service
 * 
 * Entry point for the application.
 * Loads environment, creates the app, and starts the server.
 */

import "dotenv/config";
import { createApp } from "./app.js";
import { startServer } from "./server.js";

// Create and start the application
const app = createApp();
startServer(app);

export default app;
