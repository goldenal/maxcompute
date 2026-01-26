require('dotenv').config();
const express = require('express');
const cors = require('cors');
const GeminiService = require('./src/services/geminiService');
const ProjectService = require('./src/services/projectService');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3000;

// --- Logging Middleware ---
app.use((req, res, next) => {
    const start = Date.now();
    const { method, url } = req;
    console.log(`[Server] ${method} ${url} - Started`);

    // Log body summary (avoid logging huge base64 strings)
    if (req.body) {
        const bodyKeys = Object.keys(req.body);
        const summary = bodyKeys.map(key => {
            const val = req.body[key];
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
let geminiService;
const projectService = new ProjectService();

try {
    geminiService = new GeminiService(process.env.GEMINI_API_KEY);
} catch (e) {
    console.error("Failed to initialize GeminiService:", e.message);
}

// --- Project Endpoints ---

app.post('/project/validate', async (req, res) => {
    try {
        const { path } = req.body;
        const isValid = await projectService.validateProject(path);
        res.json({ isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/project/create', async (req, res) => {
    try {
        const { parentPath, projectName } = req.body;
        const fullPath = await projectService.createProject(parentPath, projectName);
        res.json({ path: fullPath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/project/features', async (req, res) => {
    try {
        const { projectPath } = req.body;
        const features = await projectService.getFeatures(projectPath);
        res.json({ features });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/project/feature', async (req, res) => {
    try {
        const { projectPath, featureName } = req.body;
        await projectService.createFeature(projectPath, featureName);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/file/save', async (req, res) => {
    try {
        const { projectPath, featureName, fileName, content } = req.body;
        const filePath = await projectService.saveFile(projectPath, featureName, fileName, content);
        res.json({ filePath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Upload Image - Saves to temp directory
 * Returns unique filename that will be used later to copy to project assets
 */
app.post('/upload-image', async (req, res) => {
    try {
        const { name, data } = req.body;

        if (!name || !data) {
            return res.status(400).json({ error: 'Missing name or data' });
        }

        const filename = await projectService.saveTempUpload(name, data);
        res.json({ filename });
    } catch (error) {
        console.error('[Server] Upload Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Convert UI Screenshot to Flutter Code
 * Uses context image as primary visual reference
 * Optional: Include Figma data for precise measurements (fonts, colors, spacing, border radius)
 * Optional: Can save assets to project if projectPath is provided
 */
app.post('/convert', async (req, res) => {
    try {
          const { contextImage, figmaData, options, assets, projectPath } = req.body;

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
        console.log(`[Server] Options:`, options);
        console.log(`[Server] Figma data provided:`, !!figmaData);

        // Prepare enhanced options with Figma data if available
        const enhancedOptions = { ...options };
        if (figmaData) {
            enhancedOptions.figmaData = figmaData;
            console.log('[Server] Including Figma data for precise measurements');
        }

        // Generate code from image with optional Figma context
        console.log('[Server] Generating Flutter code from screenshot...');
        const code = await geminiService.generateCodeFromImage(contextImage, enhancedOptions);

        console.log('[Server] Code generation complete');
        res.json({ code });
    } catch (error) {
        console.error('[Server] Error converting:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Optional: Cleanup endpoint for old temp files
app.post('/cleanup', async (req, res) => {
    try {
        await projectService.cleanupTempUploads(24); // Clean files older than 24 hours
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug Logging Endpoint
app.post('/log', (req, res) => {
    const { message, type } = req.body;
    const prefix = type === 'error' ? '[Plugin Error]' : '[Plugin Log]';
    console.log(`${prefix} ${message}`);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Gemini API Key:', process.env.GEMINI_API_KEY ? 'Configured' : 'MISSING');
});