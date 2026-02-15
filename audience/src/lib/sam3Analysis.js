/**
 * SAM 3 (Segment Anything Model 3) Integration
 * Uses Hugging Face Inference API for medical image segmentation
 */

import { queryHuggingFaceModel } from './huggingfaceApi.js';
import { canvasToBase64 } from './geminiAnalysis.js';

const SAM3_MODEL_ID = 'facebook/sam3';

/**
 * Segment objects in an image using text prompt
 * @param {string} base64Image - Base64 encoded JPEG image
 * @param {string} textPrompt - Text description of what to segment (e.g., "lung", "tumor")
 * @param {object} options - Segmentation options
 * @returns {Promise<object>} Segmentation results with masks and scores
 */
export async function segmentWithText(base64Image, textPrompt, options = {}) {
    if (!textPrompt || textPrompt.trim().length === 0) {
        throw new Error('Text prompt is required for segmentation');
    }

    const {
        threshold = 0.5,
        maskThreshold = 0.5
    } = options;

    try {
        const result = await queryHuggingFaceModel(SAM3_MODEL_ID, {
            image: base64Image,
            text: textPrompt.trim(),
            threshold,
            mask_threshold: maskThreshold
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error,
                masks: [],
                boxes: [],
                scores: []
            };
        }

        // Parse SAM 3 response
        // Expected format: array of { mask, box, score }
        const segmentations = result.data;

        return {
            success: true,
            prompt: textPrompt,
            numObjects: segmentations?.length || 0,
            masks: segmentations?.map(s => s.mask) || [],
            boxes: segmentations?.map(s => s.box) || [],
            scores: segmentations?.map(s => s.score) || [],
            rawResponse: result.data
        };
    } catch (error) {
        console.error('SAM 3 text segmentation error:', error);
        return {
            success: false,
            error: error.message,
            masks: [],
            boxes: [],
            scores: []
        };
    }
}

/**
 * Segment objects in an image using point prompts (click coordinates)
 * @param {string} base64Image - Base64 encoded JPEG image
 * @param {Array<{x: number, y: number, label: number}>} points - Click points with labels (1=foreground, 0=background)
 * @param {object} options - Segmentation options
 * @returns {Promise<object>} Segmentation results with masks and scores
 */
export async function segmentWithPoints(base64Image, points, options = {}) {
    if (!points || points.length === 0) {
        throw new Error('At least one point is required for segmentation');
    }

    const {
        threshold = 0.5,
        maskThreshold = 0.5
    } = options;

    try {
        const result = await queryHuggingFaceModel(SAM3_MODEL_ID, {
            image: base64Image,
            points: points.map(p => [p.x, p.y]),
            point_labels: points.map(p => p.label || 1), // Default to foreground
            threshold,
            mask_threshold: maskThreshold
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error,
                masks: [],
                boxes: [],
                scores: []
            };
        }

        // Parse SAM 3 response
        const segmentations = result.data;

        return {
            success: true,
            numPoints: points.length,
            numObjects: segmentations?.length || 0,
            masks: segmentations?.map(s => s.mask) || [],
            boxes: segmentations?.map(s => s.box) || [],
            scores: segmentations?.map(s => s.score) || [],
            rawResponse: result.data
        };
    } catch (error) {
        console.error('SAM 3 point segmentation error:', error);
        return {
            success: false,
            error: error.message,
            masks: [],
            boxes: [],
            scores: []
        };
    }
}

/**
 * Segment objects in an image using bounding box
 * @param {string} base64Image - Base64 encoded JPEG image
 * @param {object} box - Bounding box {x1, y1, x2, y2}
 * @param {object} options - Segmentation options
 * @returns {Promise<object>} Segmentation results with masks and scores
 */
export async function segmentWithBox(base64Image, box, options = {}) {
    if (!box || !box.x1 || !box.y1 || !box.x2 || !box.y2) {
        throw new Error('Valid bounding box is required for segmentation');
    }

    const {
        threshold = 0.5,
        maskThreshold = 0.5
    } = options;

    try {
        const result = await queryHuggingFaceModel(SAM3_MODEL_ID, {
            image: base64Image,
            box: [box.x1, box.y1, box.x2, box.y2],
            threshold,
            mask_threshold: maskThreshold
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error,
                masks: [],
                boxes: [],
                scores: []
            };
        }

        // Parse SAM 3 response
        const segmentations = result.data;

        return {
            success: true,
            numObjects: segmentations?.length || 0,
            masks: segmentations?.map(s => s.mask) || [],
            boxes: segmentations?.map(s => s.box) || [],
            scores: segmentations?.map(s => s.score) || [],
            rawResponse: result.data
        };
    } catch (error) {
        console.error('SAM 3 box segmentation error:', error);
        return {
            success: false,
            error: error.message,
            masks: [],
            boxes: [],
            scores: []
        };
    }
}

/**
 * Segment the current viewport slice using text prompt
 * @param {object} renderingEngine - Cornerstone rendering engine
 * @param {string} viewportId - ID of the viewport to segment
 * @param {string} textPrompt - Text description of what to segment
 * @returns {Promise<object>} Segmentation results
 */
export async function segmentCurrentSlice(renderingEngine, viewportId, textPrompt) {
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

        // Segment with text prompt
        const result = await segmentWithText(base64Image, textPrompt);

        return result;
    } catch (error) {
        console.error('Error segmenting current slice:', error);
        return {
            success: false,
            error: error.message,
            masks: [],
            boxes: [],
            scores: []
        };
    }
}

/**
 * Convert binary mask to colored overlay for rendering
 * @param {Array} mask - Binary mask array
 * @param {string} color - Hex color for the overlay (e.g., '#FF0000')
 * @param {number} opacity - Opacity of the overlay (0-1)
 * @returns {ImageData} Colored mask as ImageData
 */
export function maskToColoredOverlay(mask, color = '#FF0000', opacity = 0.5) {
    // Parse hex color
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const a = Math.floor(opacity * 255);

    // Create ImageData from mask
    const height = mask.length;
    const width = mask[0]?.length || 0;

    const imageData = new ImageData(width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (mask[y][x]) {
                imageData.data[idx] = r;
                imageData.data[idx + 1] = g;
                imageData.data[idx + 2] = b;
                imageData.data[idx + 3] = a;
            }
        }
    }

    return imageData;
}
