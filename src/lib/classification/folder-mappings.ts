export interface FolderSeedMapping {
  ruleId: string;
  patterns: string[]; // case-insensitive normalized folder labels or synonyms
  mainCategory: string;
  subcategory: string | null;
  baseWeight: number; // 0.0 to 1.0
  isAmbiguous?: boolean;
}

const GENERIC_BROWSER_CONTAINERS = new Set([
  'bookmarks bar',
  'bookmark bar',
  'favorites bar',
  'favourite bar',
  'favourites bar',
  'other bookmarks',
  'other favourites',
  'other favorites',
  'mobile bookmarks',
  'synced bookmarks',
  'bookmarks menu',
  'bookmarks toolbar',
  'personal toolbar folder',
  'unfiled bookmarks',
  'imported bookmarks',
  'imported',
  'bookmarks',
  'favorites',
  'favourites',
  'speed dial',
  'reading list',
  'new folder',
  'untitled folder',
]);

export function isGenericBrowserContainer(folderLabel: string): boolean {
  const norm = folderLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!norm) return true;
  if (GENERIC_BROWSER_CONTAINERS.has(norm)) return true;
  if (/^imported\s+from\b/i.test(norm)) return true;
  return false;
}

export const INITIAL_FOLDER_SEED_MAPPINGS: readonly FolderSeedMapping[] = [
  // Section 7 explicit seed mappings + synonyms
  {
    ruleId: 'seed-folder-ide-repo',
    patterns: [
      'ide repo',
      'code editor',
      'code editors',
      'ides',
      'editors & ides',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'Code Editors & IDEs',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-coding-tools',
    patterns: [
      'coding tools',
      'developer utilities',
      'dev tools',
      'devtools',
      'sdks',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'SDKs & Developer Utilities',
    baseWeight: 0.72,
    isAmbiguous: true,
  },
  {
    ruleId: 'seed-folder-awesome-github',
    patterns: [
      'awesome github',
      'git & repositories',
      'github repos',
      'git repos',
      'repositories',
      'open source repos',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'Git & Repositories',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-frontend',
    patterns: [
      'frontend',
      'frontend & next.js',
      'ui frameworks',
      'react & nextjs',
      'web dev',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    baseWeight: 0.76,
  },
  {
    ruleId: 'seed-folder-backend',
    patterns: [
      'backend',
      'cloud & backend engineering',
      'backend & apis',
      'apis',
      'server engineering',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'Backend & APIs',
    baseWeight: 0.75,
  },
  {
    ruleId: 'seed-folder-coding-education',
    patterns: [
      'coding education',
      'coding tutorials',
      'programming tutorials',
      'code examples',
    ],
    mainCategory: 'Development & Programming',
    subcategory: 'Coding Education & Examples',
    baseWeight: 0.76,
  },
  {
    ruleId: 'seed-folder-ai-agent',
    patterns: [
      'ai agent',
      'ai agents',
      'agent builders',
      'autonomous agents',
      'multi-agent',
    ],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'AI Agents & Agent Builders',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-local-llm',
    patterns: ['local llm', 'local ai', 'ollama', 'local inference', 'gguf'],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Local LLM & Inference',
    baseWeight: 0.82,
  },
  {
    ruleId: 'seed-folder-open-source-ai-model',
    patterns: [
      'open source ai model',
      'open source models',
      'ai models',
      'model hubs',
      'huggingface',
    ],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Models & Open-Source Hubs',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-mcp',
    patterns: ['mcp', 'model context protocol', 'agent tooling', 'mcp servers'],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'MCP & Agent Tooling',
    baseWeight: 0.84,
  },
  {
    ruleId: 'seed-folder-prompt',
    patterns: ['prompt', 'prompts', 'prompt library', 'prompt engineering'],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Prompt Libraries',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-ai-coding',
    patterns: ['ai coding', 'coding assistants', 'ai code', 'copilot & cursor'],
    mainCategory: 'AI Tools & Agents',
    subcategory: 'AI Coding Assistants',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-cloud-compute',
    patterns: ['cloud compute', 'vps', 'cloud servers', 'virtual machines'],
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Cloud Compute & VPS',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-s3-storage',
    patterns: ['s3 storage', 'object storage', 'file hosting', 'cloud storage'],
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Object Storage & File Hosting',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-managed-db',
    patterns: [
      'database & sql',
      'databases',
      'managed databases',
      'postgres',
      'postgresql',
      'sql',
    ],
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Managed Databases',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-hosting-paas',
    patterns: ['hosting', 'paas', 'cloud hosting', 'web hosting', 'deployment'],
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Hosting & PaaS',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-site-builder',
    patterns: ['site builder', 'website builder', 'web builders', 'app builder'],
    mainCategory: 'Website & App Builders',
    subcategory: null,
    baseWeight: 0.74,
  },
  {
    ruleId: 'seed-folder-apk-builder',
    patterns: ['apk builder', 'android builder', 'mobile app builder', 'apk'],
    mainCategory: 'Website & App Builders',
    subcategory: 'Android & APK Builders',
    baseWeight: 0.82,
  },
  {
    ruleId: 'seed-folder-3d-elements',
    patterns: ['3d elements', '3d models', '3d assets', 'webgl & 3d'],
    mainCategory: 'Design & Creative Assets',
    subcategory: '3D Models & Elements',
    baseWeight: 0.82,
  },
  {
    ruleId: 'seed-folder-ui-design',
    patterns: ['ui/ux', 'ui design', 'design systems', 'figma & ui'],
    mainCategory: 'Design & Creative Assets',
    subcategory: 'UI/UX Design',
    baseWeight: 0.78,
  },
  {
    ruleId: 'seed-folder-icons-png',
    patterns: ['icons', 'png assets', 'svg icons', 'icon packs'],
    mainCategory: 'Design & Creative Assets',
    subcategory: 'Icons & PNG Assets',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-video-tools',
    patterns: ['video tools', 'video editing', 'video creation', 'video editors'],
    mainCategory: 'Media & Content Creation',
    subcategory: 'Video Creation & Editing',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-seo',
    patterns: ['seo', 'search marketing', 'keyword research', 'seo tools'],
    mainCategory: 'Marketing & Monetization',
    subcategory: 'SEO & Search Marketing',
    baseWeight: 0.82,
  },
  {
    ruleId: 'seed-folder-temp-mail',
    patterns: [
      'temp mail',
      'temporary email',
      'disposable email',
      'burner mail',
    ],
    mainCategory: 'Communication & Email',
    subcategory: 'Temporary Email',
    baseWeight: 0.84,
  },
  {
    ruleId: 'seed-folder-pdf-docs',
    patterns: [
      'pdf / docs',
      'pdf tools',
      'pdf utilities',
      'document utilities',
    ],
    mainCategory: 'Downloads & File Utilities',
    subcategory: 'PDF & Document Utilities',
    baseWeight: 0.82,
  },
  {
    ruleId: 'seed-folder-movies',
    patterns: ['movies', 'movies & series', 'streaming', 'cinema & tv'],
    mainCategory: 'Entertainment & Lifestyle',
    subcategory: 'Movies & Series',
    baseWeight: 0.80,
  },
  {
    ruleId: 'seed-folder-tutorials',
    patterns: [
      'video tutorials',
      'technical tutorials',
      'tutorials',
      'courses',
    ],
    mainCategory: 'Learning & Reference',
    subcategory: 'Technical Tutorials',
    baseWeight: 0.74,
  },
  {
    ruleId: 'seed-folder-docs-ref',
    patterns: [
      'documentation',
      'docs & reference',
      'reference',
      'research & reading',
    ],
    mainCategory: 'Learning & Reference',
    subcategory: 'Documentation & Reference',
    baseWeight: 0.74,
  },
] as const;

export interface EvaluatedFolderSignal {
  ruleId: string;
  mainCategory: string;
  subcategory: string | null;
  weight: number;
  evidence: string;
  folderSegment: string;
  fullPathLabel: string;
}

export function evaluateSourceFolderPaths(
  folderPaths: string[][]
): EvaluatedFolderSignal[] {
  const results: EvaluatedFolderSignal[] = [];

  for (const pathSegments of folderPaths) {
    const meaningfulSegments = pathSegments
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 0 && !isGenericBrowserContainer(s));

    if (meaningfulSegments.length === 0) continue;

    const fullPathLabel = meaningfulSegments.join(' / ');

    meaningfulSegments.forEach((segment, idx) => {
      const normSeg = segment.toLowerCase();
      // Leaf folder gets slightly stronger specificity bonus than outer parent folder
      const isLeaf = idx === meaningfulSegments.length - 1;
      const depthBonus = isLeaf ? 0.04 : 0.0;

      for (const seed of INITIAL_FOLDER_SEED_MAPPINGS) {
        const matched = seed.patterns.some(
          (pat) =>
            normSeg === pat ||
            normSeg.includes(pat) ||
            fullPathLabel.toLowerCase().includes(pat)
        );
        if (matched) {
          const weight = Math.min(0.88, seed.baseWeight + depthBonus);
          results.push({
            ruleId: seed.ruleId,
            mainCategory: seed.mainCategory,
            subcategory: seed.subcategory,
            weight,
            folderSegment: segment,
            fullPathLabel,
            evidence: `Matched source folder "${fullPathLabel}" to ${
              seed.subcategory
                ? `${seed.mainCategory} → ${seed.subcategory}`
                : seed.mainCategory
            }.`,
          });
        }
      }
    });
  }

  return results;
}
