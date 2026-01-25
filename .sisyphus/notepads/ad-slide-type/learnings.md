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

## Preview Rendering Pattern (Task 3: renderPreview() Extension)

### Two-Part Modification Approach

The `renderPreview()` function in `public/app.js` was extended to handle ad slide type preview rendering through two distinct modifications:

#### PART A: Ad Type Data Collection (lines 599-627)
- **Location**: Inside the `if (!data)` block where live preview data is collected from form inputs
- **Pattern**: Three-way conditional branching for slide types
  - `if (type === 'hymn')`: Hymn-specific data collection
  - `else if (type === 'ad')`: Ad-specific data collection (NEW)
  - `else`: Simple slide data collection (default)
- **Ad Data Properties Collected**:
  - Simple slide properties: `name`, `type`, `sourceType`, `content`, `font`, `fontSize`, `bg`, `align`
  - Ad-specific properties: `adTitle`, `adTitleSize`, `adTitleAlign`, `adBgSource`, `adBgImageUrl`, `adBgOpacity`
  - File references: `file` (for PPTX upload), `adBgImageFile` (for background image)
- **Key Detail**: `adBgOpacity` is parsed as integer from slider value (0-100 range)

#### PART B: Ad Slide Rendering Logic (inserted before line 918)
- **Location**: Before the "// Basic Render" section, after upload source type handling
- **Trigger Condition**: `if (data.type === 'ad' && data.sourceType === 'basic')`
- **Rendering Structure** (4-layer approach):
  1. **Container Setup**: Creates div with `position: relative` and `overflow: hidden`
  2. **Background Layer**: 
     - File source: Uses FileReader to convert local file to data URL
     - URL source: Direct CSS background-image with URL
     - No source: Falls back to bg color (black/white)
     - CSS: `background-size: cover`, `background-position: center`
  3. **Overlay Layer**: 
     - Absolute positioned div covering entire container
     - `backgroundColor: rgba(0,0,0,${opacity/100})`
     - `pointer-events: none` to prevent interaction blocking
  4. **Content Layer** (relative z-index: 1):
     - Flex container with column direction
     - **Title Section** (if adTitle exists):
       - Bold text with color based on bg (white if black bg, black if white bg)
       - Text alignment from adTitleAlign
       - Font size mapping: `{ large: "24px", medium: "18px", small: "14px" }`
       - Bottom margin: 20px
     - **Content Section**:
       - Flex: 1 to fill remaining space
       - Centered alignment (flex center)
       - Font family from data.font
       - Text color matches title color logic
       - Text alignment from data.align
       - Content split by newlines, each line in separate div
       - Font size: `${data.fontSize || 40}px`
       - Font weight: bold
       - Line height: 1.2

### Title Size Mapping
The preview uses a three-tier size system for ad titles:
- `large`: 24px (대)
- `medium`: 18px (중) - default
- `small`: 14px (소)

### Color Logic Pattern
Both title and content use the same color determination:
```
color = (data.bg === "black") ? "white" : "black"
```
This ensures text is always readable against the background.

### FileReader Pattern for Local Images
When background source is 'file' with an image file:
```javascript
const reader = new FileReader();
reader.onload = (e) => {
  container.style.backgroundImage = `url(${e.target.result})`;
  // ... other styles
};
reader.readAsDataURL(data.adBgImageFile);
```
This converts the File object to a data URL for preview rendering.

### Early Return Pattern
Both ad slide rendering and upload source type rendering use `return;` to exit the function early, preventing fallthrough to the "Basic Render" section.

### Verification
- Syntax validation: `node -c public/app.js` passes without errors
- No modifications to existing simple/hymn rendering logic
- No CSS file modifications required
- Ad preview shows: background image, overlay, title (bold), content as specified


## Save Logic Implementation (Task 4: saveCurrentSlide Extension)

