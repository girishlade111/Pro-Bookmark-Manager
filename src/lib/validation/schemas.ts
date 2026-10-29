import { z } from 'zod';

export const reusableRuleOptionSchema = z
  .object({
    ruleType: z.enum([
      'exact_url',
      'path_prefix',
      'hostname',
      'subdomain',
      'folder_mapping',
      'title_keyword',
    ]),
    pattern: z.string().trim().min(1).max(1024),
    name: z.string().trim().max(160).optional(),
    applyToMatchingUnlocked: z.boolean().optional(),
  })
  .nullable()
  .optional();

export const createBookmarkSchema = z.object({
  url: z.string().trim().min(1, 'URL is required').max(2048, 'URL is too long'),
  title: z.string().trim().max(300, 'Title must be 300 characters or fewer').optional().or(z.literal('')),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer').nullable().optional().or(z.literal('')),
  notes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer').nullable().optional().or(z.literal('')),
  categoryId: z.string().uuid('Invalid category ID').nullable().optional().or(z.literal('')),
  isFavorite: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional(),
});

export const updateBookmarkSchema = z.object({
  url: z.string().trim().min(1, 'URL is required').max(2048, 'URL is too long').optional(),
  title: z.string().trim().max(300, 'Title must be 300 characters or fewer').optional().or(z.literal('')),
  description: z.string().trim().max(1000, 'Description must be 1000 characters or fewer').nullable().optional(),
  notes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer').nullable().optional(),
  categoryId: z.string().uuid('Invalid category ID').nullable().optional().or(z.literal('')),
  isFavorite: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(25).optional(),
  createReusableRule: reusableRuleOptionSchema,
});

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required')
    .max(80, 'Category name must be 80 characters or fewer'),
  parentCategoryId: z
    .string()
    .uuid('Invalid parent category ID')
    .nullable()
    .optional()
    .or(z.literal('')),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
