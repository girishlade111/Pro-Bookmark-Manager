import type {
  CategoryRecord,
  ClassificationResult,
  ClassificationRuleRecord,
} from '../../types/bookmark.ts';
import { evaluateSourceFolderPaths } from './folder-mappings.ts';
import { evaluateTextKeywordSignals } from './keyword-dictionary.ts';
import {
  evaluateOwnerRuleMatch,
  isMultiPurposeAmbiguousDomain,
  matchesHostnameBoundary,
  SYSTEM_HOST_PATH_RULES,
} from './rule-matcher.ts';
import { buildTaxonomyIndex, resolveTaxonomyIds } from './taxonomy.ts';

export const RULESET_VERSION = 'phase3-deterministic-v1';
export const DEFAULT_AUTO_CLASSIFY_THRESHOLD = 0.90;
export const DEFAULT_SUGGEST_REVIEW_THRESHOLD = 0.65;

export interface BookmarkClassificationInput {
  bookmarkId?: string;
  originalUrl: string;
  normalizedUrlKey: string;
  domain: string;
  title: string;
  description?: string | null;
  explicitOwnerCategoryId?: string | null;
  currentCategoryId?: string | null;
  currentCategoryLocked?: boolean;
  sourceFolderPaths?: string[][];
}

interface CandidateBucket {
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  bestBaseScore: number;
  corroborationBonus: number;
  signalTypes: Set<'owner_rule' | 'folder' | 'host_path' | 'keyword'>;
  matchedRuleIds: string[];
  evidence: string[];
  suggestedTags: Set<string>;
}

function parsePathnameAndQuery(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return `${u.pathname || '/'}${u.search || ''}`;
  } catch {
    return '/';
  }
}

function resolveCategoryPairById(
  targetId: string,
  byId: Map<string, CategoryRecord>
): {
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
} {
  const cat = byId.get(targetId);
  if (!cat) {
    return {
      categoryId: null,
      categoryName: null,
      subcategoryId: null,
      subcategoryName: null,
    };
  }
  if (cat.parentCategoryId) {
    const parent = byId.get(cat.parentCategoryId);
    return {
      categoryId: parent ? parent.id : cat.id,
      categoryName: parent ? parent.name : cat.name,
      subcategoryId: parent ? cat.id : null,
      subcategoryName: parent ? cat.name : null,
    };
  }
  return {
    categoryId: cat.id,
    categoryName: cat.name,
    subcategoryId: null,
    subcategoryName: null,
  };
}

/**
 * Pure deterministic bookmark classification engine.
 * Never uses AI/LLMs or external network calls.
 */
