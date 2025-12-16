import { Router } from "express";
import sessionRoutes from "./session.routes.js";
import chatRoutes from "./chat.routes.js";
import presetRoutes from "./preset.routes.js";

const router = Router();

/**
 * Main API Router
 * 
 * Combines all route modules into a single router.
 * Each module handles a specific domain of the API.
 */

// Mount route modules
router.use(sessionRoutes);
router.use(chatRoutes);
router.use(presetRoutes);

export default router;
