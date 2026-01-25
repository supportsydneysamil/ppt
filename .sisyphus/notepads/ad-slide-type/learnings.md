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
