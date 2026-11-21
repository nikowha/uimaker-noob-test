// Export et import du fichier « spec UI » (ui.json) — PROTOTYPE : JSON seul, pas encore de zip ni de PNG.
import { buildNodeIndex, cloneJson, computeNodePath, GENERATOR_NAME, normalizeImportedDocument } from '../model/document.js';
import { measureScreenFrames } from '../render/screenRenderer.js';
import { getIconExportEntry, loadIconLibrary } from '../render/iconLibrary.js';

/**
 * Cherche toutes les références d'icônes ("lucide:…") dans une valeur JSON.
 * @param {any} value valeur à parcourir
 * @param {Set<string>} iconReferences reçoit les références trouvées
 */
function collectIconReferences(value, iconReferences) {
  if (typeof value === 'string') { if (value.startsWith('lucide:')) iconReferences.add(value); return; }
  if (Array.isArray(value)) { value.forEach((item) => collectIconReferences(item, iconReferences)); return; }
  if (value && typeof value === 'object') Object.values(value).forEach((item) => collectIconReferences(item, iconReferences));
}

/**
 * Construit le contenu de ui.json : document + chemins + frames mesurées + icônes utilisées.
 * @param {object} uiDocument document
 * @returns {Promise<object>} spec UI prête à écrire
 */
export async function buildUiSpecExport(uiDocument) {
  await loadIconLibrary().catch(() => null);
  const exportedDocument = cloneJson(uiDocument);
  exportedDocument.generator = GENERATOR_NAME;
  exportedDocument.exportedAt = new Date().toISOString();
  const nodeIndex = buildNodeIndex(exportedDocument);
  const defaultThemeId = exportedDocument.project.defaultTheme;
  for (const screen of exportedDocument.screens) {
    const framesById = measureScreenFrames(uiDocument, uiDocument.screens.find((candidate) => candidate.id === screen.id), defaultThemeId);
    for (const record of nodeIndex.values()) {
      if (record.screen.id !== screen.id || record.kind === 'screen') continue;
      record.node.path = computeNodePath(nodeIndex, record.node.id);
      const frame = framesById.get(record.node.id);
      if (frame) record.node.frame = frame;
    }
  }
  const iconReferences = new Set();
  collectIconReferences(exportedDocument.screens, iconReferences);
  collectIconReferences(exportedDocument.components, iconReferences);
  collectIconReferences(exportedDocument.menus, iconReferences);
  exportedDocument.icons = {};
  for (const iconReference of [...iconReferences].sort()) {
    const iconEntry = getIconExportEntry(iconReference);
    if (iconEntry) exportedDocument.icons[iconReference] = iconEntry;
  }
  return exportedDocument;
}

/**
 * Lit un texte JSON importé et renvoie un document utilisable.
 * @param {string} importedText contenu du fichier
 * @returns {object} document
 * @throws {Error} si le JSON est invalide ou n'est pas une spec UI
 */
export function parseUiSpecImport(importedText) {
  let importedValue;
  try {
    importedValue = JSON.parse(importedText);
  } catch (error) {
    throw new Error(`JSON illisible : ${error.message}`);
  }
  return normalizeImportedDocument(importedValue);
}
