import { Router } from "express";
import {
  listPresets,
  getPreset,
  connectPreset,
  disconnectPreset,
  connectAllPresets,
} from "../controllers/presetController.js";

const router = Router();

/**
 * Preset Management Routes
 * 
 * These routes handle pre-configured MCP server operations.
 */

// List all presets
router.get("/presets", listPresets);

// Connect all presets at once
router.post("/presets/connect-all", connectAllPresets);

// Single preset operations
router.get("/presets/:presetId", getPreset);
router.post("/presets/:presetId/connect", connectPreset);
router.post("/presets/:presetId/disconnect", disconnectPreset);

export default router;

