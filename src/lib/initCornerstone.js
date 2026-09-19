import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";
import { getR2AccessToken } from "./r2Access.js";

let initPromise = null;

export function isMobileDevice() {
  const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
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

    cornerstone.imageLoader.registerImageLoader(
      "wadouri",
      cornerstoneDICOMImageLoader.wadouri.loadImage
    );
    cornerstone.imageLoader.registerImageLoader(
      "dicomweb",
      cornerstoneDICOMImageLoader.wadouri.loadImage
    );

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