### Ad Type Save Block Structure
- **Location**: `public/app.js` lines 1313-1385 (inserted between hymn and simple slide logic)
- **Pattern**: Three-way conditional branching in saveCurrentSlide function
  - `if (slide.type === 'hymn')`: Hymn download/save logic
  - `else if (slide.type === 'ad')`: Ad-specific save logic (NEW)
  - `else`: Simple slide save logic (default)

### Ad-Specific Properties Saved
1. **Title Properties**:
   - `slide.adTitle` - From `adTitleInput.value`
   - `slide.adTitleSize` - From `adTitleSizeSelect.value`
   - `slide.adTitleAlign` - From `adTitleAlignSelect.value`

2. **Background Properties**:
   - `slide.adBgSource` - From radio button selection (none/file/url)
   - `slide.adBgOpacity` - From slider, parsed as integer

3. **Background Image Handling** (Mutually Exclusive):
   - **File Source**: 
     - Uploads file via `uploadFile()` function
     - Stores path in `slide.adBgImagePath`
     - Clears `slide.adBgImageUrl` to null
   - **URL Source**:
     - Stores URL in `slide.adBgImageUrl`
     - Clears `slide.adBgImagePath` to null
   - **No Source**:
     - Both `adBgImagePath` and `adBgImageUrl` set to null

4. **Simple Slide Properties** (Reused):
   - `slide.content` - From `slideContentInput.value`
   - `slide.font` - From `slideFontSelect.value`
   - `slide.fontSize` - From `slideFontSizeSelect.value`
   - `slide.bg` - From `slideBgSelect.value`
   - `slide.align` - From `slideAlignSelect.value`
   - `slide.sourceType` - From radio button (basic/upload)

5. **PPTX File Upload** (if sourceType === 'upload'):
   - File size validation: max 50MB
   - Uploads via `uploadFile()` function
   - Stores in `slide.serverFilePath` and `slide.fileName`

### File Upload Pattern
Both background image and PPTX uploads follow the same pattern:
```javascript
const saveBtnMsg = document.getElementById('editorSaveBtn');
const originalText = saveBtnMsg ? saveBtnMsg.textContent : "저장";
if (saveBtnMsg) saveBtnMsg.textContent = "업로드 중...";

try {
  const uploadResult = await uploadFile(file);
  // Store result
} catch (e) {
  alert("업로드 실패: " + e.message);
  if (saveBtnMsg) saveBtnMsg.textContent = originalText;
  return; // Stop save on error
} finally {
  if (saveBtnMsg) saveBtnMsg.textContent = originalText;
}
```

### Mutual Exclusivity Implementation
The background source is handled as a three-way exclusive choice:
1. Check `bgSource` value from radio button
2. If 'file': upload file, set path, clear URL
3. Else if 'url': set URL, clear path
4. Else: clear both path and URL

This ensures only one source is active at a time in the saved data.

### populateEditor() Extension
- **Location**: `public/app.js` lines 1131-1145
- **Pattern**: Loads ad-specific properties when slide type is 'ad'
- **Key Addition**: Load `adBgImageUrl` if available
- **File Input Clearing**: Clear `adBgImageFile.value` to prevent stale data

### Verification Results
- Syntax validation: `node -c public/app.js` passes
- Save test: Ad slide with URL background saves successfully
- Reload test: All properties persist after page reload
  - adTitle: "Test Ad Title" ✓
  - adBgImageUrl: "https://example.com/bg.jpg" ✓
  - adOpacity: "30" ✓
  - content: "Ad content here" ✓
- Server storage: Data correctly stored in `data/slides.json`

### Key Design Insights
1. **Async Upload Handling**: Both background image and PPTX uploads are async, requiring await
2. **Button State Management**: Save button text changes to "업로드 중..." during upload
3. **Error Recovery**: Upload failures stop the save process and restore button text
4. **Property Reuse**: Ad slides inherit all simple slide properties, reducing duplication
5. **Mutual Exclusivity**: File and URL are never both set, enforced at save time
6. **Null vs Empty String**: File paths use null (not empty string) when not set
