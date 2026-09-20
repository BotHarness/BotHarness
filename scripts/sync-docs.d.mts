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
export function syncDocs(): void;
