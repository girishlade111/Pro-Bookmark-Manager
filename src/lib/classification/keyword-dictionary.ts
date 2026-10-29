export interface KeywordRuleDefinition {
  ruleId: string;
  mainCategory: string;
  subcategory: string;
  phrases: string[]; // matched with word-boundary tokenization
  weight: number; // 0.15 to 0.35 contribution per phrase match
  suggestedTag?: string;
}

export const CLASSIFICATION_KEYWORD_DICTIONARY: readonly KeywordRuleDefinition[] = [
  // 1. Development & Programming
  {
    ruleId: 'kw-dev-ide',
    mainCategory: 'Development & Programming',
    subcategory: 'Code Editors & IDEs',
    phrases: [
      'code editor',
      'online compiler',
      'code playground',
      'visual studio code',
      'vscode',
      'neovim',
      'jetbrains',
      'intellij',
      'webstorm',
    ],
    weight: 0.26,
    suggestedTag: 'IDE',
  },
  {
    ruleId: 'kw-dev-git',
    mainCategory: 'Development & Programming',
    subcategory: 'Git & Repositories',
    phrases: [
      'git repository',
      'open source repo',
      'pull request',
      'version control',
      'git workflow',
      'monorepo',
    ],
    weight: 0.24,
    suggestedTag: 'Git',
  },
  {
    ruleId: 'kw-dev-frontend',
    mainCategory: 'Development & Programming',
    subcategory: 'Frontend & UI Frameworks',
    phrases: [
      'next.js',
      'nextjs',
      'app router',
      'react component',
      'tailwind css',
      'tailwindcss',
      'shadcn',
      'sveltekit',
      'vue.js',
      'frontend framework',
    ],
    weight: 0.26,
    suggestedTag: 'Frontend',
  },
  {
    ruleId: 'kw-dev-backend',
    mainCategory: 'Development & Programming',
    subcategory: 'Backend & APIs',
    phrases: [
      'rest api',
      'graphql',
      'grpc',
      'webhook',
      'drizzle orm',
      'prisma',
      'server actions',
      'microservice',
      'backend architecture',
    ],
    weight: 0.26,
    suggestedTag: 'Backend',
  },
  {
    ruleId: 'kw-dev-sdk',
    mainCategory: 'Development & Programming',
    subcategory: 'SDKs & Developer Utilities',
    phrases: [
      'developer utility',
      'json formatter',
      'regex tester',
      'cli tool',
      'npm package',
      'typescript sdk',
    ],
    weight: 0.24,
    suggestedTag: 'DevTools',
  },
  {
    ruleId: 'kw-dev-devops',
    mainCategory: 'Development & Programming',
    subcategory: 'DevOps & Automation',
    phrases: [
      'ci/cd',
      'github actions',
      'dockerfile',
      'kubernetes',
      'terraform',
      'helm chart',
    ],
    weight: 0.26,
    suggestedTag: 'DevOps',
  },
  {
    ruleId: 'kw-dev-education',
    mainCategory: 'Development & Programming',
    subcategory: 'Coding Education & Examples',
    phrases: [
      'coding tutorial',
      'programming course',
      'leetcode',
      'algorithm practice',
      'react tutorial',
      'typescript tutorial',
      'postgresql indexing deep dive',
      'app router server actions',
    ],
    weight: 0.28,
    suggestedTag: 'Coding Tutorial',
  },
  {
    ruleId: 'kw-dev-snippets',
    mainCategory: 'Development & Programming',
    subcategory: 'Code Templates & Snippets',
    phrases: [
      'code snippet',
      'boilerplate',
      'starter template',
      'cheat sheet',
    ],
    weight: 0.24,
    suggestedTag: 'Snippets',
  },

  // 2. AI Tools & Agents
  {
    ruleId: 'kw-ai-chatbots',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'LLM Chatbots',
    phrases: [
      'llm chatbot',
      'conversational ai',
      'chat assistant',
      'chatgpt',
      'claude chat',
    ],
    weight: 0.28,
    suggestedTag: 'LLM',
  },
  {
    ruleId: 'kw-ai-agents',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'AI Agents & Agent Builders',
    phrases: [
      'ai agent',
      'agentic workflow',
      'autonomous agent',
      'multi-agent',
      'agent builder',
    ],
    weight: 0.28,
    suggestedTag: 'AI Agents',
  },
  {
    ruleId: 'kw-ai-models',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Models & Open-Source Hubs',
    phrases: [
      'hugging face',
      'open weights',
      'model hub',
      'fine-tuning',
      'lora checkpoint',
    ],
    weight: 0.28,
    suggestedTag: 'AI Models',
  },
  {
    ruleId: 'kw-ai-local',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Local LLM & Inference',
    phrases: [
      'ollama',
      'llama.cpp',
      'lm studio',
      'vllm',
      'local inference',
      'gguf quantized',
    ],
    weight: 0.30,
    suggestedTag: 'Local LLM',
  },
  {
    ruleId: 'kw-ai-coding',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'AI Coding Assistants',
    phrases: [
      'ai coding assistant',
      'code generation assistant',
      'agentic coding',
      'cursor ide',
      'github copilot',
      'windsurf',
    ],
    weight: 0.28,
    suggestedTag: 'AI Coding',
  },
  {
    ruleId: 'kw-ai-prompts',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Prompt Libraries',
    phrases: ['prompt library', 'system prompt', 'prompt engineering'],
    weight: 0.28,
    suggestedTag: 'Prompts',
  },
  {
    ruleId: 'kw-ai-mcp',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'MCP & Agent Tooling',
    phrases: [
      'model context protocol',
      'mcp server',
      'mcp client',
      'tool calling',
    ],
    weight: 0.32,
    suggestedTag: 'MCP',
  },
  {
    ruleId: 'kw-ai-voice',
    mainCategory: 'AI Tools & Agents',
    subcategory: 'Voice AI & Speech',
    phrases: [
      'text to speech',
      'speech to text',
      'voice cloning',
      'elevenlabs',
      'whisper transcription',
    ],
    weight: 0.28,
    suggestedTag: 'Voice AI',
  },

  // 3. Cloud & Infrastructure
  {
    ruleId: 'kw-cloud-compute',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Cloud Compute & VPS',
    phrases: [
      'virtual private server',
      'cloud compute',
      'hetzner',
      'digitalocean droplet',
      'ec2 instance',
    ],
    weight: 0.28,
    suggestedTag: 'VPS',
  },
  {
    ruleId: 'kw-cloud-paas',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Hosting & PaaS',
    phrases: [
      'serverless deployment',
      'cloud hosting',
      'platform as a service',
      'vercel deployment',
      'railway app',
      'fly.io',
    ],
    weight: 0.28,
    suggestedTag: 'Hosting',
  },
  {
    ruleId: 'kw-cloud-db',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Managed Databases',
    phrases: [
      'postgresql',
      'managed database',
      'database hosting',
      'serverless postgres',
      'neon postgres',
      'cloud sql',
      'unique indexes',
      'indexes & constraints',
    ],
    weight: 0.28,
    suggestedTag: 'PostgreSQL',
  },
  {
    ruleId: 'kw-cloud-storage',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Object Storage & File Hosting',
    phrases: [
      'object storage',
      's3 bucket',
      'cloudflare r2',
      'minio',
      'blob storage',
    ],
    weight: 0.28,
    suggestedTag: 'Storage',
  },
  {
    ruleId: 'kw-cloud-auth',
    mainCategory: 'Cloud & Infrastructure',
    subcategory: 'Identity & Authentication Services',
    phrases: [
      'better auth',
      'oauth provider',
      'single sign-on',
      'authentication service',
      'passkey auth',
    ],
    weight: 0.28,
    suggestedTag: 'Auth',
  },

  // 4. Website & App Builders
  {
    ruleId: 'kw-builder-nocode',
    mainCategory: 'Website & App Builders',
    subcategory: 'No-Code & Low-Code',
    phrases: ['no-code builder', 'low-code platform', 'webflow', 'framer site'],
    weight: 0.28,
    suggestedTag: 'No-Code',
  },
  {
    ruleId: 'kw-builder-apk',
    mainCategory: 'Website & App Builders',
    subcategory: 'Android & APK Builders',
    phrases: ['apk builder', 'android app builder', 'flutterflow'],
    weight: 0.30,
    suggestedTag: 'Android',
  },

  // 5. Design & Creative Assets
  {
    ruleId: 'kw-design-uiux',
    mainCategory: 'Design & Creative Assets',
    subcategory: 'UI/UX Design',
    phrases: ['figma design', 'ui/ux design', 'wireframe', 'prototyping tool'],
    weight: 0.28,
    suggestedTag: 'UI/UX',
  },
  {
    ruleId: 'kw-design-3d',
    mainCategory: 'Design & Creative Assets',
    subcategory: '3D Models & Elements',
    phrases: ['3d model', 'three.js', 'spline 3d', 'blender asset', 'webgl scene'],
    weight: 0.28,
    suggestedTag: '3D',
  },
  {
    ruleId: 'kw-design-icons',
    mainCategory: 'Design & Creative Assets',
    subcategory: 'Icons & PNG Assets',
    phrases: ['lucide icons', 'svg icon pack', 'png illustration', 'heroicons'],
    weight: 0.28,
    suggestedTag: 'Icons',
  },

  // 6. Media & Content Creation
  {
    ruleId: 'kw-media-video',
    mainCategory: 'Media & Content Creation',
    subcategory: 'Video Creation & Editing',
    phrases: ['video editor', 'screen recorder', 'davinci resolve', 'capcut'],
    weight: 0.28,
    suggestedTag: 'Video Editing',
  },
  {
    ruleId: 'kw-media-image',
    mainCategory: 'Media & Content Creation',
    subcategory: 'Image Generation & Editing',
    phrases: ['image generator', 'photo editor', 'background remover'],
    weight: 0.28,
    suggestedTag: 'Image Gen',
  },

  // 7. Productivity & Collaboration
  {
    ruleId: 'kw-prod-notes',
    mainCategory: 'Productivity & Collaboration',
    subcategory: 'Notes & Knowledge',
    phrases: ['knowledge base', 'second brain', 'obsidian vault', 'markdown notes'],
    weight: 0.28,
    suggestedTag: 'Knowledge Base',
  },
  {
    ruleId: 'kw-prod-tasks',
    mainCategory: 'Productivity & Collaboration',
    subcategory: 'Project & Task Management',
    phrases: ['kanban board', 'issue tracker', 'project management', 'sprint planning'],
    weight: 0.26,
    suggestedTag: 'Project Management',
  },

  // 8. Marketing & Monetization
  {
    ruleId: 'kw-mkt-seo',
    mainCategory: 'Marketing & Monetization',
    subcategory: 'SEO & Search Marketing',
    phrases: ['search engine optimization', 'keyword research', 'backlink checker', 'serp analysis'],
    weight: 0.28,
    suggestedTag: 'SEO',
  },

  // 9. Security & Privacy
  {
    ruleId: 'kw-sec-pw',
    mainCategory: 'Security & Privacy',
    subcategory: 'Password Managers',
    phrases: ['password manager', 'bitwarden', '1password', 'keepass'],
    weight: 0.30,
    suggestedTag: 'Security',
  },

  // 11. Communication & Email
  {
    ruleId: 'kw-comm-tempmail',
    mainCategory: 'Communication & Email',
    subcategory: 'Temporary Email',
    phrases: ['temporary email', 'disposable email', 'temp mail', '10minutemail'],
    weight: 0.30,
    suggestedTag: 'Temp Mail',
  },

  // 12. Learning & Reference
  {
    ruleId: 'kw-learn-docs',
    mainCategory: 'Learning & Reference',
    subcategory: 'Documentation & Reference',
    phrases: [
      'living standard',
      'whatwg',
      'mdn web docs',
      'api reference',
      'official documentation',
      'specification',
    ],
    weight: 0.28,
    suggestedTag: 'Documentation',
  },

  // 15. Downloads & File Utilities
  {
    ruleId: 'kw-dl-pdf',
    mainCategory: 'Downloads & File Utilities',
    subcategory: 'PDF & Document Utilities',
    phrases: ['pdf converter', 'merge pdf', 'ocr pdf', 'document utility'],
    weight: 0.28,
    suggestedTag: 'PDF',
  },
] as const;

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches phrase with word/token boundaries so short words are never matched inside unrelated words.
 */
