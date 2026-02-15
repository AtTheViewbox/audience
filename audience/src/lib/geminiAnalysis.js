/**
 * Gemini API Integration for Radiology Image Analysis
 * Using official @google/genai SDK
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Rate limiting: Track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 6000; // 6 seconds between requests (10 RPM safe limit)

/**
 * Convert canvas to base64 JPEG image
 * @param {HTMLCanvasElement} canvas - The canvas element to convert
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<string>} Base64 encoded image data (without data URI prefix)
 */
export async function canvasToBase64(canvas, quality = 0.9) {
    return new Promise((resolve, reject) => {
        try {
            // Get the data URL and strip the prefix
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const base64Data = dataUrl.split(',')[1];
            resolve(base64Data);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Analyze radiology image using Gemini API
 * @param {string} base64Image - Base64 encoded JPEG image
 * @param {object} options - Analysis options
 * @returns {Promise<object>} Analysis results
 */
export async function analyzeWithGemini(base64Image, options = {}) {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
    }

    // Rate limiting check
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
        const waitTime = Math.ceil((MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest) / 1000);
        throw new Error(`Please wait ${waitTime} seconds before analyzing again (rate limit protection)`);
    }

    const prompt = options.customPrompt || `You are an expert radiologist analyzing a medical image. 

Analyze this radiological image and provide:

1. **Image Type/Modality**: What type of scan is this (CT, X-ray, MRI, etc.)?
2. **Anatomical Region**: What body part/region is shown?
3. **Key Findings**: List any notable findings or abnormalities you observe
4. **Potential Pathology**: Describe any potential pathological findings
5. **Differential Diagnoses**: Suggest possible diagnoses based on the findings
6. **Recommendations**: What additional imaging or clinical correlation might be helpful?

Format your response in clear sections. Be specific but acknowledge uncertainty where appropriate.

IMPORTANT DISCLAIMER: This analysis is for educational purposes only and should not be used for clinical decision-making.`;

    try {
        // Initialize the SDK
        const ai = new GoogleGenAI({
            apiKey: GEMINI_API_KEY
        });

        // Generate content with the model
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: base64Image
                            }
                        }
                    ]
                }
            ]
        });

        const analysisText = response.text;

        if (!analysisText) {
            throw new Error('No analysis text received from Gemini API');
        }

        // Update rate limit tracker on success
        lastRequestTime = now;

        return {
            success: true,
            analysis: analysisText,
            rawResponse: response
        };
    } catch (error) {
        console.error('Gemini API Error:', error);
        return {
            success: false,
            error: error.message,
            analysis: null
        };
    }
}

/**
 * Analyze the current viewport for pathology
 * @param {object} renderingEngine - Cornerstone rendering engine
 * @param {string} viewportId - ID of the viewport to analyze
 * @returns {Promise<object>} Analysis results
 */
export async function analyzeCurrentSlice(renderingEngine, viewportId) {
    try {
        const viewport = renderingEngine.getViewport(viewportId);
        if (!viewport) {
            throw new Error('Viewport not found');
        }

        // Get the canvas element
        const canvas = viewport.canvas;
        if (!canvas) {
            throw new Error('Canvas not found in viewport');
        }

        // Convert canvas to base64
        const base64Image = await canvasToBase64(canvas);

        // Analyze with Gemini
        const result = await analyzeWithGemini(base64Image);

        return result;
    } catch (error) {
        console.error('Error analyzing current slice:', error);
        return {
            success: false,
            error: error.message,
            analysis: null
        };
    }
}
