#!/usr/bin/env bash
# Runs every test suite and reports by EXIT CODE.
#
# The previous habit was to grep each suite's output for "AssertionError" and
# treat anything else as passing. That silently missed suites which print their
# own failure marker — test_portal_surface_role_guard.mjs prints "✗ FAIL" and
# exits non-zero, and was reported as passing while three of its assertions
# were failing. Exit code is the only signal a suite cannot get wrong.
#
# Usage: bash scripts/run_all_tests.sh
set -u

cd "$(dirname "$0")/.." || exit 2

failures=0
passed=0

for f in src/scripts/test_*.mjs; do
  name=$(basename "$f")
  if out=$(node "$f" 2>&1); then
    passed=$((passed + 1))
  else
    failures=$((failures + 1))
    echo "FAIL  $name"
    # Show the suite's own failure lines, whatever marker it uses.
    echo "$out" | grep -iE "✗|FAIL|AssertionError|Error:" | head -4 | sed 's/^/        /'
  fi
done

echo
echo "passed: $passed   failed: $failures"
[ "$failures" -eq 0 ]
