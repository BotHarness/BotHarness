export interface DocsPageVariant {
  source: string;
  title: string;
  description: string;
  lang?: string;
  diagrams?: Array<{ name: string; caption: string }>;
  configuredTitle?: boolean;
}

export interface DocsPage {
  slug: string;
  order: number;
  en?: DocsPageVariant;
  zh?: DocsPageVariant;
}

export const PAGES: DocsPage[];
export const DEV_SECTION_ORDER: Readonly<{
  design: number;
  guides: number;
  reference: number;
  adr: number;
}>;
export interface ReleaseLedgerSiteEntry {
  slug: string;
  english: string;
  chinese: string;
}
export function releaseLedgerSiteEntries(
  english: string,
  chinese: string,
): ReleaseLedgerSiteEntry[];
export function syncDocs(): void;
