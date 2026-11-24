// Mode test : l'UI dessinée en plein écran, manipulable comme une vraie app (PROTOTYPE).
// Travaille sur une COPIE du document : rien de ce qu'on fait ici ne modifie le projet.
// Gestes : souris (clic, double clic, clic droit, milieu, survol, molette), doigt (tap, double tap, appui long),
// Pencil (tap ; ou « souris simulée » réglable), double tap / squeeze du Pencil simulés par des boutons.
import { createElement } from '../utils/dom.js';
import { appSettings, appState, updateAppSetting } from '../model/store.js';
import { buildNodeIndex, cloneJson } from '../model/document.js';
import { expandAllModuleInstances } from '../model/modules.js';
import { computeVariableChange, convertVariableValue } from '../model/variables.js';
import { getTriggerFallbacks } from '../model/interactions.js';
import { renderScreen } from '../render/screenRenderer.js';
import { createSelectElement } from './fields.js';
import {
  closeAllMenus, getOpenMenuBarId, getOpenMenuBarLabel, isAnyMenuOpen, isInsideMenu, openMenuAt, openMenuBarMenu, setMenuLayer,
} from './testMenus.js';

const TEST_MARGIN_PIXELS = 32;
const DIALOG_MARGIN_PIXELS = 48;
const MINIMUM_TEST_SCREEN_SIZE = 160;
const MINIMUM_AREA_SIZE = 24;
const TOAST_DURATION_MS = 1800;
const TAP_MOVE_TOLERANCE_PIXELS = 10;
const WHEEL_THROTTLE_MS = 300;
const DESKTOP_PLATFORMS = new Set(['windows', 'macos', 'linux', 'web', 'any']);
const CLICK_LIKE_GESTURES = new Set(['click', 'tap', 'pencilTap']);
const GESTURE_LABELS = {
  click: 'Clic', doubleClick: 'Double clic', rightClick: 'Clic droit', middleClick: 'Clic du milieu', tap: 'Tap', doubleTap: 'Double tap',
  longPress: 'Appui long', pencilTap: 'Tap du Pencil', pencilDoubleTap: 'Double tap du Pencil', pencilSqueeze: 'Squeeze du Pencil',
  wheel: 'Molette', keyShortcut: 'Raccourci',
};

/** État du mode test (null quand il est fermé). */
let testSession = null;

// ---------------------------------------------------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Renvoie un écran de la copie du document.
 * @param {string} screenId écran
 * @returns {object|undefined} écran
 */
function getTestScreenById(screenId) {
  return testSession.testDocument.screens.find((screen) => screen.id === screenId);
}

/** @returns {object} écran principal testé */
function getMainScreen() {
  return getTestScreenById(testSession.screenId);
}

