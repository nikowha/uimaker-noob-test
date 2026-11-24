// Catalogue des types de widgets, préréglages d'écran et valeurs par défaut (PROTOTYPE).

/** Préréglages de format d'écran (taille en pixels logiques, orientation de base). */
export const SCREEN_PRESETS = [
  { key: '16:9', label: '16/9 — 1920×1080', width: 1920, height: 1080, platform: 'windows' },
  { key: '16:9-small', label: '16/9 — 1280×720', width: 1280, height: 720, platform: 'windows' },
  { key: 'ipad', label: 'iPad 11" — 1180×820', width: 1180, height: 820, platform: 'ipados' },
  { key: 'ipad-13', label: 'iPad 13" — 1376×1032', width: 1376, height: 1032, platform: 'ipados' },
  { key: 'smartphone', label: 'Smartphone iPhone — 393×852', width: 393, height: 852, platform: 'ios', portrait: true,
    safeArea: { top: 59, right: 0, bottom: 34, left: 0 } },
  { key: 'smartphone-android', label: 'Smartphone Android — 412×915', width: 412, height: 915, platform: 'any', portrait: true },
  { key: 'custom', label: 'Personnalisé — 1024×768', width: 1024, height: 768, platform: 'any' },
];

export const PLATFORMS = ['windows', 'macos', 'linux', 'ios', 'ipados', 'web', 'any'];

export const ANCHORS = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight', 'stretch'];

/**
 * Types de widgets du catalogue V1.
 * - label : nom affiché dans la bibliothèque ; libraryIcon : icône Lucide de la bibliothèque
 * - defaults : valeurs d'un nouveau widget
 * - fields : champs éditables (target = content ou state)
 * - isContainer : contient d'autres widgets (widgetLayout + children)
 */
