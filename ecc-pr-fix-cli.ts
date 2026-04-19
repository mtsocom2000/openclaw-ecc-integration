#!/usr/bin/env tsx
/**
 * ECC PR Comment Fix CLI
 * 
 * Usage:
 *   npx tsx ecc-pr-fix-cli.ts --comment "..." --file "..." --diff "..."
 *   npx tsx ecc-pr-fix-cli.ts --input pr-comment.json
 */

import { executePRCommentFixWorkflow, type PRCommentFixWorkflowInput } from './ecc-runtime';
import { detectECC } from './ecc-adapter';
import { readFileSync } from 'fs';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIArgs {
  comment?: string;
  file?: string;
  line?: number;
  diff?: string;
  input?: string;
  prNumber?: number;
  repo?: string;
  help?: boolean;
  json?: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--comment':
      case '-c':
        args.comment = next;
        i++;
        break;
      case '--file':
      case '-f':
        args.file = next;
        i++;
        break;
      case '--line':
      case '-l':
        args.line = parseInt(next, 10);
        i++;
        break;
      case '--diff':
      case '-d':
        args.diff = next;
        i++;
        break;
      case '--input':
      case '-i':
        args.input = next;
        i++;
        break;
      case '--pr':
        args.prNumber = parseInt(next, 10);
        i++;
        break;
      case '--repo':
        args.repo = next;
        i++;
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
ECC PR Comment Fix CLI

Usage:
  npx tsx ecc-pr-fix-cli.ts [options]

Options:
  -c, --comment <text>   PR comment text (required unless --input)
  -f, --file <path>      File path of the comment (required unless --input)
  -l, --line <number>    Line number (optional)
  -d, --diff <text>      Git diff (required unless --input)
  -i, --input <file>     JSON input file (alternative to individual args)
  --pr <number>          PR number (optional)
  --repo <name>          Repository name (optional)
  --json                 Output in JSON format
  -h, --help             Show this help message

Examples:
  # Basic usage
  npx tsx ecc-pr-fix-cli.ts \\
    -c "This function is missing error handling" \\
    -f "src/utils/api.ts" \\
    -d "$(cat diff.txt)"

  # From JSON file
  npx tsx ecc-pr-fix-cli.ts -i pr-comment.json

  # Full example
  npx tsx ecc-pr-fix-cli.ts \\
    -c "Add validation for user input" \\
    -f "src/handlers/user.ts" \\
    -l 42 \\
    -d "$(git diff HEAD~1)" \\
    --pr 123 \\
    --repo "myorg/myrepo"

JSON Input Format:
  {
    "comment": {
      "body": "Comment text",
      "path": "file/path.ts",
      "line": 42,
      "author": "reviewer"
    },
    "diff": "unified diff content",
    "prNumber": 123,
    "repo": "org/repo"
  }
`.trim());
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Check ECC installation
  console.log('🔍 Checking ECC installation...');
  const registry = detectECC();
  
  if (!registry.installed) {
    console.error('❌ ECC is not installed!');
    console.error('\nInstall with:');
    console.error('  cd /root/.openclaw/workspace/everything-claude-code');
    console.error('  ./install.sh --profile full');
    process.exit(1);
  }

  console.log(`✅ ECC installed: ${registry.agents.length} agents available\n`);

  // Build input
  let input: PRCommentFixWorkflowInput;

  if (args.input) {
    // Load from JSON file
    try {
      const content = readFileSync(args.input, 'utf-8');
      input = JSON.parse(content);
    } catch (err) {
      console.error(`❌ Error reading input file: ${err}`);
      process.exit(1);
    }
  } else {
    // Build from CLI args
    if (!args.comment || !args.file || !args.diff) {
      console.error('❌ Missing required arguments!');
      console.error('Required: --comment, --file, --diff (or use --input)');
      console.error('\nUse --help for usage information.');
      process.exit(1);
    }

    input = {
      comment: {
        body: args.comment,
        path: args.file,
        line: args.line
      },
      diff: args.diff,
      prNumber: args.prNumber,
      repo: args.repo
    };
  }

  // Execute workflow
  console.log('🚀 Starting PR Comment Fix Workflow...\n');
  console.log(`📝 Comment: "${input.comment.body.slice(0, 60)}${input.comment.body.length > 60 ? '...' : ''}"`);
  console.log(`📁 File: ${input.comment.path}${input.comment.line ? `:L${input.comment.line}` : ''}`);
  if (input.prNumber) {
    console.log(`🔗 PR: #${input.prNumber}${input.repo ? ` (${input.repo})` : ''}`);
  }
  console.log('');

  try {
    const result = await executePRCommentFixWorkflow(input);

    if (args.json) {
      // Output JSON
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Output human-readable
      console.log('\n' + '='.repeat(70));
      console.log('FINAL RESULT');
      console.log('='.repeat(70));
      console.log(result.summary);
      console.log('='.repeat(70));

      if (result.readyToCommit) {
        console.log('\n✅ Ready to commit!');
      } else {
        console.log('\n❌ Not ready to commit. Review the findings above.');
      }
    }

    process.exit(result.readyToCommit ? 0 : 1);

  } catch (err) {
    console.error('\n❌ Workflow failed:', err);
    process.exit(1);
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
