import { useTranslation } from "react-i18next";
import { useEffect, type JSX } from "react";
import { CustomDropdown } from "@/shared/ui";
import { HISTORY_FILTER_ALL, type HistoryFilter } from "@/shared/model";

interface WalletHistoryFilterOption {
  address: string;
  label?: string;
  isHidden?: boolean;
}

interface WalletHistoryFilterProps {
  accounts: WalletHistoryFilterOption[];
  value: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Abbreviates a wallet address for compact display in the filter dropdown.
 * @param {string} address - The full wallet address.
 * @returns {string} The shortened address label.
 */
function abbreviate(address: string): string {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Dropdown that drives the global history filter. It always offers an
 * aggregate 'All Wallets' option followed by one entry per visible owned wallet.
 * @param {WalletHistoryFilterProps} props - The owned wallets, the current filter value, and the change handler.
 * @returns {JSX.Element} The rendered wallet history filter control.
 */
function WalletHistoryFilter({
  accounts,
  value,
  onChange,
  className,
  compact,
}: WalletHistoryFilterProps): JSX.Element {
  const { t } = useTranslation();
  useEffect(() => {
    if (value !== HISTORY_FILTER_ALL) {
      const activeAccount = accounts.find((acc) => acc.address === value);
      if (!activeAccount || activeAccount.isHidden) {
        onChange(HISTORY_FILTER_ALL);
      }
    }
  }, [value, accounts, onChange]);

  const visibleAccounts = accounts.filter((account) => !account.isHidden);

  const options = [
    { value: HISTORY_FILTER_ALL, label: t("wallet:historyFilter.allWallets") },
    ...visibleAccounts.map((account) => ({
      value: account.address,
      label: account.label || abbreviate(account.address),
    })),
  ];

  const selected = options.find((opt) => opt.value === value) ?? options[0];

  return (
    <CustomDropdown<{ value: HistoryFilter; label: string }>
      options={options}
      selected={selected}
      onSelect={(opt) => onChange(opt.value)}
      renderSelected={(opt) => <span>{opt?.label}</span>}
      renderOption={(opt) => <span>{opt.label}</span>}
      className={className}
      compact={compact}
    />
  );
}

export { WalletHistoryFilter };
export type { WalletHistoryFilterProps };
