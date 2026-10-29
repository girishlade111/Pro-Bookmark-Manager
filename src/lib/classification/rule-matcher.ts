import type { ClassificationRuleRecord } from '../../types/bookmark.ts';
import { containsTokenizedPhrase } from './keyword-dictionary.ts';

export interface SystemHostPathRule {
  ruleId: string;
  hostPattern: string;
  pathPrefix?: string;
  mainCategory: string;
  subcategory: string | null;
  baseConfidence: number; // 0.0 to 1.0
  isMultiPurposeHost?: boolean;
  suggestedTag?: string;
}

/**
 * Strict hostname boundary check:
 * matchesHostnameBoundary('github.com', 'github.com') -> true
 * matchesHostnameBoundary('gist.github.com', 'github.com') -> true
 * matchesHostnameBoundary('evilgithub.com', 'github.com') -> false
 */
export function matchesHostnameBoundary(
  actualHostname: string,
  targetHost: string
): boolean {
  const host = actualHostname.trim().toLowerCase().replace(/^www\./, '');
  const target = targetHost.trim().toLowerCase().replace(/^www\./, '');
  if (!host || !target) return false;
  return host === target || host.endsWith(`.${target}`);
}

export const SYSTEM_HOST_PATH_RULES: readonly SystemHostPathRule[] = [
  // Development & Programming
  {
    ruleId: 'sys-host-vscode',
    hostPattern: 'code.visualstudio.com',
    mainCategory: 'Development & Programming',
    subcategory: 'Code Editors & IDEs',
    baseConfidence: 0.94,
    suggestedTag: 'VS Code',
  },
  {
    ruleId: 'sys-host-github',
    hostPattern: 'github.com',
    mainCategory: 'Development & Programming',
    subcategory: 'Git & Repositories',
    baseConfidence: 0.78, // Can be overridden by stronger AI/MCP/specific rules
    isMultiPurposeHost: true,
    suggestedTag: 'GitHub',
  },
  {
    ruleId: 'sys-host-gitlab',
    hostPattern: 'gitlab.com',
    mainCategory: 'Development & Programming',
    subcategory: 'Git & Repositories',
    baseConfidence: 0.91,
    suggestedTag: 'GitLab',
  },
  {
    ruleId: 'sys-host-nextjs',
    hostPattern: 'nextjs.org',
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    baseConfidence: 0.94,
    suggestedTag: 'Next.js',
  },
  {
    ruleId: 'sys-host-react',
    hostPattern: 'react.dev',
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    baseConfidence: 0.94,
    suggestedTag: 'React',
  },
  {
    ruleId: 'sys-host-tailwind',
    hostPattern: 'tailwindcss.com',
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    baseConfidence: 0.94,
    suggestedTag: 'Tailwind CSS',
  },
  {
    ruleId: 'sys-host-shadcn',
    hostPattern: 'ui.shadcn.com',
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    baseConfidence: 0.94,
    suggestedTag: 'shadcn/ui',
  },
  {
    ruleId: 'sys-host-drizzle',
    hostPattern: 'orm.drizzle.team',
    mainCategory: 'Development & Programming',
    subcategory: 'Backend & APIs',
    baseConfidence: 0.93,
    suggestedTag: 'Drizzle ORM',
  },
  {
    ruleId: 'sys-host-npm',
    hostPattern: 'npmjs.com',
    mainCategory: 'Development & Programming',
    subcategory: 'SDKs & Developer Utilities',
    baseConfidence: 0.92,
    suggestedTag: 'npm',
  },

  // AI Tools & Agents
  {
    ruleId: 'sys-host-huggingface',
    hostPattern: 'huggingface.co',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Models & Open-Source Hubs',
    baseConfidence: 0.94,
    suggestedTag: 'Hugging Face',
  },
  {
    ruleId: 'sys-host-ollama',
    hostPattern: 'ollama.com',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Local LLM & Inference',
    baseConfidence: 0.95,
    suggestedTag: 'Ollama',
  },
  {
    ruleId: 'sys-host-cursor',
    hostPattern: 'cursor.com',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'AI Coding Assistants',
    baseConfidence: 0.94,
    suggestedTag: 'Cursor',
  },
  {
    ruleId: 'sys-host-mcp',
    hostPattern: 'modelcontextprotocol.io',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'MCP & Agent Tooling',
    baseConfidence: 0.95,
    suggestedTag: 'MCP',
  },

  // Cloud & Infrastructure
  {
    ruleId: 'sys-host-postgresql',
    hostPattern: 'postgresql.org',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Managed Databases',
    baseConfidence: 0.93,
    suggestedTag: 'PostgreSQL',
  },
  {
    ruleId: 'sys-host-neon',
    hostPattern: 'neon.tech',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Managed Databases',
    baseConfidence: 0.95,
    suggestedTag: 'Neon',
  },
  {
    ruleId: 'sys-host-vercel',
    hostPattern: 'vercel.com',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Hosting & PaaS',
    baseConfidence: 0.93,
    suggestedTag: 'Vercel',
  },
  {
    ruleId: 'sys-host-better-auth',
    hostPattern: 'better-auth.com',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Identity & Authentication Services',
    baseConfidence: 0.94,
    suggestedTag: 'Better Auth',
  },

  // Design & Creative Assets
  {
    ruleId: 'sys-host-figma',
    hostPattern: 'figma.com',
    mainCategory: 'Design & Creative Assets',
    subcategory: 'UI/UX Design',
    baseConfidence: 0.94,
    suggestedTag: 'Figma',
  },
  {
    ruleId: 'sys-host-lucide',
    hostPattern: 'lucide.dev',
    mainCategory: 'Design & Creative Assets',
    subcategory: 'Icons & PNG Assets',
    baseConfidence: 0.95,
    suggestedTag: 'Lucide',
  },

  // Learning & Reference
  {
    ruleId: 'sys-host-mdn',
    hostPattern: 'developer.mozilla.org',
    mainCategory: 'Learning & Reference',
    subcategory: 'Documentation & Reference',
    baseConfidence: 0.94,
    suggestedTag: 'MDN',
  },
  {
    ruleId: 'sys-host-whatwg',
    hostPattern: 'whatwg.org',
    mainCategory: 'Learning & Reference',
    subcategory: 'Documentation & Reference',
    baseConfidence: 0.94,
    suggestedTag: 'WHATWG',
  },
] as const;

