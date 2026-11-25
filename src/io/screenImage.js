// Image PNG d'un écran : le rendu HTML est placé dans un SVG (foreignObject), puis dessiné sur un canvas (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { renderScreen } from '../render/screenRenderer.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** @returns {string} règles CSS de l'application */
function collectStyleText() {
  return [...document.styleSheets].map((styleSheet) => {
    try { return [...styleSheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch (error) { console.warn('collectStyleText', error); return ''; }
  }).join('\n');
}

/**
 * Recopie en attributs ce que l'utilisateur ne voit que dans les propriétés (valeur, case cochée, choix).
 * @param {HTMLElement} rootElement rendu
 */
function writeFormValues(rootElement) {
  for (const inputElement of rootElement.querySelectorAll('input')) {
    inputElement.setAttribute('value', inputElement.value);
    inputElement.toggleAttribute('checked', inputElement.checked);
  }
  for (const textElement of rootElement.querySelectorAll('textarea')) textElement.textContent = textElement.value;
  for (const optionElement of rootElement.querySelectorAll('option')) optionElement.toggleAttribute('selected', optionElement.selected);
}

/**
 * Rend un écran en SVG autonome.
 * @param {object} uiDocument document
 * @param {object} screen écran
 * @param {string} themeId thème
 * @param {number} scale échelle de l'image
 * @returns {string} texte SVG
 */
function buildScreenSvg(uiDocument, screen, themeId, scale) {
  const { width, height } = screen.size;
  const screenElement = renderScreen(uiDocument, screen, { themeId, isEditor: false, areIdsVisible: false, selectedId: null });
  screenElement.style.boxShadow = 'none';
  const hostElement = createElement('div', { style: { position: 'fixed', left: '-100000px', top: '0' } }, [screenElement]);
  document.body.append(hostElement);
  writeFormValues(screenElement);
  hostElement.remove();
  const bodyStyle = getComputedStyle(document.body);
  const pageElement = createElement('div', { style: { width: `${width}px`, height: `${height}px`, overflow: 'hidden', font: bodyStyle.font, color: bodyStyle.color } }, [
    createElement('style', { text: collectStyleText() }), screenElement]);
  pageElement.setAttribute('xmlns', XHTML_NAMESPACE);
  const svgElement = document.createElementNS(SVG_NAMESPACE, 'svg');
  svgElement.setAttribute('width', String(Math.round(width * scale)));
  svgElement.setAttribute('height', String(Math.round(height * scale)));
  svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const foreignElement = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  foreignElement.setAttribute('width', '100%');
  foreignElement.setAttribute('height', '100%');
  foreignElement.append(pageElement);
  svgElement.append(foreignElement);
  return new XMLSerializer().serializeToString(svgElement);
}

/**
 * Fabrique l'image PNG d'un écran.
 * @param {object} uiDocument document
 * @param {object} screen écran
 * @param {string} themeId thème
 * @param {number} [scale] échelle (1 = un pixel par point)
 * @returns {Promise<Blob>} image PNG
 */
export async function renderScreenPng(uiDocument, screen, themeId, scale = 1) {
  const svgText = buildScreenSvg(uiDocument, screen, themeId, scale);
  const image = new Image();
  // Une URL « data: » ne bloque pas la lecture du canvas (une URL de fichier, si).
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await image.decode();
  const canvas = createElement('canvas');
  canvas.width = Math.round(screen.size.width * scale);
  canvas.height = Math.round(screen.size.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const pngBlob = await new Promise((resolvePromise) => { canvas.toBlob(resolvePromise, 'image/png'); });
  canvas.width = 0;
  canvas.height = 0;
  if (!pngBlob) throw new Error(`image impossible pour ${screen.id}`);
  return pngBlob;
}
