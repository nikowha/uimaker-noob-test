// Calcul de l'apparence : style lié + valeurs propres à l'élément + thème (PROTOTYPE).

const FALLBACK_COLOR = '#FF00FF';

/**
 * Résout une couleur : "#RRGGBB" tel quel, "$V3" → valeur de la variable dans le thème courant.
 * @param {object} uiDocument document
 * @param {string} colorValue couleur ou référence de variable
 * @param {string} themeId thème courant
 * @returns {string} couleur CSS
 */
export function resolveColor(uiDocument, colorValue, themeId) {
  if (typeof colorValue !== 'string' || !colorValue.startsWith('$')) return colorValue;
  const colorVariable = uiDocument.colorVariables[colorValue.slice(1)];
  if (!colorVariable) return FALLBACK_COLOR;
  return colorVariable.values[themeId] ?? Object.values(colorVariable.values)[0] ?? FALLBACK_COLOR;
}

/**
 * Fusionne le style lié et les valeurs propres de l'élément.
 * @param {object} uiDocument document
 * @param {object} node area ou widget
 * @returns {object} apparence finale (clés de APPEARANCE_FIELDS)
 */
export function resolveAppearance(uiDocument, node) {
  const linkedStyle = node.style ? uiDocument.styles[node.style] ?? {} : {};
  const { name: unusedName, appliesTo: unusedTarget, ...styleValues } = linkedStyle;
  return { ...styleValues, ...(node.styleOverrides ?? {}) };
}

/**
 * Écrit les variables de couleur du thème en propriétés CSS (--ui-<nom>) sur un élément.
 * Les apparences par défaut des widgets utilisent --ui-background, --ui-surface, --ui-textMain,
 * --ui-textMuted, --ui-accent, --ui-border si ces variables existent.
 * @param {HTMLElement} element élément racine de l'écran
 * @param {object} uiDocument document
 * @param {string} themeId thème
 */
export function applyThemeVariables(element, uiDocument, themeId) {
  for (const [variableId, colorVariable] of Object.entries(uiDocument.colorVariables)) {
    element.style.setProperty(`--ui-${colorVariable.name}`, resolveColor(uiDocument, `$${variableId}`, themeId));
  }
}

/**
 * Applique une apparence à un élément DOM.
 * @param {HTMLElement} element élément
 * @param {object} appearance apparence résolue
 * @param {object} uiDocument document
 * @param {string} themeId thème
 * @param {boolean} isPaddingApplied vrai pour appliquer padding (widgets) ; les areas utilisent widgetLayout.padding
 */
export function applyAppearanceToElement(element, appearance, uiDocument, themeId, isPaddingApplied) {
  const elementStyle = element.style;
  if (appearance.background) elementStyle.background = resolveColor(uiDocument, appearance.background, themeId);
  if (appearance.textColor) elementStyle.color = resolveColor(uiDocument, appearance.textColor, themeId);
  if (appearance.borderWidth !== undefined && appearance.borderWidth !== '') {
    const borderColor = resolveColor(uiDocument, appearance.borderColor ?? '$', themeId);
    const borderValue = `${appearance.borderWidth}px solid ${appearance.borderColor ? borderColor : 'currentColor'}`;
    const borderSides = appearance.borderSides ?? ['top', 'right', 'bottom', 'left'];
    for (const borderSide of borderSides) elementStyle[`border${borderSide[0].toUpperCase()}${borderSide.slice(1)}`] = borderValue;
  }
  if (appearance.radius !== undefined && appearance.radius !== '') elementStyle.borderRadius = `${appearance.radius}px`;
  if (appearance.fontSize) elementStyle.fontSize = `${appearance.fontSize}px`;
  if (appearance.fontWeight) elementStyle.fontWeight = appearance.fontWeight;
  if (appearance.fontFamily && appearance.fontFamily !== 'system') elementStyle.fontFamily = appearance.fontFamily;
  if (isPaddingApplied && Array.isArray(appearance.padding)) elementStyle.padding = appearance.padding.map((paddingValue) => `${paddingValue}px`).join(' ');
  if (appearance.opacity !== undefined && appearance.opacity !== '') elementStyle.opacity = appearance.opacity;
}