export const WIDGET_TYPES = {
  button: {
    label: 'Bouton', libraryIcon: 'rectangle-horizontal',
    defaults: { name: 'Button', content: { label: 'Button', icon: '', iconPosition: 'start' }, size: { width: 'hug', height: 32 } },
    fields: [
      { target: 'content', key: 'label', label: 'Texte', kind: 'text' },
      { target: 'content', key: 'icon', label: 'Icône', kind: 'icon' },
      { target: 'content', key: 'iconPosition', label: 'Position icône', kind: 'select', options: ['start', 'end', 'only'] },
    ],
  },
  text: {
    label: 'Texte', libraryIcon: 'type',
    defaults: { name: 'Label', content: { text: 'Text', textRole: 'body', align: 'start' }, size: { width: 'hug', height: 'hug' } },
    fields: [
      { target: 'content', key: 'text', label: 'Texte', kind: 'textarea' },
      { target: 'content', key: 'textRole', label: 'Rôle', kind: 'select', options: ['title', 'subtitle', 'body', 'caption'] },
      { target: 'content', key: 'align', label: 'Alignement', kind: 'select', options: ['start', 'center', 'end'] },
    ],
  },
  textField: {
    label: 'Champ texte', libraryIcon: 'text-cursor-input',
    defaults: { name: 'TextField', content: { placeholder: 'Type here…', value: '', inputKind: 'text', multiline: false }, size: { width: 'fill', height: 32 } },
    fields: [
      { target: 'content', key: 'placeholder', label: 'Indication', kind: 'text' },
      { target: 'content', key: 'value', label: 'Valeur', kind: 'text' },
      { target: 'content', key: 'inputKind', label: 'Type de saisie', kind: 'select', options: ['text', 'email', 'password', 'number', 'search'] },
      { target: 'content', key: 'multiline', label: 'Multiligne', kind: 'checkbox' },
    ],
  },
  checkbox: {
    label: 'Case à cocher', libraryIcon: 'square-check',
    defaults: { name: 'Checkbox', content: { label: 'Option', appearance: 'box' }, state: { checked: true }, size: { width: 'hug', height: 24 } },
    fields: [
      { target: 'content', key: 'label', label: 'Texte', kind: 'text' },
      { target: 'state', key: 'checked', label: 'Cochée', kind: 'checkbox' },
      { target: 'content', key: 'appearance', label: 'Affichage', kind: 'select', options: ['box', 'button'] },
      { target: 'content', key: 'checkedColor', label: 'Couleur cochée', kind: 'color' },
    ],
  },
  toggle: {
    label: 'Interrupteur', libraryIcon: 'toggle-right',
    defaults: { name: 'Toggle', content: { label: 'Option' }, state: { on: true }, size: { width: 'hug', height: 24 } },
    fields: [
      { target: 'content', key: 'label', label: 'Texte', kind: 'text' },
      { target: 'state', key: 'on', label: 'Activé', kind: 'checkbox' },
    ],
  },
  slider: {
    label: 'Curseur', libraryIcon: 'sliders-horizontal',
    defaults: { name: 'Slider', content: { min: 0, max: 100, step: 1, value: 40, orientation: 'horizontal' }, size: { width: 'fill', height: 24 } },
    fields: [
      { target: 'content', key: 'min', label: 'Min', kind: 'number' },
      { target: 'content', key: 'max', label: 'Max', kind: 'number' },
      { target: 'content', key: 'step', label: 'Pas', kind: 'number' },
      { target: 'content', key: 'value', label: 'Valeur', kind: 'number' },
      { target: 'content', key: 'orientation', label: 'Orientation', kind: 'select', options: ['horizontal', 'vertical'] },
    ],
  },
  dropdown: {
    label: 'Liste déroulante', libraryIcon: 'chevrons-up-down',
    defaults: { name: 'Dropdown', content: { options: ['Option 1', 'Option 2'], selectedIndex: 0 }, size: { width: 'fill', height: 32 } },
    fields: [
      { target: 'content', key: 'options', label: 'Options (une par ligne)', kind: 'lines' },
      { target: 'content', key: 'selectedIndex', label: 'Choisie (index)', kind: 'number' },
    ],
  },
  list: {
    label: 'Liste', libraryIcon: 'list',
    defaults: { name: 'ItemList', content: { items: [{ label: 'Item 1', icon: '' }, { label: 'Item 2', icon: '' }, { label: 'Item 3', icon: '' }], selectedIndex: 0, scroll: 'auto' },
      size: { width: 'fill', height: 120 } },
    fields: [
      { target: 'content', key: 'items', label: 'Éléments (un par ligne)', kind: 'itemLines' },
      { target: 'content', key: 'selectedIndex', label: 'Sélection (index, -1 = aucune)', kind: 'number' },
      { target: 'content', key: 'controlsPageStack', label: 'Pilote la pile de pages', kind: 'pageStackRef' },
    ],
  },
  table: {
    label: 'Tableau', libraryIcon: 'table',
    defaults: { name: 'DataTable',
      content: { columns: [{ label: 'Name', width: 'fill' }, { label: 'Type', width: 100 }, { label: 'Size', width: 80 }],
        rows: [['Item A', 'Mesh', '12 MB'], ['Item B', 'Light', '1 KB'], ['Item C', 'Camera', '2 KB']],
        headerVisible: true, selectedRow: 0, striped: true },
      size: { width: 'fill', height: 160 } },
    fields: [
      { target: 'content', key: 'columns', label: 'Colonnes (Nom | largeur)', kind: 'tableColumns' },
      { target: 'content', key: 'rows', label: 'Lignes (cellules séparées par |)', kind: 'tableRows' },
      { target: 'content', key: 'headerVisible', label: 'En-tête visible', kind: 'checkbox' },
      { target: 'content', key: 'striped', label: 'Lignes alternées', kind: 'checkbox' },
      { target: 'content', key: 'selectedRow', label: 'Ligne sélectionnée (-1 = aucune)', kind: 'number' },
    ],
  },
  icon: {
    label: 'Icône', libraryIcon: 'star',
    defaults: { name: 'Icon', content: { icon: 'lucide:star', size: 20 }, size: { width: 'hug', height: 'hug' } },
    fields: [
      { target: 'content', key: 'icon', label: 'Icône', kind: 'icon' },
      { target: 'content', key: 'size', label: 'Taille', kind: 'number' },
    ],
  },
  tabs: {
    label: 'Onglets', libraryIcon: 'panels-top-left',
    defaults: { name: 'Tabs', content: { tabs: [{ label: 'Tab 1', icon: '' }, { label: 'Tab 2', icon: '' }], selectedIndex: 0 }, size: { width: 'fill', height: 32 } },
    fields: [
      { target: 'content', key: 'tabs', label: 'Onglets (un par ligne)', kind: 'itemLines' },
      { target: 'content', key: 'selectedIndex', label: 'Onglet actif (index)', kind: 'number' },
      { target: 'content', key: 'controlsPageStack', label: 'Pilote la pile de pages', kind: 'pageStackRef' },
    ],
  },
  menuBar: {
    label: 'Barre de menus', libraryIcon: 'menu',
    defaults: { name: 'MenuBar', content: { menus: [{ label: 'File', menuId: '' }, { label: 'Edit', menuId: '' }, { label: 'View', menuId: '' }] }, size: { width: 'fill', height: 28 } },
    fields: [
      { target: 'content', key: 'menus', label: 'Menus de la barre (texte → menu de la section « Menus » à droite)', kind: 'menuLinks' },
    ],
  },
  toolbar: {
    label: 'Barre d\'outils', libraryIcon: 'wrench', isContainer: true,
    defaults: { name: 'Toolbar', size: { width: 'fill', height: 40 },
      widgetLayout: { mode: 'stack', direction: 'horizontal', gap: 4, padding: [4, 4, 4, 4], alignMain: 'start', alignCross: 'center' } },
    fields: [],
  },
  separator: {
    label: 'Séparateur', libraryIcon: 'minus',
    defaults: { name: 'Separator', content: { orientation: 'horizontal' }, size: { width: 'fill', height: 1 } },
    fields: [
      { target: 'content', key: 'orientation', label: 'Orientation', kind: 'select', options: ['horizontal', 'vertical'] },
    ],
  },
  container: {
    label: 'Conteneur', libraryIcon: 'square-dashed', isContainer: true,
    defaults: { name: 'Panel', content: { title: '' }, size: { width: 'fill', height: 160 },
      widgetLayout: { mode: 'stack', direction: 'vertical', gap: 8, padding: [8, 8, 8, 8], alignMain: 'start', alignCross: 'stretch' } },
    fields: [
      { target: 'content', key: 'title', label: 'Titre (facultatif)', kind: 'text' },
    ],
  },
  pageStack: {
    label: 'Pile de pages', libraryIcon: 'layers', isContainer: true,
    defaults: { name: 'PageStack', content: { activeIndex: 0 }, size: { width: 'fill', height: 'fill' },
      widgetLayout: { mode: 'stack', direction: 'vertical', gap: 0, padding: [0, 0, 0, 0], alignMain: 'start', alignCross: 'stretch' } },
    fields: [
      { target: 'content', key: 'activeIndex', label: 'Page affichée', kind: 'pageSelect' },
    ],
  },
  repeat: {
    label: 'Répétition', libraryIcon: 'repeat',
    defaults: { name: 'Repeat', content: { itemModuleId: '', previewCount: 4, countSource: '', minCount: 0, maxCount: 64, direction: 'horizontal', distribution: 'share',
      itemSize: 40, itemMinSize: 0, crossSize: 'fill', gap: 4, positionSource: '', alternateEvery: 1 }, size: { width: 'fill', height: 60 } },
    fields: [
      { target: 'content', key: 'itemModuleId', label: 'Module répété', kind: 'moduleSelect' },
      { target: 'content', key: 'previewCount', label: 'Nombre d\'exemple', kind: 'number', min: 0, max: 64 },
      { target: 'content', key: 'countVariableId', label: 'Relier à la variable', kind: 'numberVariable' },
      { target: 'content', key: 'countSource', label: 'Nombre dans l\'app (source)', kind: 'text', placeholder: 'ex. beat.steps' },
      { target: 'content', key: 'minCount', label: 'Nombre min', kind: 'number', min: 0 },
      { target: 'content', key: 'maxCount', label: 'Nombre max', kind: 'number', min: 0 },
      { target: 'content', key: 'direction', label: 'Direction', kind: 'select', options: [{ value: 'horizontal', label: 'Horizontale' }, { value: 'vertical', label: 'Verticale' }] },
      { target: 'content', key: 'distribution', label: 'Placement', kind: 'select', options: [{ value: 'share', label: 'Se partager la place' }, { value: 'fixed', label: 'Taille fixe + défilement' },
        { value: 'wrap', label: 'Retour à la ligne' }, { value: 'position', label: 'Selon une position (temps…)' }] },
      { target: 'content', key: 'itemMinSize', label: 'Taille min d\'un élément (défile en dessous)', kind: 'number', min: 0 },
      { target: 'content', key: 'itemSize', label: 'Taille fixe d\'un élément', kind: 'number', min: 1 },
      { target: 'content', key: 'crossSize', label: 'Autre sens', kind: 'select', options: [{ value: 'fill', label: 'Remplir' }, { value: 'module', label: 'Taille du module' }] },
      { target: 'content', key: 'gap', label: 'Espacement', kind: 'number', min: 0 },
      { target: 'content', key: 'positionSource', label: 'Position dans l\'app (source)', kind: 'text', placeholder: 'ex. step.start, step.duration' },
      { target: 'content', key: 'alternateColor', label: 'Fond alterné', kind: 'color' },
      { target: 'content', key: 'alternateEvery', label: 'Alterner tous les', kind: 'number', min: 1 },
    ],
  },
  placeholder: {
    label: 'Placeholder', libraryIcon: 'box',
    defaults: { name: 'CustomView', content: { description: 'Vue codée plus tard' }, displayColor: '#5B6B8C', size: { width: 'fill', height: 'fill' } },
    fields: [
      { target: 'content', key: 'description', label: 'Description pour le codeur', kind: 'textarea' },
      { target: 'widget', key: 'displayColor', label: 'Couleur d\'affichage', kind: 'rawColor' },
    ],
  },
};

/** Champs d'apparence communs aux styles, aux areas et aux widgets. */
export const APPEARANCE_FIELDS = [
  { key: 'background', label: 'Fond', kind: 'color' },
  { key: 'textColor', label: 'Couleur du texte', kind: 'color' },
  { key: 'borderWidth', label: 'Bordure (épaisseur)', kind: 'number', min: 0 },
  { key: 'borderColor', label: 'Bordure (couleur)', kind: 'color' },
  { key: 'radius', label: 'Arrondi', kind: 'number', min: 0 },
  { key: 'fontSize', label: 'Taille du texte', kind: 'number', min: 1 },
  { key: 'fontWeight', label: 'Graisse', kind: 'select', options: ['', '400', '500', '600', '700'] },
  { key: 'padding', label: 'Marges internes (h d b g)', kind: 'padding' },
  { key: 'opacity', label: 'Opacité (0–1)', kind: 'number', step: 0.01, min: 0, max: 1 },
];

/** Cibles possibles d'un style (appliesTo). */
export const STYLE_TARGETS = ['any', 'area', ...Object.keys(WIDGET_TYPES)];
