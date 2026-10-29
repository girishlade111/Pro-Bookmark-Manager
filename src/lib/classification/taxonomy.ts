import type { CategoryRecord } from '../../types/bookmark.ts';

export interface TaxonomyMainCategorySeed {
  name: string;
  sortOrder: number;
  subcategories: string[];
}

export const INITIAL_TAXONOMY_18_83: readonly TaxonomyMainCategorySeed[] = [
  {
    name: 'Development & Programming',
    sortOrder: 1,
    subcategories: [
      'Code Editors & IDEs',
      'Git & Repositories',
      'Frontend & UI Frameworks',
      'Backend & APIs',
      'SDKs & Developer Utilities',
      'DevOps & Automation',
      'Coding Education & Examples',
      'Code Templates & Snippets',
    ],
  },
  {
    name: 'AI Tools & Agents',
    sortOrder: 2,
    subcategories: [
      'LLM Chatbots',
      'AI Agents & Agent Builders',
      'Models & Open-Source Hubs',
      'Local LLM & Inference',
      'AI Coding Assistants',
      'AI Research & Search',
      'Prompt Libraries',
      'MCP & Agent Tooling',
      'Voice AI & Speech',
    ],
  },
  {
    name: 'Cloud & Infrastructure',
    sortOrder: 3,
    subcategories: [
      'Cloud Compute & VPS',
      'Hosting & PaaS',
      'Managed Databases',
      'Object Storage & File Hosting',
      'Identity & Authentication Services',
      'Infrastructure Operations',
    ],
  },
  {
    name: 'Website & App Builders',
    sortOrder: 4,
    subcategories: [
      'AI Website Builders',
      'No-Code & Low-Code',
      'Website Templates',
      'Site Platforms & CMS',
      'Android & APK Builders',
    ],
  },
  {
    name: 'Design & Creative Assets',
    sortOrder: 5,
    subcategories: [
      'UI/UX Design',
      'Brand & Logo Design',
      'Icons & PNG Assets',
      '3D Models & Elements',
      'UI Templates & Design Systems',
      'Stock Images & Illustration',
    ],
  },
  {
    name: 'Media & Content Creation',
    sortOrder: 6,
    subcategories: [
      'Video Creation & Editing',
      'Image Generation & Editing',
      'Audio & Music',
      'Podcast Production',
      'Animation & Avatars',
      'Presentations & Slides',
    ],
  },
  {
    name: 'Productivity & Collaboration',
    sortOrder: 7,
    subcategories: [
      'Notes & Knowledge',
      'Documents & Workspaces',
      'Project & Task Management',
      'Automation & Workflows',
      'Mind Maps & Diagrams',
    ],
  },
  {
    name: 'Marketing & Monetization',
    sortOrder: 8,
    subcategories: [
      'SEO & Search Marketing',
      'Paid Advertising & Creative',
      'Affiliate Programs',
      'Website & Link Monetization',
      'Analytics & Growth',
    ],
  },
  {
    name: 'Security & Privacy',
    sortOrder: 9,
    subcategories: [
      'Password Managers',
      'Identity & OTP',
      'Security Tools',
      'Privacy & Temporary Access',
    ],
  },
  {
    name: 'Browsers & Extensions',
    sortOrder: 10,
    subcategories: [
      'Browser Extensions',
      'Virtual & Remote Browsers',
      'Browser Productivity',
      'Browser Utilities & Capture',
    ],
  },
  {
    name: 'Communication & Email',
    sortOrder: 11,
    subcategories: [
      'Email Providers',
      'Temporary Email',
      'Chat, Forms & Customer Support',
    ],
  },
  {
    name: 'Learning & Reference',
    sortOrder: 12,
    subcategories: [
      'Learning Platforms',
      'Technical Tutorials',
      'Study & Research',
      'Documentation & Reference',
    ],
  },
  {
    name: 'Business & Startups',
    sortOrder: 13,
    subcategories: [
      'Startup Programs & Credits',
      'Business Tools',
      'Marketplaces & Directories',
      'Sales & Operations',
    ],
  },
  {
    name: 'Entertainment & Lifestyle',
    sortOrder: 14,
    subcategories: [
      'Movies & Series',
      'Anime & Animation Viewing',
      'Music & Pop Culture',
      'General Recreation',
    ],
  },
  {
    name: 'Downloads & File Utilities',
    sortOrder: 15,
    subcategories: [
      'Download Managers',
      'PDF & Document Utilities',
      'File Conversion & Compression',
    ],
  },
  {
    name: 'Shopping & Consumer',
    sortOrder: 16,
    subcategories: ['Shopping & E-commerce', 'Wishlists & Buying Research'],
  },
  {
    name: 'Personal & Private',
    sortOrder: 17,
    subcategories: [
      'Personal Collections',
      'Private / Sensitive',
      'Other Personal Interests',
    ],
  },
  {
    name: 'Uncategorized & Review',
    sortOrder: 18,
    subcategories: ['Uncategorized', 'Needs Manual Review'],
  },
] as const;

export const INITIAL_MAIN_CATEGORY_COUNT = INITIAL_TAXONOMY_18_83.length; // 18
export const INITIAL_SUBCATEGORY_COUNT = INITIAL_TAXONOMY_18_83.reduce(
  (sum, item) => sum + item.subcategories.length,
  0
); // 83

export interface TaxonomyIndex {
  mainByNameLower: Map<string, CategoryRecord>;
  subByCompositeLower: Map<string, CategoryRecord>;
  subByNameLower: Map<string, CategoryRecord>;
  byId: Map<string, CategoryRecord>;
}

export function buildTaxonomyIndex(categories: CategoryRecord[]): TaxonomyIndex {
  const byId = new Map<string, CategoryRecord>();
  const mainByNameLower = new Map<string, CategoryRecord>();
  const subByCompositeLower = new Map<string, CategoryRecord>();
  const subByNameLower = new Map<string, CategoryRecord>();

  for (const cat of categories) {
    byId.set(cat.id, cat);
    if (!cat.parentCategoryId) {
      mainByNameLower.set(cat.name.trim().toLowerCase(), cat);
    }
  }

  for (const cat of categories) {
    if (cat.parentCategoryId) {
      const parent = byId.get(cat.parentCategoryId);
      const subLower = cat.name.trim().toLowerCase();
      subByNameLower.set(subLower, cat);
      if (parent) {
        const key = `${parent.name.trim().toLowerCase()}::${subLower}`;
        subByCompositeLower.set(key, cat);
      }
    }
  }

  return {
    mainByNameLower,
    subByCompositeLower,
    subByNameLower,
    byId,
  };
}

export function resolveTaxonomyIds(
  index: TaxonomyIndex,
  mainCategoryName: string,
  subcategoryName?: string | null
): {
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
} {
  const main = index.mainByNameLower.get(mainCategoryName.trim().toLowerCase());
  if (!main) {
    return {
      categoryId: null,
      categoryName: null,
      subcategoryId: null,
      subcategoryName: null,
    };
  }

  if (!subcategoryName) {
    return {
      categoryId: main.id,
      categoryName: main.name,
      subcategoryId: null,
      subcategoryName: null,
    };
  }

  const compositeKey = `${main.name.trim().toLowerCase()}::${subcategoryName
    .trim()
    .toLowerCase()}`;
  const sub =
    index.subByCompositeLower.get(compositeKey) ??
    index.subByNameLower.get(subcategoryName.trim().toLowerCase()) ??
    null;

  return {
    categoryId: main.id,
    categoryName: main.name,
    subcategoryId: sub ? sub.id : null,
    subcategoryName: sub ? sub.name : null,
  };
}
