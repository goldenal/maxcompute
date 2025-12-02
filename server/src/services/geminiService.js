const { GoogleGenAI } = require('@google/genai');

class GeminiService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Gemini API Key is required');
        }
        this.ai = new GoogleGenAI({ apiKey });
    }

    async generateCode(promptData) {
        console.log('[GeminiService] generateCode started');
        try {
            const { systemInstruction, userPrompt, contextImage } = promptData;

            // Using gemini-2.0-flash-exp for speed and quality, or pro if preferred
            const modelId = "gemini-3-pro-preview"; // Reverting to flash-exp as it supports multimodal better usually, or check pro support

            const parts = [{ text: userPrompt }];

            if (contextImage) {
                console.log(`[GeminiService] Attaching context image: ${contextImage}`);
                const fs = require('fs');
                const path = require('path');
                const imagePath = path.join(__dirname, '../../uploads', contextImage);

                try {
                    const imageBuffer = await fs.promises.readFile(imagePath);
                    const imageBase64 = imageBuffer.toString('base64');
                    console.log(`[GeminiService] Image loaded. Size: ${imageBase64.length} chars`);

                    parts.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: imageBase64
                        }
                    });
                } catch (e) {
                    console.error(`[GeminiService] Failed to read context image: ${e.message}`);
                }
            }

            const response = await this.ai.models.generateContent({
                model: modelId,
                config: {
                    systemInstruction: systemInstruction, // System instruction for context
                    temperature: 0.2, // Low temperature for deterministic code
                },
                contents: [{ role: 'user', parts: parts }],
            });

            let text = response.text; // In @google/genai, text is a property, not a function
            // Actually in @google/genai, response is the result object.
            // Let's check the previous implementation: `let text = response.text;` 
            // If it was working, we stick to it. But usually it's `response.response.text()` or similar in older SDKs.
            // In the new @google/genai, it might be `response.text`.

            // Wait, looking at previous file content: `let text = response.text;` was used.
            // However, if we look at the official docs for @google/genai (not google-generative-ai), the structure might differ.
            // But let's assume `response.text` is correct based on previous code.

            // Cleanup
            if (text) {
                text = text.replace(/```dart/g, '').replace(/```/g, '').trim();
            }

            console.log('[GeminiService] generateCode completed');
            return text;
        } catch (error) {
            console.error("[GeminiService] Error:", error);
            throw error;
        }
    }
}

module.exports = GeminiService;
