// Mode test : l'UI dessinée en plein écran, manipulable comme une vraie app (PROTOTYPE).
// Travaille sur une COPIE du document : rien de ce qu'on fait ici ne modifie le projet.
import { createElement } from '../utils/dom.js';
import { appState } from '../model/store.js';
import { buildNodeIndex, cloneJson } from '../model/document.js';
import { renderScreen } from '../render/screenRenderer.js';
import { createSelectElement } from './fields.js';

const TEST_MARGIN_PIXELS = 32;
const MINIMUM_TEST_SCREEN_SIZE = 160;
const MINIMUM_AREA_SIZE = 24;
const TOAST_DURATION_MS = 1800;
const DESKTOP_PLATFORMS = new Set(['windows', 'macos', 'linux', 'web', 'any']);

/** État du mode test (null quand il est fermé). */
let testSession = null;

/**
 * Renvoie l'écran testé dans la copie du document.
 * @returns {object} écran
 */
function getTestScreen() {
  return testSession.testDocument.screens.find((screen) => screen.id === testSession.screenId);
}

/**
 * Affiche un court message en bas du mode test.
 * @param {string} messageText texte
 */
function showToast(messageText) {
  testSession.toastElement.textContent = messageText;
  testSession.toastElement.classList.add('is-visible');
  clearTimeout(testSession.toastTimer);
  testSession.toastTimer = setTimeout(() => testSession?.toastElement.classList.remove('is-visible'), TOAST_DURATION_MS);
}

/**
 * Calcule l'échelle pour que l'écran tienne dans la zone de test (jamais au-delà de 1).
 * @returns {number} échelle
 */
function computeFitScale() {
  const screen = getTestScreen();
  const viewportRectangle = testSession.viewportElement.getBoundingClientRect();
  return Math.min(1, (viewportRectangle.width - TEST_MARGIN_PIXELS * 2) / screen.size.width, (viewportRectangle.height - TEST_MARGIN_PIXELS * 2) / screen.size.height);
}

/**
 * Redessine l'écran testé.
 * @param {{keepScale?: boolean}} [renderOptions] garder l'échelle actuelle (pendant un redimensionnement)
 */
function renderTestScreen(renderOptions = {}) {
  const screen = getTestScreen();
  if (!renderOptions.keepScale) testSession.scale = computeFitScale();
  const screenElement = renderScreen(testSession.testDocument, screen, {
    themeId: testSession.themeId, isEditor: false, areIdsVisible: false, selectedId: null,
  });
  const resizeCorner = DESKTOP_PLATFORMS.has(screen.platform)
    ? createElement('div', { className: 'test-resize-corner', attributes: { title: 'Glisser pour redimensionner la fenêtre' } })
    : null;
  testSession.frameElement.replaceChildren(screenElement, ...(resizeCorner ? [resizeCorner] : []));
  testSession.frameElement.style.width = `${screen.size.width}px`;
  testSession.frameElement.style.height = `${screen.size.height}px`;
  testSession.frameElement.style.transform = `scale(${testSession.scale})`;
  testSession.sizeLabel.textContent = `${screen.name} — ${Math.round(screen.size.width)}×${Math.round(screen.size.height)}${testSession.scale < 1 ? ` (affiché à ${Math.round(testSession.scale * 100)} %)` : ''}`;
}

/**
 * Trouve le widget de la copie sous un élément touché.
 * @param {EventTarget} eventTarget cible
 * @returns {{widget: object, widgetElement: HTMLElement}|null} widget
 */
function findTestWidget(eventTarget) {
  const widgetElement = eventTarget instanceof Element ? eventTarget.closest('.ui-widget[data-node-id]') : null;
  if (!widgetElement) return null;
  const record = buildNodeIndex(testSession.testDocument).get(widgetElement.dataset.nodeId);
  if (!record || record.node.state?.enabled === false) return null;
  return { widget: record.node, widgetElement };
}

/**
 * Exécute l'action d'un bouton.
 * @param {object} widget bouton
 */
