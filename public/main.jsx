import "./styles.css";
import "@simonwep/pickr/dist/themes/nano.min.css";

import { createRoot } from "react-dom/client";

import * as customTitleDesignCatalog from "@lib/custom-title-design-catalog.js";
import * as customTitleText from "@lib/custom-title-text.js";
import * as titleSlideDate from "@lib/title-slide-date.js";
import * as titleSlideDesignCatalog from "@lib/title-slide-design-catalog.js";
import * as titleSlideLayout from "@lib/title-slide-layout.js";
import * as titleSlideText from "@lib/title-slide-text.js";
import { CustomEditorChrome } from "./custom-editor-chrome.jsx";

window.TitleSlideDate = titleSlideDate;
window.CustomTitleDesignCatalog = customTitleDesignCatalog;
window.TitleSlideDesignCatalog = titleSlideDesignCatalog;
window.TitleSlideLayout = titleSlideLayout;
window.TitleSlideText = titleSlideText;
window.CustomTitleText = customTitleText;

const editorRoot = document.getElementById("customSlideEditor");
const chromeHost = document.getElementById("customEditorReactRoot");
if (editorRoot && chromeHost) {
  editorRoot.dataset.reactChrome = "true";
  createRoot(chromeHost).render(
    <CustomEditorChrome
      inspectorHost={document.getElementById("customEditorInspectorHost")}
    />
  );
}

await import("./app.js");
