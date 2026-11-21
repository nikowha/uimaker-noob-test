// Mode test : menus qui s'ouvrent (barre de menus, menu contextuel, liste déroulante), avec sous-menus (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { getIconSvg } from '../render/iconLibrary.js';

const MENU_EDGE_MARGIN_PIXELS = 6;

let menuLayerElement = null;
let openMenuElements = [];
let menuBarSession = null;

/**
 * Indique le calque où s'affichent les menus (créé par le mode test).
 * @param {HTMLElement|null} layerElement calque, ou null à la fermeture du mode test
 */
export function setMenuLayer(layerElement) {
  closeAllMenus();
  menuLayerElement = layerElement;
}

/** @returns {boolean} vrai si un menu est ouvert */
export function isAnyMenuOpen() {
  return openMenuElements.length > 0;
}

/**
 * Indique si un élément fait partie d'un menu ouvert.
 * @param {EventTarget} eventTarget cible
 * @returns {boolean} vrai si dans un menu
 */
export function isInsideMenu(eventTarget) {
  return eventTarget instanceof Element && Boolean(eventTarget.closest('.test-menu'));
}

/** Ferme tous les menus ouverts. */
export function closeAllMenus() {
  for (const menuElement of openMenuElements) menuElement.remove();
  openMenuElements = [];
  menuBarSession?.labelElement?.classList.remove('is-open');
  menuBarSession = null;
}

/**
 * Ferme les menus à partir d'un niveau (garde les menus parents).
 * @param {number} menuLevel niveau (0 = menu principal)
 */
function closeMenusFromLevel(menuLevel) {
  for (const menuElement of openMenuElements.splice(menuLevel)) menuElement.remove();
}

/**
 * Place un menu à un point en le gardant dans la fenêtre.
 * @param {HTMLElement} menuElement menu (déjà dans le DOM)
 * @param {number} left position voulue
 * @param {number} top position voulue
 */
function placeMenuInsideWindow(menuElement, left, top) {
  const menuRectangle = menuElement.getBoundingClientRect();
  const maximumLeft = window.innerWidth - menuRectangle.width - MENU_EDGE_MARGIN_PIXELS;
  const maximumTop = window.innerHeight - menuRectangle.height - MENU_EDGE_MARGIN_PIXELS;
  menuElement.style.left = `${Math.max(MENU_EDGE_MARGIN_PIXELS, Math.min(left, maximumLeft))}px`;
  menuElement.style.top = `${Math.max(MENU_EDGE_MARGIN_PIXELS, Math.min(top, maximumTop))}px`;
}

/**
 * Ouvre un menu (liste d'éléments) à un point de l'écran.
 * @param {object[]} menuItems éléments { label, shortcut, icon, action, enabled, checked, separator, submenu }
 * @param {number} left position (px écran)
 * @param {number} top position (px écran)
 * @param {(menuItem: object) => void} onItemChosen appelé avec l'élément choisi (menus fermés avant)
 * @param {number} [menuLevel] niveau (0 = principal, 1 = sous-menu…)
 */
export function openMenuAt(menuItems, left, top, onItemChosen, menuLevel = 0) {
  if (!menuLayerElement) return;
  if (menuLevel === 0) closeAllMenus(); else closeMenusFromLevel(menuLevel);
  const menuElement = createElement('div', { className: 'test-menu' }, (menuItems ?? []).map((menuItem) => {
    if (menuItem.separator) return createElement('div', { className: 'test-menu-separator' });
    const isEnabled = menuItem.enabled !== false;
    const itemElement = createElement('div', { className: `test-menu-item${isEnabled ? '' : ' is-disabled'}` }, [
      createElement('span', { className: 'test-menu-check', text: menuItem.checked ? '✓' : '' }),
      createElement('span', { className: 'test-menu-icon', html: menuItem.icon ? getIconSvg(menuItem.icon) : '' }),
      createElement('span', { className: 'test-menu-label', text: menuItem.label ?? '' }),
      createElement('span', { className: 'test-menu-shortcut', text: menuItem.submenu ? '›' : (menuItem.shortcut ?? '') }),
    ]);
    const openSubmenu = () => {
      const itemRectangle = itemElement.getBoundingClientRect();
      openMenuAt(menuItem.submenu, itemRectangle.right - 2, itemRectangle.top - 4, onItemChosen, menuLevel + 1);
    };
    itemElement.addEventListener('pointerenter', (pointerEvent) => {
      if (pointerEvent.pointerType === 'touch') return;
      if (menuItem.submenu && isEnabled) openSubmenu(); else closeMenusFromLevel(menuLevel + 1);
    });
    itemElement.addEventListener('click', () => {
      if (!isEnabled) return;
      if (menuItem.submenu) { openSubmenu(); return; }
      closeAllMenus();
      onItemChosen(menuItem);
    });
    return itemElement;
  }));
  menuLayerElement.append(menuElement);
  openMenuElements.push(menuElement);
  placeMenuInsideWindow(menuElement, left, top);
}

/**
 * Ouvre le menu d'un libellé de barre de menus (« File »…), juste dessous.
 * @param {HTMLElement} labelElement libellé touché
 * @param {object[]} menuItems éléments du menu
 * @param {(menuItem: object) => void} onItemChosen élément choisi
 * @param {string} menuBarWidgetId barre de menus (pour passer d'un menu à l'autre au survol)
 */
export function openMenuBarMenu(labelElement, menuItems, onItemChosen, menuBarWidgetId) {
  const labelRectangle = labelElement.getBoundingClientRect();
  openMenuAt(menuItems, labelRectangle.left, labelRectangle.bottom, onItemChosen);
  labelElement.classList.add('is-open');
  menuBarSession = { labelElement, menuBarWidgetId };
}

/**
 * Barre de menus ouverte : renvoie l'ID de la barre si un menu de barre est ouvert.
 * @returns {string|null} ID du widget barre de menus
 */
export function getOpenMenuBarId() {
  return menuBarSession && openMenuElements.length ? menuBarSession.menuBarWidgetId : null;
}

/**
 * Libellé de barre de menus actuellement ouvert.
 * @returns {HTMLElement|null} élément
 */
export function getOpenMenuBarLabel() {
  return menuBarSession?.labelElement ?? null;
}