function runButtonAction(widget) {
  const action = widget.action ?? { type: 'none' };
  if (action.type === 'navigate' && testSession.testDocument.screens.some((screen) => screen.id === action.target)) {
    testSession.screenId = action.target;
    renderTestScreen();
    renderTestToolbar();
    return;
  }
  if (action.type === 'custom') showToast(`${widget.name} : ${action.description || 'action perso'}`);
  else showToast(`${widget.name} (aucune action)`);
}

/**
 * Index de l'élément touché parmi ses semblables (onglet, ligne de liste, ligne de tableau).
 * @param {EventTarget} eventTarget cible
 * @param {string} itemSelector sélecteur des éléments
 * @param {string} [excludedSelector] éléments à ne pas compter (ex. en-tête)
 * @returns {number} index, -1 si aucun
 */
function findItemIndex(eventTarget, itemSelector, excludedSelector) {
  const itemElement = eventTarget.closest(itemSelector);
  if (!itemElement || (excludedSelector && itemElement.matches(excludedSelector))) return -1;
  const siblingItems = [...itemElement.parentElement.querySelectorAll(`:scope > ${itemSelector}`)]
    .filter((siblingElement) => !excludedSelector || !siblingElement.matches(excludedSelector));
  return siblingItems.indexOf(itemElement);
}

/**
 * Change la valeur d'un curseur selon la position du pointeur.
 * @param {object} widget curseur
 * @param {HTMLElement} widgetElement élément du curseur
 * @param {PointerEvent} pointerEvent événement
 */
function updateSliderFromPointer(widget, widgetElement, pointerEvent) {
  const trackElement = widgetElement.querySelector('.uiw-slider-track');
  if (!trackElement) return;
  const trackRectangle = trackElement.getBoundingClientRect();
  const { min = 0, max = 100, step = 1, orientation } = widget.content ?? {};
  const ratio = orientation === 'vertical'
    ? (trackRectangle.bottom - pointerEvent.clientY) / trackRectangle.height
    : (pointerEvent.clientX - trackRectangle.left) / trackRectangle.width;
  const rawValue = min + Math.max(0, Math.min(1, ratio)) * (max - min);
  widget.content.value = Math.round(rawValue / (step || 1)) * (step || 1);
  renderTestScreen({ keepScale: true });
}

/**
 * Ouvre une liste de choix sous une liste déroulante.
 * @param {object} widget liste déroulante
 * @param {HTMLElement} widgetElement élément
 */
function openDropdownMenu(widget, widgetElement) {
  const widgetRectangle = widgetElement.getBoundingClientRect();
  const menuElement = createElement('div', { className: 'test-dropdown-menu',
    style: { left: `${widgetRectangle.left}px`, top: `${widgetRectangle.bottom + 2}px`, minWidth: `${widgetRectangle.width}px` } },
  (widget.content?.options ?? []).map((optionText, optionIndex) => createElement('button', {
    className: optionIndex === widget.content.selectedIndex ? 'is-active' : '', text: optionText, attributes: { type: 'button' },
    on: { click: () => { widget.content.selectedIndex = optionIndex; menuElement.remove(); renderTestScreen({ keepScale: true }); } },
  })));
  const closeMenu = (pointerEvent) => {
    if (menuElement.contains(pointerEvent.target)) return;
    menuElement.remove();
    window.removeEventListener('pointerdown', closeMenu, true);
  };
  window.addEventListener('pointerdown', closeMenu, true);
  testSession.overlayElement.append(menuElement);
}

/**
 * Remplace le texte d'un champ par un vrai champ de saisie (le clavier iPad s'ouvre).
 * @param {object} widget champ texte
 * @param {HTMLElement} widgetElement élément
 */
