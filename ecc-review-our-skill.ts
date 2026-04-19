#!/usr/bin/env tsx
/**
 * Use ECC agents to review our ECC integration skill
 * 
 * This script invokes ECC's code-reviewer and security-reviewer agents
 * to analyze the code we wrote.
 */

import { loadECCAgent, buildAgentPrompt, spawnECCAgent } from './ecc-runtime';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Files to Review
// ============================================================================

const FILES_TO_REVIEW = [
  {
    name: 'ecc-adapter.ts',
    path: '/root/.openclaw/workspace/ecc-adapter.ts',
    description: 'ECC agent detection and loading adapter'
  },
  {
    name: 'ecc-runtime.ts',
    path: '/root/.openclaw/workspace/ecc-runtime.ts',
    description: 'ECC subagent runtime with 4-stage workflow'
  },
  {
    name: 'ecc-pr-fix-cli.ts',
    path: '/root/.openclaw/workspace/ecc-pr-fix-cli.ts',
    description: 'CLI tool for PR comment fix workflow'
  },
  {
    name: 'SKILL.md',
    path: '/root/.openclaw/workspace/skills/ecc-pr-comment-fix/SKILL.md',
    description: 'Skill documentation for PR comment fix'
  }
];

// ============================================================================
// Review Functions
// ============================================================================

/**
 * Read file content
 */
function readFileContent(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return '';
  }
}

/**
 * Review code with ECC code-reviewer agent
 */
async function reviewWithECC(
  files: Array<{ name: string; content: string; description: string }>,
  reviewType: 'code-quality' | 'security' | 'best-practices'
): Promise<string> {
  const agentName = reviewType === 'security' ? 'security-reviewer' : 'code-reviewer';
  
  const agent = loadECCAgent(agentName);
  if (!agent) {
    throw new Error(`Agent ${agentName} not found`);
  }

  const reviewPrompt = `
# Code Review Task

You are reviewing an ECC integration for OpenClaw.

## Review Focus: ${reviewType.toUpperCase()}

## Files to Review

${files.map(f => `
### ${f.name}
${f.description}

\`\`\`typescript
${f.content}
\`\`\`
`).join('\n')}

## Review Guidelines

### For Code Quality Review
- Code organization and modularity
- Type safety and error handling
- Function naming and clarity
- Code duplication
- Testability
- Performance considerations

### For Security Review
- Input validation
- Error handling (no sensitive info leakage)
- File path handling (no path traversal)
- Command injection risks
- Secret handling
- Dependency security

### For Best Practices Review
- TypeScript best practices
- Error handling patterns
- Logging and debugging
- Documentation quality
- Code comments
- Configuration management

## Output Format

Provide your review in this format:

### ✅ Strengths
- List what was done well

### ⚠️ Issues Found
- List issues with severity (HIGH/MEDIUM/LOW)
- Include file name and line number if applicable
- Explain why it's an issue

### 💡 Recommendations
- Specific actionable improvements
- Code examples where helpful

### 📊 Overall Assessment
- Brief summary of code quality
- Ready for production? (Yes/No/With fixes)
`;

  const result = await spawnECCAgent({
    agentName,
    task: reviewPrompt,
    thinking: reviewType === 'security' ? 'high' : 'medium',
    timeoutSeconds: 600
  });

  return result.output;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('ECC Code Review - Our ECC Integration Skill');
  console.log('='.repeat(70));
  console.log('');

  // Load files
  console.log('📁 Loading files for review...');
  const files = FILES_TO_REVIEW.map(f => ({
    name: f.name,
    content: readFileContent(f.path),
    description: f.description
  })).filter(f => f.content.length > 0);

  console.log(`   Loaded ${files.length} files:\n`);
  files.forEach(f => {
    const lines = f.content.split('\n').length;
    const chars = f.content.length;
    console.log(`   - ${f.name}: ${lines} lines, ${chars} chars`);
  });
  console.log('');

  // Check ECC installation
  console.log('🔍 Checking ECC installation...');
  const { detectECC } = await import('./ecc-adapter');
  const registry = detectECC();
  
  if (!registry.installed) {
    console.error('❌ ECC not installed!');
    process.exit(1);
  }
  console.log(`   ✅ ECC installed: ${registry.agents.length} agents\n`);

  // Review 1: Code Quality
  console.log('='.repeat(70));
  console.log('📋 Review 1: Code Quality');
  console.log('='.repeat(70));
  console.log('');
  
  const codeQualityReview = await reviewWithECC(files, 'code-quality');
  console.log(codeQualityReview);
  console.log('');

  // Review 2: Security
  console.log('='.repeat(70));
  console.log('🔒 Review 2: Security');
  console.log('='.repeat(70));
  console.log('');
  
  const securityReview = await reviewWithECC(files, 'security');
  console.log(securityReview);
  console.log('');

  // Review 3: Best Practices
  console.log('='.repeat(70));
  console.log('💡 Review 3: Best Practices');
  console.log('='.repeat(70));
  console.log('');
  
  const bestPracticesReview = await reviewWithECC(files, 'best-practices');
  console.log(bestPracticesReview);
  console.log('');

  // Save reviews to file
  console.log('='.repeat(70));
  console.log('💾 Saving reviews to file...');
  console.log('='.repeat(70));
  
  const { writeFileSync } = await import('fs');
  const reviewOutput = `
# ECC Code Review Results

**Date**: ${new Date().toISOString().split('T')[0]}
**Files Reviewed**: ${files.length}

---

## Code Quality Review

${codeQualityReview}

---

## Security Review

${securityReview}

---

## Best Practices Review

${bestPracticesReview}

---

## Summary

Reviews completed using ECC agents:
- code-reviewer
- security-reviewer

Generated by: ecc-review-our-skill.ts
`.trim();

  const outputPath = '/root/.openclaw/workspace/ECC_CODE_REVIEW_RESULTS.md';
  writeFileSync(outputPath, reviewOutput);
  
  console.log(`   ✅ Reviews saved to: ${outputPath}`);
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ Review Complete!');
  console.log('='.repeat(70));
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
