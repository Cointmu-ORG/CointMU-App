export interface DerivedAccount {
  index: number;
  address: string;
  label: string;
  encryptedKey?: string;
  isHidden?: boolean;
}