function startTextEditing(widget, widgetElement) {
  const inputElement = createElement('input', {
    className: 'test-text-input',
    attributes: { type: widget.content?.inputKind === 'password' ? 'password' : 'text', placeholder: widget.content?.placeholder ?? '' },
    on: {
      input: () => { widget.content.value = inputElement.value; },
      blur: () => renderTestScreen({ keepScale: true }),
      keydown: (keyboardEvent) => { if (keyboardEvent.key === 'Enter') inputElement.blur(); },
    },
  });
  inputElement.value = widget.content?.value ?? '';
  widgetElement.replaceChildren(inputElement);
  inputElement.focus();
}

/**
 * Gère un appui sur l'UI testée (widgets, séparateurs, coin de redimensionnement).
 * @param {PointerEvent} pointerEvent événement
 */
function handleTestPointerDown(pointerEvent) {
  const eventTarget = pointerEvent.target;
  if (!(eventTarget instanceof Element)) return;
  if (eventTarget.closest('.test-text-input')) return;
  if (eventTarget.closest('.test-resize-corner')) { startWindowResize(pointerEvent); return; }
  const splitterElement = eventTarget.closest('.ui-splitter.is-resizable');
  if (splitterElement) { startSplitterDrag(splitterElement, pointerEvent); return; }
  const hit = findTestWidget(eventTarget);
  if (!hit) return;
  const { widget, widgetElement } = hit;
  switch (widget.type) {
    case 'button': widgetElement.classList.add('is-pressed'); break;
    case 'checkbox': widget.state = { ...widget.state, checked: !widget.state?.checked }; renderTestScreen({ keepScale: true }); break;
    case 'toggle': widget.state = { ...widget.state, on: !widget.state?.on }; renderTestScreen({ keepScale: true }); break;
    case 'slider': startSliderDrag(widget, widgetElement, pointerEvent); break;
    case 'dropdown': pointerEvent.preventDefault(); openDropdownMenu(widget, widgetElement); break;
    case 'textField': pointerEvent.preventDefault(); startTextEditing(widget, widgetElement); break;
    case 'tabs': selectItem(widget, 'selectedIndex', findItemIndex(eventTarget, '.uiw-tab')); break;
    case 'list': selectItem(widget, 'selectedIndex', findItemIndex(eventTarget, '.uiw-list-item')); break;
    case 'table': selectItem(widget, 'selectedRow', findItemIndex(eventTarget, '.uiw-table-row', '.is-header')); break;
    default: break;
  }
}

/**
 * Sélectionne un élément d'une liste / d'onglets / d'un tableau.
 * @param {object} widget widget
 * @param {string} contentKey clé de l'index dans content
 * @param {number} itemIndex index touché
 */
function selectItem(widget, contentKey, itemIndex) {
  if (itemIndex < 0) return;
  widget.content[contentKey] = itemIndex;
  renderTestScreen({ keepScale: true });
}

/**
 * Relâchement : un bouton appuyé déclenche son action.
 * @param {PointerEvent} pointerEvent événement
 */
function handleTestPointerUp(pointerEvent) {
  const pressedElement = testSession.frameElement.querySelector('.ui-widget.is-pressed');
  if (!pressedElement) return;
  pressedElement.classList.remove('is-pressed');
  const hit = findTestWidget(pointerEvent.target);
  if (hit && hit.widgetElement === pressedElement) runButtonAction(hit.widget);
}

/**
 * Suit un geste jusqu'au relâchement.
 * @param {PointerEvent} startEvent pointerdown
 * @param {(moveEvent: PointerEvent) => void} onMove à chaque mouvement
 * @param {() => void} [onEnd] à la fin
 */
function trackPointer(startEvent, onMove, onEnd) {
  startEvent.preventDefault();
  const handleMove = (moveEvent) => { if (moveEvent.pointerId === startEvent.pointerId) onMove(moveEvent); };
  const handleEnd = (endEvent) => {
    if (endEvent.pointerId !== startEvent.pointerId) return;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleEnd);
    window.removeEventListener('pointercancel', handleEnd);
    onEnd?.();
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleEnd);
  window.addEventListener('pointercancel', handleEnd);
}