const MULTI_PURPOSE_VIDEO_AND_SOCIAL_HOSTS = new Set([
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'reddit.com',
  'medium.com',
  'substack.com',
  'x.com',
  'twitter.com',
]);

export function isMultiPurposeAmbiguousDomain(hostname: string): boolean {
  for (const mp of MULTI_PURPOSE_VIDEO_AND_SOCIAL_HOSTS) {
    if (matchesHostnameBoundary(hostname, mp)) {
      return true;
    }
  }
  return false;
}

export interface EvaluatedOwnerRuleMatch {
  rule: ClassificationRuleRecord;
  specificityTier: number; // 3 = owner folder mapping, 4 = owner exact_url / path_prefix / hostname
  confidence: number;
  evidence: string;
}

export function evaluateOwnerRuleMatch(
  rule: ClassificationRuleRecord,
  input: {
    normalizedUrlKey: string;
    originalUrl: string;
    domain: string;
    pathnameAndQuery: string;
    title: string;
    description?: string | null;
    sourceFolderPaths: string[][];
  }
): EvaluatedOwnerRuleMatch | null {
  if (!rule.isEnabled) return null;
  const pattern = rule.pattern.trim();
  if (!pattern) return null;

  const lowerPattern = pattern.toLowerCase();
  const baseConfidence = Math.min(
    0.99,
    Math.max(0.7, Number(rule.confidenceScore) || 0.94)
  );

  switch (rule.ruleType) {
    case 'folder_mapping': {
      for (const pathArr of input.sourceFolderPaths) {
        const joined = pathArr.join(' / ').toLowerCase();
        const segMatch = pathArr.some(
          (s) => s.trim().toLowerCase() === lowerPattern
        );
        if (segMatch || joined.includes(lowerPattern)) {
          return {
            rule,
            specificityTier: 3, // Priority 3: Owner-approved source-folder-to-category mapping
            confidence: Math.max(0.95, baseConfidence),
            evidence: `Matched owner-approved folder mapping rule "${rule.name}" (${pattern}).`,
          };
        }
      }
      return null;
    }

    case 'exact_url': {
      const cleanUrl = input.normalizedUrlKey.toLowerCase();
      const origLower = input.originalUrl.trim().toLowerCase();
      if (cleanUrl === lowerPattern || origLower === lowerPattern) {
        return {
          rule,
          specificityTier: 4,
          confidence: 0.98,
          evidence: `Matched owner exact full-URL rule "${rule.name}" (${pattern}).`,
        };
      }
      return null;
    }

    case 'path_prefix': {
      // Pattern can be "github.com/org/" or "/docs/api"
      const fullNoScheme = `${input.domain}${input.pathnameAndQuery}`.toLowerCase();
      const pathLower = input.pathnameAndQuery.toLowerCase();
      const strippedPattern = lowerPattern.replace(/^https?:\/\//, '');
      if (
        fullNoScheme.startsWith(strippedPattern) ||
        (strippedPattern.startsWith('/') && pathLower.startsWith(strippedPattern))
      ) {
        return {
          rule,
          specificityTier: 4,
          confidence: Math.max(0.94, baseConfidence),
          evidence: `Matched owner URL path prefix rule "${rule.name}" (${pattern}).`,
        };
      }
      return null;
    }

    case 'subdomain':
    case 'hostname': {
      const strippedHost = lowerPattern
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (matchesHostnameBoundary(input.domain, strippedHost)) {
        return {
          rule,
          specificityTier: 4,
          confidence: Math.max(0.92, baseConfidence),
          evidence: `Matched owner hostname rule "${rule.name}" (${strippedHost}).`,
        };
      }
      return null;
    }

    case 'title_keyword': {
      const hay = `${input.title} ${input.description || ''}`;
      if (containsTokenizedPhrase(hay, pattern)) {
        return {
          rule,
          specificityTier: 4,
          confidence: Math.max(0.91, baseConfidence),
          evidence: `Matched owner title/keyword rule "${rule.name}" ("${pattern}").`,
        };
      }
      return null;
    }

    default:
      return null;
  }
}
