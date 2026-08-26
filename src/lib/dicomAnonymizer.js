/**
 * Browser DICOM de-identification aligned with DICOM PS3.15 Appendix E
 * Basic Application Confidentiality Profile, plus RSNA-style options:
 *   - 113107 modified dates (offset from original Patient ID)
 *   - 113108 retain sex / age / size / weight
 *   - 113105 keep Study / Series description
 *   - 113109 keep manufacturer / model
 *
 * Pixel-burned PHI is not removed. Callers must not upload original bytes
 * if this step throws.
 */

import * as dcmjs from "dcmjs";

const UID_ROOT = "2.25";
const METHOD = "ATTHETHEVIEWBOX BASIC PROFILE";

const KEEP_UID_TAGS = new Set([
  "00020010", // Transfer Syntax UID
  "00020002", // Media Storage SOP Class UID
  "00080016", // SOP Class UID
]);

const KEEP_TAGS = new Set([
  "00080016",
  "00080060", // Modality
  "00080070", // Manufacturer
  "00081030", // Study Description
  "0008103E", // Series Description
  "00081090", // Manufacturer Model Name
  "00100040", // Patient Sex
  "00101010", // Patient Age
  "00101020", // Patient Size
  "00101030", // Patient Weight
]);

/** Identifying tags to strip (Basic Profile X) that are not replaced below. */
const REMOVE_TAGS = new Set([
  "00080050", // Accession Number
  "00080080", // Institution Name
  "00080081", // Institution Address
  "00080090", // Referring Physician Name
  "00080092", // Referring Physician Address
  "00080094", // Referring Physician Telephone
  "00080096", // Referring Physician ID Sequence
  "00081010", // Station Name
  "00081040", // Institutional Department Name
  "00081048", // Physician(s) of Record
  "00081050", // Performing Physician
  "00081060", // Name of Physician(s) Reading Study
  "00081070", // Operators' Name
  "00081080", // Admitting Diagnoses Description
  "00081084", // Admitting Diagnoses Code Sequence
  "00081120", // Referenced Patient Sequence
  "00082111", // Derivation Description
  "00089514", // Consulted Procedure Code
  "00100021", // Issuer of Patient ID
  "00100032", // Patient Birth Time
  "00100050", // Patient Insurance Plan Code
  "00101000", // Other Patient IDs
  "00101001", // Other Patient Names
  "00101005", // Patient Birth Name
  "00101040", // Patient Address
  "00101060", // Patient Mother Birth Name
  "00101080", // Military Rank
  "00101081", // Branch of Service
  "00101090", // Medical Record Locator
  "00102000", // Medical Alerts
  "00102110", // Allergies
  "00102150", // Country of Residence
  "00102152", // Region of Residence
  "00102154", // Patient Telephone Numbers
  "00102160", // Ethnic Group
  "00102180", // Occupation
  "001021A0", // Smoking Status
  "001021B0", // Additional Patient History
  "001021C0", // Pregnancy Status
  "001021D0", // Last Menstrual Date
  "001021F0", // Patient Religious Preference
  "00104000", // Patient Comments
  "00120010", // Clinical Trial Sponsor
  "00120020", // Clinical Trial Protocol ID
  "00120021", // Clinical Trial Protocol Name
  "00120030", // Clinical Trial Site ID
  "00120031", // Clinical Trial Site Name
  "00120040", // Clinical Trial Subject ID
  "00120042", // Clinical Trial Subject Reading ID
  "00120050", // Clinical Trial Time Point ID
  "00120051", // Clinical Trial Time Point Description
  "00120060", // Coordinating Center Name
  "00181000", // Device Serial Number
  "00181030", // Protocol Name
  "00200010", // Study ID
  "00320012", // Study Priority ID
  "00320032", // Study Patient ID
  "00380010", // Admission ID
  "00380014", // Issuer of Admission ID
  "00380064", // Discharge Diagnosis
  "00401001", // Requested Procedure ID
  "00400009", // Scheduled Procedure Step ID
  "00400006", // Scheduled Performing Physician
  "00400007", // Scheduled Procedure Step Description
  "00401002", // Reason for Requested Procedure
  "00402001", // Reason for Requested Procedure
  "00402016", // Placer Order Number
  "00402017", // Filler Order Number
  "00700080", // Content Label
  "00700081", // Content Description
  "00700084", // Content Creator Name
  "04000561", // Original Attributes Sequence
]);

export function createAnonymizerSession() {
  return {
    uidMap: new Map(),
    patientKey: null,
    patientId: null,
    dateOffsetDays: 0,
  };
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8);
}

async function uidFromOriginal(original) {
  const hex = await sha256Hex(`atvb-uid:${original}`);
  const n = BigInt(`0x${hex.slice(0, 32)}`);
  const uid = `${UID_ROOT}.${n.toString()}`;
  return uid.length <= 64 ? uid : `${UID_ROOT}.${n.toString().slice(0, 58)}`;
}

