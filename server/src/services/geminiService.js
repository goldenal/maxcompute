const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

class GeminiService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Gemini API Key is required');
        }
        this.ai = new GoogleGenAI({ apiKey });
    }

    /**
     * Generate Flutter code from context image only
     * @param {Object} params - Generation parameters
     * @param {string} params.contextImage - Filename of the uploaded context image
     * @param {Object} params.options - Optional generation options (widgetType, etc.)
     * @returns {Promise<string>} Generated Flutter code
     */
    async generateCodeFromImage(contextImage, options = {}) {
        console.log('[GeminiService] generateCodeFromImage started');
        
        if (!contextImage) {
            throw new Error('Context image is required for code generation');
        }

        try {
            const { widgetType = 'StatelessWidget', useProvider = false } = options;

            // Build system instruction for image-to-Flutter conversion
            const systemInstruction = this._buildSystemInstruction(widgetType, useProvider);

            // Build user prompt
            const userPrompt = this._buildUserPrompt();

            // Load and encode the image
            const imageData = await this._loadImage(contextImage);

            // Prepare multimodal content
            const parts = [
                { text: userPrompt },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: imageData
                    }
                }
            ];

            // Use gemini-2.0-flash-exp for multimodal support
            const modelId = "gemini-2.5-pro";

            console.log('[GeminiService] Sending request to Gemini API...');
            const response = await this.ai.models.generateContent({
                model: modelId,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.1, // Low temperature for consistent code generation
                },
                contents: [{ role: 'user', parts: parts }],
            });

            let code = response.text;

            // Clean up code fences if present
            if (code) {
                code = code.replace(/```dart/g, '').replace(/```/g, '').trim();
            }

            console.log('[GeminiService] Code generation completed successfully');
            return code;

        } catch (error) {
            console.error("[GeminiService] Error during code generation:", error);
            throw error;
        }
    }

    /**
     * Load and encode image from uploads directory
     * @private
     */
    async _loadImage(filename) {
        const imagePath = path.join(__dirname, '../../uploads', filename);
        
        try {
            const imageBuffer = await fs.promises.readFile(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            console.log(`[GeminiService] Image loaded successfully. Size: ${imageBase64.length} chars`);
            return imageBase64;
        } catch (error) {
            console.error(`[GeminiService] Failed to read image at ${imagePath}:`, error.message);
            throw new Error(`Failed to load context image: ${error.message}`);
        }
    }

    /**
     * Build system instruction for the LLM
     * @private
     */
    _buildSystemInstruction(widgetType, useProvider) {
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
     * Build user prompt for image analysis
     * @private
     */
    _buildUserPrompt() {
        return `Please analyze the UI screenshot provided and generate production-ready Flutter code that recreates this design with pixel-perfect accuracy.

Focus on:
- Accurate layout structure
- Precise spacing and padding
- Exact colors and styling
- Proper typography
- Appropriate Flutter widgets

Generate clean, well-structured code that follows Flutter best practices.`;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use generateCodeFromImage instead
     */
    async generateCode(promptData) {
        console.log('[GeminiService] generateCode (legacy) called');
        const { contextImage, options } = promptData;
        return this.generateCodeFromImage(contextImage, options || {});
    }
}

module.exports = GeminiService;
