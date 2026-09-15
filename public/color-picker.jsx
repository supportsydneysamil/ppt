import { useEffect, useRef } from "react";
import Pickr from "@simonwep/pickr";

export function ColorPicker({
  value = "#000000",
  field,
  background = false,
  title,
  ariaLabel,
}) {
  const hostRef = useRef(null);
  const inputRef = useRef(null);
  const pickrRef = useRef(null);

  /**
   * Shows a colour the user did not pick. `setColor` alone only moves the
   * picker's own handles: painting the swatch is `applyColor`'s job, and
   * `setColor`'s silent flag is what skips it. Both are called silently, so
   * reflecting a selection never looks like an edit of it.
   */
  function showColor(next) {
    const pickr = pickrRef.current;
    if (!pickr || !next) {
      return;
    }
    if (pickr.setColor(next, true)) {
      pickr.applyColor(true);
    }
  }

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }
    const pickr = Pickr.create({
      el: hostRef.current,
      theme: "nano",
      default: value,
      swatches: [
        "#ffffff",
        "#000000",
        "#f3f0ea",
        "#d47b37",
        "#1d1b16",
        "#0f172a",
        "#b91c1c",
        "#166534",
        "#1d4ed8",
      ],
      components: {
        preview: true,
        opacity: true,
        hue: true,
        interaction: {
          hex: true,
          input: true,
          save: true,
        },
      },
    });
    pickrRef.current = pickr;
    const commit = (color) => {
      if (!color || !inputRef.current) {
        return;
      }
      const next = color.toHEXA().toString();
      inputRef.current.value = next;
      inputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    };
    pickr.on("save", commit);
    pickr.on("changestop", (_source, instance) => commit(instance.getColor()));
    return () => {
      pickr.destroyAndRemove();
      pickrRef.current = null;
    };
    // Mount once; later value sync happens through the hidden input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inputRef.current && value) {
      inputRef.current.value = value;
    }
    showColor(value);
  }, [value]);

  // The editor writes the selected object's colour onto the hidden input
  // directly, which React never sees. It announces each of those writes, and
  // the swatch follows them so it always shows the selection's own colour.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return undefined;
    }
    const sync = () => showColor(input.value);
    input.addEventListener("editor-field-sync", sync);
    return () => input.removeEventListener("editor-field-sync", sync);
  }, []);

  const extra = background ? { "data-custom-editor": "background" } : {};

  return (
    <span className="custom-color-picker">
      <span ref={hostRef} />
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        data-editor-field={field}
        aria-label={ariaLabel}
        title={title}
        className="custom-color-picker-value"
        {...extra}
      />
    </span>
  );
}
