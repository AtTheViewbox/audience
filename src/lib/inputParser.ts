import { DICOM_CDN } from "./r2Access.js";

function recreateVariableStringList(start_str, end_str, delta_str) {
    const start = parseInt(start_str, 10);
    const end = parseInt(end_str, 10);
    const delta = parseInt(delta_str, 10);
    const length = start_str.length;

    const generatedList = [];
    for (let i = start; i <= end; i += delta) {
        let numStr = i.toString();
        while (numStr.length < length) {
            numStr = "0" + numStr;
        }
        generatedList.push(numStr);
    }

    return generatedList;
}

/** Expand a compact viewer stack (prefix, suffix, start, end, step) into image URLs. */
export function recreateList(prefix, suffix, start_str, end_str, delta_str) {
    return recreateVariableStringList(start_str, end_str, delta_str).map(
        (str) => prefix + str + suffix
    );
}

const S3_BUCKET_PREFIX = "https://s3.amazonaws.com/elasticbeanstalk-us-east-1-843279806438/";
const R2_PUBLIC_HOST_RE = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i;

/** Send legacy S3 and public R2 URLs through the CORS-enabled DICOM host. */
export function rewriteImageUrl(url: string): string {
    const schemeMatch = url.match(/^(dicomweb:|wadouri:)/);
    const scheme = schemeMatch ? schemeMatch[0] : "";
    const rawUrl = scheme ? url.slice(scheme.length) : url;

    if (rawUrl.startsWith(S3_BUCKET_PREFIX)) {
        return scheme + DICOM_CDN + "/" + rawUrl.slice(S3_BUCKET_PREFIX.length);
    }

    const r2Match = rawUrl.match(R2_PUBLIC_HOST_RE);
    if (r2Match) {
        return scheme + DICOM_CDN + "/" + rawUrl.slice(r2Match[0].length);
    }

    return url;
}
