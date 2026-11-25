// Paquet d'export : zip avec ui.json, schéma, guide, images PNG et icônes (PROTOTYPE).
import { createCustomWidgetFileText } from '../model/customWidgets.js';
import { createModuleScreen } from '../model/document.js';
import { applyModuleOverrides } from '../model/modules.js';
import { createZip } from '../utils/zip.js';
import { renderScreenPng } from './screenImage.js';

const DATA_FILES = { schema: './data/ui.schema.json', guide: './data/UISPEC_GUIDE.md' };
/** Plus grande image faisable sur iPad (pixels). */
const MAXIMUM_IMAGE_PIXELS = 16000000;
const PAUSE_INTERVAL_MS = 100;

/**
 * Lit un fichier texte fourni avec l'app.
 * @param {'schema'|'guide'} fileKey fichier
 * @returns {Promise<string|null>} texte, ou null s'il est inaccessible
 */
async function fetchDataText(fileKey) {
  try {
    const response = await fetch(DATA_FILES[fileKey]);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    return await response.text();
  } catch (error) {
    console.error(`fetchDataText (${fileKey})`, error);
    return null;
  }
}

/** @returns {Promise<{schemaText: string|null, guideText: string|null}>} fichiers joints */
export async function loadSpecFiles() {
  const [schemaText, guideText] = await Promise.all([fetchDataText('schema'), fetchDataText('guide')]);
  return { schemaText, guideText };
}

/**
 * Liste les images à fabriquer : écrans (par thème), puis modules et leurs états.
 * @param {object} uiDocument document
 * @param {boolean} areAllThemes vrai pour tous les thèmes des écrans
 * @returns {Array<{path: string, screen: object, themeId: string}>} images
 */
function listImages(uiDocument, areAllThemes) {
  const defaultThemeId = uiDocument.project.defaultTheme;
  const themeIds = areAllThemes ? Object.keys(uiDocument.themes) : [defaultThemeId];
  const images = uiDocument.screens.flatMap((screen) => themeIds.map((themeId) => (
    { path: `screens/${screen.id}${themeId === defaultThemeId ? '' : `_${themeId}`}.png`, screen, themeId })));
  for (const [moduleId, module] of Object.entries(uiDocument.modules)) {
    images.push({ path: `modules/${moduleId}.png`, screen: createModuleScreen(uiDocument, moduleId), themeId: defaultThemeId });
    for (const state of module.states ?? []) {
      const stateScreen = createModuleScreen(uiDocument, moduleId);
      const stateRoot = applyModuleOverrides(module.root, state.overrides);
      if (module.kind === 'area') stateScreen.root = stateRoot; else stateScreen.root.widgets = [stateRoot];
      images.push({ path: `modules/${moduleId}_${state.id}.png`, screen: stateScreen, themeId: defaultThemeId });
    }
  }
  return images;
}

/**
 * Fabrique le zip.
 * @param {object} uiDocument document (copie qui ne bouge pas pendant le travail)
 * @param {object} uiSpec spec exportée
 * @param {{schemaText: string|null, guideText: string|null}} specFiles fichiers joints
 * @param {{scale: number, areAllThemes: boolean, onProgress: (doneCount: number, totalCount: number) => void, isCancelled: () => boolean}} options réglages
 * @returns {Promise<{zipBlob: Blob, imageCount: number, problems: string[]}|null>} zip, ou null si annulé
 */
export async function buildSpecPackage(uiDocument, uiSpec, specFiles, options) {
  const problems = [];
  const files = [];
  const packagedSpec = { ...uiSpec, icons: {} };
  for (const [iconReference, icon] of Object.entries(uiSpec.icons)) {
    const iconPath = `assets/icons/${iconReference.replace(/[^\w-]+/g, '_')}.svg`;
    packagedSpec.icons[iconReference] = { ...icon, file: iconPath };
    files.push({ path: iconPath, content: icon.svg });
  }
  for (const [customWidgetId, definition] of Object.entries(uiDocument.customWidgets ?? {})) files.push({ path: `custom-widgets/${customWidgetId}.uimwidget`, content: createCustomWidgetFileText(definition) });
  files.unshift({ path: 'ui.json', content: JSON.stringify(packagedSpec, null, 2) });
  if (specFiles.schemaText) files.push({ path: 'ui.schema.json', content: specFiles.schemaText }); else problems.push('ui.schema.json absent (app hors ligne ?)');
  if (specFiles.guideText) files.push({ path: 'UISPEC_GUIDE.md', content: specFiles.guideText }); else problems.push('UISPEC_GUIDE.md absent (app hors ligne ?)');
  const images = listImages(uiDocument, options.areAllThemes);
  let imageCount = 0;
  let lastPauseAt = performance.now();
  for (const [imageIndex, image] of images.entries()) {
    if (options.isCancelled()) return null;
    options.onProgress(imageIndex, images.length);
    const { width, height } = image.screen.size;
    const scale = Math.min(options.scale, Math.sqrt(MAXIMUM_IMAGE_PIXELS / (width * height)));
    try {
      files.push({ path: image.path, content: await renderScreenPng(uiDocument, image.screen, image.themeId, scale) });
      imageCount += 1;
      if (scale < options.scale) problems.push(`${image.path} : réduit à ${scale.toFixed(2)}× (trop grand)`);
    } catch (error) {
      console.error(`buildSpecPackage (${image.path})`, error);
      problems.push(`${image.path} : image impossible (${error.message})`);
    }
    // Laisse la fenêtre se redessiner (barre de progression, bouton Annuler).
    if (performance.now() - lastPauseAt > PAUSE_INTERVAL_MS) {
      await new Promise((resolvePromise) => { setTimeout(resolvePromise, 0); });
      lastPauseAt = performance.now();
    }
  }
  options.onProgress(images.length, images.length);
  return { zipBlob: await createZip(files), imageCount, problems };
}
