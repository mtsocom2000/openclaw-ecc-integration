/**
 * ECC (Everything Claude Code) Agent Adapter
 * 
 * Detects and invokes ECC agents from OpenClaw subagent system.
 * ECC agents are stored in ~/.claude/agents/*.md
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
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

interface ECCInstallState {
  schemaVersion: string;
  installedAt: string;
  target: {
    id: string;
    target: string;
    kind: string;
    root: string;
  };
  agents: string[];
  skills: string[];
}

interface AgentRegistry {
  installed: boolean;
  installPath: string;
  agents: ECCAgent[];
  agentsByCategory: Record<string, ECCAgent[]>;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect if ECC is installed and return registry
 */
export function detectECC(): AgentRegistry {
  const registry: AgentRegistry = {
    installed: false,
    installPath: '',
    agents: [],
    agentsByCategory: {}
  };

  // Check install state
  const installStatePath = '/root/.claude/ecc/install-state.json';
  if (!existsSync(installStatePath)) {
    console.log('ECC not installed: no install-state.json');
    return registry;
  }

  // Check agents directory
  const agentsDir = '/root/.claude/agents';
  if (!existsSync(agentsDir)) {
    console.log('ECC not installed: no agents directory');
    return registry;
  }

  registry.installed = true;
  registry.installPath = '/root/.claude';

  // Load all agents
  const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  
  for (const file of agentFiles) {
    const agent = parseAgentFile(join(agentsDir, file));
    if (agent) {
      registry.agents.push(agent);
      
      // Categorize
      const category = categorizeAgent(agent);
      if (!registry.agentsByCategory[category]) {
        registry.agentsByCategory[category] = [];
      }
      registry.agentsByCategory[category].push(agent);
    }
  }

  console.log(`ECC detected: ${registry.agents.length} agents`);
  return registry;
}

/**
 * Parse ECC agent markdown file
 */
function parseAgentFile(filePath: string): ECCAgent | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.log(`Invalid agent file: ${filePath}`);
      return null;
    }

    const [, frontmatterStr, prompt] = frontmatterMatch;
    
    // Parse frontmatter fields
    const nameMatch = frontmatterStr.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatterStr.match(/^description:\s*(.+)$/m);
    const toolsMatch = frontmatterStr.match(/^tools:\s*\[(.+)\]/m);
    const modelMatch = frontmatterStr.match(/^model:\s*(.+)$/m);

    return {
      name: nameMatch?.[1]?.trim() || 'unknown',
      description: descMatch?.[1]?.trim() || '',
      tools: toolsMatch?.[1]?.split(',').map(t => t.trim().replace(/"/g, '')) || [],
      model: modelMatch?.[1]?.trim() || 'sonnet',
      prompt: prompt.trim(),
      filePath
    };
  } catch (err) {
    console.log(`Error parsing ${filePath}: ${err}`);
    return null;
  }
}

/**
 * Categorize agent by name/purpose
 */
function categorizeAgent(agent: ECCAgent): string {
  const name = agent.name.toLowerCase();
  
  if (name.includes('review')) return 'review';
  if (name.includes('build') || name.includes('resolver')) return 'debug';
  if (name.includes('architect')) return 'architecture';
  if (name.includes('test') || name.includes('e2e')) return 'testing';
  if (name.includes('doc')) return 'documentation';
  if (name.includes('security')) return 'security';
  if (name.includes('loop') || name.includes('operator')) return 'orchestration';
  if (name.includes('lookup') || name.includes('search')) return 'research';
  
  return 'general';
}

// ============================================================================
// Agent Invocation
// ============================================================================

interface InvokeOptions {
  agentName: string;
  task: string;
  attachments?: Array<{ name: string; content: string }>;
  background?: boolean;
  model?: string;
}

/**
 * Invoke an ECC agent via OpenClaw subagent system
 */
export async function invokeECCAgent(options: InvokeOptions): Promise<string> {
  const registry = detectECC();
  
  if (!registry.installed) {
    throw new Error('ECC not installed. Run: ./install.sh --profile full');
  }

  // Find the agent
  const agent = registry.agents.find(a => a.name === options.agentName);
  if (!agent) {
    const available = registry.agents.map(a => a.name).join(', ');
    throw new Error(`Agent "${options.agentName}" not found. Available: ${available}`);
  }

  // Build the enhanced prompt
  const enhancedPrompt = buildEnhancedPrompt(agent, options.task);

  console.log(`Invoking ECC agent: ${agent.name}`);
  console.log(`Category: ${categorizeAgent(agent)}`);
  console.log(`Tools: ${agent.tools.join(', ')}`);

  // In OpenClaw, we would call sessions_spawn here
  // For now, return the prepared prompt for manual invocation
  return enhancedPrompt;
}

/**
 * Build enhanced prompt by combining agent instructions with task
 */
function buildEnhancedPrompt(agent: ECCAgent, task: string): string {
  return `
# ECC Agent: ${agent.name}

${agent.description}

## Agent Instructions

${agent.prompt}

## Current Task

${task}

## Execution

Follow the agent instructions above to complete the current task.
Use the specified tools: ${agent.tools.join(', ')}
Target model: ${agent.model}
`.trim();
}

// ============================================================================
// Review-Specific Helpers
// ============================================================================

/**
 * Get all review agents
 */
export function getReviewAgents(): ECCAgent[] {
  const registry = detectECC();
  return registry.agentsByCategory['review'] || [];
}

/**
 * Select best review agent for a file type
 */
export function selectReviewAgent(fileType?: string): ECCAgent | null {
  const registry = detectECC();
  const reviewAgents = registry.agentsByCategory['review'] || [];

  if (!fileType) {
    return reviewAgents.find(a => a.name === 'code-reviewer') || reviewAgents[0] || null;
  }

  // Map file types to specific reviewers
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

  const agentName = typeMap[fileType] || 'code-reviewer';
  return reviewAgents.find(a => a.name === agentName) || 
         reviewAgents.find(a => a.name === 'code-reviewer') ||
         reviewAgents[0] || null;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  console.log('=== ECC Agent Adapter ===\n');
  
  const registry = detectECC();
  
  if (!registry.installed) {
    console.log('ECC is not installed.');
    console.log('Install with: cd everything-claude-code && ./install.sh --profile full');
    process.exit(1);
  }

  console.log(`\nInstalled: ${registry.agents.length} agents\n`);
  
  console.log('Agents by category:');
  for (const [category, agents] of Object.entries(registry.agentsByCategory)) {
    console.log(`\n  ${category}:`);
    for (const agent of agents) {
      console.log(`    - ${agent.name}: ${agent.description.slice(0, 60)}...`);
    }
  }

  // Demo: Get review agents
  console.log('\n\n=== Review Agents ===');
  const reviewAgents = getReviewAgents();
  for (const agent of reviewAgents) {
    console.log(`\n${agent.name}:`);
    console.log(`  Description: ${agent.description}`);
    console.log(`  Tools: ${agent.tools.join(', ')}`);
    console.log(`  Model: ${agent.model}`);
  }
}
