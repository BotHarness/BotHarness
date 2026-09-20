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
export function syncDocs(): void;