function firstValue(elem) {
  if (!elem) return "";
  const value = elem.Value;
  if (Array.isArray(value)) return value[0] ?? "";
  if (value == null) return "";
  return value;
}

function tagGroup(tag) {
  return Number.parseInt(String(tag).slice(0, 4), 16);
}

function isPrivateTag(tag) {
  if (!/^[0-9A-Fa-f]{8}$/.test(tag)) return false;
  return tagGroup(tag) % 2 === 1;
}

function stripGroup(group) {
  if (group >= 0x0032 && group <= 0x0033) return true;
  if (group === 0x0038) return true;
  if (group === 0x0040) return true;
  if (group === 0x4000 || group === 0x4008) return true;
  if (group >= 0x5000 && group <= 0x50ff) return true;
  if (group >= 0x6000 && group <= 0x60ff) return true;
  return false;
}

function shiftDA(da, days) {
  const raw = String(da).replace(/\D/g, "");
  if (raw.length < 8) return "";
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function shiftDT(dt, days) {
  const raw = String(dt);
  const da = shiftDA(raw.slice(0, 8), days);
  if (!da) return "";
  return `${da}${raw.slice(8)}`;
}

function setTag(dict, tag, vr, value) {
  dict[tag] = { vr, Value: Array.isArray(value) ? value : [value] };
}

async function mappedUid(session, original) {
  const key = String(original || "");
  if (!key) return key;
  if (session.uidMap.has(key)) return session.uidMap.get(key);
  const next = await uidFromOriginal(key);
  session.uidMap.set(key, next);
  return next;
}

async function ensurePatientIdentity(session, dict) {
  if (session.patientId) return;
  const originalId = String(firstValue(dict["00100020"]) || firstValue(dict["00100010"]) || "unknown");
  session.patientKey = originalId;
  const hex = await sha256Hex(`atvb-patient:${originalId}`);
  session.patientId = `ATVB-${hex.slice(0, 8).toUpperCase()}`;
  const offsetHex = await sha256Hex(`atvb-date:${originalId}`);
  session.dateOffsetDays = Number(BigInt(`0x${offsetHex.slice(0, 8)}`) % 3652n);
}

async function anonymizeDataset(dict, session) {
  if (!dict || typeof dict !== "object") return;

  await ensurePatientIdentity(session, dict);

  for (const tag of Object.keys(dict)) {
    if (KEEP_TAGS.has(tag)) continue;
    const group = tagGroup(tag);
    if (tag === "7FE00010" || tag === "7FE00008") continue;
    if (isPrivateTag(tag) || stripGroup(group) || REMOVE_TAGS.has(tag)) {
      delete dict[tag];
    }
  }

  delete dict["00100010"];
  delete dict["00100020"];
  delete dict["00100030"];
  setTag(dict, "00100010", "PN", "ANONYMIZED");
  setTag(dict, "00100020", "LO", session.patientId);
  setTag(dict, "00120062", "CS", "YES");
  setTag(dict, "00120063", "LO", METHOD);

  for (const tag of Object.keys(dict)) {
    const elem = dict[tag];
    if (!elem || typeof elem !== "object") continue;
    const vr = elem.vr;

    if (vr === "SQ" && Array.isArray(elem.Value)) {
      for (const item of elem.Value) {
        await anonymizeDataset(item, session);
      }
      continue;
    }

    if (vr === "PN" && tag !== "00100010") {
      setTag(dict, tag, "PN", "ANONYMIZED");
      continue;
    }

    if (vr === "UI" && !KEEP_UID_TAGS.has(tag)) {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      elem.Value = await Promise.all(values.map((v) => mappedUid(session, v)));
      delete elem._rawValue;
      continue;
    }

    if (vr === "DA" && tag !== "00100030") {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      elem.Value = values.map((v) => shiftDA(v, session.dateOffsetDays) || "");
      delete elem._rawValue;
      continue;
    }

    if (vr === "DT" || tag === "0008002A") {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      elem.Value = values.map((v) => shiftDT(v, session.dateOffsetDays) || "");
      delete elem._rawValue;
    }
  }
}

export async function anonymizeDicomArrayBuffer(arrayBuffer, session = createAnonymizerSession()) {
  const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
  await anonymizeDataset(dicomData.dict, session);
  if (dicomData.meta) {
    await anonymizeDataset(dicomData.meta, session);
    const sop = firstValue(dicomData.dict["00080018"]);
    if (sop) setTag(dicomData.meta, "00020003", "UI", sop);
  }
  return dicomData.write();
}

export async function anonymizeDicomFile(file, session = createAnonymizerSession(), fileName = "anonymized.dcm") {
  const arrayBuffer = await file.arrayBuffer();
  const outputBuffer = await anonymizeDicomArrayBuffer(arrayBuffer, session);
  const blob = new Blob([outputBuffer], { type: "application/dicom" });
  return new File([blob], fileName, { type: "application/dicom" });
}
