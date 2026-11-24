// Déclencheurs d'événements, types d'action et menus (texte ↔ données) — PROTOTYPE.

/** Déclencheurs possibles. isScreenLevel = réglé sur l'écran (pas sur un widget précis). */
export const EVENT_TRIGGERS = [
  { value: 'click', label: 'Clic (souris) / tap' },
  { value: 'doubleClick', label: 'Double clic' },
  { value: 'rightClick', label: 'Clic droit' },
  { value: 'middleClick', label: 'Clic du milieu' },
  { value: 'hoverEnter', label: 'Survol : entrée' },
  { value: 'hoverLeave', label: 'Survol : sortie' },
  { value: 'wheel', label: 'Molette' },
  { value: 'tap', label: 'Tap (doigt)' },
  { value: 'doubleTap', label: 'Double tap (doigt)' },
  { value: 'longPress', label: 'Appui long (doigt)' },
  { value: 'pencilTap', label: 'Tap du Pencil' },
  { value: 'pencilDoubleTap', label: 'Double tap du Pencil (sur le Pencil)', isScreenLevel: true },
  { value: 'pencilSqueeze', label: 'Squeeze du Pencil Pro', isScreenLevel: true },
  { value: 'keyShortcut', label: 'Raccourci clavier', isScreenLevel: true },
];

/** Types d'action et la cible qu'ils demandent. */
export const ACTION_TYPES = [
  { value: 'none', label: 'Aucune' },
  { value: 'navigate', label: 'Aller à un écran', targetKind: 'screen' },
  { value: 'openDialog', label: 'Ouvrir un écran en fenêtre (dialogue)', targetKind: 'screen' },
  { value: 'closeDialog', label: 'Fermer le dialogue' },
  { value: 'openContextMenu', label: 'Ouvrir un menu contextuel', targetKind: 'menu' },
  { value: 'showPage', label: 'Afficher une page (pile de pages)', targetKind: 'pageStack' },
  { value: 'toggleVisibility', label: 'Afficher / cacher un widget', targetKind: 'widget' },
  { value: 'changeVariable', label: 'Changer une variable de test', targetKind: 'variable' },
  { value: 'custom', label: 'Action perso (décrite)' },
];

const MENU_SEPARATOR_TEXT = '---';
const SUBMENU_INDENT = '  ';

/**
 * Transforme les éléments d'un menu en texte éditable (une ligne par élément).
 * « Texte | raccourci | lucide:icône », « --- » = séparateur, 2 espaces devant = élément de sous-menu.
 * @param {object[]} menuItems éléments
 * @returns {string} texte
 */
export function convertMenuItemsToText(menuItems) {
  const lines = [];
  const appendItems = (items, indent) => {
    for (const menuItem of items ?? []) {
      if (menuItem.separator) { lines.push(`${indent}${MENU_SEPARATOR_TEXT}`); continue; }
      const parts = [menuItem.label ?? ''];
      if (menuItem.shortcut || menuItem.icon) parts.push(menuItem.shortcut ?? '');
      if (menuItem.icon) parts.push(menuItem.icon);
      lines.push(`${indent}${parts.join(' | ')}`);
      if (menuItem.submenu) appendItems(menuItem.submenu, indent + SUBMENU_INDENT);
    }
  };
  appendItems(menuItems, '');
  return lines.join('\n');
}

/**
 * Lit le texte d'un menu. Les actions / états des éléments existants sont gardés (même texte).
 * @param {string} menuText texte
 * @param {object[]} previousItems éléments actuels (pour garder leurs actions)
 * @returns {object[]} éléments
 */
export function parseMenuText(menuText, previousItems) {
  const previousByLabel = new Map();
  const rememberItems = (items) => (items ?? []).forEach((menuItem) => {
    if (!menuItem.separator) previousByLabel.set(menuItem.label, menuItem);
    rememberItems(menuItem.submenu);
  });
  rememberItems(previousItems);
  const parsedItems = [];
  for (const rawLine of menuText.split('\n')) {
    if (!rawLine.trim()) continue;
    const isSubmenuItem = rawLine.startsWith(SUBMENU_INDENT) || rawLine.startsWith('\t');
    const lineText = rawLine.trim();
    let menuItem;
    if (lineText === MENU_SEPARATOR_TEXT) {
      menuItem = { separator: true };
    } else {
      const [label, shortcut = '', icon = ''] = lineText.split('|').map((part) => part.trim());
      const previousItem = previousByLabel.get(label) ?? {};
      menuItem = { label, shortcut, icon, action: previousItem.action ?? { type: 'none' } };
      if (previousItem.enabled === false) menuItem.enabled = false;
      if (previousItem.checked) menuItem.checked = true;
    }
    const parentItem = parsedItems[parsedItems.length - 1];
    if (isSubmenuItem && parentItem && !parentItem.separator) (parentItem.submenu ??= []).push(menuItem);
    else parsedItems.push(menuItem);
  }
  return parsedItems;
}

/**
 * Liste à plat des éléments (non séparateurs) d'un menu, sous-menus compris, avec leur chemin.
 * @param {object[]} menuItems éléments
 * @returns {Array<{menuItem: object, displayLabel: string}>} éléments
 */
export function flattenMenuItems(menuItems) {
  const flatItems = [];
  const visitItems = (items, prefix) => (items ?? []).forEach((menuItem) => {
    if (menuItem.separator) return;
    flatItems.push({ menuItem, displayLabel: `${prefix}${menuItem.label}` });
    visitItems(menuItem.submenu, `${prefix}${menuItem.label} › `);
  });
  visitItems(menuItems, '');
  return flatItems;
}

/**
 * Renvoie les déclencheurs à essayer, dans l'ordre, pour un geste du mode test.
 * @param {string} gesture geste détecté (click, doubleClick, rightClick, middleClick, tap, doubleTap, longPress, pencilTap…)
 * @returns {string[]} déclencheurs (le premier trouvé sur l'élément gagne)
 */
export function getTriggerFallbacks(gesture) {
  const fallbacks = {
    tap: ['tap', 'click'], doubleTap: ['doubleTap', 'doubleClick'], longPress: ['longPress', 'rightClick'],
    pencilTap: ['pencilTap', 'tap', 'click'], pencilDoubleTap: ['pencilDoubleTap'],
  };
  return fallbacks[gesture] ?? [gesture];
}
