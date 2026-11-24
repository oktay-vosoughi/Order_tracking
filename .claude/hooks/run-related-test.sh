#!/bin/bash
# PostToolUse hook: after Claude edits a file, run its sibling node:test file (if any).
# Exit 2 on failure so the test output is fed back to Claude.

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

case "$file" in
  *.test.cjs|*.test.js|*.test.mjs)
    test="$file" ;;
  *.cjs|*.js|*.mjs)
    base="${file%.*}"; ext="${file##*.}"
    test=""
    for cand in "$base.test.$ext" "$base.test.cjs" "$base.test.js" "$base.test.mjs"; do
      [ -f "$cand" ] && { test="$cand"; break; }
    done ;;
  *) exit 0 ;;
esac

[ -z "$test" ] || [ ! -f "$test" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(node --test "$test" 2>&1); then
  echo "Related test failed: $test" >&2
  echo "$out" | tail -40 >&2
  exit 2
fi
exit 0
