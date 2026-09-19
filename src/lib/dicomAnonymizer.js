/**
 * HIPAA Safe Harbor de-identification (45 CFR 164.514(b)(2)) applied to DICOM
 * headers in the browser before upload.
 *
 * Removes or replaces the 18 Safe Harbor identifiers:
 *   names; geography smaller than a state; dates except year; ages 90+;
 *   phone/fax/email; SSN; MRN / account / beneficiary / license numbers;
 *   vehicle and device serials; URLs; IPs; biometrics; full-face photos
 *   (not detectable here); and other unique codes (UIDs, accession, Study ID).
 *
 * Replacement Patient IDs and UIDs are random per upload session — not derived
 * from the original values (Safe Harbor forbids a re-identification code that
 * is derived from information about the individual).
 *
 * Dates keep year only (YYYY0101). Study/series descriptions and other
 * free-text descriptors are stripped because they often contain names or dates.
 *
 * Pixel-burned PHI and recognizable faces are not removed. Callers must not
 * upload original bytes if this step throws.
 */

import * as dcmjs from "dcmjs";

const UID_ROOT = "2.25";
const METHOD = "ATTHETHEVIEWBOX HIPAA SAFE HARBOR";

const KEEP_UID_TAGS = new Set([
  "00020002", // Media Storage SOP Class UID
  "00020010", // Transfer Syntax UID
  "00080016", // SOP Class UID
]);

/** Imaging / Safe Harbor-allowed characteristics. Descriptors are not kept. */
const KEEP_TAGS = new Set([
  "00080016",
  "00080060", // Modality
  "00080070", // Manufacturer
  "00081090", // Manufacturer Model Name
  "00100040", // Patient Sex
  "00101010", // Patient Age (capped at 90+)
  "00101020", // Patient Size
  "00101030", // Patient Weight
]);

/** Safe Harbor identifiers and free-text that commonly holds them. */
const REMOVE_TAGS = new Set([
  "00080050", // Accession Number
  "00080080", // Institution Name
  "00080081", // Institution Address
  "00080082", // Institution Code Sequence
  "00080090", // Referring Physician Name
  "00080092", // Referring Physician Address
  "00080094", // Referring Physician Telephone
  "00080096", // Referring Physician ID Sequence
  "0008009C", // Consulting Physician Name
  "0008009D", // Consulting Physician ID Sequence
  "00081010", // Station Name
  "00081030", // Study Description
  "00081032", // Procedure Code Sequence
  "0008103E", // Series Description
  "0008103F", // Institution Name of Dept? Series Description Code
  "00081040", // Institutional Department Name
  "00081048", // Physician(s) of Record
  "00081049", // Physician(s) of Record ID Sequence
  "00081050", // Performing Physician
  "00081052", // Performing Physician ID Sequence
  "00081060", // Name of Physician(s) Reading Study
  "00081062", // Physician Reading Study ID Sequence
  "00081070", // Operators' Name
  "00081072", // Operator ID Sequence
  "00081080", // Admitting Diagnoses Description
  "00081084", // Admitting Diagnoses Code Sequence
  "00081120", // Referenced Patient Sequence
  "00082111", // Derivation Description
  "00089410", // Referenced Image Evidence Sequence comments
  "00089514", // Consulted Procedure Code
  "00100021", // Issuer of Patient ID
  "00100024", // Issuer of Patient ID Qualifiers
  "00100032", // Patient Birth Time
  "00100033", // Patient Birth Date in Alternative Calendar
  "00100050", // Patient Insurance Plan Code
  "00101000", // Other Patient IDs
  "00101001", // Other Patient Names
  "00101002", // Other Patient IDs Sequence
  "00101005", // Patient Birth Name
  "00101040", // Patient Address
  "00101050", // Insurance Plan Identification
  "00101060", // Patient Mother Birth Name
  "00101080", // Military Rank
  "00101081", // Branch of Service
  "00101090", // Medical Record Locator
  "00101100", // Referenced Patient Photo Sequence
  "00102000", // Medical Alerts
  "00102110", // Allergies
  "00102150", // Country of Residence
  "00102152", // Region of Residence
  "00102154", // Patient Telephone Numbers
  "00102155", // Patient Telecom Information
  "00102160", // Ethnic Group
  "00102180", // Occupation
  "001021A0", // Smoking Status
  "001021B0", // Additional Patient History
  "001021C0", // Pregnancy Status
  "001021D0", // Last Menstrual Date
  "001021F0", // Patient Religious Preference
  "00102201", // Patient Species Description
  "00102202", // Patient Species Code
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
  "00120071", // Clinical Trial Series ID
  "00120072", // Clinical Trial Series Description
  "00181000", // Device Serial Number
  "00181002", // Device UID
  "00181008", // Gantry ID
  "00181009", // Unique Device Identifier
  "0018100A", // UDI Sequence
  "0018100B", // Manufacturer Device Class UID
  "00181030", // Protocol Name
  "00183100", // Secondary Capture Device ID
  "0018700A", // Detector ID
  "0018700C", // Date of Last Detector Calibration
  "00200010", // Study ID
  "00204000", // Image Comments
  "00320012", // Study Priority ID
  "00320032", // Requesting Physician? Study Patient ID
  "00321032", // Requesting Physician
  "00321033", // Requesting Service
  "00380010", // Admission ID
  "00380014", // Issuer of Admission ID
  "00380016", // Route of Admissions
  "00380020", // Admitting Date
  "00380021", // Admitting Time
  "00380064", // Discharge Diagnosis
  "00400006", // Scheduled Performing Physician
  "00400007", // Scheduled Procedure Step Description
  "00400009", // Scheduled Procedure Step ID
  "00400011", // Scheduled Procedure Step Location
  "00401001", // Requested Procedure ID
  "00401002", // Reason for Requested Procedure
  "00401010", // Names of Intended Recipients of Results
  "00402001", // Reason for Requested Procedure
  "00402016", // Placer Order Number
  "00402017", // Filler Order Number
  "00700080", // Content Label
  "00700081", // Content Description
  "00700082", // Presentation Creation Date
  "00700083", // Presentation Creation Time
  "00700084", // Content Creator Name
  "04000561", // Original Attributes Sequence
]);

