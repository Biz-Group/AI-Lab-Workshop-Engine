/**
 * Seed Script — Aldar Properties "Super Agents 101" Template
 *
 * Reads sample-template-aldar.json and inserts the full hierarchy
 * (template → modules → steps → prompt blocks) into the database.
 *
 * Usage:
 *   npx tsx scripts/seed-aldar-template.ts
 *
 * The script targets the first organization in the DB. Pass an org name
 * as a CLI arg to target a specific one:
 *   npx tsx scripts/seed-aldar-template.ts "Aldar Properties"
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Types matching the JSON schema ──────────────────────────────────────────

interface PromptBlock {
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
}

interface Step {
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes?: number | null;
  is_required: boolean;
  ai_tool_name?: string | null;
  ai_tool_url?: string | null;
  prompt_blocks: PromptBlock[];
}

interface Module {
  title: string;
  objective: string;
  order_index: number;
  steps: Step[];
}

interface TemplateData {
  template: {
    name: string;
    description: string;
    estimated_duration_minutes: number;
    ai_tool_name: string;
    ai_tool_url: string;
    is_published: boolean;
  };
  modules: Module[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function ok(msg: string)  { console.log(`  ✅  ${msg}`); }
function err(msg: string, e: unknown) {
  console.error(`  ❌  ${msg}`, e);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = dirname(__filename);
  const jsonPath   = join(__dirname, '..', 'sample-template-aldar.json');

  log('');
  log('━'.repeat(60));
  log('  🌱  Aldar "Super Agents 101" — Template Seed');
  log('━'.repeat(60));

  // 1. Load the JSON data
  let data: TemplateData;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    err('Could not read sample-template-aldar.json', e);
    return;
  }
  log(`\n📄  Loaded template data: "${data.template.name}"`);
  log(`    ${data.modules.length} modules, ${data.modules.reduce((n, m) => n + m.steps.length, 0)} steps, ${data.modules.reduce((n, m) => n + m.steps.reduce((s, st) => s + st.prompt_blocks.length, 0), 0)} prompt blocks\n`);

  // 2. Resolve the target organization
  const orgNameArg = process.argv[2];
  let query = supabase.from('organizations').select('id, name').order('created_at', { ascending: true });
  if (orgNameArg) query = query.ilike('name', `%${orgNameArg}%`);

  const { data: orgs, error: orgError } = await query.limit(1).single();
  if (orgError || !orgs) {
    err(`No organization found${orgNameArg ? ` matching "${orgNameArg}"` : ''}. Run the main seed first.`, orgError);
    return;
  }
  log(`🏢  Target organization: "${orgs.name}" (${orgs.id})\n`);

  // 3. Guard: skip if template already exists with the same name
  const { data: existing } = await supabase
    .from('workshop_templates')
    .select('id, name')
    .eq('organization_id', orgs.id)
    .eq('name', data.template.name)
    .maybeSingle();

  if (existing) {
    console.warn(`⚠️   Template "${existing.name}" already exists (${existing.id}).`);
    console.warn('    Delete it first or rename the template in the JSON to re-seed.\n');
    process.exit(0);
  }

  // 4. Create the template
  log('📋  Creating template…');
  const templateId = uuidv4();
  const { error: templateError } = await supabase.from('workshop_templates').insert({
    id: templateId,
    organization_id: orgs.id,
    name: data.template.name,
    description: data.template.description,
    estimated_duration_minutes: data.template.estimated_duration_minutes,
    ai_tool_name: data.template.ai_tool_name,
    ai_tool_url: data.template.ai_tool_url,
    is_published: data.template.is_published,
  });
  if (templateError) err('Failed to create template', templateError);
  ok(`Template created: "${data.template.name}" (${templateId})`);

  // 5. Create modules → steps → prompt blocks
  log('\n📦  Creating modules…');

  let totalSteps   = 0;
  let totalBlocks  = 0;

  for (const mod of data.modules) {
    const moduleId = uuidv4();
    const { error: modError } = await supabase.from('modules').insert({
      id: moduleId,
      template_id: templateId,
      title: mod.title,
      objective: mod.objective,
      order_index: mod.order_index,
    });
    if (modError) err(`Failed to create module "${mod.title}"`, modError);
    ok(`Module [${mod.order_index}] "${mod.title}"`);

    for (const step of mod.steps) {
      const stepId = uuidv4();
      const { error: stepError } = await supabase.from('module_steps').insert({
        id: stepId,
        module_id: moduleId,
        title: step.title,
        instruction_markdown: step.instruction_markdown,
        order_index: step.order_index,
        estimated_minutes: step.estimated_minutes ?? null,
        is_required: step.is_required,
        ai_tool_name: step.ai_tool_name ?? null,
        ai_tool_url: step.ai_tool_url ?? null,
      });
      if (stepError) err(`  Failed to create step "${step.title}"`, stepError);
      log(`       ↳ Step [${step.order_index}] "${step.title}"`);
      totalSteps++;

      for (const block of step.prompt_blocks) {
        const blockId = uuidv4();
        const { error: blockError } = await supabase.from('prompt_blocks').insert({
          id: blockId,
          step_id: stepId,
          title: block.title,
          content_markdown: block.content_markdown,
          order_index: block.order_index,
          is_copyable: block.is_copyable,
        });
        if (blockError) err(`    Failed to create prompt block "${block.title}"`, blockError);
        log(`            • Block "${block.title}"`);
        totalBlocks++;
      }
    }
  }

  // 6. Summary
  log('');
  log('━'.repeat(60));
  log('🎉  Seed completed successfully!\n');
  log(`    Template  : ${data.template.name}`);
  log(`    Template ID: ${templateId}`);
  log(`    Org       : ${orgs.name}`);
  log(`    Modules   : ${data.modules.length}`);
  log(`    Steps     : ${totalSteps}`);
  log(`    Blocks    : ${totalBlocks}`);
  log('');
  log('  Next steps:');
  log('  1. Open the admin panel and find the new template');
  log('  2. Publish it when ready');
  log('  3. Create a session to run the workshop');
  log('━'.repeat(60));
  log('');
}

seed().catch(console.error);
