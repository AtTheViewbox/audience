/**
 * SAM3 API Client
 * Frontend utility for calling SAM3 segmentation API
 */

const API_BASE = 'http://localhost:8000/api';

/**
 * Segment a DICOM image using SAM3
 */
export async function segmentDicom(dicomUrl, prompt, options = {}) {
  const {
    windowCenter,
    windowWidth,
    apiUrl = API_BASE
  } = options;

  const requestBody = {
    dicom_url: dicomUrl,
    prompt: prompt
  };

  if (windowCenter !== undefined) requestBody.window_center = windowCenter;
  if (windowWidth !== undefined) requestBody.window_width = windowWidth;

  try {
    const response = await fetch(`${apiUrl}/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      masks: data.masks,
      boxes: data.boxes,
      scores: data.scores,
      numMasks: data.num_masks,
      imageShape: data.image_shape
    };
  } catch (error) {
    console.error('SAM3 segmentation error:', error);
    throw error;
  }
}

/**
 * Segment an entire DICOM series using SAM3 video tracking (One-shot)
 */
export async function segmentDicomSeries(dicomUrlOrUrls, prompt, promptFrameIdx, options = {}) {
  const {
    windowCenter,
    windowWidth,
    apiUrl = API_BASE
  } = options;

  const requestBody = {
    prompt: prompt,
    prompt_frame_idx: promptFrameIdx
  };

  if (Array.isArray(dicomUrlOrUrls)) {
    requestBody.dicom_urls = dicomUrlOrUrls;
  } else {
    requestBody.dicom_url = dicomUrlOrUrls;
  }

  if (windowCenter !== undefined) requestBody.window_center = windowCenter;
  if (windowWidth !== undefined) requestBody.window_width = windowWidth;

  try {
    const response = await fetch(`${apiUrl}/segment-series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      masksPerFrame: data.masks_per_frame,
      boxesPerFrame: data.boxes_per_frame,
      numFrames: data.num_frames,
      promptFrame: data.prompt_frame
    };
  } catch (error) {
    console.error('SAM3 series segmentation error:', error);
    throw error;
  }
}

// --- Session Management ---

export async function startSession(dicomUrlOrUrls, options = {}) {
    const {
        windowCenter,
        windowWidth,
        apiUrl = API_BASE
    } = options;

    const requestBody = {};
    if (Array.isArray(dicomUrlOrUrls)) {
        requestBody.dicom_urls = dicomUrlOrUrls;
    } else {
        requestBody.dicom_url = dicomUrlOrUrls;
    }
    if (windowCenter !== undefined) requestBody.window_center = windowCenter;
    if (windowWidth !== undefined) requestBody.window_width = windowWidth;

    const response = await fetch(`${apiUrl}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    if (!response.ok) throw new Error(`Failed to start session: ${response.statusText}`);
    return response.json();
}

export const addPoint = async (sessionId, frameIdx, points, labels, objId, propagate = true) => {
    const response = await fetch(`${API_BASE}/session/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            session_id: sessionId,
            frame_idx: frameIdx,
            points,
            labels,
            obj_id: objId,
            propagate
        })
    });
    if (!response.ok) throw new Error('Failed to add points');
    return await response.json();
};

export const addTextPrompt = async (sessionId, frameIdx, text, propagate = true) => {
    const response = await fetch(`${API_BASE}/session/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            session_id: sessionId,
            frame_idx: frameIdx,
            text,
            propagate
        })
    });
    if (!response.ok) throw new Error('Failed to add text prompt');
    return await response.json();
};

export const removeObject = async (sessionId, objId, propagate = true) => {
    const response = await fetch(`${API_BASE}/session/remove-object`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            session_id: sessionId,
            obj_id: objId,
            propagate
        })
    });
    if (!response.ok) throw new Error('Failed to remove object');
    return await response.json();
};

export const propagateSession = async (sessionId) => {
    const response = await fetch(`${API_BASE}/session/propagate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });
    if (!response.ok) throw new Error('Failed to propagate session');
    return await response.json();
};

export const stopSession = async (sessionId) => {
    const response = await fetch(`${API_BASE}/session/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });
    if (!response.ok) console.warn('Failed to stop session');
    return response.json();
}

export function decodeMask(base64Mask) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64Mask}`;
  });
}

export async function checkHealth(apiUrl = API_BASE) {
  try {
    const response = await fetch(`${apiUrl}/health`);
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return { status: 'unhealthy', error: error.message };
  }
}
