
export const initalValues = {
    thumbnail: "",
    label: "",
    id: 0,
    modality: "",
    prefix: "",
    suffix: "",
    start_slice: 0,
    end_slice: 1,
    min_slice: 0,
    ww: 0,
    wc: 0,
    ci: 1,
    z: 0,
    px: "0",
    max_slice: 0,
    py: "0",
    r: 0,
    pad: 0,
    cord: [-1, -1],
    url: "",
    intLoad: true,
    rescaleIntercept: 0,
    rescaleSlope: 1,
    step: 1,
    excluded_slices: [],
};

export function generateURL(data) {
    const URL_genereated = new URL(
        window.location.protocol + '//' + window.location.host + window.location.pathname
    );

    URL_genereated.searchParams.append("m", "true");
    URL_genereated.searchParams.append("ld.r", "1");
    URL_genereated.searchParams.append("ld.c", "1");

    URL_genereated.searchParams.append(
        "vd.0.s.pf",
        encodeURI("wadouri:" + data.prefix)
    );
    URL_genereated.searchParams.append("vd.0.s.sf", data.suffix);
    URL_genereated.searchParams.append("vd.0.s.s", data.start_slice.toString());
    URL_genereated.searchParams.append("vd.0.s.e", data.end_slice.toString());
    URL_genereated.searchParams.append("vd.0.ww", data.ww.toString());
    URL_genereated.searchParams.append("vd.0.wc", data.wc.toString());

    URL_genereated.searchParams.append("vd.0.ci", data.ci.toString());
    URL_genereated.searchParams.append("vd.1.z", data.z.toString());
    URL_genereated.searchParams.append("vd.1.px", data.px.toString());
    URL_genereated.searchParams.append("vd.1.py", data.py.toString());
    URL_genereated.searchParams.append("vd.1.r", data.r.toString());
    return URL_genereated.href;
}

export function generateGridURL(
    metaDataList,
    row,
    col
) {
    const URL_genereated = new URL(
        window.location.protocol + '//' + window.location.host + window.location.pathname
    );

    URL_genereated.searchParams.append("m", "true");
    URL_genereated.searchParams.append("ld.r", row.toString());
    URL_genereated.searchParams.append("ld.c", col.toString());

    metaDataList.map((data) => {
        if (data.isDraft || !data.prefix) return;
        if (data.cord[0] != -1 && data.cord[1] != -1) {
            let value = (data.cord[0] + 1 + col * data.cord[1] - 1).toString();
            URL_genereated.searchParams.append(
                "vd." + value + ".s.pf",
                encodeURI("wadouri:" + data.prefix)
            );
            URL_genereated.searchParams.append("vd." + value + ".s.sf", data.suffix);
            URL_genereated.searchParams.append(
                "vd." + value + ".s.s",
                String((data.start_slice) * data.step + data.min_slice).padStart(data.pad, "0")
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".s.e",
                String(data.end_slice * data.step + data.min_slice).padStart(data.pad, "0")
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".s.D",
                data.step.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".ww",
                data.ww.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".wc",
                data.wc.toString()
            );

            URL_genereated.searchParams.append(
                "vd." + value + ".ci",
                data.ci.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".z",
                data.z.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".px",
                data.px.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".py",
                data.py.toString()
            );
            URL_genereated.searchParams.append(
                "vd." + value + ".r",
                data.r.toString()
            );
        }
    });
    return URL_genereated.href;
}

export function recreateVariableStringList(start_str, end_str, step) {
    const start = parseInt(start_str, 10);
    const end = parseInt(end_str, 10);
    const length = start_str.length;

    // Generate the list programmatically
    const generatedList = [];

    for (let i = start; i <= end; i += step) {

        let numStr = i.toString();
        while (numStr.length < length) {
            numStr = "0" + numStr;
        }
        generatedList.push(numStr);
    }

    return generatedList;
}

export function recreateUriStringList(
    prefix,
    suffix,
    start_str,
    end_str,
    pad,
    step
) {
    const variableStringList = recreateVariableStringList(
        String(start_str).padStart(pad, "0"),
        String(end_str).padStart(pad, "0"),
        step
    );
    return variableStringList.map((str) => "wadouri:" + prefix + str + suffix);
}

/** Inclusive 0-based index range available for this series. */
export function getSliceBounds(metadata) {
    const step = Number(metadata?.step) > 0 ? Number(metadata.step) : 1;
    const fromFiles = metadata?.localBlobUrls?.length || metadata?.localFiles?.length || 0;
    if (fromFiles > 0) {
        return { minIndex: 0, maxIndex: fromFiles - 1, count: fromFiles };
    }

    const minS = Number(metadata?.min_slice);
    const maxS = Number(metadata?.max_slice);
    if (Number.isFinite(minS) && Number.isFinite(maxS) && maxS >= minS) {
        const count = Math.floor((maxS - minS) / step) + 1;
        return { minIndex: 0, maxIndex: Math.max(0, count - 1), count: Math.max(1, count) };
    }

    const start = Number(metadata?.start_slice);
    const end = Number(metadata?.end_slice);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        const count = end + 1;
        return { minIndex: 0, maxIndex: Math.max(0, count - 1), count: Math.max(1, count) };
    }

    return { minIndex: 0, maxIndex: 0, count: 1 };
}

