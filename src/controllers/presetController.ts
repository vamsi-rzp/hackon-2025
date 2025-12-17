import type { Request, Response, NextFunction } from "express";
import { presetManager } from "../services/PresetManager.js";
import type {
  ErrorResponse,
  PresetInfo,
  ConnectPresetRequest,
  ConnectPresetResponse,
} from "../types/index.js";
import { sendError } from "../utils/index.js";

/**
 * GET /api/presets
 * List all available MCP server presets
 */
export function listPresets(
  _req: Request,
  res: Response<{ presets: PresetInfo[]; count: number }>
): void {
  console.log("[PresetController] List presets request");

  const presets = presetManager.getAllPresetInfo();

  res.json({
    presets,
    count: presets.length,
  });
}

/**
 * GET /api/presets/:presetId
 * Get info about a specific preset
 */
export function getPreset(
  req: Request<{ presetId: string }, PresetInfo | ErrorResponse>,
  res: Response<PresetInfo | ErrorResponse>
): void {
  const { presetId } = req.params;

  console.log(`[PresetController] Get preset request: ${presetId}`);

  const preset = presetManager.getPresetInfo(presetId);

  if (!preset) {
    sendError(res, `Preset '${presetId}' not found`, "PRESET_NOT_FOUND", 404);
    return;
  }

  res.json(preset);
}

/**
 * POST /api/presets/:presetId/connect
 * Connect to a preset MCP server
 */
export async function connectPreset(
  req: Request<{ presetId: string }, ConnectPresetResponse | ErrorResponse>,
  res: Response<ConnectPresetResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  const { presetId } = req.params;

  console.log(`[PresetController] Connect preset request: ${presetId}`);

  try {
    const preset = presetManager.getPreset(presetId);
    if (!preset) {
      sendError(res, `Preset '${presetId}' not found`, "PRESET_NOT_FOUND", 404);
      return;
    }

    const { sessionId, toolCount } = await presetManager.connectPreset(presetId);

    res.status(201).json({
      presetId,
      sessionId,
      name: preset.name,
      toolCount,
      connectedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[PresetController] Failed to connect preset '${presetId}':`, error);
    
    if (error instanceof Error) {
      sendError(res, error.message, "CONNECTION_FAILED", 503);
      return;
    }
    
    next(error);
  }
}

/**
 * POST /api/presets/:presetId/disconnect
 * Disconnect from a preset MCP server
 */
export async function disconnectPreset(
  req: Request<{ presetId: string }, { success: boolean; presetId: string } | ErrorResponse>,
  res: Response<{ success: boolean; presetId: string } | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  const { presetId } = req.params;

  console.log(`[PresetController] Disconnect preset request: ${presetId}`);

  try {
    const preset = presetManager.getPreset(presetId);
    if (!preset) {
      sendError(res, `Preset '${presetId}' not found`, "PRESET_NOT_FOUND", 404);
      return;
    }

    await presetManager.disconnectPreset(presetId);

    res.json({
      success: true,
      presetId,
    });
  } catch (error) {
    console.error(`[PresetController] Failed to disconnect preset '${presetId}':`, error);
    next(error);
  }
}

/**
 * POST /api/presets/connect-all
 * Connect to all auto-connect presets
 */
export async function connectAllPresets(
  _req: Request,
  res: Response<{ connected: string[]; failed: string[] }>,
  _next: NextFunction
): Promise<void> {
  console.log("[PresetController] Connect all presets request");

  const presets = presetManager.getPresets();
  const connected: string[] = [];
  const failed: string[] = [];

  const results = await Promise.allSettled(
    presets.map(preset => presetManager.connectPreset(preset.id))
  );

  results.forEach((result, index) => {
    const preset = presets[index];
    if (!preset) return;
    
    if (result.status === "fulfilled") {
      connected.push(preset.id);
    } else {
      failed.push(preset.id);
    }
  });

  res.json({ connected, failed });
}

