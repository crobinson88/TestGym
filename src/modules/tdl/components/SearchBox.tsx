import { useLayoutEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
};

/**
 * Live-filter search box that grows line by line instead of scrolling a long
 * query out of view, so a whole task title stays readable on a phone. A
 * textarea underneath (an <input> can't wrap); newlines are never kept.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  iconClassName,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-3 top-2.5 h-5 w-4 text-muted",
          iconClassName,
        )}
      />
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "block w-full resize-none overflow-hidden rounded-xl border border-line bg-surface py-2.5 pl-9 text-sm leading-5 text-text placeholder:text-muted",
          "outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
          value ? "pr-9" : "pr-3",
          inputClassName,
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-1 top-0 flex h-10 w-8 items-center justify-center text-muted hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
