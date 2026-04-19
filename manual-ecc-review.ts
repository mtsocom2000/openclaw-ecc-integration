#!/usr/bin/env tsx
/**
 * Manual ECC Review using actual agent checklists
 * 
 * This script applies ECC agent review checklists to our code
 * without relying on subagent spawning.
 */

import { readFileSync, writeFileSync } from 'fs';
import { loadECCAgent } from './ecc-runtime';

// ============================================================================
// Review Checklists (from ECC agents)
// ============================================================================

interface ReviewIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line?: number;
  issue: string;
  suggestion: string;
}

interface ReviewResult {
  strengths: string[];
  issues: ReviewIssue[];
  recommendations: string[];
  score: number;
}

// ============================================================================
// Code Quality Review
// ============================================================================

function reviewCodeQuality(files: Array<{ name: string; content: string }>): ReviewResult {
  const result: ReviewResult = {
    strengths: [],
    issues: [],
    recommendations: [],
    score: 100
  };

  for (const file of files) {
    const lines = file.content.split('\n');
    
    // Check 1: Large functions (>50 lines)
    let inFunction = false;
    let functionStartLine = 0;
    let functionLines = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function start
      if (line.match(/^(async\s+)?function\s+\w+/) || 
          line.match(/^(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/) ||
          line.match(/^\s*(export\s+)?(async\s+)?function/)) {
        inFunction = true;
        functionStartLine = i + 1;
        functionLines = 0;
      }
      
      if (inFunction) {
        functionLines++;
        
        // Check for function end (simplified)
        if (line.trim() === '}' && functionLines > 50) {
          result.issues.push({
            severity: 'MEDIUM',
            file: file.name,
            line: functionStartLine,
            issue: `Large function (${functionLines} lines)`,
            suggestion: 'Consider splitting into smaller, focused functions'
          });
          result.score -= 5;
          inFunction = false;
        }
      }
    }
    
    // Check 2: Missing error handling
    const hasTryCatch = file.content.includes('try {') || file.content.includes('catch');
    const hasThrowStatements = file.content.includes('throw new Error');
    
    if (file.name.endsWith('.ts') && !hasTryCatch && file.content.includes('async')) {
      result.issues.push({
        severity: 'MEDIUM',
        file: file.name,
        issue: 'Async functions without try-catch error handling',
        suggestion: 'Add try-catch blocks around async operations'
      });
      result.score -= 10;
    }
    
    // Check 3: Type safety
    const hasAnyType = file.content.match(/:\s*any\b/);
    if (hasAnyType) {
      result.issues.push({
        severity: 'LOW',
        file: file.name,
        issue: 'Use of "any" type reduces type safety',
        suggestion: 'Replace "any" with specific types or unknown'
      });
      result.score -= 3;
    }
    
    // Check 4: Console statements (debug code)
    const consoleStatements = file.content.match(/console\.(log|error|warn|debug)/g);
    if (consoleStatements && consoleStatements.length > 5) {
      result.recommendations.push(
        `${file.name}: Consider removing debug console statements before production (${consoleStatements.length} found)`
      );
    }
    
    // Check 5: Comments quality
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('/*'));
    const commentRatio = commentLines.length / lines.length;
    
    if (commentRatio > 0.15) {
      result.strengths.push(`${file.name}: Well documented (${Math.round(commentRatio * 100)}% comments)`);
    } else if (commentRatio < 0.05 && file.name.endsWith('.ts')) {
      result.recommendations.push(`${file.name}: Consider adding more JSDoc comments`);
    }
  }

  return result;
}

// ============================================================================
// Security Review
// ============================================================================

