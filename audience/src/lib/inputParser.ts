//window.studydata.series.reduce((pS, cS) => [...pS, cS.instances.reduce((pV, cV) => [...pV, cV.url], [])], [])

function longestCommonPrefix(strs) {
    if (strs.length === 0) return "";

    strs.sort();

    let prefix = "";
    let first = strs[0];
    let last = strs[strs.length - 1];

    for (let i = 0; i < first.length; i++) {
        if (first[i] === last[i]) {
            prefix += first[i];
        } else {
            break;
        }
    }

    return prefix;
}

function longestCommonSuffix(strs) {
    const reversedStrs = strs.map(str => str.split("").reverse().join(""));
    const suffix = longestCommonPrefix(reversedStrs);
    return suffix.split("").reverse().join("");
}

function variableStringsInTheMiddle(strs, prefix, suffix) {    
    return strs.map(str => str.slice(prefix.length, str.length - suffix.length));
}

function recreateVariableStringList(start_str, end_str) {
    const start = parseInt(start_str, 10);
    const end = parseInt(end_str, 10);
    const length = start_str.length;

    // Generate the list programmatically
    const generatedList = [];
    for (let i = start; i <= end; i++) {
        let numStr = i.toString();
        while (numStr.length < length) {
            numStr = '0' + numStr;
        }
        generatedList.push(numStr);
    }

    return generatedList;
}

function recreateUriStringList(prefix, suffix, start_str, end_str) {
    const variableStringList = recreateVariableStringList(start_str, end_str);
    return variableStringList.map(str => prefix + str + suffix);
}

function decomposeList(strs) {
    const prefix = longestCommonPrefix(strs);
    const suffix = longestCommonSuffix(strs);
    const variableStringList = variableStringsInTheMiddle(strs, prefix, suffix);
    const start = variableStringList[0];
    const end = variableStringList[variableStringList.length - 1];
    return { prefix, suffix, start, end };
}

export function recreateList(prefix, suffix, start_str, end_str) {
    const generatedList = recreateUriStringList(prefix, suffix, start_str, end_str);
    return generatedList;
}

function recreateListFromList(strs) {
    const { prefix, suffix, start, end } = decomposeList(strs);
    const generatedList = recreateList(prefix, suffix, start, end);

    // Compare the generated list with the input list
    if (generatedList.length !== strs.length) return false;
    for (let i = 0; i < generatedList.length; i++) {
        if (generatedList[i] !== strs[i]) return false;
    }
    return true; // The lists match
}