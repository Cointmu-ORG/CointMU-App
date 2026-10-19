import { LANGUAGE_OPTIONS } from "../config/settings.constants";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { CustomDropdown } from "@/shared/ui";

/**
 * A UI component that allows users to toggle the application language
 * between English and Indonesian. Uses react-i18next for localization.
 * @returns {JSX.Element} The language switcher dropdown and demonstration text.
 */
function LanguageSwitcher(): JSX.Element {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (option: {
    label: string;
    value: string;
  }): void => {
    void i18n.changeLanguage(option.value);
  };

  const selectedOption =
    LANGUAGE_OPTIONS.find((opt) => opt.value === i18n.language) ||
    LANGUAGE_OPTIONS[0];

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("languageLabel")}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {t("languageDescription")}
        </p>
      </div>
      <div className="w-48">
        <CustomDropdown<{ label: string; value: string }>
          options={LANGUAGE_OPTIONS}
          selected={selectedOption}
          onSelect={handleLanguageChange}
          renderSelected={(selected) => selected?.label}
          renderOption={(option) => option.label}
          compact
        />
      </div>
    </div>
  );
}

export { LanguageSwitcher };