/**
 * Glisser sur un curseur.
 * @param {object} widget curseur
 * @param {HTMLElement} widgetElement élément
 * @param {PointerEvent} startEvent pointerdown
 */
function startSliderDrag(widget, widgetElement, startEvent) {
  const widgetId = widget.id;
  updateSliderFromPointer(widget, widgetElement, startEvent);
  trackPointer(startEvent, (moveEvent) => {
    const currentElement = testSession.frameElement.querySelector(`[data-node-id="${widgetId}"]`);
    if (currentElement) updateSliderFromPointer(widget, currentElement, moveEvent);
  });
}

/**
 * Glisser un séparateur déplaçable (respecte min / max de l'area).
 * @param {HTMLElement} splitterElement séparateur
 * @param {PointerEvent} startEvent pointerdown
 */
function startSplitterDrag(splitterElement, startEvent) {
  const isHorizontal = splitterElement.classList.contains('is-horizontal');
  const parentArea = buildNodeIndex(testSession.testDocument).get(splitterElement.dataset.splitParentId)?.node;
  const previousIndex = Number(splitterElement.dataset.previousIndex);
  const previousArea = parentArea?.children[previousIndex];
  const nextArea = parentArea?.children[previousIndex + 1];
  if (!previousArea || !nextArea) return;
  const previousRectangle = splitterElement.previousElementSibling.getBoundingClientRect();
  const nextRectangle = splitterElement.nextElementSibling.getBoundingClientRect();
  const parentRectangle = splitterElement.parentElement.getBoundingClientRect();
  const scale = testSession.scale;
  const previousStartSize = (isHorizontal ? previousRectangle.width : previousRectangle.height) / scale;
  const nextStartSize = (isHorizontal ? nextRectangle.width : nextRectangle.height) / scale;
  const parentSize = (isHorizontal ? parentRectangle.width : parentRectangle.height) / scale;
  const startCoordinate = isHorizontal ? startEvent.clientX : startEvent.clientY;
  trackPointer(startEvent, (moveEvent) => {
    const coordinate = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
    let newSize = previousStartSize + (coordinate - startCoordinate) / scale;
    newSize = Math.max(MINIMUM_AREA_SIZE, Math.min(newSize, previousStartSize + nextStartSize - MINIMUM_AREA_SIZE));
    const sizing = previousArea.sizing ?? { mode: 'fill' };
    if (typeof sizing.min === 'number') newSize = Math.max(sizing.min, newSize);
    if (typeof sizing.max === 'number') newSize = Math.min(sizing.max, newSize);
    if (sizing.mode === 'proportional') previousArea.sizing = { ...sizing, ratio: newSize / parentSize };
    else if (sizing.mode === 'fixed') previousArea.sizing = { ...sizing, size: newSize };
    else if (nextArea.sizing?.mode === 'fixed') nextArea.sizing = { ...nextArea.sizing, size: nextStartSize - (newSize - previousStartSize) };
    else previousArea.sizing = { ...sizing, mode: 'fixed', size: newSize };
    renderTestScreen({ keepScale: true });
  });
}

/**
 * Redimensionner la fenêtre testée (écrans de bureau) par le coin bas-droit.
 * @param {PointerEvent} startEvent pointerdown
 */
function startWindowResize(startEvent) {
  const screen = getTestScreen();
  const startWidth = screen.size.width;
  const startHeight = screen.size.height;
  const scale = testSession.scale;
  trackPointer(startEvent, (moveEvent) => {
    screen.size = {
      width: Math.max(MINIMUM_TEST_SCREEN_SIZE, Math.round(startWidth + (2 * (moveEvent.clientX - startEvent.clientX)) / scale)),
      height: Math.max(MINIMUM_TEST_SCREEN_SIZE, Math.round(startHeight + (2 * (moveEvent.clientY - startEvent.clientY)) / scale)),
    };
    renderTestScreen({ keepScale: true });
  }, () => renderTestScreen());
}

/** Pivote l'écran testé (portrait ↔ paysage). */
function rotateTestScreen() {
  const screen = getTestScreen();
  screen.size = { width: screen.size.height, height: screen.size.width };
  renderTestScreen();
}

