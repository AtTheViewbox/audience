import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";
import { DICOM_CDN, ensureR2AccessToken, getR2AccessToken } from "./r2Access.js";

let initPromise = null;
const originalWadoLoad = cornerstoneDICOMImageLoader.wadouri.loadImage;

export function isMobileDevice() {
  const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

async function maybeGunzip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  if (typeof DecompressionStream === "undefined") return buffer;
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

function loadAuthedDicom(imageId, options) {
  const schemeMatch = String(imageId).match(/^(wadouri:|dicomweb:)/);
  const scheme = schemeMatch ? schemeMatch[0] : "";
  const rawUrl = scheme ? imageId.slice(scheme.length) : imageId;
  const isCdn = rawUrl.startsWith(DICOM_CDN) || /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i.test(rawUrl);
  if (!isCdn || rawUrl.startsWith("blob:")) {
    return originalWadoLoad(imageId, options);
  }

  let cancelled = false;
  const promise = (async () => {
    const token = (await ensureR2AccessToken()) || getR2AccessToken();
    if (cancelled) throw new Error("DICOM load cancelled");
    const response = await fetch(rawUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`DICOM request failed (${response.status})`);
    }
    const unzipped = await maybeGunzip(await response.arrayBuffer());
    const blobUrl = URL.createObjectURL(new Blob([unzipped], { type: "application/dicom" }));
    const loaded = originalWadoLoad(`${scheme || "wadouri:"}${blobUrl}`, options);
    const image = await loaded.promise;
    return image;
  })();

  return {
    promise,
    cancelFn: () => {
      cancelled = true;
    },
  };
}

export function initCornerstone() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    window.cornerstone = cornerstone;
    window.cornerstoneTools = cornerstoneTools;
    cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
    cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

    const mobile = isMobileDevice();
    const workerCount = mobile ? 1 : Math.min(navigator.hardwareConcurrency || 4, 4);

    cornerstoneDICOMImageLoader.configure({
      useWebWorkers: true,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true,
      },
      beforeSend: (xhr) => {
        const token = getR2AccessToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      },
    });

    try {
      cornerstoneDICOMImageLoader.webWorkerManager.initialize({
        maxWebWorkers: workerCount,
        startWebWorkersOnDemand: false,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: true,
            strict: false,
          },
        },
      });
    } catch (_) {
      // Already initialized from a previous route.
    }

    cornerstone.imageLoader.registerImageLoader("wadouri", loadAuthedDicom);
    cornerstone.imageLoader.registerImageLoader("dicomweb", loadAuthedDicom);

    await cornerstone.init();

    const cacheSizeBytes = mobile
      ? 384 * 1024 * 1024
      : 3000 * 1024 * 1024;
    cornerstone.cache.setMaxCacheSize(cacheSizeBytes);

    await cornerstoneTools.init();
    return { mobile };
  })();

  return initPromise;
}
