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
    if (pickrRef.current && value) {
      pickrRef.current.setColor(value, true);
    }
  }, [value]);

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
