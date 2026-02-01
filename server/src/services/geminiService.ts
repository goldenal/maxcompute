import path from 'path';
import fs from 'fs';
import { LlmAgent, FunctionTool, InMemoryRunner, isFinalResponse, stringifyContent } from '@google/adk';
import { Content } from '@google/genai';
import { z } from 'zod';
import ProjectService from './projectService';
import { execFile } from 'child_process';
import util from 'util';

interface GenerationOptions {
    widgetType?: string;
    useProvider?: boolean;
    figmaData?: unknown;
}

class GeminiService {
    private projectService: ProjectService;

    constructor(_apiKey?: string) {
        this.projectService = new ProjectService();
    }

    /**
     * Generate Flutter code from context image with optional Figma data
     * Uses ADK agent with function tools for project/asset operations.
     */
    async generateCodeFromImage(
        contextImage: string,
        options: GenerationOptions = {},
        assetMap: Record<string, string> = {}
    ): Promise<string> {
        console.log('[GeminiService] generateCodeFromImage started');

        if (!contextImage) {
            throw new Error('Context image is required for code generation');
        }

        const { widgetType = 'StatelessWidget', useProvider = false, figmaData = null } = options;

        const systemInstruction = this._buildSystemInstruction(widgetType, useProvider);
        const userPrompt = this._buildUserPrompt(figmaData, assetMap);
        const imageData = await this._loadImage(contextImage);

        const tools = this._buildTools();

        const agent = new LlmAgent({
            name: 'figma_flutter_agent',
            instruction: systemInstruction,
            tools,
            model: 'gemini-2.5-flash',
        });

        const runner = new InMemoryRunner({ agent, appName: 'figma_flutter_app' });

        const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await runner.sessionService.createSession({
            appName: 'figma_flutter_app',
            userId: 'server',
            sessionId,
        });

        const newMessage: Content = {
            role: 'user',
            parts: [
                { text: userPrompt },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: imageData,
                    },
                },
            ],
        };

        const finalText = await this._runWithRetries({
            runner,
            userId: 'server',
            sessionId,
            newMessage,
            maxAttempts: 3,
            timeoutMs: 60_000,
        });

        // Clean up code fences if present
        const cleanedText = finalText.replace(/```dart/g, '').replace(/```/g, '').trim();

        console.log('[GeminiService] Code generation completed successfully');
        return cleanedText;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use generateCodeFromImage instead
     */
    async generateCode(promptData: { contextImage: string; options?: GenerationOptions; figmaData?: unknown }): Promise<string> {
        console.log('[GeminiService] generateCode (legacy) called');
        const { contextImage, options, figmaData } = promptData;

        const enhancedOptions: GenerationOptions = { ...(options || {}) };
        if (figmaData) {
            enhancedOptions.figmaData = figmaData;
        }

        return this.generateCodeFromImage(contextImage, enhancedOptions);
    }

    async fixFlutterProjectWeb(projectPath: string, options?: { maxFixAttempts?: number; buildTimeoutMs?: number }): Promise<{ success: boolean; attempts: number }> {
        const maxFixAttempts = options?.maxFixAttempts ?? 3;
        const buildTimeoutMs = options?.buildTimeoutMs ?? 5 * 60 * 1000;

        const isValid = await this.projectService.validateProject(projectPath);
        if (!isValid) {
            throw new Error(`Invalid Flutter project at ${projectPath} (pubspec.yaml not found).`);
        }

        const agent = this._buildFixAgent(projectPath);
        const runner = new InMemoryRunner({ agent, appName: 'flutter_fix_app' });
        const sessionId = `fix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await runner.sessionService.createSession({
            appName: 'flutter_fix_app',
            userId: 'server',
            sessionId,
        });

        let lastError = '';

        for (let attempt = 1; attempt <= maxFixAttempts; attempt += 1) {
            console.log(`[GeminiService] Build attempt ${attempt}/${maxFixAttempts}`);

            await this._runFlutter(projectPath, ['pub', 'get'], buildTimeoutMs);

            try {
                await this._runFlutter(projectPath, ['build', 'web'], buildTimeoutMs);
                return { success: true, attempts: attempt };
            } catch (error) {
                const err = error as Error;
                lastError = err.message;
            }

            const errorExcerpt = this._truncate(lastError, 6000);
            const fixPrompt = this._buildFixPrompt(projectPath, errorExcerpt, attempt, maxFixAttempts);

            const newMessage: Content = {
                role: 'user',
                parts: [{ text: fixPrompt }],
            };

            await this._runAgentOnce({
                runner,
                userId: 'server',
                sessionId,
                newMessage,
                timeoutMs: 60_000,
            });
        }

        throw new Error(`Build failed after ${maxFixAttempts} attempts: ${lastError}`);
    }

    private _buildTools(): FunctionTool[] {
        // Keep tools minimal for future use; file IO is handled deterministically by the server.
        const noop = new FunctionTool({
            name: 'noop',
            description: 'No-op tool (reserved for future agentic extensions).',
            parameters: z.object({}),
            execute: async () => ({ status: 'success' }),
        });

        return [noop];
    }

    private _buildFixAgent(projectPath: string): LlmAgent {
        const tools = this._buildFixTools(projectPath);
        return new LlmAgent({
            name: 'flutter_fix_agent',
            instruction: this._buildFixSystemInstruction(),
            tools,
            model: 'gemini-2.5-flash',
        });
    }

    private _buildFixTools(projectPath: string): FunctionTool[] {
        const readFile = new FunctionTool({
            name: 'read_file',
            description: 'Read a UTF-8 text file inside the Flutter project.',
            parameters: z.object({
                path: z.string().describe('Path to the file, absolute or relative to project root.'),
            }),
            execute: async ({ path: inputPath }) => {
                const resolved = this._resolveProjectPath(projectPath, inputPath);
                const content = await fs.promises.readFile(resolved, 'utf8');
                return { status: 'success', content: this._truncate(content, 20000) };
            },
        });

        const writeFile = new FunctionTool({
            name: 'write_file',
            description: 'Write UTF-8 content to a file inside the Flutter project.',
            parameters: z.object({
                path: z.string().describe('Path to the file, absolute or relative to project root.'),
                content: z.string().describe('Full file contents to write.'),
            }),
            execute: async ({ path: inputPath, content }) => {
                const resolved = this._resolveProjectPath(projectPath, inputPath);
                if (!this._isAllowedWritePath(projectPath, resolved)) {
                    throw new Error('Write path is not allowed.');
                }
                await fs.promises.writeFile(resolved, content, 'utf8');
                return { status: 'success' };
            },
        });

        const listFiles = new FunctionTool({
            name: 'list_files',
            description: 'List files and directories under a given project subdirectory.',
            parameters: z.object({
                dir: z.string().describe('Directory to list, relative to project root.'),
            }),
            execute: async ({ dir }) => {
                const resolved = this._resolveProjectPath(projectPath, dir);
                const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
                return {
                    status: 'success',
                    entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
                };
            },
        });

        return [readFile, writeFile, listFiles];
    }

    /**
     * Load and encode image from uploads directory
     */
    private async _loadImage(filename: string): Promise<string> {
        const imagePath = path.join(__dirname, '../../uploads', filename);

        try {
            const imageBuffer = await fs.promises.readFile(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            console.log(`[GeminiService] Image loaded successfully. Size: ${imageBase64.length} chars`);
            return imageBase64;
        } catch (error) {
            const err = error as Error;
            console.error(`[GeminiService] Failed to read image at ${imagePath}:`, err.message);
            throw new Error(`Failed to load context image: ${err.message}`);
        }
    }

    /**
     * Build system instruction for the LLM
     */
    private _buildSystemInstruction(widgetType: string, useProvider: boolean): string {
        return `You are a Senior Flutter Engineer specializing in converting UI designs to production-ready Flutter code.

## YOUR TASK
Analyze the provided UI screenshot and generate pixel-perfect Flutter code that recreates the design.

## ANALYSIS APPROACH

### 1. Visual Analysis
- Examine the overall layout structure (rows, columns, stacks)
- Identify spacing, padding, and margins
- Note colors, gradients, and backgrounds
- Recognize typography (font sizes, weights, styles)
- Detect shadows, borders, and corner radius
- Identify images and icons

### 2. Layout Strategy
- **Horizontal layouts** → Use \`Row\` with appropriate \`MainAxisAlignment\`
- **Vertical layouts** → Use \`Column\` with appropriate \`MainAxisAlignment\`
- **Overlapping elements** → Use \`Stack\` with \`Positioned\`
- **Scrollable content** → Use \`SingleChildScrollView\`, \`ListView\`, or \`GridView\`
- **Flexible sizing** → Use \`Expanded\` or \`Flexible\` where appropriate

### 3. Spacing & Dimensions
- Use \`SizedBox\` for fixed spacing and dimensions
- Use \`Padding\` widget for padding only
- Apply \`EdgeInsets\` for precise padding control
- Use \`Gap\` from flutter_gap package for spacing in Rows/Columns (if appropriate)

### 4. Styling
- **Colors**: Use \`Color(0xAARRGGBB)\` format
- **Gradients**: Use \`LinearGradient\` or \`RadialGradient\`
- **Borders**: Use \`Border.all\` or \`BoxDecoration.border\`
- **Shadows**: Use \`BoxShadow\` with appropriate offset, blur, and spread
- **Corner Radius**: Use \`BorderRadius.circular\` or \`BorderRadius.only\`

### 5. Typography
- Use \`GoogleFonts\` for custom fonts (assume package is available)
- Map font weights accurately (100-900)
- Set proper \`fontSize\`, \`fontWeight\`, \`letterSpacing\`, and \`height\`
- Use \`TextStyle\` for consistent styling

### 6. Component Recognition
- **Buttons** → \`ElevatedButton\`, \`TextButton\`, \`OutlinedButton\`, or \`IconButton\`
- **Input fields** → \`TextField\` with \`InputDecoration\`
- **Cards** → \`Card\` widget with elevation
- **Images** → \`Image.asset\`, \`Image.network\`, or \`CircleAvatar\`
- **Icons** → \`Icon\` widget or custom SVG
- **Lists** → \`ListView.builder\` or \`Column\` with mapped items

## CODE QUALITY STANDARDS

### Structure
- Generate a \`${widgetType}\` named \`GeneratedWidget\`
- Break complex UIs into private methods (\`_buildHeader()\`, \`_buildCard()\`, etc.)
- Extract very complex sections into separate widget classes

### Best Practices
- ✅ Use \`const\` constructors wherever possible
- ✅ Write null-safe code
- ✅ Use \`SizedBox\` for spacing and fixed dimensions
- ✅ Use \`Padding\` for padding only
- ✅ Use \`Container\` ONLY when decoration or constraints are needed
- ✅ Prefer \`EdgeInsets.only\` over \`EdgeInsets.fromLTRB\`
- ❌ NO \`Container(padding: ...)\` without decoration
- ❌ NO hardcoded magic numbers without context
- ❌ NO unused variables or imports

### Accuracy Targets
- **Spacing**: Match visual spacing as closely as possible
- **Colors**: Extract exact colors from the screenshot
- **Typography**: Match font sizes and weights accurately
- **Dimensions**: Recreate proportions faithfully

## OUTPUT REQUIREMENTS

**Return ONLY raw Dart code:**
- Start with: \`class GeneratedWidget extends ${widgetType} {\`
- NO markdown code fences (\`\`\`dart\`)
- NO explanatory text before or after the code
- NO comments (unless critical for understanding)
- Clean, formatted, production-ready code
- Include necessary imports at the top

## CRITICAL REMINDERS
1. Analyze the ENTIRE screenshot carefully before coding
2. Pay attention to alignment and spacing
3. Use appropriate Flutter widgets for each UI element
4. Ensure the code is runnable and follows Flutter best practices
5. Make the UI responsive where appropriate`;
    }

    /**
     * Build user prompt for image analysis with optional Figma data and assets.
     */
    private _buildUserPrompt(figmaData: unknown = null, assetMap: Record<string, string> = {}): string {
        let prompt = 'Please analyze the UI screenshot provided and generate production-ready Flutter code that recreates this design with pixel-perfect accuracy.';

        if (Object.keys(assetMap).length > 0) {
            prompt += `\n\nImage assets are already saved. Use these paths for Image.asset references where appropriate:\n\`\`\`json\n${JSON.stringify(assetMap, null, 2)}\n\`\`\``;
        }

        if (figmaData) {
            prompt += `\n\n## FIGMA DESIGN DATA (Use for Precise Measurements)\n\nI'm providing the Figma design data below. Use this JSON to extract EXACT values for:\n\n### Typography\n- **Font sizes** (fontSize property)\n- **Font weights** (fontWeight property)\n- **Line heights** (lineHeight property)\n- **Letter spacing** (letterSpacing property)\n\n### Colors & Fills\n- **Solid colors** (fills array with type: "SOLID", color: {r, g, b} in 0-1 range)\n- **Gradients** (fills array with type: "GRADIENT_LINEAR" or "GRADIENT_RADIAL")\n  - Extract gradientStops array: [{color: {r, g, b}, position: 0-1}]\n  - Extract gradientHandlePositions for angle/direction\n  - Convert to Flutter LinearGradient or RadialGradient\n\n### Layout & Spacing\n- **Border radius** (cornerRadius, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius)\n- **Spacing** (itemSpacing, padding properties)\n- **Stroke widths** (strokeWeight property)\n- **Opacity** (opacity property)\n\n### Effects (Shadows)\n- **Box shadows** (effects array with type: "DROP_SHADOW" or "INNER_SHADOW")\n  - Extract offset: {x, y} → Offset(x, y)\n  - Extract radius (blur) → blurRadius\n  - Extract spread → spreadRadius\n  - Extract color: {r, g, b, a} → Color with alpha\n  - Multiple shadows → multiple BoxShadow in list\n\n**CRITICAL:** When you see these properties in the Figma data, use the EXACT values. Do not approximate.\n\n### Gradient Conversion Examples:\n\`\`\`\nFigma GRADIENT_LINEAR:\n{\n  type: "GRADIENT_LINEAR",\n  gradientStops: [\n    {color: {r: 0.2, g: 0.4, b: 0.8}, position: 0},\n    {color: {r: 0.8, g: 0.2, b: 0.4}, position: 1}\n  ]\n}\n\nFlutter:\nLinearGradient(\n  colors: [Color(0xFF3366CC), Color(0xFFCC3366)],\n  stops: [0.0, 1.0],\n  begin: Alignment.topLeft,\n  end: Alignment.bottomRight,\n)\n\`\`\`\n\n### Shadow Conversion Examples:\n\`\`\`\nFigma DROP_SHADOW:\n{\n  type: "DROP_SHADOW",\n  offset: {x: 0, y: 4},\n  radius: 8,\n  spread: 2,\n  color: {r: 0, g: 0, b: 0, a: 0.25}\n}\n\nFlutter:\nBoxShadow(\n  offset: Offset(0, 4),\n  blurRadius: 8.0,\n  spreadRadius: 2.0,\n  color: Color(0x40000000),  // 0.25 alpha = 0x40\n)\n\`\`\`\n\nFigma Design JSON:\n\`\`\`json\n${JSON.stringify(figmaData, null, 2)}\n\`\`\`\n\n`;
        }

        prompt += '\n\nFocus on:\n- Accurate layout structure from the visual\n- EXACT spacing, padding, and dimensions from Figma data (if provided)\n- EXACT colors and gradients from Figma data (if provided)\n- EXACT typography (sizes, weights, line heights) from Figma data (if provided)\n- EXACT border radius from Figma data (if provided)\n- EXACT box shadows from Figma data (if provided)\n- Appropriate Flutter widgets\n\nGenerate clean, well-structured code that follows Flutter best practices.';

        return prompt;
    }

    private async _runWithRetries(params: {
        runner: InMemoryRunner;
        userId: string;
        sessionId: string;
        newMessage: Content;
        maxAttempts: number;
        timeoutMs: number;
    }): Promise<string> {
        const { runner, userId, sessionId, newMessage, maxAttempts, timeoutMs } = params;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const result = await this._runWithTimeout({
                    runner,
                    userId,
                    sessionId,
                    newMessage,
                    timeoutMs,
                });
                if (result) return result;
                throw new Error('Agent did not return a response.');
            } catch (error) {
                lastError = error as Error;
                console.error(`[GeminiService] Attempt ${attempt} failed:`, lastError.message);
                if (attempt < maxAttempts) {
                    await this._sleep(500 * attempt);
                }
            }
        }

        throw new Error(`AI request failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
    }

    private async _runWithTimeout(params: {
        runner: InMemoryRunner;
        userId: string;
        sessionId: string;
        newMessage: Content;
        timeoutMs: number;
    }): Promise<string> {
        const { runner, userId, sessionId, newMessage, timeoutMs } = params;

        const runPromise = (async () => {
            let finalText = '';
            for await (const event of runner.runAsync({
                userId,
                sessionId,
                newMessage,
            })) {
                if (isFinalResponse(event) && event.content?.parts?.length) {
                    finalText = stringifyContent(event).trim();
                }
            }
            return finalText;
        })();

        const timeoutPromise = new Promise<string>((_resolve, reject) => {
            setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        return Promise.race([runPromise, timeoutPromise]);
    }

    private async _runAgentOnce(params: {
        runner: InMemoryRunner;
        userId: string;
        sessionId: string;
        newMessage: Content;
        timeoutMs: number;
    }): Promise<void> {
        const { runner, userId, sessionId, newMessage, timeoutMs } = params;

        const runPromise = (async () => {
            for await (const _event of runner.runAsync({
                userId,
                sessionId,
                newMessage,
            })) {
                // Drain events until completion.
            }
        })();

        const timeoutPromise = new Promise<void>((_resolve, reject) => {
            setTimeout(() => reject(new Error(`Agent fix timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        await Promise.race([runPromise, timeoutPromise]);
    }

    private _buildFixSystemInstruction(): string {
        return `You are a Flutter build-fix assistant. Your goal is to make the project compile for web.\n\nRules:\n- Only edit files when necessary.\n- Prefer minimal changes.\n- Use read_file to inspect files before editing.\n- Use write_file to apply fixes.\n- Allowed write targets: pubspec.yaml, lib/**, assets/**.\n- Do not add new files unless required to fix a build error.\n- After making changes, stop and wait for the next build attempt.`;
    }

    private _buildFixPrompt(projectPath: string, errorLog: string, attempt: number, maxAttempts: number): string {
        return `The Flutter web build failed.\n\nProject path: ${projectPath}\nAttempt ${attempt}/${maxAttempts}\n\nError log (truncated):\n${errorLog}\n\nFix the error by editing files using the tools. If you need to inspect files, call read_file or list_files.\nWhen you finish applying fixes, do not output code; just finish.`;
    }

    private async _runFlutter(projectPath: string, args: string[], timeoutMs: number): Promise<void> {
        const execFileAsync = util.promisify(execFile);
        try {
            const { stdout, stderr } = await execFileAsync('flutter', args, {
                cwd: projectPath,
                timeout: timeoutMs,
                maxBuffer: 5 * 1024 * 1024,
            });
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
        } catch (error) {
            const err = error as { stdout?: string; stderr?: string; message: string };
            const details = `${err.stdout || ''}\n${err.stderr || ''}`.trim();
            throw new Error(details || err.message);
        }
    }

    private _resolveProjectPath(projectRoot: string, inputPath: string): string {
        const resolved = path.resolve(projectRoot, inputPath);
        if (!resolved.startsWith(path.resolve(projectRoot))) {
            throw new Error('Path is outside the project root.');
        }
        return resolved;
    }

    private _isAllowedWritePath(projectRoot: string, resolvedPath: string): boolean {
        const rel = path.relative(projectRoot, resolvedPath).replace(/\\\\/g, '/');
        return rel === 'pubspec.yaml' || rel.startsWith('lib/') || rel.startsWith('assets/');
    }

    private _truncate(value: string, maxLen: number): string {
        if (value.length <= maxLen) return value;
        return `${value.slice(0, maxLen)}\n... [truncated ${value.length - maxLen} chars]`;
    }

    private async _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export default GeminiService;
