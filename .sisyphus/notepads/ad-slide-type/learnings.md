# Learnings - Ad Slide Type Implementation

## Conventions & Patterns

### HTML Structure Pattern (Task 1: HTML Structure)

The ad slide type follows the same pattern as existing slide types (simple, hymn):

#### Slide Type Selector
- Location: `public/index.html` line 194-197
- Pattern: `<option value="ad">광고</option>` added to the `#slideType` select element
- Consistent with existing options (simple, hymn)

#### Settings Container
- ID: `#adSlideSettings`
- Class: `settings-group` (reused from simple/hymn)
- Initial state: `style="display:none;"` (hidden until selected)
- Location: After hymn settings (line 278-335)

#### Form Control Structure
- **Title Input** (`#adTitle`): text input with placeholder
- **Title Size** (`#adTitleSize`): select with options 대/중/소 (default: 중)
- **Title Alignment** (`#adTitleAlign`): select with options 왼쪽/가운데/오른쪽 (default: 가운데)
- **Background Source** (`name="adBgSource"`): radio buttons (none/file/url)
- **File Upload** (`#adBgImageFile`): file input accepting image/jpeg,image/png
- **URL Input** (`#adBgImageUrl`): text input for image URL
- **Opacity Slider** (`#adBgOpacity`): range 0-100, default 30, with display span

#### CSS Classes Reused
- `.settings-group` - Main container
- `.field` - Individual form field wrapper
- `.split-fields` - Two fields side-by-side (size + alignment)
- `.radio-group` - Radio button container
- `.hint` - Helper text styling

#### Key Design Decisions
1. **Conditional Display**: File and URL sections use `style="display:none;"` and toggle via radio selection
2. **Default Values**: size=중, align=가운데, source=none, opacity=30%
3. **File Restrictions**: JPEG/PNG only via accept attribute, hint mentions 5MB max
4. **Accessibility**: All inputs have labels and clear placeholders

#### Verification Results
- "광고" option appears in dropdown (verified via curl)
- All 6 form control IDs present in served HTML
- Server running on http://localhost:3000 successfully serves updated HTML

## JavaScript Implementation Pattern (Task 2: JavaScript Logic)

### DOM Element References
- Location: `public/app.js` lines 376-403
- Pattern: All ad-specific controls referenced at top of file alongside other slide type controls
- References added:
  - `adSlideSettings` - Main settings container
  - `adTitleInput`, `adTitleSizeSelect`, `adTitleAlignSelect` - Title controls
  - `adBgSourceRadios` - Radio button group for background source selection
  - `adBgImageFile`, `adBgImageUrl` - File/URL input controls
  - `adBgOpacity`, `adBgOpacityValue` - Opacity slider and display span

### createSlide() Function Extension
- Location: `public/app.js` lines 515-545
- Pattern: Ad properties added to new slide object with sensible defaults
- Properties added:
  - `adTitle: ""` - Empty string default
  - `adTitleSize: "medium"` - Default to medium size
  - `adTitleAlign: "center"` - Default to center alignment
  - `adBgSource: "none"` - Default to no background
  - `adBgImagePath: null` - File path placeholder
  - `adBgImageUrl: null` - URL placeholder
  - `adBgOpacity: 30` - Default 30% opacity

### Slide Type Change Event Listener
- Location: `public/app.js` lines 410-427
- Pattern: Three-way conditional for slide type visibility
- Logic:
  - `type === 'hymn'`: Hide simple/ad, show hymn
  - `type === 'ad'`: Show simple + ad, hide hymn (ad slides reuse simple slide settings)
  - `type === 'simple'`: Show simple, hide hymn/ad
- Key insight: Ad slides combine simple slide settings (content, font, fontSize, bg, align) with ad-specific settings

### populateEditor() Function Extension
- Location: `public/app.js` lines 1135-1213
- Pattern: Three-way conditional matching slide type change event
- Ad type handling:
  - Loads simple slide properties (content, font, fontSize, bg, align, sourceType)
  - Loads ad-specific properties (adTitle, adTitleSize, adTitleAlign, adBgOpacity)
  - Sets background source radio buttons and calls toggleAdBgMode()
  - Clears file input to prevent stale data

### toggleAdBgMode() Helper Function
- Location: `public/app.js` lines 1225-1237
- Pattern: Mirrors toggleSettingsMode() for simple slides
- Logic:
  - `source === "file"`: Show file input, hide URL input
  - `source === "url"`: Show URL input, hide file input
  - `source === "none"`: Hide both file and URL inputs
- Uses `document.getElementById()` to find conditional display divs (#adBgFileMode, #adBgUrlMode)

### Event Listeners for Ad Controls
- Location: `public/app.js` lines 1642-1656
- Pattern: Follows existing radio button and input listener patterns

#### Background Source Radio Buttons
```javascript
adBgSourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    hasUnsavedChanges = true;
    toggleAdBgMode(e.target.value);
    renderPreview();
  })
});
```
- Sets unsaved changes flag
- Toggles visibility of file/URL inputs
- Triggers preview update

#### Opacity Slider
```javascript
adBgOpacity.addEventListener('input', () => {
  adBgOpacityValue.textContent = adBgOpacity.value;
  hasUnsavedChanges = true;
  renderPreview();
});
```
- Updates display span in real-time as user drags slider
- Sets unsaved changes flag
- Triggers preview update

### Key Design Patterns Observed
1. **Reuse of Simple Slide Settings**: Ad slides inherit content, font, fontSize, bg, align from simple slides
2. **Conditional Visibility**: Settings containers hidden/shown based on slide type selection
3. **Radio Button Toggling**: Background source radio buttons control visibility of file/URL input sections
4. **Real-time Preview**: All input changes trigger renderPreview() for live feedback
5. **Unsaved Changes Tracking**: All modifications set hasUnsavedChanges = true for save prompt
6. **Consistent Naming**: Ad-specific properties prefixed with "ad" (adTitle, adBgSource, etc.)

### Code Organization
- DOM references grouped at top of file (lines 376-403)
- Functions organized by purpose: createSlide, populateEditor, toggleAdBgMode, event listeners
- Event listeners added at end of file with other UI event handlers
- Comments used to separate ad-specific logic from simple slide logic

### Verification
- JavaScript syntax validated with `node -c`
- Server running successfully on http://localhost:3000
- Ad option appears in slide type dropdown
- All DOM references resolve correctly