export function createAnonymizerSession() {
  return {
    uidMap: new Map(),
    patientId: null,
  };
}

function randomBytes(length) {
  const buf = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function randomHex(length) {
  return [...randomBytes(length)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random UID, not derived from the original value. */
function randomUid() {
  const n = BigInt(`0x${randomHex(16)}`);
  const uid = `${UID_ROOT}.${n.toString()}`;
  return uid.length <= 64 ? uid : `${UID_ROOT}.${n.toString().slice(0, 58)}`;
}

function randomPatientId() {
  return `ATVB-${randomHex(4).toUpperCase()}`;
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

/** Safe Harbor: keep year only. */
function yearOnlyDA(da) {
  const raw = String(da ?? "").replace(/\D/g, "");
  if (raw.length < 4) return "";
  const y = Number(raw.slice(0, 4));
  if (!y || y < 1900 || y > 2100) return "";
  return `${String(y).padStart(4, "0")}0101`;
}

function yearOnlyDT(dt) {
  const da = yearOnlyDA(String(dt ?? "").slice(0, 8));
  return da ? `${da}000000` : "";
}

/** Ages 90 and over become a single 90+ category. */
export function safeHarborAge(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([DWMY])?$/i);
  if (!match) return "";
  const n = Number(match[1]);
  const unit = (match[2] || "Y").toUpperCase();
  let years = n;
  if (unit === "M") years = n / 12;
  if (unit === "W") years = n / 52;
  if (unit === "D") years = n / 365.25;
  if (!Number.isFinite(years) || years < 0) return "";
  if (years >= 90) return "090Y";
  if (unit === "Y") return `${String(Math.floor(n)).padStart(3, "0")}Y`;
  return raw;
}

function setTag(dict, tag, vr, value) {
  dict[tag] = { vr, Value: Array.isArray(value) ? value : [value] };
}

function mappedUid(session, original) {
  const key = String(original || "");
  if (!key) return randomUid();
  if (session.uidMap.has(key)) return session.uidMap.get(key);
  const next = randomUid();
  session.uidMap.set(key, next);
  return next;
}

function ensurePatientIdentity(session) {
  if (!session.patientId) session.patientId = randomPatientId();
}

function isPixelDataTag(tag) {
  return tag === "7FE00010" || tag === "7FE00008" || tag === "7FE00009";
}

async function anonymizeDataset(dict, session) {
  if (!dict || typeof dict !== "object") return;

  ensurePatientIdentity(session);

  for (const tag of Object.keys(dict)) {
    if (KEEP_TAGS.has(tag) || isPixelDataTag(tag)) continue;
    const group = tagGroup(tag);
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

    if (vr === "PN") {
      setTag(dict, tag, "PN", "ANONYMIZED");
      continue;
    }

    if (vr === "UI" && !KEEP_UID_TAGS.has(tag)) {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      elem.Value = values.map((v) => mappedUid(session, v));
      delete elem._rawValue;
      continue;
    }

    if (vr === "DA") {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      const next = values.map((v) => yearOnlyDA(v)).filter(Boolean);
      if (!next.length) delete dict[tag];
      else {
        elem.Value = next;
        delete elem._rawValue;
      }
      continue;
    }

    if (vr === "DT" || tag === "0008002A") {
      const values = Array.isArray(elem.Value) ? elem.Value : [elem.Value];
      const next = values.map((v) => yearOnlyDT(v)).filter(Boolean);
      if (!next.length) delete dict[tag];
      else {
        elem.Value = next;
        delete elem._rawValue;
      }
      continue;
    }

    if (vr === "TM") {
      delete dict[tag];
      continue;
    }

    if (vr === "AS" || tag === "00101010") {
      const capped = safeHarborAge(firstValue(elem));
      if (!capped) delete dict[tag];
      else setTag(dict, tag, "AS", capped);
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
