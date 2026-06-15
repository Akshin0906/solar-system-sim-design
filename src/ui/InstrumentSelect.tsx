import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type InstrumentSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  meta?: ReactNode;
};

export type InstrumentSelectGroup<T extends string = string> = {
  label?: string;
  options: Array<InstrumentSelectOption<T>>;
};

type MenuRect = {
  side: "top" | "bottom";
  left: number;
  width: number;
  top: number;
  maxHeight: number;
};

type InstrumentSelectProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options?: Array<InstrumentSelectOption<T>>;
  groups?: Array<InstrumentSelectGroup<T>>;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
  side?: "top" | "bottom" | "auto";
  className?: string;
};

const getNextEnabledIndex = <T extends string,>(
  options: Array<InstrumentSelectOption<T>>,
  startIndex: number,
  direction: 1 | -1,
) => {
  if (options.length === 0) {
    return -1;
  }

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + offset * direction + options.length) % options.length;
    if (!options[index].disabled) {
      return index;
    }
  }

  return -1;
};

const getFirstEnabledIndex = <T extends string,>(options: Array<InstrumentSelectOption<T>>) =>
  options.findIndex((option) => !option.disabled);

const getLastEnabledIndex = <T extends string,>(options: Array<InstrumentSelectOption<T>>) => {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) {
      return index;
    }
  }

  return -1;
};

const getVisibleViewportRect = () => {
  const viewport = window.visualViewport;

  if (viewport) {
    return {
      top: viewport.offsetTop,
      left: viewport.offsetLeft,
      right: viewport.offsetLeft + viewport.width,
      bottom: viewport.offsetTop + viewport.height,
    };
  }

  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
};

export const InstrumentSelect = <T extends string,>({
  value,
  onChange,
  options,
  groups,
  label,
  ariaLabel,
  placeholder = "Select",
  icon,
  disabled = false,
  side = "auto",
  className = "",
}: InstrumentSelectProps<T>) => {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);

  const optionGroups = useMemo<Array<InstrumentSelectGroup<T>>>(
    () => groups ?? [{ options: options ?? [] }],
    [groups, options],
  );
  const flatOptions = useMemo(() => optionGroups.flatMap((group) => group.options), [optionGroups]);
  const selectedIndex = flatOptions.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? flatOptions[selectedIndex] : undefined;

  const updateMenuRect = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") {
      return;
    }

    const viewportPadding = 12;
    const gap = 8;
    const viewport = getVisibleViewportRect();
    const availableBelow = viewport.bottom - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewport.top - viewportPadding;
    const maxHeightBelow = Math.max(1, availableBelow - gap);
    const maxHeightAbove = Math.max(1, availableAbove - gap);
    const resolvedSide =
      side === "auto" ? (maxHeightBelow < 220 && maxHeightAbove > maxHeightBelow ? "top" : "bottom") : side;
    const maxHeight = resolvedSide === "top" ? maxHeightAbove : maxHeightBelow;
    const top =
      resolvedSide === "top"
        ? Math.max(viewport.top + viewportPadding, rect.top - gap - maxHeight)
        : rect.bottom + gap;
    const minLeft = viewport.left + viewportPadding;
    const maxLeft = Math.max(minLeft, viewport.right - rect.width - viewportPadding);
    const left = Math.min(Math.max(rect.left, minLeft), maxLeft);

    setMenuRect({
      side: resolvedSide,
      left,
      width: rect.width,
      top,
      maxHeight,
    });
  }, [side]);

  const openMenu = useCallback(() => {
    if (disabled) {
      return;
    }

    const nextIndex = selectedIndex >= 0 && !flatOptions[selectedIndex]?.disabled ? selectedIndex : getFirstEnabledIndex(flatOptions);
    setActiveIndex(Math.max(0, nextIndex));
    setOpen(true);
    updateMenuRect();
  }, [disabled, flatOptions, selectedIndex, updateMenuRect]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuRect(null);
  }, []);

  const selectOption = useCallback(
    (option: InstrumentSelectOption<T>) => {
      if (option.disabled) {
        return;
      }

      onChange(option.value);
      closeMenu();
      triggerRef.current?.focus();
    },
    [closeMenu, onChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    updateMenuRect();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    window.visualViewport?.addEventListener("resize", updateMenuRect);
    window.visualViewport?.addEventListener("scroll", updateMenuRect);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
      window.visualViewport?.removeEventListener("resize", updateMenuRect);
      window.visualViewport?.removeEventListener("scroll", updateMenuRect);
    };
  }, [closeMenu, open, updateMenuRect]);

  useEffect(() => {
    if (!open) {
      return;
    }

    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const nextIndex = getNextEnabledIndex(flatOptions, activeIndex, 1);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const nextIndex = getNextEnabledIndex(flatOptions, activeIndex, -1);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(Math.max(0, getFirstEnabledIndex(flatOptions)));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, getLastEnabledIndex(flatOptions)));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const option = flatOptions[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
    }
  };

  const menuStyle = menuRect
    ? ({
        left: menuRect.left,
        top: menuRect.top,
        width: menuRect.width,
        maxHeight: menuRect.maxHeight,
      } satisfies CSSProperties)
    : undefined;

  let optionIndex = -1;
  const menu =
    open && menuRect ? (
      <div
        ref={menuRef}
        id={listboxId}
        className={`instrument-select-menu ${menuRect.side}`}
        role="listbox"
        aria-label={ariaLabel ?? label}
        style={menuStyle}
      >
        {optionGroups.map((group, groupIndex) => (
          <div className="instrument-select-group" key={`${group.label ?? "group"}-${groupIndex}`}>
            {group.label && <div className="instrument-select-group-label">{group.label}</div>}
            {group.options.map((option) => {
              optionIndex += 1;
              const currentIndex = optionIndex;
              const selected = option.value === value;
              const active = currentIndex === activeIndex;

              return (
                <button
                  key={option.value}
                  id={`${listboxId}-option-${currentIndex}`}
                  className={`instrument-select-option ${selected ? "selected" : ""} ${active ? "active" : ""}`.trim()}
                  type="button"
                  role="option"
                  ref={active ? activeOptionRef : undefined}
                  aria-selected={selected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(currentIndex)}
                  onClick={() => selectOption(option)}
                >
                  <span className="instrument-select-option-mark" aria-hidden>
                    {selected && <Check size={14} />}
                  </span>
                  <span className="instrument-select-option-copy">
                    <span>{option.label}</span>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.meta && <span className="instrument-select-option-meta">{option.meta}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      className={`instrument-select ${icon ? "has-icon" : ""} ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        className="instrument-select-trigger"
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {icon && <span className="instrument-select-icon">{icon}</span>}
        <span className="instrument-select-copy">
          {label && <span className="instrument-select-label">{label}</span>}
          <span className="instrument-select-value">{selectedOption?.label ?? placeholder}</span>
        </span>
        {selectedOption?.meta && <span className="instrument-select-meta">{selectedOption.meta}</span>}
        <ChevronDown className="instrument-select-chevron" size={15} aria-hidden />
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
};
