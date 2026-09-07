#!/usr/bin/env bash
# Unattended stage driver.
#
# One headless Claude Code invocation per stage, each with FRESH context, its own write
# scope, and its own model. The driver independently runs VERIFY after each stage — the
# model's claim of success is never trusted. Halts the chain on first failure and leaves
# a git checkpoint so you can see exactly where it stopped.
#
# Usage:
#   ./run-stages.sh 3 5      # run stages 3 through 5
#   ./run-stages.sh 3        # run stage 3 only
#
# Prompts live in prompts/stage-NN.md (stage 3 uses prompts/stage-03-adapter.md,
# with <RENDERER> substituted per adapter).

set -uo pipefail

LOG_DIR="./.harness-run/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

# --- stage table: id | name | model | write scope | verify command ---------------------
declare -A STAGE_NAME=(
  [4]="measure"  [5]="kb"  [6]="engine"  [7]="astro"  [8]="agent"  [9]="integration"  [10]="explainer"
)
declare -A STAGE_MODEL=(
  [3]="sonnet"  [4]="sonnet"  [5]="sonnet"  [6]="opus"  [7]="sonnet"
  [8]="opus"    [9]="sonnet"  [10]="opus"
)
declare -A STAGE_SCOPE=(
  [3]="Edit(./packages/renderers/**),Write(./packages/renderers/**),Write(./fixtures/**)"
  [4]="Edit(./packages/measure/**),Write(./packages/measure/**)"
  [5]="Edit(./packages/kb/**),Write(./packages/kb/**)"
  [6]="Edit(./packages/engine/**),Write(./packages/engine/**)"
  [7]="Edit(./packages/astro/**),Write(./packages/astro/**)"
  [8]="Edit(./packages/agent/**),Write(./packages/agent/**)"
  [9]="Edit(./fixtures/**),Write(./fixtures/**),Write(./scripts/**)"
  [10]="Edit(./docs/**),Write(./docs/**)"
)
declare -A STAGE_VERIFY=(
  [4]="pnpm --filter @harness/measure typecheck && pnpm --filter @harness/measure test && pnpm --filter @harness/measure build"
  [5]="pnpm --filter @harness/kb typecheck && pnpm --filter @harness/kb test && pnpm --filter @harness/kb build"
  [6]="pnpm --filter @harness/engine typecheck && pnpm --filter @harness/engine test && pnpm --filter @harness/engine build"
  [7]="pnpm --filter @harness/astro typecheck && pnpm --filter @harness/astro test && pnpm --filter @harness/astro build"
  [8]="pnpm --filter @harness/agent test"
  [9]="pnpm verify-dod"
  [10]="test -f docs/EXPLAINER.md && test -f docs/FAILURE_MODES.md"
)

RENDERERS=(react qwik svelte solid)

# --- helpers ---------------------------------------------------------------------------
log()  { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_DIR/driver.log"; }
fail() { log "HALT: $*"; log "Checkpoint: $(git rev-parse --short HEAD)"; log "Logs: $LOG_DIR"; exit 1; }

# Every stage always gets Read/Grep/Glob plus its own build+test commands.
BASE_TOOLS="Read,Grep,Glob,Bash(pnpm typecheck*),Bash(pnpm test*),Bash(pnpm build*),Bash(pnpm --filter * typecheck*),Bash(pnpm --filter * test*),Bash(pnpm --filter * build*),Bash(pnpm publint*),Bash(git status*),Bash(git diff*)"

run_agent() {
  local label="$1" model="$2" scope="$3" prompt_file="$4"
  local out="$LOG_DIR/${label}.json"

  log "── $label · model=$model"
  log "   scope: $scope"

  # --bare skips machine-specific config discovery so runs are reproducible.
  # --permission-mode dontAsk turns any unlisted prompt into a denial rather than a hang.
  claude -p "$(cat "$prompt_file")" \
    --bare \
    --model "$model" \
    --output-format json \
    --permission-mode dontAsk \
    --allowedTools "${BASE_TOOLS},${scope}" \
    --max-turns 120 \
    > "$out" 2> "$LOG_DIR/${label}.err"

  local rc=$?
  if [[ $rc -ne 0 ]]; then
    log "   agent exited $rc"
    return 1
  fi

  # The agent reporting success is not evidence. But an explicit BLOCKED is.
  if grep -q "BLOCKED:" "$out"; then
    log "   agent emitted BLOCKED:"
    grep -o "BLOCKED:[^\"]*" "$out" | head -3 | tee -a "$LOG_DIR/driver.log"
    return 1
  fi

  local cost
  cost=$(jq -r '.total_cost_usd // "?"' "$out" 2>/dev/null)
  log "   agent done (cost: \$$cost)"
  return 0
}

verify() {
  local label="$1" cmd="$2"
  log "   verifying independently…"
  if eval "$cmd" >> "$LOG_DIR/${label}.verify.log" 2>&1; then
    log "   VERIFY PASS"
    return 0
  else
    log "   VERIFY FAIL — see $LOG_DIR/${label}.verify.log"
    return 1
  fi
}

checkpoint() {
  local label="$1"
  git add -A
  git commit -q -m "harness: $label" || true
  log "   checkpoint $(git rev-parse --short HEAD)"
}

# --- preflight -------------------------------------------------------------------------
command -v claude >/dev/null || fail "claude CLI not found"
command -v jq     >/dev/null || fail "jq not found"
[[ -z "$(git status --porcelain)" ]] || fail "working tree dirty — commit or stash first"

FROM="${1:-3}"
TO="${2:-$FROM}"
log "Running stages $FROM..$TO · logs → $LOG_DIR"

# --- main loop -------------------------------------------------------------------------
for stage in $(seq "$FROM" "$TO"); do

  if [[ "$stage" == "3" ]]; then
    # Stage 3 fans out: one fresh session per adapter, sequential here for a clean
    # halt-on-failure. Run them in parallel manually if you prefer speed over clarity.
    for r in "${RENDERERS[@]}"; do
      label="stage-03-$r"
      sed "s/<RENDERER>/$r/g" prompts/stage-03-adapter.md > "$LOG_DIR/${label}.prompt.md"
      run_agent "$label" "${STAGE_MODEL[3]}" "${STAGE_SCOPE[3]}" "$LOG_DIR/${label}.prompt.md" \
        || fail "$label agent failed"
      verify "$label" "pnpm --filter @harness/renderers test -- $r" \
        || fail "$label verify failed"
      checkpoint "$label"
    done
    continue
  fi

  name="${STAGE_NAME[$stage]:-}"
  [[ -n "$name" ]] || fail "no stage $stage defined"
  label="stage-$(printf %02d "$stage")-$name"
  prompt="prompts/stage-$(printf %02d "$stage").md"
  [[ -f "$prompt" ]] || fail "missing $prompt"

  run_agent "$label" "${STAGE_MODEL[$stage]}" "${STAGE_SCOPE[$stage]}" "$prompt" \
    || fail "$label agent failed"
  verify "$label" "${STAGE_VERIFY[$stage]}" \
    || fail "$label verify failed"
  checkpoint "$label"
done

log "── all stages $FROM..$TO passed"
log "Review: git log --oneline | head -20"
log "Diffs:  git diff HEAD~$((TO-FROM+1))"
