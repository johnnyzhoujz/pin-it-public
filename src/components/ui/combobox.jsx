import { useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils.js";
import { Input } from "./input.jsx";

export function Combobox({
  className,
  inputClassName,
  label,
  menuLabel = "Options",
  options = [],
  value,
  onChange,
  onCommit,
  maxOptions = 6
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const blurTimerRef = useRef(null);
  const reactId = useId();
  const listboxId = `combobox-${reactId.replace(/:/g, "")}-listbox`;
  const query = String(value || "").trim().toLowerCase();
  const visibleOptions = useMemo(() => {
    const filtered = query
      ? options.filter((option) => String(option).toLowerCase().includes(query))
      : options;

    return filtered.slice(0, maxOptions);
  }, [maxOptions, options, query]);
  const hasOptions = visibleOptions.length > 0;

  function commit(nextValue) {
    const cleanValue = String(nextValue || "").trim();
    onCommit?.(cleanValue);
  }

  function closeMenu() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function chooseOption(option) {
    window.clearTimeout(blurTimerRef.current);
    onChange?.(option);
    commit(option);
    closeMenu();
    inputRef.current?.blur();
  }

  return (
    <div className={cn("ui-combobox", className)}>
      <Input
        ref={inputRef}
        className={cn("ui-combobox-input", inputClassName)}
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={open && hasOptions}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        role="combobox"
        value={value}
        onFocus={() => {
          window.clearTimeout(blurTimerRef.current);
          setOpen(true);
        }}
        onChange={(event) => {
          setOpen(true);
          setActiveIndex(-1);
          onChange?.(event.target.value);
        }}
        onBlur={(event) => {
          blurTimerRef.current = window.setTimeout(() => {
            commit(event.target.value);
            closeMenu();
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeMenu();
            event.currentTarget.blur();
            return;
          }

          if (event.key === "ArrowDown" && hasOptions) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((previous) => (previous + 1) % visibleOptions.length);
            return;
          }

          if (event.key === "ArrowUp" && hasOptions) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((previous) => (previous <= 0 ? visibleOptions.length - 1 : previous - 1));
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            if (open && activeIndex >= 0 && visibleOptions[activeIndex]) {
              chooseOption(visibleOptions[activeIndex]);
              event.currentTarget.blur();
              return;
            }

            commit(event.currentTarget.value);
            closeMenu();
            event.currentTarget.blur();
          }
        }}
      />
      <span className="ui-combobox-caret" aria-hidden="true" />
      {open && hasOptions ? (
        <div className="ui-combobox-menu" id={listboxId} role="listbox" aria-label={menuLabel}>
          {visibleOptions.map((option, index) => (
            <button
              className={cn(index === activeIndex && "active")}
              id={`${listboxId}-option-${index}`}
              key={option}
              type="button"
              role="option"
              aria-selected={String(option) === String(value)}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(option)}
            >
              <span>{option}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