function reviewSecurity(files: Array<{ name: string; content: string }>): ReviewResult {
  const result: ReviewResult = {
    strengths: [],
    issues: [],
    recommendations: [],
    score: 100
  };

  for (const file of files) {
    // Check 1: Hardcoded secrets
    const secretPatterns = [
      /['"]sk-[a-zA-Z0-9]+['"]/g,  // OpenAI keys
      /['"]ghp_[a-zA-Z0-9]+['"]/g,  // GitHub tokens
      /['"]gho_[a-zA-Z0-9]+['"]/g,  // GitHub OAuth
      /password\s*=\s*['"][^'"]+['"]/gi,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
      /secret\s*=\s*['"][^'"]+['"]/gi
    ];
    
    for (const pattern of secretPatterns) {
      const matches = file.content.match(pattern);
      if (matches) {
        result.issues.push({
          severity: 'HIGH',
          file: file.name,
          issue: `Potential hardcoded secret found (${matches.length} occurrences)`,
          suggestion: 'Move secrets to environment variables'
        });
        result.score -= 25;
      }
    }
    
    // Check 2: Command injection
    const execPatterns = [
      /exec\s*\(\s*`/,  // exec with template literal
      /execSync\s*\(\s*`/,
      /spawn\s*\([^,]+,\s*`/,
      /\$\{.*\}/g  // Template literals in shell commands
    ];
    
    for (const pattern of execPatterns) {
      const matches = file.content.match(pattern);
      if (matches && file.content.includes('exec') || file.content.includes('spawn')) {
        result.issues.push({
          severity: 'MEDIUM',
          file: file.name,
          issue: 'Potential command injection risk with template literals',
          suggestion: 'Use parameterized commands or validate inputs'
        });
        result.score -= 15;
      }
    }
    
    // Check 3: Path traversal
    const readFileSync = file.content.match(/readFileSync\s*\([^)]*\+/);
    if (readFileSync) {
      result.issues.push({
        severity: 'MEDIUM',
        file: file.name,
        issue: 'Potential path traversal with string concatenation',
        suggestion: 'Use path.join() and validate file paths'
      });
      result.score -= 10;
    }
    
    // Check 4: Process environment usage (good practice)
    if (file.content.includes('process.env')) {
      result.strengths.push(`${file.name}: Uses environment variables for configuration`);
    }
    
    // Check 5: Error message leakage
    const errorPatterns = file.content.match(/catch\s*\([^)]*\)\s*\{[^}]*console\.(log|error)\s*\(\s*[^)]*error[^)]*\)/gs);
    if (errorPatterns) {
      result.recommendations.push(
        `${file.name}: Ensure error messages don't leak sensitive information in production`
      );
    }
  }

  return result;
}

// ============================================================================
// Best Practices Review
// ============================================================================

function reviewBestPractices(files: Array<{ name: string; content: string }>): ReviewResult {
  const result: ReviewResult = {
    strengths: [],
    issues: [],
    recommendations: [],
    score: 100
  };

  for (const file of files) {
    // Check 1: Export organization
    const exports = file.content.match(/^(export\s+)?(const|let|var|function|class|interface|type)\s+\w+/gm);
    if (exports && exports.length > 10) {
      result.recommendations.push(
        `${file.name}: Consider splitting into multiple modules (${exports.length} exports)`
      );
    }
    
    // Check 2: Import organization
    const imports = file.content.match(/^import\s+.+/gm);
    if (imports) {
      const hasGroupedImports = imports.some(i => i.includes(','));
      if (!hasGroupedImports) {
        result.strengths.push(`${file.name}: Clean import organization`);
      }
    }
    
    // Check 3: Naming conventions
    const constNames = file.content.match(/const\s+([a-z_][a-zA-Z0-9_]*)/g);
    if (constNames) {
      const nonConventional = constNames.filter(n => {
        const name = n.replace('const ', '');
        return !name.match(/^[a-z][a-zA-Z0-9_]*$/) && !name.match(/^[A-Z_]+$/);
      });
      if (nonConventional.length > 0) {
        result.issues.push({
          severity: 'LOW',
          file: file.name,
          issue: `Non-standard const naming (${nonConventional.length} found)`,
          suggestion: 'Use camelCase for variables, UPPER_CASE for constants'
        });
        result.score -= 2;
      }
    }
    
    // Check 4: Magic numbers
    const magicNumbers = file.content.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 5) {
      result.recommendations.push(
        `${file.name}: Consider extracting magic numbers to named constants`
      );
    }
    
    // Check 5: Async/await consistency
    const hasPromiseThen = file.content.includes('.then(');
    const hasAsyncAwait = file.content.includes('async') && file.content.includes('await');
    
    if (hasPromiseThen && hasAsyncAwait) {
      result.recommendations.push(
        `${file.name}: Mix of .then() and async/await - consider using async/await consistently`
      );
    } else if (hasAsyncAwait) {
      result.strengths.push(`${file.name}: Consistent async/await usage`);
    }
    
    // Check 6: Documentation
    const hasJSDoc = file.content.match(/\/\*\*[\s\S]*?\*\//g);
    if (hasJSDoc && hasJSDoc.length > 3) {
      result.strengths.push(`${file.name}: Good JSDoc documentation (${hasJSDoc.length} blocks)`);
    }
  }

  return result;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Manual ECC Review - Using Agent Checklists');
  console.log('='.repeat(70));
  console.log('');

  // Load files
  const files = [
    { name: 'ecc-adapter.ts', content: readFileSync('/root/.openclaw/workspace/ecc-adapter.ts', 'utf-8') },
    { name: 'ecc-runtime.ts', content: readFileSync('/root/.openclaw/workspace/ecc-runtime.ts', 'utf-8') },
    { name: 'ecc-pr-fix-cli.ts', content: readFileSync('/root/.openclaw/workspace/ecc-pr-fix-cli.ts', 'utf-8') },
    { name: 'SKILL.md', content: readFileSync('/root/.openclaw/workspace/skills/ecc-pr-comment-fix/SKILL.md', 'utf-8') }
  ];

  console.log(`📁 Reviewing ${files.length} files:\n`);
  files.forEach(f => {
    const lines = f.content.split('\n').length;
    console.log(`   - ${f.name}: ${lines} lines`);
  });
  console.log('');

  // Code Quality Review
  console.log('='.repeat(70));
  console.log('📋 Code Quality Review');
  console.log('='.repeat(70));
  
  const codeQuality = reviewCodeQuality(files);
  console.log(`\nScore: ${codeQuality.score}/100\n`);
  
  console.log('✅ Strengths:');
  codeQuality.strengths.forEach(s => console.log(`   - ${s}`));
  
  if (codeQuality.issues.length > 0) {
    console.log('\n⚠️ Issues:');
    codeQuality.issues.forEach(i => {
      console.log(`   [${i.severity}] ${i.file}:${i.line || '?'} - ${i.issue}`);
      console.log(`           → ${i.suggestion}`);
    });
  }
  
  if (codeQuality.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    codeQuality.recommendations.forEach(r => console.log(`   - ${r}`));
  }

  // Security Review
  console.log('\n' + '='.repeat(70));
  console.log('🔒 Security Review');
  console.log('='.repeat(70));
  
  const security = reviewSecurity(files);
  console.log(`\nScore: ${security.score}/100\n`);
  
  console.log('✅ Strengths:');
  security.strengths.forEach(s => console.log(`   - ${s}`));
  
  if (security.issues.length > 0) {
    console.log('\n⚠️ Issues:');
    security.issues.forEach(i => {
      console.log(`   [${i.severity}] ${i.file} - ${i.issue}`);
      console.log(`           → ${i.suggestion}`);
    });
  }
  
  if (security.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    security.recommendations.forEach(r => console.log(`   - ${r}`));
  }

  // Best Practices Review
  console.log('\n' + '='.repeat(70));
  console.log('💡 Best Practices Review');
  console.log('='.repeat(70));
  
  const bestPractices = reviewBestPractices(files);
  console.log(`\nScore: ${bestPractices.score}/100\n`);
  
  console.log('✅ Strengths:');
  bestPractices.strengths.forEach(s => console.log(`   - ${s}`));
  
  if (bestPractices.issues.length > 0) {
    console.log('\n⚠️ Issues:');
    bestPractices.issues.forEach(i => {
      console.log(`   [${i.severity}] ${i.file} - ${i.issue}`);
      console.log(`           → ${i.suggestion}`);
    });
  }
  
  if (bestPractices.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    bestPractices.recommendations.forEach(r => console.log(`   - ${r}`));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  
  const overallScore = Math.round((codeQuality.score + security.score + bestPractices.score) / 3);
  console.log(`\nOverall Score: ${overallScore}/100`);
  console.log(`- Code Quality: ${codeQuality.score}/100`);
  console.log(`- Security: ${security.score}/100`);
  console.log(`- Best Practices: ${bestPractices.score}/100`);
  
  const totalIssues = codeQuality.issues.length + security.issues.length + bestPractices.issues.length;
  const highSeverityIssues = [codeQuality, security, bestPractices]
    .flatMap(r => r.issues)
    .filter(i => i.severity === 'HIGH').length;
  
  console.log(`\nTotal Issues: ${totalIssues}`);
  console.log(`- HIGH: ${highSeverityIssues}`);
  console.log(`- MEDIUM: ${[codeQuality, security, bestPractices].flatMap(r => r.issues).filter(i => i.severity === 'MEDIUM').length}`);
  console.log(`- LOW: ${[codeQuality, security, bestPractices].flatMap(r => r.issues).filter(i => i.severity === 'LOW').length}`);
  
  const readyForProduction = highSeverityIssues === 0 && overallScore >= 80;
  console.log(`\nReady for Production: ${readyForProduction ? '✅ Yes' : '❌ No - address issues first'}`);

  // Save results
  const output = `
# ECC Manual Review Results

**Date**: ${new Date().toISOString().split('T')[0]}
**Files Reviewed**: ${files.length}

---

## Code Quality Review

**Score**: ${codeQuality.score}/100

### Strengths
${codeQuality.strengths.map(s => `- ${s}`).join('\n')}

### Issues
${codeQuality.issues.map(i => `- [${i.severity}] ${i.file}:${i.line || '?'} - ${i.issue}\n  → ${i.suggestion}`).join('\n')}

### Recommendations
${codeQuality.recommendations.map(r => `- ${r}`).join('\n')}

---

## Security Review

**Score**: ${security.score}/100

### Strengths
${security.strengths.map(s => `- ${s}`).join('\n')}

### Issues
${security.issues.map(i => `- [${i.severity}] ${i.file} - ${i.issue}\n  → ${i.suggestion}`).join('\n')}

### Recommendations
${security.recommendations.map(r => `- ${r}`).join('\n')}

---

## Best Practices Review

**Score**: ${bestPractices.score}/100

### Strengths
${bestPractices.strengths.map(s => `- ${s}`).join('\n')}

### Issues
${bestPractices.issues.map(i => `- [${i.severity}] ${i.file} - ${i.issue}\n  → ${i.suggestion}`).join('\n')}

### Recommendations
${bestPractices.recommendations.map(r => `- ${r}`).join('\n')}

---

## Summary

| Category | Score |
|----------|-------|
| Code Quality | ${codeQuality.score}/100 |
| Security | ${security.score}/100 |
| Best Practices | ${bestPractices.score}/100 |
| **Overall** | **${overallScore}/100** |

**Total Issues**: ${totalIssues} (HIGH: ${highSeverityIssues})

**Ready for Production**: ${readyForProduction ? '✅ Yes' : '❌ No'}

---

Generated by: manual-ecc-review.ts
Using ECC agent checklists from:
- code-reviewer
- security-reviewer
`.trim();

  const outputPath = '/root/.openclaw/workspace/ECC_MANUAL_REVIEW_RESULTS.md';
  writeFileSync(outputPath, output);
  
  console.log(`\n📄 Full results saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