export function containsTokenizedPhrase(haystack: string, phrase: string): boolean {
  const normHaystack = haystack.toLowerCase();
  const normPhrase = phrase.trim().toLowerCase();
  if (!normPhrase) return false;

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegex(normPhrase)}(?=$|[^a-z0-9])`,
    'i'
  );
  return pattern.test(normHaystack);
}

export interface EvaluatedKeywordSignal {
  ruleId: string;
  mainCategory: string;
  subcategory: string;
  weight: number;
  matchedPhrase: string;
  evidence: string;
  suggestedTag?: string;
}

export function evaluateTextKeywordSignals(
  title: string,
  description: string | null | undefined,
  urlPathAndQuery: string
): EvaluatedKeywordSignal[] {
  const combinedText = [title, description || '', urlPathAndQuery]
    .join(' ')
    .replace(/[-_/]+/g, ' ');

  const matches: EvaluatedKeywordSignal[] = [];

  for (const def of CLASSIFICATION_KEYWORD_DICTIONARY) {
    for (const phrase of def.phrases) {
      if (containsTokenizedPhrase(combinedText, phrase)) {
        const inTitle = containsTokenizedPhrase(title, phrase);
        const effectiveWeight = inTitle ? def.weight + 0.04 : def.weight;
        matches.push({
          ruleId: def.ruleId,
          mainCategory: def.mainCategory,
          subcategory: def.subcategory,
          weight: effectiveWeight,
          matchedPhrase: phrase,
          evidence: `Matched keyword phrase "${phrase}" in ${
            inTitle ? 'bookmark title' : 'metadata/URL path'
          }.`,
          suggestedTag: def.suggestedTag,
        });
        break; // Count each keyword rule definition at most once per bookmark
      }
    }
  }

  return matches;
}