export function getExcludedSliceSet(metadata, start, end) {
    const list = Array.isArray(metadata?.excluded_slices) ? metadata.excluded_slices : [];
    const excluded = new Set();
    for (const value of list) {
        const n = Number(value);
        if (!Number.isFinite(n)) continue;
        const i = Math.round(n);
        if (i >= start && i <= end) excluded.add(i);
    }
    return excluded;
}

export function getIncludedSliceIndices(metadata, bounds = getSliceBounds(metadata)) {
    const { start_slice: start, end_slice: end } = clampSliceRange(metadata, bounds);
    const excluded = getExcludedSliceSet(metadata, start, end);
    const included = [];
    for (let i = start; i <= end; i++) {
        if (!excluded.has(i)) included.push(i);
    }
    return included.length ? included : [start];
}

export function stackIndexForSlice(metadata, sliceIndex) {
    const included = getIncludedSliceIndices(metadata);
    const idx = included.indexOf(sliceIndex);
    return idx >= 0 ? idx : 0;
}

export function sliceIndexForStack(metadata, stackIndex) {
    const included = getIncludedSliceIndices(metadata);
    if (!included.length) return 0;
    const i = Math.max(0, Math.min(included.length - 1, Number(stackIndex) || 0));
    return included[i];
}

export function clampSliceRange(metadata, bounds = getSliceBounds(metadata)) {
    const { minIndex, maxIndex } = bounds;
    let start = Number(metadata?.start_slice);
    let end = Number(metadata?.end_slice);
    if (!Number.isFinite(start)) start = minIndex;
    if (!Number.isFinite(end)) end = maxIndex;
    start = Math.min(Math.max(Math.round(start), minIndex), maxIndex);
    end = Math.min(Math.max(Math.round(end), start), maxIndex);

    let excluded = [...getExcludedSliceSet(metadata, start, end)];
    while (excluded.includes(start) && start < end) start += 1;
    while (excluded.includes(end) && end > start) end -= 1;
    excluded = excluded.filter((i) => i > start && i < end);

    let ci = Number(metadata?.ci);
    if (!Number.isFinite(ci)) ci = start;
    ci = Math.min(Math.max(Math.round(ci), start), end);
    if (excluded.includes(ci)) {
        const included = [];
        for (let i = start; i <= end; i++) {
            if (!excluded.includes(i)) included.push(i);
        }
        if (included.length) {
            ci = included.reduce((best, i) =>
                Math.abs(i - ci) < Math.abs(best - ci) ? i : best
            , included[0]);
        }
    }

    return { start_slice: start, end_slice: end, ci, excluded_slices: excluded };
}

/** wadouri for a 0-based slice index across the full series, not the cropped stack. */
export function getImageIdForSlice(metadata, index) {
    const urls = metadata?.localBlobUrls;
    if (Array.isArray(urls) && urls[index]) {
        return `wadouri:${urls[index]}`;
    }
    if (!metadata?.prefix) return null;
    const step = Number(metadata.step) > 0 ? Number(metadata.step) : 1;
    const minS = Number.isFinite(Number(metadata.min_slice)) ? Number(metadata.min_slice) : 0;
    const fileNum = index * step + minS;
    const pad = Number(metadata.pad) || 0;
    const padded = String(fileNum).padStart(pad, "0");
    return `wadouri:${metadata.prefix}${padded}${metadata.suffix || ""}`;
}

export function buildLocalStack(metadata) {
    const urls = metadata?.localBlobUrls || [];
    if (!urls.length) return [];
    return getIncludedSliceIndices(metadata)
        .map((i) => (urls[i] ? `wadouri:${urls[i]}` : null))
        .filter(Boolean);
}

export function isPlacedOnGrid(metadata) {
    return metadata?.cord?.[0] !== -1 && metadata?.cord?.[1] !== -1;
}

export function findFirstEmptyCell(metaDataList, cols, rows) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const occupied = metaDataList.some(
                (item) => item.cord?.[0] === c && item.cord?.[1] === r
            );
            if (!occupied) return [c, r];
        }
    }
    return null;
}

export function hasDraftPlacedOnGrid(metaDataList) {
    return metaDataList.some((item) => item.isDraft && isPlacedOnGrid(item));
}

export function checkUrlQuery(object, search) {
    const urlParams = new URLSearchParams(object.url.split("?")[1]);

    if (urlParams.get("s") == String(object.id) && urlParams.has(search)) {
        return Number(urlParams.get(search));
    }
    return 0;
}

export function getAdjustedWC(
    wc,
    metadata
) {
    if (!wc) {
        return 40
    }
    return (wc - metadata.rescaleIntercept) / (metadata.rescaleSlope)
}

export function getAdjustedWW(
    ww,
    metadata
) {
    if (!ww) {
        return 400
    }
    return (ww) / (metadata.rescaleSlope)
}

export function getReveredAdjustedWW(
    metadata
) {
    return (metadata.ww) * (metadata.rescaleSlope)
}

export function getReveredAdjustedWC(
    metadata
) {
    return (metadata.wc * metadata.rescaleSlope + metadata.rescaleIntercept)
}

