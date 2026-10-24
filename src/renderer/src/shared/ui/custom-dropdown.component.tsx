import {
  DROPDOWN_AUTO_SEARCH_THRESHOLD,
  DROPDOWN_MAX_VISIBLE_ITEMS,
  DROPDOWN_ITEM_HEIGHT_PX,
} from "./ui.constants";
import { type JSX, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

/**
 * Props for the CustomDropdown component.
 * @template T - The type of the options array items.
 */
interface CustomDropdownProps<T> {
  options: T[];
  selected: T | null;
  onSelect: (option: T) => void;
  renderSelected: (selected: T | null) => React.ReactNode;
  renderOption: (option: T) => React.ReactNode;
  getSearchLabel?: (option: T) => string;
  disabled?: boolean;
  className?: string;
  enableSearch?: boolean;
  compact?: boolean;
}

/**
 * A reusable, generic dropdown component that manages its own open/close state
 * and close-on-click-outside behavior. Limits visible options to 5 rows with an
 * overflow scrollbar. Automatically renders a search input when `enableSearch`
 * is true or when the options list exceeds 10 items, filtering results
 * case-insensitively. Allows full customization of how the selected item and
 * option list items are rendered.
 * @param props - The configuration props including options, render functions,
 *   and optional search, compact mode, and width overrides.
 * @returns The rendered custom dropdown component.
 */
export function CustomDropdown<T>({
  options,
  selected,
  onSelect,
  renderSelected,
  renderOption,
  getSearchLabel,
  disabled = false,
  className = "",
  enableSearch = false,
  compact = false,
}: CustomDropdownProps<T>): JSX.Element {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showSearch =
    enableSearch || options.length > DROPDOWN_AUTO_SEARCH_THRESHOLD;

  const filteredOptions =
    showSearch && query.trim().length > 0
      ? options.filter((opt) => {
          const label = getSearchLabel ? getSearchLabel(opt) : String(opt);
          return label.toLowerCase().includes(query.toLowerCase());
        })
      : options;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && showSearch && searchRef.current) {
      searchRef.current.focus();
    }
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen, showSearch]);

  const maxHeight = DROPDOWN_MAX_VISIBLE_ITEMS * DROPDOWN_ITEM_HEIGHT_PX;

  return (
    <div className={`relative ${className || "w-full"}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-800 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          compact ? "px-3 py-1.5 text-xs" : "px-4 py-3 text-sm"
        }`}
      >
        <div className="flex items-center gap-2">
          {renderSelected(selected)}
        </div>
        <ChevronDown
          width={16}
          height={16}
          className={`text-slate-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden flex flex-col">
          {showSearch && (
            <div className="px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-gray-800 flex-shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common:dropdown.search")}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-slate-300"
              />
            </div>
          )}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {filteredOptions.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">
                {t("common:dropdown.noResults")}
              </p>
            ) : (
              filteredOptions.map((option, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    onSelect(option);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {renderOption(option)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
