# ECC PR Comment Fix Skill

**版本**: 1.0.0  
**依赖**: ECC (Everything Claude Code) v1.10.0+  
**运行环境**: OpenClaw with ECC installed

---

## 概述

使用 ECC agents 实现 PR comment 的自动化分析和修复：

1. **Validity Analysis** - 分析 comment 是否有效
2. **Fix Implementation** - 实现修复代码
3. **Test Verification** - 验证修复不引入回归
4. **Impact Assessment** - 评估对整体 PR 的影响

---

## 触发条件

当用户：
- 提供 PR comment 和 diff
- 请求分析/修复 PR comment
- 需要评估 comment 对 PR 的影响

---

## 使用方式

### 基本用法

```typescript
import { executePRCommentFixWorkflow } from './ecc-runtime';

const result = await executePRCommentFixWorkflow({
  comment: {
    body: 'This function is missing error handling.',
    path: 'src/utils/api.ts',
    line: 42
  },
  diff: `@@ -38,7 +38,10 @@ export async function fetchData(url: string) {
-  const response = await fetch(url);
+  const response = await fetch(url);
+  if (!response.ok) {
+    throw new Error(\`HTTP error: \${response.status}\`);
+  }
   const data = await response.json();
   return data;
 }`,
  prNumber: 42,
  repo: 'myorg/myrepo'
});

console.log(result.summary);
console.log('Ready to commit:', result.readyToCommit);
```

### 分阶段执行

```typescript
import {
  executeValidityStage,
  executeFixStage,
  executeTestStage,
  executeImpactStage
} from './ecc-runtime';

// Stage 1: Validity
const validity = await executeValidityStage(comment, diff);

if (validity.data?.valid) {
  // Stage 2: Fix
  const fix = await executeFixStage(comment, diff, validity);
  
  // Stage 3: Test
  const test = await executeTestStage(fix);
  
  // Stage 4: Impact
  const impact = await executeImpactStage([validity, fix, test]);
}
```

### 并行执行 (高级)

```typescript
import { spawnECCAgentsParallel } from './ecc-runtime';

// 并行执行多个独立分析
const results = await spawnECCAgentsParallel([
  {
    agentName: 'typescript-reviewer',
    task: 'Review this code for security issues...',
    thinking: 'high'
  },
  {
    agentName: 'security-reviewer',
    task: 'Check for vulnerabilities...',
    thinking: 'high'
  },
  {
    agentName: 'performance-optimizer',
    task: 'Identify performance issues...',
    thinking: 'medium'
  }
]);
```

---

## ECC Agents 映射

| 阶段 | 默认 Agent | 备选 Agent | 用途 |
|------|-----------|-----------|------|
| Validity | `typescript-reviewer` | `code-reviewer` | 分析 comment 有效性 |
| Fix | `typescript-reviewer` | `code-reviewer` | 实现修复 |
| Test | `tdd-guide` | `e2e-runner` | 测试验证 |
| Impact | `architect` | `planner` | 影响评估 |

### 文件类型 → Reviewer 映射

| 文件类型 | Reviewer Agent |
|---------|----------------|
| .ts, .tsx, .js, .jsx | `typescript-reviewer` |
| .py | `python-reviewer` |
| .java | `java-reviewer` |
| .go | `go-reviewer` |
| .rs | `rust-reviewer` |
| .kt, .kts | `kotlin-reviewer` |
| .cpp, .cc, .h, .hpp | `cpp-reviewer` |
| .cs | `csharp-reviewer` |
| .dart | `flutter-reviewer` |
| .sql | `database-reviewer` |
| 其他 | `code-reviewer` |

---

## 输出格式

### 完整工作流输出

```typescript
interface PRCommentFixWorkflowOutput {
  stages: {
    validity: StageResult;    // 有效性分析结果
    fix: StageResult;         // 修复实现结果
    test: StageResult;        // 测试验证结果
    impact: StageResult;      // 影响评估结果
  };
  summary: string;            // 人类可读摘要
  readyToCommit: boolean;     // 是否可提交
  consolidatedResult: {
    summary: string;
    findings: Array<{ agent: string; finding: string; severity: string }>;
    recommendations: string[];
    readyToMerge: boolean;
    stageResults: Record<string, any>;
  };
}
```

### Stage Result

```typescript
interface StageResult {
  stage: string;       // 'validity' | 'fix' | 'test' | 'impact'
  agent: string;       // 使用的 ECC agent 名称
  success: boolean;    // 执行是否成功
  output: string;      // agent 输出
  data?: any;          // 结构化数据
}
```

---

## 错误处理

### ECC 未安装

```typescript
import { detectECC } from './ecc-adapter';

const registry = detectECC();
if (!registry.installed) {
  throw new Error(
    'ECC not installed. Install with:\n' +
    '  cd /root/.openclaw/workspace/everything-claude-code\n' +
    '  ./install.sh --profile full'
  );
}
```

### Agent 执行失败

```typescript
const result = await spawnECCAgent({ agentName: 'typescript-reviewer', task });

if (result.status === 'error') {
  console.error(`Agent failed: ${result.error}`);
  // 降级到兜底实现或重试
}
```

### 超时处理

```typescript
const result = await spawnECCAgent({
  agentName: 'architect',
  task: 'Complex analysis...',
  timeoutSeconds: 600,  // 10 分钟超时
  thinking: 'high'
});

if (result.status === 'timeout') {
  // 处理超时
}
```

---

## 配置选项

### 自定义 Agent 选择

```typescript
// 在 ~/.openclaw/workspace/TOOLS.md 中配置
### ECC PR Comment Fix

- Default Validity Agent: typescript-reviewer
- Default Fix Agent: typescript-reviewer
- Default Test Agent: tdd-guide
- Default Impact Agent: architect
- Parallel Execution: true
- Timeout Seconds: 300
```

### 模型覆盖

```typescript
// 在 ecc-runtime.ts 中修改 MODEL_MAP
const MODEL_MAP: Record<string, string> = {
  'sonnet': 'anthropic/claude-sonnet-4-6',
  'opus': 'anthropic/claude-opus-4-7',
  'haiku': 'anthropic/claude-haiku-4-5',
  // 自定义覆盖
  'custom': 'your/preferred/model'
};
```

---

## 性能优化

### 并行执行

Stage 1-4 是顺序依赖的，但可以在某些场景下并行：

```typescript
// 并行执行多个 review agents
const [securityReview, performanceReview, codeReview] = await spawnECCAgentsParallel([
  { agentName: 'security-reviewer', task: '...' },
  { agentName: 'performance-optimizer', task: '...' },
  { agentName: 'code-reviewer', task: '...' }
]);
```

### 结果缓存

```typescript
const cache = new Map<string, ECCAgentResult>();

async function spawnWithCache(config: ECCAgentConfig): Promise<ECCAgentResult> {
  const cacheKey = `${config.agentName}:${hash(config.task)}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  
  const result = await spawnECCAgent(config);
  cache.set(cacheKey, result);
  return result;
}
```

---

## 调试

### 启用详细日志

```bash
export ECC_RUNTIME_DEBUG=true
npx tsx ecc-runtime.ts
```

### 查看 Agent 输出

```typescript
const result = await executePRCommentFixWorkflow(input);

// 查看每个 agent 的完整输出
console.log('Validity:', result.stages.validity.output);
console.log('Fix:', result.stages.fix.output);
console.log('Test:', result.stages.test.output);
console.log('Impact:', result.stages.impact.output);
```

### 保存中间结果

```typescript
import { writeFileSync } from 'fs';

const result = await executePRCommentFixWorkflow(input);

writeFileSync('/tmp/ecc-validity.md', result.stages.validity.output);
writeFileSync('/tmp/ecc-fix.md', result.stages.fix.output);
writeFileSync('/tmp/ecc-test.md', result.stages.test.output);
writeFileSync('/tmp/ecc-impact.md', result.stages.impact.output);
```

---

## 降级策略

当 ECC 不可用时，降级到兜底实现：

```typescript
async function executeWithFallback(input: PRCommentFixInput) {
  try {
    const registry = detectECC();
    if (!registry.installed) {
      throw new Error('ECC not installed');
    }
    return await executePRCommentFixWorkflow(input);
  } catch (err) {
    console.log('ECC failed, using fallback:', err);
    return await executeFallbackWorkflow(input);
  }
}
```

---

## 相关文件

- `ecc-adapter.ts` - ECC 检测与基础调用
- `ecc-runtime.ts` - 完整运行时与工作流
- `ecc-pr-review.ts` - 早期原型（已废弃）
- `ECC_INTEGRATION_REPORT.md` - 集成报告

---

## 更新日志

### v1.0.0 (2026-04-19)
- ✅ ECC 安装与检测
- ✅ 4 阶段工作流实现
- ✅ 文件类型 → Reviewer 映射
- ✅ 并行执行支持
- ✅ 结果整合与摘要生成
