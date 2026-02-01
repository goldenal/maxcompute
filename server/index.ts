import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import GeminiService from './src/services/geminiService';
import ProjectService from './src/services/projectService';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3000;

// --- Logging Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const { method, url } = req;
    console.log(`[Server] ${method} ${url} - Started`);

    // Log body summary (avoid logging huge base64 strings)
    if (req.body) {
        const bodyKeys = Object.keys(req.body as Record<string, unknown>);
        const summary = bodyKeys.map((key) => {
            const val = (req.body as Record<string, unknown>)[key];
            if (typeof val === 'string' && val.length > 100) {
                return `${key}: <string length ${val.length}>`;
            }
            return `${key}: ${JSON.stringify(val)}`;
        }).join(', ');
        console.log(`[Server] Params: { ${summary} }`);
    }

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Server] ${method} ${url} - ${res.statusCode} (${duration}ms)`);
    });

    next();
});

// Initialize Services
let geminiService: GeminiService | undefined;
const projectService = new ProjectService();

try {
    geminiService = new GeminiService(process.env.GEMINI_API_KEY);
} catch (e) {
    const err = e as Error;
    console.error('Failed to initialize GeminiService:', err.message);
}

// --- Project Endpoints ---

app.post('/project/validate', async (req: Request, res: Response) => {
    try {
        const { path } = req.body as { path: string };
        const isValid = await projectService.validateProject(path);
        res.json({ isValid });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

app.post('/project/create', async (req: Request, res: Response) => {
    try {
        const { parentPath, projectName } = req.body as { parentPath: string; projectName: string };
        const fullPath = await projectService.createProject(parentPath, projectName);
        res.json({ path: fullPath });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

app.post('/project/features', async (req: Request, res: Response) => {
    try {
        const { projectPath } = req.body as { projectPath: string };
        const features = await projectService.getFeatures(projectPath);
        res.json({ features });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

app.post('/project/feature', async (req: Request, res: Response) => {
    try {
        const { projectPath, featureName } = req.body as { projectPath: string; featureName: string };
        await projectService.createFeature(projectPath, featureName);
        res.json({ success: true });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

app.post('/file/save', async (req: Request, res: Response) => {
    try {
        const { projectPath, featureName, fileName, content } = req.body as {
            projectPath: string;
            featureName: string;
            fileName: string;
            content: string;
        };
        const filePath = await projectService.saveFile(projectPath, featureName, fileName, content);
        res.json({ filePath });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

/**
 * Upload Image - Saves to temp directory
 * Returns unique filename that will be used later to copy to project assets
 */
app.post('/upload-image', async (req: Request, res: Response) => {
    try {
        const { name, data } = req.body as { name: string; data: string };

        if (!name || !data) {
            return res.status(400).json({ error: 'Missing name or data' });
        }

        const filename = await projectService.saveTempUpload(name, data);
        res.json({ filename });
    } catch (error) {
        const err = error as Error;
        console.error('[Server] Upload Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Convert UI Screenshot to Flutter Code
 * Uses context image as primary visual reference
 * Optional: Include Figma data for precise measurements (fonts, colors, spacing, border radius)
 * Optional: Can save assets to project if projectPath is provided
 */
app.post('/convert', async (req: Request, res: Response) => {
    try {
        const { contextImage, figmaData, options, assets, projectPath } = req.body as {
            contextImage: string;
            figmaData?: unknown;
            options?: Record<string, unknown>;
            assets?: Record<string, { id: string; name: string; filename: string }>;
            projectPath?: string;
        };

        if (!geminiService) {
            if (process.env.GEMINI_API_KEY) {
                geminiService = new GeminiService(process.env.GEMINI_API_KEY);
            } else {
                return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY missing.' });
            }
        }

        if (!contextImage) {
            return res.status(400).json({ error: 'Missing contextImage in request body.' });
        }

        console.log(`[Server] Converting UI from context image: ${contextImage}`);
        console.log('[Server] Options:', options);
        console.log('[Server] Figma data provided:', !!figmaData);

        // Prepare enhanced options with Figma data if available
        const enhancedOptions: Record<string, unknown> = { ...(options || {}) };
        if (figmaData) {
            enhancedOptions.figmaData = figmaData;
            console.log('[Server] Including Figma data for precise measurements');
        }

        // Save assets deterministically before code generation
        let assetMap: Record<string, string> = {};
        if (projectPath && assets && Object.keys(assets).length > 0) {
            console.log('[Server] Saving assets to project before code generation...');
            assetMap = await projectService.saveAssets(projectPath, assets);
        }

        // Generate code from image with optional Figma context
        console.log('[Server] Generating Flutter code from screenshot...');
        const code = await geminiService.generateCodeFromImage(
            contextImage,
            enhancedOptions,
            assetMap
        );

        console.log('[Server] Code generation complete');
        res.json({ code });
    } catch (error) {
        const err = error as Error;
        console.error('[Server] Error converting:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});

// Optional: Cleanup endpoint for old temp files
app.post('/cleanup', async (_req: Request, res: Response) => {
    try {
        await projectService.cleanupTempUploads(24); // Clean files older than 24 hours
        res.json({ success: true });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// Debug Logging Endpoint
app.post('/log', (req: Request, res: Response) => {
    const { message, type } = req.body as { message: string; type?: string };
    const prefix = type === 'error' ? '[Plugin Error]' : '[Plugin Log]';
    console.log(`${prefix} ${message}`);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Gemini API Key:', process.env.GEMINI_API_KEY ? 'Configured' : 'MISSING');
});
