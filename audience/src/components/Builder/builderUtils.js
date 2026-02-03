
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
    step: 1
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
        encodeURI("dicomweb:" + data.prefix)
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
        if (data.cord[0] != -1 && data.cord[1] != -1) {
            let value = (data.cord[0] + 1 + col * data.cord[1] - 1).toString();
            URL_genereated.searchParams.append(
                "vd." + value + ".s.pf",
                encodeURI("dicomweb:" + data.prefix)
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
    return variableStringList.map((str) => "dicomweb:" + prefix + str + suffix);
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