/** Remet l'écran testé dans son état d'origine (copie fraîche du projet). */
function resetTestScreen() {
  testSession.testDocument = cloneJson(appState.uiDocument);
  renderTestScreen();
  renderTestToolbar();
  showToast('État de départ rétabli');
}

/** Redessine la barre du mode test. */
function renderTestToolbar() {
  const { testDocument } = testSession;
  const screen = getTestScreen();
  const createButton = (buttonLabel, buttonTitle, onClick) => createElement('button', { text: buttonLabel, attributes: { type: 'button', title: buttonTitle }, on: { click: onClick } });
  testSession.toolbarElement.replaceChildren(...[
    createElement('span', { className: 'test-title', text: '▶ Test de l\'UI' }),
    createSelectElement(testSession.screenId, testDocument.screens.map((candidate) => ({ value: candidate.id, label: `${candidate.id} · ${candidate.name}` })),
      (screenId) => { testSession.screenId = screenId; renderTestScreen(); renderTestToolbar(); }),
    createSelectElement(testSession.themeId, Object.entries(testDocument.themes).map(([themeId, theme]) => ({ value: themeId, label: `Thème : ${theme.name}` })),
      (themeId) => { testSession.themeId = themeId; renderTestScreen({ keepScale: true }); }),
    DESKTOP_PLATFORMS.has(screen.platform) ? null : createButton('⟳ Pivoter', 'Portrait ↔ paysage', rotateTestScreen),
    createButton('↺ Réinitialiser', 'Revenir à l\'état de départ', resetTestScreen),
    testSession.sizeLabel,
    createElement('span', { className: 'top-spacer' }),
    createButton('Quitter (Échap)', 'Revenir à l\'édition', closeTestMode),
  ].filter(Boolean));
}

/**
 * Échap ferme le mode test (sauf pendant une saisie).
 * @param {KeyboardEvent} keyboardEvent événement
 */
function handleTestKeyDown(keyboardEvent) {
  if (keyboardEvent.target instanceof Element && keyboardEvent.target.closest('.test-text-input')) return;
  keyboardEvent.stopImmediatePropagation();
  if (keyboardEvent.key === 'Escape') closeTestMode();
}

/** Ouvre le mode test sur l'écran courant. */
export function openTestMode() {
  if (testSession) return;
  const viewportElement = createElement('div', { className: 'test-viewport' });
  const frameElement = createElement('div', { className: 'test-frame' });
  viewportElement.append(frameElement);
  const toolbarElement = createElement('div', { className: 'test-toolbar' });
  const toastElement = createElement('div', { className: 'test-toast' });
  const overlayElement = createElement('div', { className: 'test-mode' }, [toolbarElement, viewportElement, toastElement]);
  testSession = {
    testDocument: cloneJson(appState.uiDocument), screenId: appState.currentScreenId, themeId: appState.currentThemeId,
    scale: 1, overlayElement, viewportElement, frameElement, toolbarElement, toastElement,
    sizeLabel: createElement('span', { className: 'test-size-label' }), toastTimer: null,
    resizeObserver: new ResizeObserver(() => renderTestScreen()),
  };
  frameElement.addEventListener('pointerdown', handleTestPointerDown);
  window.addEventListener('pointerup', handleTestPointerUp);
  window.addEventListener('keydown', handleTestKeyDown, true);
  document.body.append(overlayElement);
  renderTestToolbar();
  renderTestScreen();
  testSession.resizeObserver.observe(viewportElement);
}

/** Ferme le mode test (la copie est jetée, le projet n'a pas changé). */
export function closeTestMode() {
  if (!testSession) return;
  testSession.resizeObserver.disconnect();
  window.removeEventListener('pointerup', handleTestPointerUp);
  window.removeEventListener('keydown', handleTestKeyDown, true);
  clearTimeout(testSession.toastTimer);
  testSession.overlayElement.remove();
  testSession = null;
}