export function classifyBookmarkDeterministic(
  input: BookmarkClassificationInput,
  ownerCategories: CategoryRecord[],
  ownerRules: ClassificationRuleRecord[] = [],
  thresholds = {
    autoClassify: DEFAULT_AUTO_CLASSIFY_THRESHOLD,
    suggestReview: DEFAULT_SUGGEST_REVIEW_THRESHOLD,
  }
): ClassificationResult {
  const taxonomyIndex = buildTaxonomyIndex(ownerCategories);
  const folderPaths = input.sourceFolderPaths ?? [];
  const pathnameAndQuery = parsePathnameAndQuery(
    input.normalizedUrlKey || input.originalUrl
  );

  // PRIORITY 1: Explicit owner-selected category during Add or Import
  if (input.explicitOwnerCategoryId) {
    const pair = resolveCategoryPairById(
      input.explicitOwnerCategoryId,
      taxonomyIndex.byId
    );
    if (pair.categoryId) {
      return {
        categoryId: pair.categoryId,
        categoryName: pair.categoryName,
        subcategoryId: pair.subcategoryId,
        subcategoryName: pair.subcategoryName,
        confidence: 1.0,
        status: 'manual',
        matchedRuleIds: ['priority-1-explicit-owner-selection'],
        evidence: [
          `Explicitly selected by owner (${
            pair.subcategoryName
              ? `${pair.categoryName} → ${pair.subcategoryName}`
              : pair.categoryName
          }). Manual lock active.`,
        ],
        suggestedTags: [],
        rulesetVersion: RULESET_VERSION,
        requiresReview: false,
      };
    }
  }

  // PRIORITY 2: Previously saved manual category assignment with active manual lock
  if (input.currentCategoryLocked && input.currentCategoryId) {
    const pair = resolveCategoryPairById(
      input.currentCategoryId,
      taxonomyIndex.byId
    );
    if (pair.categoryId) {
      return {
        categoryId: pair.categoryId,
        categoryName: pair.categoryName,
        subcategoryId: pair.subcategoryId,
        subcategoryName: pair.subcategoryName,
        confidence: 1.0,
        status: 'manual',
        matchedRuleIds: ['priority-2-existing-manual-lock'],
        evidence: [
          `Preserved existing manual category lock (${
            pair.subcategoryName
              ? `${pair.categoryName} → ${pair.subcategoryName}`
              : pair.categoryName
          }). Automatic rules never override manual locks.`,
        ],
        suggestedTags: [],
        rulesetVersion: RULESET_VERSION,
        requiresReview: false,
      };
    }
  }

  // Collect deterministic tags from domain and keywords
  const globalSuggestedTags = new Set<string>();
  if (matchesHostnameBoundary(input.domain, 'youtube.com') || matchesHostnameBoundary(input.domain, 'youtu.be')) {
    globalSuggestedTags.add('YouTube');
    globalSuggestedTags.add('Video');
  } else if (matchesHostnameBoundary(input.domain, 'github.com')) {
    globalSuggestedTags.add('GitHub');
  }

  // PRIORITY 3 & 4: Evaluate enabled owner-defined rules (sorted by priority desc, specificity asc)
  const sortedOwnerRules = [...ownerRules]
    .filter((r) => r.isEnabled)
    .sort((a, b) => b.priority - a.priority);

  const ownerRuleMatches = sortedOwnerRules
    .map((rule) =>
      evaluateOwnerRuleMatch(rule, {
        normalizedUrlKey: input.normalizedUrlKey,
        originalUrl: input.originalUrl,
        domain: input.domain,
        pathnameAndQuery,
        title: input.title,
        description: input.description,
        sourceFolderPaths: folderPaths,
      })
    )
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort(
      (a, b) =>
        a.specificityTier - b.specificityTier ||
        b.rule.priority - a.rule.priority ||
        b.confidence - a.confidence
    );

  if (ownerRuleMatches.length > 0) {
    const topMatch = ownerRuleMatches[0];
    const targetId =
      topMatch.rule.targetSubcategoryId || topMatch.rule.targetCategoryId;
    const pair = resolveCategoryPairById(targetId, taxonomyIndex.byId);

    if (pair.categoryId) {
      const conf = Number(topMatch.confidence.toFixed(2));
      const isAuto = conf >= thresholds.autoClassify;
      return {
        categoryId: pair.categoryId,
        categoryName: pair.categoryName,
        subcategoryId: pair.subcategoryId,
        subcategoryName: pair.subcategoryName,
        confidence: conf,
        status: isAuto ? 'auto_classified' : 'suggested',
        matchedRuleIds: [topMatch.rule.id],
        evidence: [topMatch.evidence],
        suggestedTags: Array.from(globalSuggestedTags),
        rulesetVersion: RULESET_VERSION,
        requiresReview: !isAuto,
        reviewReason: isAuto
          ? undefined
          : 'Owner rule matched below automatic assignment threshold.',
      };
    }
  }

  // PRIORITY 5 & 6: Combine Source Folder Seed Mappings + Host/Path Rules + Keyword Dictionary
  const buckets = new Map<string, CandidateBucket>();

  const addSignalToBucket = (params: {
    mainCategoryName: string;
    subcategoryName: string | null;
    score: number;
    corroborationIncrement: number;
    signalType: 'owner_rule' | 'folder' | 'host_path' | 'keyword';
    ruleId: string;
    evidenceText: string;
    tag?: string;
  }) => {
    const resolved = resolveTaxonomyIds(
      taxonomyIndex,
      params.mainCategoryName,
      params.subcategoryName
    );
    if (!resolved.categoryId || !resolved.categoryName) return;

    const bucketKey = `${resolved.categoryId}::${resolved.subcategoryId || 'main'}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        categoryId: resolved.categoryId,
        categoryName: resolved.categoryName,
        subcategoryId: resolved.subcategoryId,
        subcategoryName: resolved.subcategoryName,
        bestBaseScore: params.score,
        corroborationBonus: 0,
        signalTypes: new Set([params.signalType]),
        matchedRuleIds: [params.ruleId],
        evidence: [params.evidenceText],
        suggestedTags: new Set(params.tag ? [params.tag] : []),
      };
      buckets.set(bucketKey, bucket);
    } else {
      if (params.score > bucket.bestBaseScore) {
        bucket.bestBaseScore = params.score;
      }
      bucket.corroborationBonus += params.corroborationIncrement;
      bucket.signalTypes.add(params.signalType);
      if (!bucket.matchedRuleIds.includes(params.ruleId)) {
        bucket.matchedRuleIds.push(params.ruleId);
      }
      if (!bucket.evidence.includes(params.evidenceText)) {
        bucket.evidence.push(params.evidenceText);
      }
      if (params.tag) {
        bucket.suggestedTags.add(params.tag);
      }
    }
    if (params.tag) {
      globalSuggestedTags.add(params.tag);
    }
  };

  // 5a. Source folder signals
  const folderSignals = evaluateSourceFolderPaths(folderPaths);
  for (const fsig of folderSignals) {
    addSignalToBucket({
      mainCategoryName: fsig.mainCategory,
      subcategoryName: fsig.subcategory,
      score: fsig.weight,
      corroborationIncrement: 0.14,
      signalType: 'folder',
      ruleId: fsig.ruleId,
      evidenceText: fsig.evidence,
    });
  }

  // 6a. System Hostname / Path rules
  for (const hrule of SYSTEM_HOST_PATH_RULES) {
    if (matchesHostnameBoundary(input.domain, hrule.hostPattern)) {
      if (
        !hrule.pathPrefix ||
        pathnameAndQuery.toLowerCase().startsWith(hrule.pathPrefix.toLowerCase())
      ) {
        addSignalToBucket({
          mainCategoryName: hrule.mainCategory,
          subcategoryName: hrule.subcategory,
          score: hrule.baseConfidence,
          corroborationIncrement: 0.12,
          signalType: 'host_path',
          ruleId: hrule.ruleId,
          evidenceText: `Matched hostname rule "${hrule.hostPattern}" → ${
            hrule.subcategory
              ? `${hrule.mainCategory} / ${hrule.subcategory}`
              : hrule.mainCategory
          }.`,
          tag: hrule.suggestedTag,
        });
      }
    }
  }

  // 6b. Title, Description & URL Path Keyword Signals
  const keywordSignals = evaluateTextKeywordSignals(
    input.title,
    input.description,
    pathnameAndQuery
  );
  for (const ksig of keywordSignals) {
    addSignalToBucket({
      mainCategoryName: ksig.mainCategory,
      subcategoryName: ksig.subcategory,
      score: Math.min(0.84, 0.56 + ksig.weight),
      corroborationIncrement: 0.16,
      signalType: 'keyword',
      ruleId: ksig.ruleId,
      evidenceText: ksig.evidence,
      tag: ksig.suggestedTag,
    });
  }

  // Merge main-category-level corroboration when a folder matched a main category or sibling subcategory
  const allBuckets = Array.from(buckets.values());
  if (allBuckets.length === 0) {
    const isAmbiguousHost = isMultiPurposeAmbiguousDomain(input.domain);
    const reason = isAmbiguousHost
      ? `Multi-purpose domain (${input.domain}) lacks specific folder, title, or rule evidence to classify automatically.`
      : `No deterministic folder, hostname, or keyword rules matched "${input.domain}".`;

    return {
      categoryId: null,
      categoryName: null,
      subcategoryId: null,
      subcategoryName: null,
      confidence: 0.0,
      status: 'needs_review',
      matchedRuleIds: [],
      evidence: [reason],
      suggestedTags: Array.from(globalSuggestedTags),
      rulesetVersion: RULESET_VERSION,
      requiresReview: true,
      reviewReason: reason,
    };
  }

  // Compute bounded confidence for each candidate bucket
  const scoredCandidates = allBuckets.map((b) => {
    // Check if another bucket in the SAME main category has a complementary signal type
    const sameMainSiblings = allBuckets.filter(
      (other) => other !== b && other.categoryId === b.categoryId
    );
    let siblingBonus = 0;
    const combinedEvidence = [...b.evidence];
    const combinedRules = [...b.matchedRuleIds];
    const combinedTypes = new Set(b.signalTypes);

    for (const sib of sameMainSiblings) {
      siblingBonus += 0.08;
      for (const t of sib.signalTypes) combinedTypes.add(t);
      for (const ev of sib.evidence) {
        if (!combinedEvidence.includes(ev)) combinedEvidence.push(ev);
      }
      for (const r of sib.matchedRuleIds) {
        if (!combinedRules.includes(r)) combinedRules.push(r);
      }
    }

    const multiSignalBonus = combinedTypes.size >= 2 ? 0.14 : 0;
    let rawConfidence =
      b.bestBaseScore +
      b.corroborationBonus * 0.5 +
      siblingBonus +
      multiSignalBonus;

    // Multi-purpose domains (e.g., youtube.com) require at least 2 independent signals or a strong specific phrase to exceed 0.90
    if (
      isMultiPurposeAmbiguousDomain(input.domain) &&
      combinedTypes.size < 2 &&
      b.bestBaseScore < 0.90
    ) {
      rawConfidence = Math.min(rawConfidence, 0.84);
    }

    const boundedConfidence = Math.min(
      0.98,
      Math.max(0.1, Number(rawConfidence.toFixed(2)))
    );

    return {
      ...b,
      confidence: boundedConfidence,
      evidence: combinedEvidence,
      matchedRuleIds: combinedRules,
      signalTypeCount: combinedTypes.size,
    };
  });

  scoredCandidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.signalTypeCount - a.signalTypeCount ||
      (b.subcategoryId ? 1 : 0) - (a.subcategoryId ? 1 : 0)
  );

  const winner = scoredCandidates[0];
  const runnerUpAcrossMain = scoredCandidates.find(
    (c) => c.categoryId !== winner.categoryId
  );

  let finalConfidence = winner.confidence;
  let conflictReason: string | undefined;

  // Detect conflicting near-tie across different main categories
  if (
    runnerUpAcrossMain &&
    Math.abs(winner.confidence - runnerUpAcrossMain.confidence) < 0.08 &&
    runnerUpAcrossMain.confidence >= 0.65
  ) {
    finalConfidence = Math.min(finalConfidence, 0.78);
    conflictReason = `Conflicting classification signals between "${winner.categoryName}" and "${runnerUpAcrossMain.categoryName}". Routed for manual review.`;
    winner.evidence.push(conflictReason);
  }

  if (finalConfidence >= thresholds.autoClassify && !conflictReason) {
    return {
      categoryId: winner.categoryId,
      categoryName: winner.categoryName,
      subcategoryId: winner.subcategoryId,
      subcategoryName: winner.subcategoryName,
      confidence: finalConfidence,
      status: 'auto_classified',
      matchedRuleIds: winner.matchedRuleIds,
      evidence: winner.evidence,
      suggestedTags: Array.from(globalSuggestedTags),
      rulesetVersion: RULESET_VERSION,
      requiresReview: false,
    };
  }

  if (finalConfidence >= thresholds.suggestReview) {
    const reviewReason =
      conflictReason ||
      `Moderate confidence (${Math.round(
        finalConfidence * 100
      )}%) — suggested "${
        winner.subcategoryName
          ? `${winner.categoryName} → ${winner.subcategoryName}`
          : winner.categoryName
      }" for owner confirmation.`;

    return {
      categoryId: winner.categoryId,
      categoryName: winner.categoryName,
      subcategoryId: winner.subcategoryId,
      subcategoryName: winner.subcategoryName,
      confidence: finalConfidence,
      status: 'suggested',
      matchedRuleIds: winner.matchedRuleIds,
      evidence: winner.evidence,
      suggestedTags: Array.from(globalSuggestedTags),
      rulesetVersion: RULESET_VERSION,
      requiresReview: true,
      reviewReason,
    };
  }

  const lowReason = `Low rule evidence (${Math.round(
    finalConfidence * 100
  )}%) — requires manual review.`;

  return {
    categoryId: winner.categoryId,
    categoryName: winner.categoryName,
    subcategoryId: winner.subcategoryId,
    subcategoryName: winner.subcategoryName,
    confidence: finalConfidence,
    status: 'needs_review',
    matchedRuleIds: winner.matchedRuleIds,
    evidence: winner.evidence,
    suggestedTags: Array.from(globalSuggestedTags),
    rulesetVersion: RULESET_VERSION,
    requiresReview: true,
    reviewReason: lowReason,
  };
}