/** @returns {string} écran au premier plan (dernier dialogue ouvert, sinon l'écran principal) */
function getTopScreenId() {
  return testSession.dialogStack[testSession.dialogStack.length - 1] ?? testSession.screenId;
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
 * Échelle pour qu'un écran tienne dans la zone de test (jamais au-delà de 1).
 * @param {object} screen écran
 * @param {number} marginPixels marge autour
 * @returns {number} échelle
 */
function computeFitScale(screen, marginPixels) {
  const viewportRectangle = testSession.viewportElement.getBoundingClientRect();
  return Math.min(1, (viewportRectangle.width - marginPixels * 2) / screen.size.width, (viewportRectangle.height - marginPixels * 2) / screen.size.height);
}

/**
 * Crée la surface d'un écran (rendu + taille + échelle).
 * @param {object} screen écran
 * @param {number} scale échelle
 * @param {boolean} hasResizeCorner vrai pour la fenêtre principale d'un écran de bureau
 * @returns {HTMLElement} surface
 */
function createScreenSurface(screen, scale, hasResizeCorner) {
  const screenElement = renderScreen(testSession.testDocument, screen, { themeId: testSession.themeId, isEditor: false, areIdsVisible: false, selectedId: null });
  const surfaceElement = createElement('div', { className: 'test-frame', dataset: { screenId: screen.id, scale: String(scale) },
    style: { width: `${screen.size.width}px`, height: `${screen.size.height}px`, transform: `scale(${scale})` } },
  [screenElement, hasResizeCorner ? createElement('div', { className: 'test-resize-corner', attributes: { title: 'Glisser pour redimensionner la fenêtre' } }) : null]);
  return surfaceElement;
}

/**
 * Redessine l'écran principal et les dialogues ouverts.
 * @param {{keepScale?: boolean}} [renderOptions] garder l'échelle de l'écran principal (pendant un redimensionnement)
 */
function renderTestScreens(renderOptions = {}) {
  const mainScreen = getMainScreen();
  if (!renderOptions.keepScale) testSession.scale = computeFitScale(mainScreen, TEST_MARGIN_PIXELS);
  const surfaces = [createScreenSurface(mainScreen, testSession.scale, DESKTOP_PLATFORMS.has(mainScreen.platform))];
  for (const dialogScreenId of testSession.dialogStack) {
    const dialogScreen = getTestScreenById(dialogScreenId);
    if (!dialogScreen) continue;
    surfaces.push(createElement('div', { className: 'test-dialog-backdrop' }, [createScreenSurface(dialogScreen, computeFitScale(dialogScreen, DIALOG_MARGIN_PIXELS), false)]));
  }
  testSession.viewportElement.replaceChildren(...surfaces);
  testSession.sizeLabel.textContent = `${mainScreen.name} — ${Math.round(mainScreen.size.width)}×${Math.round(mainScreen.size.height)}`
    + `${testSession.scale < 1 ? ` (affiché à ${Math.round(testSession.scale * 100)} %)` : ''}`
    + `${testSession.dialogStack.length ? ` · dialogue : ${testSession.dialogStack.join(' › ')}` : ''}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Événements et actions
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Liste les nœuds touchés, du plus précis au plus large : widget(s), area(s), puis l'écran.
 * @param {EventTarget} eventTarget cible
 * @returns {{nodes: object[], screenId: string|null}} nœuds de la copie du document
 */
function collectNodeChain(eventTarget) {
  const surfaceElement = eventTarget instanceof Element ? eventTarget.closest('.test-frame') : null;
  if (!surfaceElement) return { nodes: [], screenId: null };
  const nodeIndex = buildNodeIndex(testSession.testDocument);
  const nodes = [];
  let nodeElement = eventTarget.closest('[data-node-id]');
  while (nodeElement && surfaceElement.contains(nodeElement)) {
    const record = nodeIndex.get(nodeElement.dataset.nodeId);
    if (record) nodes.push(record.node);
    nodeElement = nodeElement.parentElement?.closest('[data-node-id]');
  }
  const screen = getTestScreenById(surfaceElement.dataset.screenId);
  if (screen) nodes.push(screen);
  return { nodes, screenId: surfaceElement.dataset.screenId };
}

/**
 * Cherche l'action à lancer pour un geste : premier nœud (du plus précis au plus large) qui a un événement
 * correspondant. L'ancien champ « action » d'un widget compte comme événement « click ».
 * @param {object[]} nodes nœuds touchés
 * @param {string} gesture geste
 * @returns {{action: object, node: object}|null} action trouvée
 */
function findEventAction(nodes, gesture) {
  const triggers = getTriggerFallbacks(gesture);
  for (const node of nodes) {
    if (node.state?.enabled === false) return null;
    for (const trigger of triggers) {
      const nodeEvent = (node.events ?? []).find((candidate) => candidate.trigger === trigger && candidate.action?.type !== 'none');
      if (nodeEvent) return { action: nodeEvent.action, node };
      if (trigger === 'click' && node.action && node.action.type !== 'none') return { action: node.action, node };
    }
  }
  return null;
}

/**
 * Lance une action du mode test.
 * @param {object} action action { type, target, menuId, page, description }
 * @param {{clientX: number, clientY: number, sourceName: string}} actionContext position (menus contextuels) et nom de la source
 */
function runAction(action, actionContext) {
  const nodeIndex = buildNodeIndex(testSession.testDocument);
  switch (action.type) {
    case 'navigate':
      if (!getTestScreenById(action.target)) { showToast(`Écran ${action.target || '?'} introuvable`); return; }
      testSession.screenId = action.target;
      testSession.dialogStack = [];
      renderTestScreens();
      renderTestToolbar();
      return;
    case 'openDialog':
      if (!getTestScreenById(action.target)) { showToast(`Écran ${action.target || '?'} introuvable`); return; }
      testSession.dialogStack.push(action.target);
      renderTestScreens({ keepScale: true });
      return;
    case 'closeDialog':
      testSession.dialogStack.pop();
      renderTestScreens({ keepScale: true });
      return;
    case 'openContextMenu': {
      const menu = testSession.testDocument.menus?.[action.menuId];
      if (!menu) { showToast(`Menu ${action.menuId || '?'} introuvable`); return; }
      openMenuAt(menu.items, actionContext.clientX, actionContext.clientY, (menuItem) => runAction(menuItem.action ?? { type: 'none' }, { ...actionContext, sourceName: menuItem.label }));
      return;
    }
    case 'showPage': {
      const pageStack = nodeIndex.get(action.target)?.node;
      if (pageStack?.type !== 'pageStack') { showToast('Pile de pages introuvable'); return; }
      pageStack.content = { ...pageStack.content, activeIndex: action.page ?? 0 };
      renderTestScreens({ keepScale: true });
      return;
    }
    case 'toggleVisibility': {
      const targetWidget = nodeIndex.get(action.target)?.node;
      if (!targetWidget) { showToast('Widget introuvable'); return; }
      targetWidget.state = { ...targetWidget.state, visible: targetWidget.state?.visible === false };
      renderTestScreens({ keepScale: true });
      return;
    }
    case 'changeVariable': {
      const variable = testSession.testDocument.variables?.[action.variableId];
      if (!variable) { showToast('Variable introuvable'); return; }
      setTestVariable(action.variableId, computeVariableChange(variable, action));
      return;
    }
    case 'custom':
      showToast(`${actionContext.sourceName} : ${action.description || 'action perso'}`);
      return;
    default:
      showToast(`${actionContext.sourceName} (aucune action)`);
  }
}

/**
 * Traite un geste sur l'UI testée : comportement de base du widget (pour un clic / tap simple), puis événement.
 * @param {string} gesture geste (click, doubleClick, rightClick, tap, longPress…)
 * @param {EventTarget} eventTarget élément touché
 * @param {number} clientX position
 * @param {number} clientY position
 */
function handleGesture(gesture, eventTarget, clientX, clientY) {
  const { nodes } = collectNodeChain(eventTarget);
  if (nodes.length === 0) return;
  if (CLICK_LIKE_GESTURES.has(gesture)) runBuiltInBehavior(eventTarget);
  const foundEvent = findEventAction(nodes, gesture);
  if (foundEvent) {
    runAction(foundEvent.action, { clientX, clientY, sourceName: foundEvent.node.name ?? foundEvent.node.id });
    return;
  }
  const touchedWidget = nodes.find((node) => node.type);
  if (touchedWidget?.type === 'button' && CLICK_LIKE_GESTURES.has(gesture)) showToast(`${touchedWidget.name} (aucune action)`);
  else if (!CLICK_LIKE_GESTURES.has(gesture)) showToast(`${GESTURE_LABELS[gesture] ?? gesture} sur ${touchedWidget?.name ?? nodes[0].name} (aucune action)`);
}

/**
 * Lance un événement de niveau écran (double tap / squeeze du Pencil, raccourci) sur l'écran au premier plan.
 * @param {string} trigger déclencheur
 * @param {(nodeEvent: object) => boolean} [matchesEvent] filtre supplémentaire (ex. touche du raccourci)
 * @returns {boolean} vrai si un événement a été trouvé
 */
function runScreenEvent(trigger, matchesEvent = () => true) {
  const topScreen = getTestScreenById(getTopScreenId());
  const nodeEvent = (topScreen?.events ?? []).find((candidate) => candidate.trigger === trigger && matchesEvent(candidate));
  const viewportRectangle = testSession.viewportElement.getBoundingClientRect();
  const actionContext = { clientX: viewportRectangle.left + viewportRectangle.width / 2, clientY: viewportRectangle.top + viewportRectangle.height / 2, sourceName: topScreen?.name ?? '' };
  if (!nodeEvent) return false;
  runAction(nodeEvent.action ?? { type: 'none' }, actionContext);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// Comportements de base des widgets (clic / tap simple)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Index de l'élément touché parmi ses semblables (onglet, ligne de liste, ligne de tableau, menu de barre).
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
 * Sélectionne un élément d'une liste / d'onglets / d'un tableau ; si la liste ou les onglets pilotent
 * une pile de pages, affiche la page de même index.
 * @param {object} widget widget
 * @param {string} contentKey clé de l'index dans content
 * @param {number} itemIndex index touché
 */
function selectItem(widget, contentKey, itemIndex) {
  if (itemIndex < 0) return;
  widget.content[contentKey] = itemIndex;
  const controlledPageStack = widget.content.controlsPageStack
    ? buildNodeIndex(testSession.testDocument).get(widget.content.controlsPageStack)?.node : null;
  if (controlledPageStack?.type === 'pageStack') controlledPageStack.content = { ...controlledPageStack.content, activeIndex: itemIndex };
  renderTestScreens({ keepScale: true });
}

/**
 * Ouvre la liste des choix d'une liste déroulante.
 * @param {object} widget liste déroulante
 * @param {HTMLElement} widgetElement élément
 */
function openDropdownChoices(widget, widgetElement) {
  const widgetRectangle = widgetElement.getBoundingClientRect();
  const choiceItems = (widget.content?.options ?? []).map((optionText, optionIndex) => ({ label: optionText, checked: optionIndex === widget.content.selectedIndex, optionIndex }));
  openMenuAt(choiceItems, widgetRectangle.left, widgetRectangle.bottom + 2, (chosenItem) => {
    widget.content.selectedIndex = chosenItem.optionIndex;
    renderTestScreens({ keepScale: true });
  });
}

/**
 * Ouvre le menu d'un libellé de barre de menus.
 * @param {object} widget barre de menus
 * @param {HTMLElement} labelElement libellé (« File »…)
 * @param {number} menuIndex index du libellé
 */
function openMenuBarEntry(widget, labelElement, menuIndex) {
  const menuLink = widget.content?.menus?.[menuIndex];
  const menu = menuLink?.menuId ? testSession.testDocument.menus?.[menuLink.menuId] : null;
  if (!menu) { showToast(`« ${menuLink?.label ?? '?'} » : aucun menu relié (section Menus)`); return; }
  openMenuBarMenu(labelElement, menu.items, (menuItem) => {
    const labelRectangle = labelElement.getBoundingClientRect();
    runAction(menuItem.action ?? { type: 'none' }, { clientX: labelRectangle.left, clientY: labelRectangle.bottom, sourceName: menuItem.label });
  }, widget.id);
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
      blur: () => renderTestScreens({ keepScale: true }),
      keydown: (keyboardEvent) => { if (keyboardEvent.key === 'Enter') inputElement.blur(); },
    },
  });
  inputElement.value = widget.content?.value ?? '';
  widgetElement.replaceChildren(inputElement);
  inputElement.focus();
}

/**
 * Comportement de base du widget touché (case, interrupteur, liste, onglets, tableau, liste déroulante, champ, menus).
 * @param {EventTarget} eventTarget élément touché
 */
function runBuiltInBehavior(eventTarget) {
  const widgetElement = eventTarget.closest('.ui-widget[data-node-id]');
  const widget = widgetElement ? buildNodeIndex(testSession.testDocument).get(widgetElement.dataset.nodeId)?.node : null;
  if (!widget || widget.state?.enabled === false) return;
  switch (widget.type) {
    case 'checkbox': widget.state = { ...widget.state, checked: !widget.state?.checked }; renderTestScreens({ keepScale: true }); break;
    case 'toggle': widget.state = { ...widget.state, on: !widget.state?.on }; renderTestScreens({ keepScale: true }); break;
    case 'dropdown': openDropdownChoices(widget, widgetElement); break;
    case 'textField': startTextEditing(widget, widgetElement); break;
    case 'tabs': selectItem(widget, 'selectedIndex', findItemIndex(eventTarget, '.uiw-tab')); break;
    case 'list': selectItem(widget, 'selectedIndex', findItemIndex(eventTarget, '.uiw-list-item')); break;
    case 'table': selectItem(widget, 'selectedRow', findItemIndex(eventTarget, '.uiw-table-row', '.is-header')); break;
    case 'menuBar': {
      const labelElement = eventTarget.closest('.uiw-menu');
      if (labelElement) openMenuBarEntry(widget, labelElement, findItemIndex(eventTarget, '.uiw-menu'));
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Glisser : curseur, séparateur, coin de fenêtre
// ---------------------------------------------------------------------------------------------------------------------

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
 * @param {string} widgetId curseur
 * @param {PointerEvent} startEvent pointerdown
 */
function startSliderDrag(widgetId, startEvent) {
  const widget = buildNodeIndex(testSession.testDocument).get(widgetId)?.node;
  if (!widget || widget.state?.enabled === false) return;
  const updateFromPointer = (pointerEvent) => {
    const trackElement = testSession.viewportElement.querySelector(`[data-node-id="${widgetId}"] .uiw-slider-track`);
    if (!trackElement) return;
    const trackRectangle = trackElement.getBoundingClientRect();
    const { min = 0, max = 100, step = 1, orientation } = widget.content ?? {};
    const ratio = orientation === 'vertical'
      ? (trackRectangle.bottom - pointerEvent.clientY) / trackRectangle.height
      : (pointerEvent.clientX - trackRectangle.left) / trackRectangle.width;
    widget.content.value = Math.round((min + Math.max(0, Math.min(1, ratio)) * (max - min)) / (step || 1)) * (step || 1);
    renderTestScreens({ keepScale: true });
  };
  updateFromPointer(startEvent);
  trackPointer(startEvent, updateFromPointer);
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
  const scale = Number(splitterElement.closest('.test-frame').dataset.scale) || 1;
  const measureSize = (element) => (isHorizontal ? element.getBoundingClientRect().width : element.getBoundingClientRect().height) / scale;
  const previousStartSize = measureSize(splitterElement.previousElementSibling);
  const nextStartSize = measureSize(splitterElement.nextElementSibling);
  const parentSize = measureSize(splitterElement.parentElement);
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
    renderTestScreens({ keepScale: true });
  });
}

/**
 * Redimensionner la fenêtre principale (écrans de bureau) par le coin bas-droit.
 * Le cadre est centré : le coin bouge de la moitié de l'agrandissement, d'où le facteur 2.
 * @param {PointerEvent} startEvent pointerdown
 */
function startWindowResize(startEvent) {
  const screen = getMainScreen();
  const startWidth = screen.size.width;
  const startHeight = screen.size.height;
  const scale = testSession.scale;
  trackPointer(startEvent, (moveEvent) => {
    screen.size = {
      width: Math.max(MINIMUM_TEST_SCREEN_SIZE, Math.round(startWidth + (2 * (moveEvent.clientX - startEvent.clientX)) / scale)),
      height: Math.max(MINIMUM_TEST_SCREEN_SIZE, Math.round(startHeight + (2 * (moveEvent.clientY - startEvent.clientY)) / scale)),
    };
    renderTestScreens({ keepScale: true });
  }, () => renderTestScreens());
}

// ---------------------------------------------------------------------------------------------------------------------
// Détection des gestes
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Traduit un tap simple / double / appui long selon l'outil (souris, doigt, Pencil) et le réglage
 * « Simuler la souris avec le Pencil ».
 * @param {'single'|'double'|'long'} tapKind type de tap
 * @param {string} pointerType mouse, touch ou pen
 * @returns {string|null} geste, ou null pour ne rien faire
 */
function translateTap(tapKind, pointerType) {
  const isMouseLike = pointerType === 'mouse' || (pointerType === 'pen' && appSettings.simulateMouseWithPencil);
  if (pointerType === 'pen' && appSettings.simulateMouseWithPencil) {
    if (tapKind === 'single') return 'click';
    if (tapKind === 'double') return appSettings.pencilDoubleTapAs;
    return appSettings.pencilLongPressAs === 'none' ? null : appSettings.pencilLongPressAs;
  }
  if (isMouseLike) return { single: 'click', double: 'doubleClick', long: null }[tapKind];
  if (tapKind === 'single') return pointerType === 'pen' ? 'pencilTap' : 'tap';
  return tapKind === 'double' ? 'doubleTap' : 'longPress';
}

/**
 * Clé de l'élément touché, pour reconnaître un double tap au même endroit.
 * @param {EventTarget} eventTarget cible
 * @returns {string} clé
 */
function getTapTargetKey(eventTarget) {
  const nodeElement = eventTarget instanceof Element ? eventTarget.closest('[data-node-id], .test-frame') : null;
  return nodeElement?.dataset.nodeId ?? nodeElement?.dataset.screenId ?? '';
}

/**
 * Appui sur la zone de test.
 * @param {PointerEvent} pointerEvent événement
 */
function handleTestPointerDown(pointerEvent) {
  const eventTarget = pointerEvent.target;
  if (!(eventTarget instanceof Element) || isInsideMenu(eventTarget) || eventTarget.closest('.test-text-input')) return;
  if (isAnyMenuOpen()) { closeAllMenus(); pointerEvent.preventDefault(); return; }
  if (eventTarget.closest('.test-resize-corner')) { startWindowResize(pointerEvent); return; }
  const splitterElement = eventTarget.closest('.ui-splitter.is-resizable');
  if (splitterElement) { startSplitterDrag(splitterElement, pointerEvent); return; }
  const sliderElement = eventTarget.closest('.uiw-slider[data-node-id]');
  if (sliderElement) { startSliderDrag(sliderElement.dataset.nodeId, pointerEvent); return; }
  if (pointerEvent.pointerType === 'mouse' && pointerEvent.button !== 0) {
    pointerEvent.preventDefault();
    handleGesture(pointerEvent.button === 2 ? 'rightClick' : 'middleClick', eventTarget, pointerEvent.clientX, pointerEvent.clientY);
    return;
  }
  eventTarget.closest('.uiw-button')?.classList.add('is-pressed');
  const pressSession = { pointerId: pointerEvent.pointerId, pointerType: pointerEvent.pointerType, eventTarget,
    startX: pointerEvent.clientX, startY: pointerEvent.clientY, isLongPressDone: false, hasMoved: false };
  if (pointerEvent.pointerType !== 'mouse') {
    pressSession.longPressTimer = setTimeout(() => {
      pressSession.isLongPressDone = true;
      testSession.viewportElement.querySelector('.is-pressed')?.classList.remove('is-pressed');
      const gesture = translateTap('long', pressSession.pointerType);
      if (gesture) handleGesture(gesture, eventTarget, pressSession.startX, pressSession.startY);
    }, appSettings.longPressDuration);
  }
  testSession.pressSession = pressSession;
}

/**
 * Mouvement : annule l'appui long si le doigt / Pencil bouge ; survol (souris) ; passage d'un menu de barre à l'autre.
 * @param {PointerEvent} pointerEvent événement
 */
function handleTestPointerMove(pointerEvent) {
  const pressSession = testSession.pressSession;
  if (pressSession && pressSession.pointerId === pointerEvent.pointerId
    && Math.hypot(pointerEvent.clientX - pressSession.startX, pointerEvent.clientY - pressSession.startY) > TAP_MOVE_TOLERANCE_PIXELS) {
    pressSession.hasMoved = true;
    clearTimeout(pressSession.longPressTimer);
  }
  if (pointerEvent.pointerType === 'touch' || pointerEvent.buttons) return;
  const openMenuBarId = getOpenMenuBarId();
  const hoveredMenuLabel = pointerEvent.target instanceof Element ? pointerEvent.target.closest('.uiw-menu') : null;
  if (openMenuBarId && hoveredMenuLabel && hoveredMenuLabel !== getOpenMenuBarLabel() && hoveredMenuLabel.closest(`[data-node-id="${openMenuBarId}"]`)) {
    const menuBarWidget = buildNodeIndex(testSession.testDocument).get(openMenuBarId)?.node;
    if (menuBarWidget) openMenuBarEntry(menuBarWidget, hoveredMenuLabel, findItemIndex(hoveredMenuLabel, '.uiw-menu'));
  }
  updateHover(pointerEvent.target, pointerEvent.clientX, pointerEvent.clientY);
}

/**
 * Survol : lance « entrée » / « sortie » quand le widget survolé change.
 * @param {EventTarget} eventTarget élément sous le pointeur
 * @param {number} clientX position
 * @param {number} clientY position
 */
function updateHover(eventTarget, clientX, clientY) {
  const hoveredElement = eventTarget instanceof Element ? eventTarget.closest('.ui-widget[data-node-id]') : null;
  const hoveredId = hoveredElement?.dataset.nodeId ?? null;
  if (hoveredId === testSession.hoveredWidgetId) return;
  const nodeIndex = buildNodeIndex(testSession.testDocument);
  const runHoverEvent = (widgetId, trigger) => {
    const widget = widgetId ? nodeIndex.get(widgetId)?.node : null;
    const nodeEvent = (widget?.events ?? []).find((candidate) => candidate.trigger === trigger);
    if (nodeEvent) runAction(nodeEvent.action ?? { type: 'none' }, { clientX, clientY, sourceName: widget.name });
  };
  runHoverEvent(testSession.hoveredWidgetId, 'hoverLeave');
  testSession.hoveredWidgetId = hoveredId;
  runHoverEvent(hoveredId, 'hoverEnter');
}

/**
 * Relâchement : tap / clic simple ou double (même élément, assez vite).
 * @param {PointerEvent} pointerEvent événement
 */
function handleTestPointerUp(pointerEvent) {
  const pressSession = testSession?.pressSession;
  if (!pressSession || pressSession.pointerId !== pointerEvent.pointerId) return;
  testSession.pressSession = null;
  clearTimeout(pressSession.longPressTimer);
  testSession.viewportElement.querySelector('.is-pressed')?.classList.remove('is-pressed');
  if (pressSession.isLongPressDone || pressSession.hasMoved || pointerEvent.type === 'pointercancel') return;
  const targetKey = getTapTargetKey(pressSession.eventTarget);
  const now = performance.now();
  const previousTap = testSession.lastTap;
  const isDoubleTap = previousTap && previousTap.targetKey === targetKey && previousTap.pointerType === pressSession.pointerType
    && now - previousTap.time <= appSettings.doubleTapDelay;
  testSession.lastTap = isDoubleTap ? null : { targetKey, time: now, pointerType: pressSession.pointerType };
  const gesture = translateTap(isDoubleTap ? 'double' : 'single', pressSession.pointerType);
  if (gesture) handleGesture(gesture, pressSession.eventTarget, pointerEvent.clientX, pointerEvent.clientY);
}

/**
 * Molette sur l'UI testée (limitée à un événement toutes les 300 ms).
 * @param {WheelEvent} wheelEvent événement
 */
function handleTestWheel(wheelEvent) {
  wheelEvent.preventDefault();
  const now = performance.now();
  if (now - (testSession.lastWheelTime ?? 0) < WHEEL_THROTTLE_MS) return;
  testSession.lastWheelTime = now;
  const { nodes } = collectNodeChain(wheelEvent.target);
  const foundEvent = findEventAction(nodes, 'wheel');
  if (foundEvent) runAction(foundEvent.action, { clientX: wheelEvent.clientX, clientY: wheelEvent.clientY, sourceName: foundEvent.node.name });
}

/**
 * Transforme une touche en texte de raccourci (« Ctrl+Shift+S »).
 * @param {KeyboardEvent} keyboardEvent événement
 * @returns {string} raccourci
 */
function describeShortcut(keyboardEvent) {
  const parts = [];
  if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) parts.push('Ctrl');
  if (keyboardEvent.altKey) parts.push('Alt');
  if (keyboardEvent.shiftKey) parts.push('Shift');
  parts.push(keyboardEvent.key.length === 1 ? keyboardEvent.key.toUpperCase() : keyboardEvent.key);
  return parts.join('+');
}

/**
 * Clavier : Échap (menus, dialogue, puis quitter), raccourcis de l'écran et des menus.
 * @param {KeyboardEvent} keyboardEvent événement
 */
function handleTestKeyDown(keyboardEvent) {
  if (keyboardEvent.target instanceof Element && keyboardEvent.target.closest('.test-text-input, .test-variable input:not([type="checkbox"])')) { keyboardEvent.stopImmediatePropagation(); return; }
  keyboardEvent.stopImmediatePropagation();
  if (keyboardEvent.key === 'Escape') {
    if (isAnyMenuOpen()) closeAllMenus();
    else if (testSession.dialogStack.length) { testSession.dialogStack.pop(); renderTestScreens({ keepScale: true }); }
    else closeTestMode();
    return;
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(keyboardEvent.key)) return;
  const shortcutText = describeShortcut(keyboardEvent).toLowerCase();
  const normalizeShortcut = (text) => (text ?? '').replace(/\s+/g, '').replace(/cmd|⌘/gi, 'ctrl').toLowerCase();
  if (runScreenEvent('keyShortcut', (nodeEvent) => normalizeShortcut(nodeEvent.key) === shortcutText)) { keyboardEvent.preventDefault(); return; }
  for (const menu of Object.values(testSession.testDocument.menus ?? {})) {
    const matchingItem = findMenuItemByShortcut(menu.items, shortcutText, normalizeShortcut);
    if (matchingItem) {
      keyboardEvent.preventDefault();
      runAction(matchingItem.action ?? { type: 'none' }, { clientX: 0, clientY: 0, sourceName: matchingItem.label });
      return;
    }
  }
}

/**
 * Cherche un élément de menu (sous-menus compris) par son raccourci.
 * @param {object[]} menuItems éléments
 * @param {string} shortcutText raccourci tapé (minuscules)
 * @param {(text: string) => string} normalizeShortcut normalisation
 * @returns {object|null} élément
 */
function findMenuItemByShortcut(menuItems, shortcutText, normalizeShortcut) {
  for (const menuItem of menuItems ?? []) {
    if (!menuItem.separator && menuItem.shortcut && normalizeShortcut(menuItem.shortcut) === shortcutText) return menuItem;
    const foundInSubmenu = findMenuItemByShortcut(menuItem.submenu, shortcutText, normalizeShortcut);
    if (foundInSubmenu) return foundInSubmenu;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Barre du mode test, ouverture / fermeture
// ---------------------------------------------------------------------------------------------------------------------

/** Pivote l'écran principal (portrait ↔ paysage). */
function rotateMainScreen() {
  const screen = getMainScreen();
  screen.size = { width: screen.size.height, height: screen.size.width };
  renderTestScreens();
}

/**
 * Copie du projet pour le test : chaque instance de module y devient un vrai contenu, actif et indépendant.
 * @param {Record<string, any>} [variableValues] valeurs des variables pendant le test
 * @returns {object} document
 */
function createTestDocument(variableValues = {}) {
  const testDocument = cloneJson(appState.uiDocument);
  for (const [variableId, value] of Object.entries(variableValues)) if (testDocument.variables?.[variableId]) testDocument.variables[variableId].value = value;
  expandAllModuleInstances(testDocument);
  return testDocument;
}

/**
 * Relève ce que le test peut changer (cases, valeurs, pages, tailles), par position dans l'écran.
 * Les ID des éléments répétés changent quand on refait la copie : la position et le nom servent de repère.
 * @param {object} testDocument copie testée
 * @returns {Map<string, object>} position → { node, values }
 */
function collectTestValues(testDocument) {
  const valuesByPosition = new Map();
  const visitNode = (node, position) => {
    const { selectedIndex, activeIndex, selectedRow, value } = node.content ?? {};
    valuesByPosition.set(position, { node, values: JSON.stringify({ state: node.state, sizing: node.sizing, size: position.includes('/') ? undefined : node.size, content: { selectedIndex, activeIndex, selectedRow, value } }) });
    [...(node.children ?? []), ...(node.widgets ?? []), ...(node.root ? [node.root] : [])].forEach((childNode, childIndex) => visitNode(childNode, `${position}/${childIndex}:${childNode.name}`));
  };
  for (const screen of testDocument.screens) visitNode(screen, screen.id);
  return valuesByPosition;
}

/**
 * Change une variable pendant le test : refait la copie avec les nouvelles valeurs, en gardant ce que l'utilisateur a changé.
 * @param {string} variableId variable
 * @param {any} rawValue valeur voulue
 */
function setTestVariable(variableId, rawValue) {
  const variable = testSession.testDocument.variables?.[variableId];
  if (!variable) { showToast('Variable introuvable'); return; }
  testSession.variableValues[variableId] = convertVariableValue(variable, rawValue);
  const currentValues = collectTestValues(testSession.testDocument);
  const startValues = testSession.startValues;
  testSession.testDocument = createTestDocument(testSession.variableValues);
  const newValues = collectTestValues(testSession.testDocument);
  testSession.startValues = new Map([...newValues].map(([position, entry]) => [position, entry.values]));
  for (const [position, { node }] of newValues) {
    const currentEntry = currentValues.get(position);
    if (!currentEntry || currentEntry.values === startValues.get(position)) continue;
    const { state, sizing, size, content } = JSON.parse(currentEntry.values);
    if (state) node.state = state;
    if (sizing) node.sizing = sizing;
    if (size) node.size = size;
    if (Object.keys(content).length) node.content = { ...node.content, ...content };
  }
  testSession.lastTap = null;
  testSession.hoveredWidgetId = null;
  closeAllMenus();
  renderTestScreens({ keepScale: true });
  renderTestToolbar();
}

/**
 * Retient les valeurs de départ du test.
 */
function rememberStartValues() {
  testSession.startValues = new Map([...collectTestValues(testSession.testDocument)].map(([position, entry]) => [position, entry.values]));
}

/**
 * Crée le contrôle d'une variable pour la barre du test.
 * @param {string} variableId variable
 * @param {object} variable variable
 * @returns {HTMLElement} contrôle
 */
function createVariableControl(variableId, variable) {
  const inputElement = createElement('input', { attributes: { type: variable.kind === 'boolean' ? 'checkbox' : variable.kind === 'number' ? 'number' : 'text', inputmode: variable.kind === 'number' ? 'numeric' : undefined, min: variable.min, max: variable.max },
    on: { change: () => setTestVariable(variableId, variable.kind === 'boolean' ? inputElement.checked : inputElement.value) } });
  if (variable.kind === 'boolean') inputElement.checked = variable.value; else inputElement.value = variable.value;
  const createStepButton = (label, delta) => createElement('button', { text: label, attributes: { type: 'button' }, on: { click: () => setTestVariable(variableId, variable.value + delta) } });
  return createElement('label', { className: 'test-toggle test-variable', attributes: { title: variable.description || variable.name } }, [
    createElement('span', { text: variable.name }),
    variable.kind === 'number' ? createStepButton('−', -1) : null, inputElement, variable.kind === 'number' ? createStepButton('+', 1) : null]);
}

/** Remet tout dans l'état de départ (copie fraîche du projet). */
function resetTestState() {
  testSession.variableValues = {};
  testSession.testDocument = createTestDocument();
  rememberStartValues();
  testSession.dialogStack = [];
  closeAllMenus();
  renderTestScreens();
  renderTestToolbar();
  showToast('État de départ rétabli');
}

/**
 * Simule un geste du Pencil qu'une webapp ne peut pas recevoir (double tap / squeeze sur le Pencil).
 * @param {string} trigger pencilDoubleTap ou pencilSqueeze
 */
function simulatePencilBarrelGesture(trigger) {
  if (!runScreenEvent(trigger)) showToast(`${GESTURE_LABELS[trigger]} : aucun événement sur l'écran ${getTopScreenId()}`);
}

/** Redessine la barre du mode test. */
function renderTestToolbar() {
  const { testDocument } = testSession;
  const mainScreen = getMainScreen();
  const createButton = (buttonLabel, buttonTitle, onClick) => createElement('button', { text: buttonLabel, attributes: { type: 'button', title: buttonTitle }, on: { click: onClick } });
  const simulationCheckbox = createElement('input', { attributes: { type: 'checkbox' },
    on: { change: () => { updateAppSetting('simulateMouseWithPencil', simulationCheckbox.checked); renderTestToolbar(); } } });
  simulationCheckbox.checked = appSettings.simulateMouseWithPencil;
  const pencilMappingText = appSettings.simulateMouseWithPencil
    ? `double tap = ${GESTURE_LABELS[appSettings.pencilDoubleTapAs]}, appui long = ${appSettings.pencilLongPressAs === 'none' ? 'rien' : GESTURE_LABELS[appSettings.pencilLongPressAs]}`
    : '';
  testSession.toolbarElement.replaceChildren(...[
    createElement('span', { className: 'test-title', text: '▶ Test de l\'UI' }),
    createSelectElement(testSession.screenId, testDocument.screens.map((candidate) => ({ value: candidate.id, label: `${candidate.id} · ${candidate.name}` })),
      (screenId) => { testSession.screenId = screenId; testSession.dialogStack = []; renderTestScreens(); renderTestToolbar(); }),
    createSelectElement(testSession.themeId, Object.entries(testDocument.themes).map(([themeId, theme]) => ({ value: themeId, label: `Thème : ${theme.name}` })),
      (themeId) => { testSession.themeId = themeId; renderTestScreens({ keepScale: true }); }),
    DESKTOP_PLATFORMS.has(mainScreen.platform) ? null : createButton('⟳ Pivoter', 'Portrait ↔ paysage', rotateMainScreen),
    createButton('↺ Réinitialiser', 'Revenir à l\'état de départ', resetTestState),
    createElement('label', { className: 'test-toggle', attributes: { title: `Le Pencil imite la souris (réglages de l'app : ${pencilMappingText || 'double tap / appui long'})` } },
      [simulationCheckbox, createElement('span', { text: `Simuler la souris avec le Pencil${pencilMappingText ? ` (${pencilMappingText})` : ''}` })]),
    createButton('✎ Double tap Pencil', 'Simule le double tap sur le Pencil (événement de l\'écran)', () => simulatePencilBarrelGesture('pencilDoubleTap')),
    createButton('✎ Squeeze', 'Simule le squeeze du Pencil Pro (événement de l\'écran)', () => simulatePencilBarrelGesture('pencilSqueeze')),
    testSession.sizeLabel,
    ...Object.entries(testDocument.variables ?? {}).map(([variableId, variable]) => createVariableControl(variableId, variable)),
    createElement('span', { className: 'top-spacer' }),
    createButton('Quitter (Échap)', 'Revenir à l\'édition', closeTestMode),
  ].filter(Boolean));
}

/** Ouvre le mode test sur l'écran courant. */
export function openTestMode() {
  if (testSession) return;
  const viewportElement = createElement('div', { className: 'test-viewport' });
  const toolbarElement = createElement('div', { className: 'test-toolbar' });
  const toastElement = createElement('div', { className: 'test-toast' });
  const menuLayerElement = createElement('div', { className: 'test-menu-layer' });
  const overlayElement = createElement('div', { className: 'test-mode' }, [toolbarElement, viewportElement, toastElement, menuLayerElement]);
  testSession = {
    testDocument: createTestDocument(), variableValues: {}, startValues: new Map(), screenId: appState.currentScreenId, themeId: appState.currentThemeId,
    scale: 1, dialogStack: [], overlayElement, viewportElement, toolbarElement, toastElement,
    sizeLabel: createElement('span', { className: 'test-size-label' }), toastTimer: null,
    pressSession: null, lastTap: null, hoveredWidgetId: null, lastWheelTime: 0,
    resizeObserver: new ResizeObserver(() => renderTestScreens()),
  };
  rememberStartValues();
  setMenuLayer(menuLayerElement);
  viewportElement.addEventListener('pointerdown', handleTestPointerDown);
  viewportElement.addEventListener('pointermove', handleTestPointerMove);
  viewportElement.addEventListener('wheel', handleTestWheel, { passive: false });
  viewportElement.addEventListener('contextmenu', (contextEvent) => contextEvent.preventDefault());
  overlayElement.addEventListener('pointerdown', (pointerEvent) => {
    if (isAnyMenuOpen() && !isInsideMenu(pointerEvent.target) && !viewportElement.contains(pointerEvent.target)) closeAllMenus();
  });
  window.addEventListener('pointerup', handleTestPointerUp);
  window.addEventListener('pointercancel', handleTestPointerUp);
  window.addEventListener('keydown', handleTestKeyDown, true);
  document.body.append(overlayElement);
  renderTestToolbar();
  renderTestScreens();
  testSession.resizeObserver.observe(viewportElement);
}

/** Ferme le mode test (la copie est jetée, le projet n'a pas changé). */
export function closeTestMode() {
  if (!testSession) return;
  testSession.resizeObserver.disconnect();
  clearTimeout(testSession.pressSession?.longPressTimer);
  window.removeEventListener('pointerup', handleTestPointerUp);
  window.removeEventListener('pointercancel', handleTestPointerUp);
  window.removeEventListener('keydown', handleTestKeyDown, true);
  clearTimeout(testSession.toastTimer);
  setMenuLayer(null);
  testSession.overlayElement.remove();
  testSession = null;
}
