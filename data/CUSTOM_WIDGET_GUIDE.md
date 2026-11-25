# Guide : écrire un custom widget pour UImaker_noob

> Pour la **session Claude** qui écrit le code. L'utilisateur te décrit un widget ; tu lui rends **un seul fichier**
> `NomDuWidget.uimwidget`, qu'il importe dans UImaker_noob (fenêtre de droite → Custom widgets → Importer).
> S'il manque une règle de comportement, demande-lui avant de coder.

Le custom widget sert à **essayer** l'UI (bouton « ▶ Tester », sur PC et iPad). Le code web sert aussi de référence à la session
qui codera la vraie app (SwiftUI, WinUI, Qt…) : sois clair, et remplis `nativeNotes`.

## 1. Le fichier

JSON en UTF-8 :

```json
{
  "format": "uimaker-noob-custom-widget",
  "formatVersion": "1",
  "widget": {
    "libraryId": "un UUID, créé une fois, gardé pour toutes les versions",
    "version": 1,
    "updatedAt": "2026-11-25T12:00:00.000Z",
    "name": "Knob",
    "description": "Potard rotatif.",
    "tags": ["knob", "potard"],
    "basedOn": "",
    "size": { "width": 72, "height": 92 },
    "params": [
      { "key": "value", "label": "Valeur", "type": "number", "min": 0, "max": 100, "step": 1, "default": 50 },
      { "key": "label", "label": "Texte", "type": "text", "default": "Volume" },
      { "key": "accentColor", "label": "Couleur", "type": "color", "default": "#4C8DFF" }
    ],
    "events": [ { "name": "doubleTap", "description": "Double tap sur le potard" } ],
    "html": "<div id=\"knob\"></div>",
    "css": "#knob { width: 100%; height: 100%; }",
    "js": "uimaker.onUpdate(({ params }) => { … });",
    "previewSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 72 92\">…</svg>",
    "nativeNotes": "SwiftUI : …"
  }
}
```

| Champ | Règle |
|---|---|
| `libraryId` | UUID. **Nouveau widget** : en créer un. **Modification** : garder le même et **augmenter `version`** |
| `name` | Nom court (anglais de préférence) : il devient le nom du widget |
| `params[].key`, `events[].name` | Lettres et chiffres, commence par une lettre (`accentColor`). Unique. Ne pas renommer d'une version à l'autre |
| `params[].type` | `number` (`min`, `max`, `step`), `text`, `boolean`, `choice` (`choices` : liste de textes), `color` |
| `params[].label` | Nom affiché à l'utilisateur, en français |
| `basedOn` | Type du widget de base modifié (`button`…), ou vide. L'app propose alors de **remplacer** ce type de widget : mêmes `key` = valeurs reprises ; une liste devient un `text` séparé par ` \| ` |
| `size` | Taille de départ en px. L'utilisateur peut la changer : le widget doit **suivre la taille** (100 %) |
| `previewSvg` | Image fixe dans l'éditeur (le code n'y tourne pas). SVG simple : formes, textes, dégradés. Sont retirés : `style`, `class`, scripts, liens, images, filtres, `use`. `currentColor` = couleur du texte. Ne pas mettre `width`/`height`, seulement `viewBox` |
| `nativeNotes` | Comment recoder ce widget en natif : gestes, dessin, valeurs, accessibilité |

## 2. Ce que le code peut faire

Le widget tourne dans une **iframe isolée** : pas de réseau, pas de stockage, pas d'accès à l'app, pas d'`eval` ni `new Function`,
pas de bibliothèque externe. Tout est dans le fichier (images et polices en `data:`). `html` est le contenu du `body` ; `js` est un script
classique lancé après. Ne pas mettre d'attribut `srcdoc`, d'iframe, ni de `</style` dans le CSS. Fond transparent par défaut.

Un objet global **`uimaker`** est fourni :

| Membre | Rôle |
|---|---|
| `uimaker.onUpdate(fn)` | `fn(uimaker)` au départ, puis à chaque changement de réglage, thème ou taille. **Redessiner ici** |
| `uimaker.params` | Réglages actuels : `{ value: 50, … }`. Les couleurs sont déjà en `#RRGGBB` |
| `uimaker.theme` | Couleurs du projet par nom : `{ background, surface, textMain, textMuted, accent, border… }` (si elles existent). Aussi en CSS : `var(--accent, #4c8dff)` |
| `uimaker.size` | `{ width, height }` en px |
| `uimaker.isEnabled` | Faux si le widget est inactif |
| `uimaker.setParam(key, value)` | L'utilisateur a changé un réglage (ex. il tourne le potard). L'app le garde et peut lancer une action |
| `uimaker.emit(name, data)` | Lance un événement déclaré dans `events` |
| `uimaker.trackDrag(element, { onStart, onMove, onEnd })` | Suit un glisser à la souris, au doigt ou au Pencil, même hors du widget. Chaque fonction reçoit `{ x, y, deltaX, deltaY, pressure, pointerType, event }` |

L'app limite elle-même les valeurs à `min` / `max` / `choices`. Après `setParam`, redessine tout de suite (`onUpdate` n'est pas
rappelé pour ta propre valeur, sauf si l'app l'a corrigée).

## 3. iPad : à respecter

- Glisser : **toujours `uimaker.trackDrag`**. Ne pas utiliser `setPointerCapture` (il bloque les gestes suivants sur iPad).
- Toucher simple : `pointerup` sur l'élément. Les vrais `button`, `input`, `select`, `textarea`, `a` et `label` marchent normalement ;
  sur les autres éléments l'événement `click` n'arrive **pas** au doigt. Ajouter `data-native` pour laisser le toucher par défaut.
- Zones à toucher d'au moins 32 px. Rien qui dépende seulement du survol.
- Pas d'animation permanente : `requestAnimationFrame` seulement pendant un mouvement (20 widgets peuvent tourner ensemble).

## 4. Code

Noms anglais explicites (pas de lettre seule), une fonction par rôle, un commentaire **en français** par fonction. Tester les valeurs
extrêmes, une petite et une grande taille, un thème clair et un sombre.

## 5. Modifier un custom widget existant

L'utilisateur te donne son `.uimwidget`. Garde `libraryId`, les `key` et les noms d'événements déjà là, augmente `version` de 1,
mets `updatedAt` à jour. UImaker_noob **propose** la mise à jour dans chaque projet ; les réglages dont la `key` existe encore sont gardés.

Exemple complet : `knob.uimwidget` (bouton « Exemple (potard) », puis « Exporter »).
