// Écriture (sans compression) et lecture de fichiers zip, sans dépendance (PROTOTYPE).

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const ZIP_VERSION = 20;
const UTF8_FLAG = 0x0800;

const crcTable = Uint32Array.from({ length: 256 }, (unused, byteValue) => {
  let crc = byteValue;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc;
});

/**
 * Calcule la somme de contrôle CRC-32.
 * @param {Uint8Array} bytes données
 * @returns {number} somme
 */
function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byteValue of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byteValue) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Écrit les champs communs aux deux en-têtes d'un fichier.
 * @param {DataView} view en-tête
 * @param {number} offset position du champ « version nécessaire »
 * @param {object} entry fichier
 */
function writeSharedFields(view, offset, entry) {
  view.setUint16(offset, ZIP_VERSION, true);
  view.setUint16(offset + 2, UTF8_FLAG, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, entry.dosTime, true);
  view.setUint16(offset + 8, entry.dosDate, true);
  view.setUint32(offset + 10, entry.crc, true);
  view.setUint32(offset + 14, entry.bytes.length, true);
  view.setUint32(offset + 18, entry.bytes.length, true);
  view.setUint16(offset + 22, entry.nameBytes.length, true);
}

/**
 * Fabrique un zip.
 * @param {Array<{path: string, content: string|Blob}>} files fichiers
 * @returns {Promise<Blob>} zip
 */
export async function createZip(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await new Blob([file.content]).arrayBuffer());
    const entry = { bytes, nameBytes: new TextEncoder().encode(file.path), crc: computeCrc32(bytes), dosTime, dosDate };
    const localHeader = new DataView(new ArrayBuffer(LOCAL_HEADER_SIZE));
    localHeader.setUint32(0, 0x04034b50, true);
    writeSharedFields(localHeader, 4, entry);
    const centralHeader = new DataView(new ArrayBuffer(CENTRAL_HEADER_SIZE));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, ZIP_VERSION, true);
    writeSharedFields(centralHeader, 6, entry);
    centralHeader.setUint32(42, offset, true);
    parts.push(localHeader, entry.nameBytes, bytes);
    centralParts.push(centralHeader, entry.nameBytes);
    offset += LOCAL_HEADER_SIZE + entry.nameBytes.length + bytes.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const endRecord = new DataView(new ArrayBuffer(END_RECORD_SIZE));
  endRecord.setUint32(0, 0x06054b50, true);
  endRecord.setUint16(8, files.length, true);
  endRecord.setUint16(10, files.length, true);
  endRecord.setUint32(12, centralSize, true);
  endRecord.setUint32(16, offset, true);
  return new Blob([...parts, ...centralParts, endRecord], { type: 'application/zip' });
}

/**
 * Indique si des données sont un zip.
 * @param {Uint8Array} bytes données
 * @returns {boolean} vrai pour un zip
 */
export function isZipBytes(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

/**
 * Lit un fichier d'un zip (stocké ou compressé).
 * @param {Uint8Array} bytes zip
 * @param {(path: string) => boolean} isWanted choisit le fichier (le premier trouvé)
 * @returns {Promise<Uint8Array|null>} contenu, ou null si absent
 */
export async function readZipFile(bytes, isWanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = bytes.length - END_RECORD_SIZE;
  while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) endOffset -= 1;
  if (endOffset < 0) throw new Error('zip abîmé');
  let offset = view.getUint32(endOffset + 16, true);
  for (let fileIndex = view.getUint16(endOffset + 10, true); fileIndex > 0; fileIndex -= 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('zip abîmé');
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(offset + CENTRAL_HEADER_SIZE, offset + CENTRAL_HEADER_SIZE + nameLength));
    if (isWanted(path)) {
      const start = localOffset + LOCAL_HEADER_SIZE + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const content = bytes.subarray(start, start + size);
      if (method === 0) return content;
      if (method !== 8) throw new Error('compression du zip non prise en charge');
      const inflatedStream = new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(inflatedStream).arrayBuffer());
    }
    offset += CENTRAL_HEADER_SIZE + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return null;
}
