/**
 * Hugging Face Inference API Integration via Cloudflare Worker Proxy
 * Uses worker proxy to avoid CORS issues and keep API token secure
 */

// Cloudflare Worker proxy URL (update after deployment)
const WORKER_PROXY_URL = import.meta.env.VITE_HF_WORKER_URL || 'http://localhost:8787';

// Rate limiting: Track last request time per model
const lastRequestTimes = new Map();
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds between requests per model

/**
 * Check if we can make a request to a specific model (rate limiting)
 * @param {string} modelId - The model ID
 * @returns {object} { canRequest: boolean, waitTime: number }
 */
function checkRateLimit(modelId) {
    const now = Date.now();
    const lastRequest = lastRequestTimes.get(modelId) || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
        const waitTime = Math.ceil((MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest) / 1000);
        return { canRequest: false, waitTime };
    }

    return { canRequest: true, waitTime: 0 };
}

/**
 * Query a Hugging Face model with inputs via Cloudflare Worker proxy
 * @param {string} modelId - The model ID (e.g., 'facebook/sam3')
 * @param {object} inputs - The input data for the model
 * @param {object} options - Additional options
 * @returns {Promise<object>} The model response
 */
export async function queryHuggingFaceModel(modelId, inputs, options = {}) {
    // Rate limiting check
    const rateCheck = checkRateLimit(modelId);
    if (!rateCheck.canRequest) {
        throw new Error(`Please wait ${rateCheck.waitTime} seconds before querying ${modelId} again (rate limit protection)`);
    }

    try {
        // Call Cloudflare Worker proxy instead of direct HF API
        const response = await fetch(WORKER_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                modelId,
                inputs: {
                    ...inputs,
                    ...options
                }
            })
        });

        if (!response.ok) {
            // Handle specific error codes
            if (response.status === 401 || response.status === 403) {
                throw new Error('Invalid Hugging Face API token or access denied. Please check your worker configuration.');
            } else if (response.status === 503) {
                throw new Error('Model is loading. Please try again in a few moments.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait before making more requests.');
            }

            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        // Check for error in response
        if (result.error) {
            throw new Error(result.error);
        }

        // Update rate limit tracker on success
        lastRequestTimes.set(modelId, Date.now());

        return {
            success: true,
            data: result,
            modelId
        };
    } catch (error) {
        console.error(`Hugging Face API Error for ${modelId}:`, error);
        return {
            success: false,
            error: error.message,
            modelId
        };
    }
}

/**
 * Query a model with an image (base64 encoded)
 * @param {string} modelId - The model ID
 * @param {string} base64Image - Base64 encoded image
 * @param {object} additionalInputs - Additional input parameters
 * @returns {Promise<object>} The model response
 */
export async function queryWithImage(modelId, base64Image, additionalInputs = {}) {
    return queryHuggingFaceModel(modelId, {
        image: base64Image,
        ...additionalInputs
    });
}

/**
 * Query a model with text
 * @param {string} modelId - The model ID
 * @param {string} text - Text input
 * @param {object} additionalInputs - Additional input parameters
 * @returns {Promise<object>} The model response
 */
export async function queryWithText(modelId, text, additionalInputs = {}) {
    return queryHuggingFaceModel(modelId, {
        text,
        ...additionalInputs
    });
}

