/**
 * ECC Subagent Runtime for OpenClaw
 * 
 * Provides native subagent spawning for ECC agents with:
 * - Tool mapping (ECC tools → OpenClaw tools)
 * - Context management
 * - Parallel execution support
 * - Result consolidation
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

interface ECCAgent {
  name: string;
  description: string;
  tools: string[];
  model: string;
  prompt: string;
  filePath: string;
}

interface ECCAgentConfig {
  agentName: string;
  task: string;
  attachments?: Array<{ name: string; content: string }>;
  background?: boolean;
  thinking?: 'low' | 'medium' | 'high';
  timeoutSeconds?: number;
}

interface ECCAgentResult {
  agentName: string;
  status: 'success' | 'error' | 'timeout';
  output: string;
  duration: number;
  sessionId?: string;
  error?: string;
}

// Tool mapping: ECC → OpenClaw
const TOOL_MAP: Record<string, string> = {
  'Read': 'read_file',
  'Write': 'write_file',
  'Edit': 'edit_file',
  'Grep': 'search_code',
  'Glob': 'list_files',
  'Bash': 'exec'
};

// Model mapping: ECC → OpenClaw
const MODEL_MAP: Record<string, string> = {
  'sonnet': 'anthropic/claude-sonnet-4-6',
  'opus': 'anthropic/claude-opus-4-7',
  'haiku': 'anthropic/claude-haiku-4-5'
};

// ============================================================================
// Agent Loading
// ============================================================================

/**
 * Load all ECC agents from ~/.claude/agents/
 */
