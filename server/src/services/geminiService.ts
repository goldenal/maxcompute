import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

interface GenerationOptions {
    widgetType?: string;
    useProvider?: boolean;
    figmaData?: unknown;
}

class GeminiService {
    private ai: GoogleGenAI;

    constructor(apiKey?: string) {
        if (!apiKey) {
            throw new Error('Gemini API Key is required');
        }
        this.ai = new GoogleGenAI({ apiKey });
    }

    /**
     * Generate Flutter code from context image with optional Figma data
     * @param {string} contextImage - Filename of the uploaded context image
     * @param {Object} options - Generation options
     * @param {string} options.widgetType - Type of Flutter widget (default: 'StatelessWidget')
     * @param {boolean} options.useProvider - Whether to use Provider pattern
     * @param {Object} options.figmaData - Optional Figma JSON for precise measurements
     * @returns {Promise<string>} Generated Flutter code
     */
    async generateCodeFromImage(contextImage: string, options: GenerationOptions = {}): Promise<string> {
        console.log('[GeminiService] generateCodeFromImage started');

        if (!contextImage) {
            throw new Error('Context image is required for code generation');
        }

        try {
            const { widgetType = 'StatelessWidget', useProvider = false, figmaData = null } = options;

            // Build system instruction for image-to-Flutter conversion
            const systemInstruction = this._buildSystemInstruction(widgetType, useProvider);

            // Build user prompt with optional Figma data context
            const userPrompt = this._buildUserPrompt(figmaData);

            // Load and encode the image
            const imageData = await this._loadImage(contextImage);

            if (figmaData) {
                console.log('[GeminiService] Including Figma data for precise measurements');
            }

            // Prepare multimodal content
            const parts = [
                { text: userPrompt },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: imageData,
                    },
                },
            ];

            // Use gemini-2.5-pro for multimodal support
            const modelId = 'gemini-2.5-pro';

            console.log('[GeminiService] Sending request to Gemini API...');
            const response = await this.ai.models.generateContent({
                model: modelId,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.1, // Low temperature for consistent code generation
                },
                contents: [{ role: 'user', parts: parts }],
            });

            let code = (response as { text?: string }).text;

            // Clean up code fences if present
            if (code) {
                code = code.replace(/```dart/g, '').replace(/```/g, '').trim();
            }

            console.log('[GeminiService] Code generation completed successfully');
            return code || '';
        } catch (error) {
            console.error('[GeminiService] Error during code generation:', error);
            throw error;
        }
    }

    /**
     * Load and encode image from uploads directory
     * @private
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
     * @private
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
     * Build user prompt for image analysis with optional Figma data
     * @private
     */
    private _buildUserPrompt(figmaData: unknown = null): string {
        let prompt = 'Please analyze the UI screenshot provided and generate production-ready Flutter code that recreates this design with pixel-perfect accuracy.';

        if (figmaData) {
            prompt += `\n\n## FIGMA DESIGN DATA (Use for Precise Measurements)\n\nI'm providing the Figma design data below. Use this JSON to extract EXACT values for:\n\n### Typography\n- **Font sizes** (fontSize property)\n- **Font weights** (fontWeight property)\n- **Line heights** (lineHeight property)\n- **Letter spacing** (letterSpacing property)\n\n### Colors & Fills\n- **Solid colors** (fills array with type: "SOLID", color: {r, g, b} in 0-1 range)\n- **Gradients** (fills array with type: "GRADIENT_LINEAR" or "GRADIENT_RADIAL")\n  - Extract gradientStops array: [{color: {r, g, b}, position: 0-1}]\n  - Extract gradientHandlePositions for angle/direction\n  - Convert to Flutter LinearGradient or RadialGradient\n\n### Layout & Spacing\n- **Border radius** (cornerRadius, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius)\n- **Spacing** (itemSpacing, padding properties)\n- **Stroke widths** (strokeWeight property)\n- **Opacity** (opacity property)\n\n### Effects (Shadows)\n- **Box shadows** (effects array with type: "DROP_SHADOW" or "INNER_SHADOW")\n  - Extract offset: {x, y} → Offset(x, y)\n  - Extract radius (blur) → blurRadius\n  - Extract spread → spreadRadius\n  - Extract color: {r, g, b, a} → Color with alpha\n  - Multiple shadows → multiple BoxShadow in list\n\n**CRITICAL:** When you see these properties in the Figma data, use the EXACT values. Do not approximate.\n\n### Gradient Conversion Examples:\n\`\`\`\nFigma GRADIENT_LINEAR:\n{\n  type: "GRADIENT_LINEAR",\n  gradientStops: [\n    {color: {r: 0.2, g: 0.4, b: 0.8}, position: 0},\n    {color: {r: 0.8, g: 0.2, b: 0.4}, position: 1}\n  ]\n}\n\nFlutter:\nLinearGradient(\n  colors: [Color(0xFF3366CC), Color(0xFFCC3366)],\n  stops: [0.0, 1.0],\n  begin: Alignment.topLeft,\n  end: Alignment.bottomRight,\n)\n\`\`\`\n\n### Shadow Conversion Examples:\n\`\`\`\nFigma DROP_SHADOW:\n{\n  type: "DROP_SHADOW",\n  offset: {x: 0, y: 4},\n  radius: 8,\n  spread: 2,\n  color: {r: 0, g: 0, b: 0, a: 0.25}\n}\n\nFlutter:\nBoxShadow(\n  offset: Offset(0, 4),\n  blurRadius: 8.0,\n  spreadRadius: 2.0,\n  color: Color(0x40000000),  // 0.25 alpha = 0x40\n)\n\`\`\`\n\nFigma Design JSON:\n\`\`\`json\n${JSON.stringify(figmaData, null, 2)}\n\`\`\`\n\n`;
        }

        prompt += '\n\nFocus on:\n- Accurate layout structure from the visual\n- EXACT spacing, padding, and dimensions from Figma data (if provided)\n- EXACT colors and gradients from Figma data (if provided)\n- EXACT typography (sizes, weights, line heights) from Figma data (if provided)\n- EXACT border radius from Figma data (if provided)\n- EXACT box shadows from Figma data (if provided)\n- Appropriate Flutter widgets\n\nGenerate clean, well-structured code that follows Flutter best practices.';

        return prompt;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use generateCodeFromImage instead
     */
    async generateCode(promptData: { contextImage: string; options?: GenerationOptions; figmaData?: unknown }): Promise<string> {
        console.log('[GeminiService] generateCode (legacy) called');
        const { contextImage, options, figmaData } = promptData;

        // Merge figmaData into options if provided
        const enhancedOptions: GenerationOptions = { ...(options || {}) };
        if (figmaData) {
            enhancedOptions.figmaData = figmaData;
        }

        return this.generateCodeFromImage(contextImage, enhancedOptions);
    }
}

export default GeminiService;
