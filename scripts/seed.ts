/**
 * Seed Script for Workshop Runner
 * 
 * This script creates sample data for development and testing:
 * - 1 Organization (Demo Co)
 * - 1 Workshop Template with 2 Modules:
 *   - Module 1: "Getting Started" with intro step
 *   - Module 2: "Prompt Coach Activity" with prompt building steps
 * 
 * Usage:
 *   npm run db:seed
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log('🌱 Starting seed...\n');

  // 1. Create Organization
  console.log('Creating organization...');
  const orgId = uuidv4();
  const { error: orgError } = await supabase.from('organizations').insert({
    id: orgId,
    name: 'Biz Group',
    industry: 'Professional Services',
    tone_notes: 'Warm, practical, and upbeat.',
    example_use_cases: [
      'Drafting client emails',
      'Summarizing research',
      'Brainstorming campaign ideas',
    ],
  });

  if (orgError) {
    console.error('Failed to create organization:', orgError);
    process.exit(1);
  }
  console.log(`✅ Created organization: Biz Group (${orgId})\n`);

  // 2. Create Workshop Template
  console.log('Creating workshop template...');
  const templateId = uuidv4();
  const { error: templateError } = await supabase.from('workshop_templates').insert({
    id: templateId,
    organization_id: orgId,
    name: 'AI Prompt Engineering Workshop',
    description: 'Learn how to craft effective prompts for AI assistants',
    estimated_duration_minutes: 90,
    is_published: true,
  });

  if (templateError) {
    console.error('Failed to create template:', templateError);
    process.exit(1);
  }
  console.log(`✅ Created template: AI Prompt Engineering Workshop (${templateId})\n`);

  // 3. Create Module 1: Getting Started
  console.log('Creating modules...');
  const module1Id = uuidv4();
  const { error: module1Error } = await supabase.from('modules').insert({
    id: module1Id,
    template_id: templateId,
    title: 'Getting Started',
    objective: 'Introduce the workshop and set expectations.',
    order_index: 0,
  });

  if (module1Error) {
    console.error('Failed to create module 1:', module1Error);
    process.exit(1);
  }

  // Module 1 Step 1: Welcome
  const step1_1Id = uuidv4();
  await supabase.from('module_steps').insert({
    id: step1_1Id,
    module_id: module1Id,
    title: 'Welcome to the Workshop',
    instruction_markdown: `
# Welcome! 👋

In this workshop, you'll learn the fundamentals of prompting AI assistants effectively.

## What You'll Learn
- The anatomy of a good prompt
- How to provide context effectively
- Techniques for getting better outputs

## How This Works
1. Follow the instructions on each step
2. Fill in the prompts with your specific use cases
3. Download your personalized prompt pack at the end

**Let's get started!**
    `.trim(),
    order_index: 0,
    estimated_minutes: 3,
    is_required: true,
  });

  console.log(`✅ Created Module 1: Getting Started\n`);

  // 4. Create Module 2: Prompt Coach Activity
  const module2Id = uuidv4();
  const { error: module2Error } = await supabase.from('modules').insert({
    id: module2Id,
    template_id: templateId,
    title: 'Prompt Coach Activity',
    objective: 'Practice building effective prompts.',
    order_index: 1,
  });

  if (module2Error) {
    console.error('Failed to create module 2:', module2Error);
    process.exit(1);
  }

  // Module 2 Step 1: Define Your Task
  const step2_1Id = uuidv4();
  await supabase.from('module_steps').insert({
    id: step2_1Id,
    module_id: module2Id,
    title: 'Define Your AI Task',
    instruction_markdown: `
# Define Your Task 📋

Think of a task you want AI to help you with regularly.

## Examples:
- Writing emails
- Summarizing documents
- Brainstorming ideas
- Analyzing data
- Writing code

## Your Turn
In the prompt builder below, describe what task you want AI to do for you. Be specific about the outcome you want.
    `.trim(),
    order_index: 0,
    estimated_minutes: 5,
    is_required: true,
  });

  // Prompt block for Step 2.1
  const prompt2_1Id = uuidv4();
  await supabase.from('prompt_blocks').insert({
    id: prompt2_1Id,
    step_id: step2_1Id,
    title: 'Your Task',
    content_markdown: 'I want AI to help me with: **{{task_description}}**',
    order_index: 0,
    is_copyable: true,
  });

  // Module 2 Step 2: Add Context
  const step2_2Id = uuidv4();
  await supabase.from('module_steps').insert({
    id: step2_2Id,
    module_id: module2Id,
    title: 'Add Context',
    instruction_markdown: `
# Add Context 🎯

Context helps AI understand your specific situation.

## Good Context Includes:
- **Who you are**: Your role or background
- **Who it's for**: The audience or recipient
- **Constraints**: Word limits, tone requirements, etc.
- **Examples**: What good output looks like

## Build Your Context
Add relevant context to your prompt below.
    `.trim(),
    order_index: 1,
    estimated_minutes: 5,
    is_required: true,
  });

  // Prompt block for Step 2.2
  const prompt2_2Id = uuidv4();
  await supabase.from('prompt_blocks').insert({
    id: prompt2_2Id,
    step_id: step2_2Id,
    title: 'Context',
    content_markdown: `You are helping **{{role}}**.

Audience: **{{audience}}**
Tone: **{{tone}}**
Length: **{{length}}**

Task: **{{task_from_step_1}}**`,
    order_index: 0,
    is_copyable: true,
  });

  // Module 2 Step 3: Final Prompt
  const step2_3Id = uuidv4();
  await supabase.from('module_steps').insert({
    id: step2_3Id,
    module_id: module2Id,
    title: 'Complete Your Prompt',
    instruction_markdown: `
# Build Your Complete Prompt 🏆

Now let's put it all together! A great prompt has:

1. **Clear Role**: Tell AI who it should be
2. **Specific Task**: What exactly to do
3. **Context**: Background information
4. **Format**: How to structure the output
5. **Examples** (optional): Show what good looks like

## Your Final Prompt
Combine everything into your reusable prompt below.
    `.trim(),
    order_index: 2,
    estimated_minutes: 7,
    is_required: true,
  });

  // Prompt block for Step 2.3
  const prompt2_3Id = uuidv4();
  await supabase.from('prompt_blocks').insert({
    id: prompt2_3Id,
    step_id: step2_3Id,
    title: 'Complete Prompt',
    content_markdown: `You are an expert **{{role}}**.

## Task
**{{task_description}}**

## Context
- Audience: **{{audience}}**
- Tone: **{{tone}}**
- Length: **{{length}}**

## Format
**{{output_format}}**

## Instructions
**{{specific_instructions}}**`,
    order_index: 0,
    is_copyable: true,
  });

  console.log(`✅ Created Module 2: Prompt Coach Activity\n`);

  // Summary
  console.log('━'.repeat(50));
  console.log('🎉 Seed completed successfully!\n');
  console.log('Created:');
  console.log(`  - Organization: Demo Co (${orgId})`);
  console.log(`  - Template: AI Prompt Engineering Workshop`);
  console.log(`  - 2 Modules with 4 total steps`);
  console.log(`  - 3 Prompt blocks\n`);
  console.log('Next steps:');
  console.log('  1. Create a facilitator user via Supabase Auth');
  console.log('  2. Add them to the facilitator_users table');
  console.log('  3. Create a session from the template');
  console.log('━'.repeat(50));
}

seed().catch(console.error);