export function loadAllECCAgents(): ECCAgent[] {
  const agentsDir = '/root/.claude/agents';
  if (!existsSync(agentsDir)) {
    throw new Error(`ECC agents directory not found: ${agentsDir}`);
  }

  const agents: ECCAgent[] = [];
  const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const agent = parseAgentFile(join(agentsDir, file));
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Load a specific ECC agent by name
 */
export function loadECCAgent(name: string): ECCAgent | null {
  const agents = loadAllECCAgents();
  return agents.find(a => a.name === name) || null;
}

/**
 * Parse ECC agent markdown file
 */
function parseAgentFile(filePath: string): ECCAgent | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) return null;

    const [, frontmatterStr, prompt] = frontmatterMatch;
    
    const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m);
    const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    const toolsMatch = frontmatterMatch[1].match(/^tools:\s*\[(.+)\]/m);
    const modelMatch = frontmatterMatch[1].match(/^model:\s*(.+)$/m);

    return {
      name: nameMatch?.[1]?.trim() || 'unknown',
      description: descMatch?.[1]?.trim() || '',
      tools: toolsMatch?.[1]?.split(',').map(t => t.trim().replace(/"/g, '')) || [],
      model: modelMatch?.[1]?.trim() || 'sonnet',
      prompt: prompt.trim(),
      filePath
    };
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
    return null;
  }
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build enhanced prompt for ECC agent execution
 */
export function buildAgentPrompt(
  agent: ECCAgent,
  task: string,
  context?: {
    attachments?: Array<{ name: string; content: string }>;
    previousResults?: Array<{ agent: string; output: string }>;
    constraints?: string[];
  }
): string {
  const sections: string[] = [];

  // Agent identity and instructions
  sections.push(`
# ECC Agent: ${agent.name}

${agent.description}

## Your Tools
You have access to: ${agent.tools.map(t => `${t} (${TOOL_MAP[t] || t})`).join(', ')}

## Your Instructions
${agent.prompt}
`.trim());

  // Attachments
  if (context?.attachments && context.attachments.length > 0) {
    sections.push(`
## Attachments
${context.attachments.map(a => `
### ${a.name}
\`\`\`
${a.content}
\`\`\`
`).join('\n')}
`.trim());
  }

  // Previous results (for multi-stage workflows)
  if (context?.previousResults && context.previousResults.length > 0) {
    sections.push(`
## Previous Stage Results
${context.previousResults.map(r => `
### ${r.agent} Output
${r.output}
`).join('\n')}
`.trim());
  }

  // Constraints
  if (context?.constraints && context.constraints.length > 0) {
    sections.push(`
## Constraints
${context.constraints.map(c => `- ${c}`).join('\n')}
`.trim());
  }

  // Current task
  sections.push(`
## Current Task

${task}

## Execution

Follow your instructions above to complete the current task.
Use your available tools effectively.
Report findings in a structured format.
`.trim());

  return sections.join('\n\n');
}

// ============================================================================
// Subagent Execution
// ============================================================================

/**
 * Spawn an ECC agent as an OpenClaw subagent
 * 
 * This function creates a subagent session with the ECC agent's
 * instructions injected into the prompt.
 */
export async function spawnECCAgent(config: ECCAgentConfig): Promise<ECCAgentResult> {
  const startTime = Date.now();
  
  // Load agent configuration
  const agent = loadECCAgent(config.agentName);
  if (!agent) {
    return {
      agentName: config.agentName,
      status: 'error',
      output: '',
      duration: 0,
      error: `Agent "${config.agentName}" not found`
    };
  }

  // Build the prompt
  const prompt = buildAgentPrompt(agent, config.task);

  console.log(`\n🤖 Spawning ECC agent: ${agent.name}`);
  console.log(`   Model: ${agent.model} → ${MODEL_MAP[agent.model] || 'default'}`);
  console.log(`   Tools: ${agent.tools.join(', ')}`);
  console.log(`   Thinking: ${config.thinking || 'medium'}`);
  console.log(`   Background: ${config.background || false}`);

  // In OpenClaw, we would call sessions_spawn here
  // For now, simulate with a structured response
  
  try {
    // Simulate subagent execution
    // In production, this would be:
    // const session = await sessions_spawn({
    //   task: prompt,
    //   thinking: config.thinking || 'medium',
    //   mode: config.background ? 'session' : 'run',
    //   timeoutSeconds: config.timeoutSeconds || 300,
    //   attachments: config.attachments?.map(a => ({
    //     name: a.name,
    //     content: a.content,
    //     encoding: 'utf8' as const
    //   }))
    // });

    // Simulated delay for demo
    await new Promise(resolve => setTimeout(resolve, 1000));

    const result: ECCAgentResult = {
      agentName: agent.name,
      status: 'success',
      output: `[${agent.name}] Task completed successfully.\n\nAnalysis:\n- The code change addresses the PR comment\n- No security issues detected\n- Test coverage is adequate\n\nRecommendation: Proceed with merge after minor style fixes.`,
      duration: Date.now() - startTime,
      sessionId: `ecc-${agent.name}-${Date.now()}`
    };

    console.log(`   ✅ Completed in ${result.duration}ms`);
    return result;

  } catch (err) {
    const result: ECCAgentResult = {
      agentName: agent.name,
      status: 'error',
      output: '',
      duration: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err)
    };

    console.log(`   ❌ Error: ${result.error}`);
    return result;
  }
}

/**
 * Spawn multiple ECC agents in parallel
 */
export async function spawnECCAgentsParallel(
  configs: ECCAgentConfig[]
): Promise<ECCAgentResult[]> {
  console.log(`\n🚀 Spawning ${configs.length} agents in parallel...`);
  
  const results = await Promise.all(
    configs.map(config => spawnECCAgent(config))
  );

  const successCount = results.filter(r => r.status === 'success').length;
  console.log(`   ✅ ${successCount}/${results.length} agents completed successfully`);

  return results;
}

// ============================================================================
// Result Consolidation
// ============================================================================

interface ConsolidatedResult {
  summary: string;
  findings: Array<{ agent: string; finding: string; severity: 'high' | 'medium' | 'low' }>;
  recommendations: string[];
  readyToMerge: boolean;
  stageResults: Record<string, ECCAgentResult>;
}

/**
 * Consolidate results from multiple ECC agents
 */
export function consolidateResults(
  results: ECCAgentResult[],
  task: string
): ConsolidatedResult {
  const findings: ConsolidatedResult['findings'] = [];
  const recommendations: string[] = [];
  const stageResults: Record<string, ECCAgentResult> = {};

  for (const result of results) {
    stageResults[result.agentName] = result;

    if (result.status === 'success') {
      // Extract findings from output (simplified parsing)
      const lines = result.output.split('\n');
      for (const line of lines) {
        if (line.includes('✅') || line.includes('- ')) {
          findings.push({
            agent: result.agentName,
            finding: line.replace(/^[✅\-]\s*/, ''),
            severity: 'medium'
          });
        }
      }

      if (result.output.includes('Recommendation')) {
        const recMatch = result.output.match(/Recommendation:\s*(.+)/);
        if (recMatch) {
          recommendations.push(`[${result.agentName}] ${recMatch[1]}`);
        }
      }
    }
  }

  // Determine merge readiness
  const hasErrors = results.some(r => r.status === 'error');
  const hasHighSeverity = findings.some(f => f.severity === 'high');
  const readyToMerge = !hasErrors && !hasHighSeverity;

  const summary = `
## ECC Multi-Agent Analysis Summary

**Task**: ${task}
**Agents Executed**: ${results.length}
**Success Rate**: ${results.filter(r => r.status === 'success').length}/${results.length}
**Findings**: ${findings.length}
**Recommendations**: ${recommendations.length}
**Ready to Merge**: ${readyToMerge ? '✅ Yes' : '❌ No'}
`.trim();

  return {
    summary,
    findings,
    recommendations,
    readyToMerge,
    stageResults
  };
}

// ============================================================================
// Stage Executors (for PR Comment Fix workflow)
// ============================================================================

export interface StageResult {
  stage: string;
  agent: string;
  success: boolean;
  output: string;
  data?: any;
}

/**
 * Stage 1: Comment Validity Analysis
 */
export async function executeValidityStage(
  comment: { body: string; path: string; line?: number },
  diff: string
): Promise<StageResult> {
  const fileType = comment.path.split('.').pop() || '';
  const agentName = selectReviewerForFileType(fileType);

  const task = `
Analyze this PR comment for validity:

**Comment**: "${comment.body}"
**File**: ${comment.path}${comment.line ? `:L${comment.line}` : ''}

**Diff**:
\`\`\`
${diff}
\`\`\`

Evaluate:
1. Is the comment technically accurate?
2. Is the requested change clearly specified?
3. Does it align with best practices?
4. Is it actionable?

Respond with: VALID or INVALID, followed by reasoning.
`;

  const result = await spawnECCAgent({
    agentName,
    task,
    thinking: 'high'
  });

  return {
    stage: 'validity',
    agent: agentName,
    success: result.status === 'success',
    output: result.output,
    data: {
      valid: !result.output.includes('INVALID'),
      reason: result.output
    }
  };
}

/**
 * Stage 2: Fix Implementation
 */
export async function executeFixStage(
  comment: { body: string; path: string },
  diff: string,
  validityResult: StageResult
): Promise<StageResult> {
  const fileType = comment.path.split('.').pop() || '';
  const agentName = selectReviewerForFileType(fileType);

  const task = `
Implement a fix for this PR comment:

**Comment**: "${comment.body}"
**File**: ${comment.path}

**Original Diff**:
\`\`\`
${diff}
\`\`\`

**Validity Analysis**:
${validityResult.output}

Create a minimal fix that:
1. Addresses the comment directly
2. Maintains existing functionality
3. Follows project conventions
4. Includes necessary tests

Provide the fix in unified diff format.
`;

  const result = await spawnECCAgent({
    agentName,
    task,
    thinking: 'high',
    attachments: [{ name: 'diff.txt', content: diff }]
  });

  return {
    stage: 'fix',
    agent: agentName,
    success: result.status === 'success',
    output: result.output,
    data: {
      fixDescription: result.output
    }
  };
}

/**
 * Stage 3: Test Verification
 */
export async function executeTestStage(
  fixResult: StageResult
): Promise<StageResult> {
  const task = `
Verify the proposed fix:

**Fix Description**:
${fixResult.output}

Evaluate:
1. What tests exist for the changed code?
2. What new tests are needed?
3. What is the regression risk?
4. Can you identify any edge cases?

Provide test verification results.
`;

  const result = await spawnECCAgent({
    agentName: 'tdd-guide',
    task,
    thinking: 'medium'
  });

  return {
    stage: 'test',
    agent: 'tdd-guide',
    success: result.status === 'success',
    output: result.output,
    data: {
      verification: result.output
    }
  };
}

/**
 * Stage 4: Impact Assessment
 */
export async function executeImpactStage(
  previousResults: StageResult[]
): Promise<StageResult> {
  const task = `
Assess the overall impact of this PR comment fix:

**Previous Stages**:
${previousResults.map(r => `
### ${r.stage}
${r.output}
`).join('\n')}

Evaluate:
1. Does the fix align with the PR's original goal?
2. Does it expand or change the PR scope?
3. Are there any architectural implications?
4. Should the PR be merged as-is, revised, or rejected?

Provide impact assessment and merge recommendation.
`;

  const result = await spawnECCAgent({
    agentName: 'architect',
    task,
    thinking: 'high'
  });

  return {
    stage: 'impact',
    agent: 'architect',
    success: result.status === 'success',
    output: result.output,
    data: {
      assessment: result.output
    }
  };
}

/**
 * Select appropriate reviewer agent for file type
 */
function selectReviewerForFileType(fileType: string): string {
  const typeMap: Record<string, string> = {
    'ts': 'typescript-reviewer',
    'tsx': 'typescript-reviewer',
    'js': 'typescript-reviewer',
    'jsx': 'typescript-reviewer',
    'py': 'python-reviewer',
    'java': 'java-reviewer',
    'kt': 'kotlin-reviewer',
    'go': 'go-reviewer',
    'rs': 'rust-reviewer',
    'cpp': 'cpp-reviewer',
    'cc': 'cpp-reviewer',
    'h': 'cpp-reviewer',
    'hpp': 'cpp-reviewer',
    'cs': 'csharp-reviewer',
    'dart': 'flutter-reviewer',
    'sql': 'database-reviewer',
  };

  return typeMap[fileType] || 'code-reviewer';
}

// ============================================================================
// Complete Workflow Executor
// ============================================================================

export interface PRCommentFixWorkflowInput {
  comment: {
    body: string;
    path: string;
    line?: number;
    author?: string;
  };
  diff: string;
  prNumber?: number;
  repo?: string;
}

export interface PRCommentFixWorkflowOutput {
  stages: {
    validity: StageResult;
    fix: StageResult;
    test: StageResult;
    impact: StageResult;
  };
  summary: string;
  readyToCommit: boolean;
  consolidatedResult: ConsolidatedResult;
}

/**
 * Execute the complete PR comment fix workflow
 */
export async function executePRCommentFixWorkflow(
  input: PRCommentFixWorkflowInput
): Promise<PRCommentFixWorkflowOutput> {
  console.log('\n' + '='.repeat(60));
  console.log('ECC PR Comment Fix Workflow');
  console.log('='.repeat(60));

  // Stage 1: Validity
  console.log('\n📋 Stage 1: Comment Validity Analysis');
  const validity = await executeValidityStage(input.comment, input.diff);
  console.log(`   Agent: ${validity.agent}`);
  console.log(`   Success: ${validity.success}`);

  if (!validity.success || !validity.data?.valid) {
    console.log('   ⚠️ Comment is invalid - skipping fix');
    return {
      stages: { validity, fix: null as any, test: null as any, impact: null as any },
      summary: 'Comment is invalid - no fix needed',
      readyToCommit: false,
      consolidatedResult: {
        summary: 'Invalid comment',
        findings: [],
        recommendations: [],
        readyToMerge: false,
        stageResults: {}
      }
    };
  }

  // Stage 2: Fix
  console.log('\n🔧 Stage 2: Fix Implementation');
  const fix = await executeFixStage(input.comment, input.diff, validity);
  console.log(`   Agent: ${fix.agent}`);
  console.log(`   Success: ${fix.success}`);

  // Stage 3: Test
  console.log('\n🧪 Stage 3: Test Verification');
  const test = await executeTestStage(fix);
  console.log(`   Agent: ${test.agent}`);
  console.log(`   Success: ${test.success}`);

  // Stage 4: Impact
  console.log('\n📊 Stage 4: Impact Assessment');
  const impact = await executeImpactStage([validity, fix, test]);
  console.log(`   Agent: ${impact.agent}`);
  console.log(`   Success: ${impact.success}`);

  // Consolidate results
  const allResults = [validity, fix, test, impact].map(r => ({
    agentName: r.agent,
    status: r.success ? 'success' as const : 'error' as const,
    output: r.output,
    duration: 0
  }));

  const consolidated = consolidateResults(
    allResults,
    `Fix PR comment: "${input.comment.body.slice(0, 50)}..."`
  );

  // Build summary
  const summary = `
## PR Comment Fix Summary

**Comment**: "${input.comment.body}"
**File**: ${input.comment.path}

### Stage Results
| Stage | Agent | Status |
|-------|-------|--------|
| Validity | ${validity.agent} | ${validity.success ? '✅' : '❌'} |
| Fix | ${fix.agent} | ${fix.success ? '✅' : '❌'} |
| Test | ${test.agent} | ${test.success ? '✅' : '❌'} |
| Impact | ${impact.agent} | ${impact.success ? '✅' : '❌'} |

### Recommendation
${consolidated.readyToMerge ? '✅ **READY TO MERGE**' : '❌ **NEEDS REVISION**'}

${consolidated.recommendations.map(r => `- ${r}`).join('\n')}
`.trim();

  const readyToCommit = 
    validity.success && 
    fix.success && 
    test.success && 
    impact.success &&
    consolidated.readyToMerge;

  console.log('\n' + '='.repeat(60));
  console.log(summary);
  console.log('='.repeat(60));

  return {
    stages: { validity, fix, test, impact },
    summary,
    readyToCommit,
    consolidatedResult: consolidated
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  // Demo execution
  const demoInput: PRCommentFixWorkflowInput = {
    comment: {
      body: 'This function is missing error handling. Please add try-catch block.',
      path: 'src/utils/api.ts',
      line: 42
    },
    diff: `@@ -38,10 +38,15 @@ export async function fetchData(url: string) {
-  const response = await fetch(url);
-  const data = await response.json();
-  return data;
+  const response = await fetch(url);
+  if (!response.ok) {
+    throw new Error(\`HTTP error: \${response.status}\`);
+  }
+  const data = await response.json();
+  return data;
 }`,
    prNumber: 42,
    repo: 'myorg/myrepo'
  };

  executePRCommentFixWorkflow(demoInput).catch(console.error);
}
