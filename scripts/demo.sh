#!/usr/bin/env bash
# Replays the README demo: naive locators break on v2, the healing layer fixes them with
# every heal logged, and the genuine bugs in v2-bug still fail.
# Recorded with: asciinema rec -c "bash scripts/demo.sh" docs/demo.cast
set -u
unset NO_COLOR FORCE_COLOR

type_cmd() {
  printf '\033[1;32m$\033[0m '
  local text="$1"
  for ((i = 0; i < ${#text}; i++)); do
    printf '%s' "${text:i:1}"
    sleep 0.02
  done
  printf '\n'
  sleep 0.4
}

run() {
  type_cmd "$1"
  eval "$1"
  sleep 1.5
}

run "npm run -s test:v2:naive 2>&1 | grep -E '^  [0-9]+ (passed|failed)'"
run "npm run -s test:v2 2>&1 | grep -E 'HEALED|REFUSED|^  [0-9]+ (passed|failed)'"
run "npm run -s test:v2-bug 2>&1 | grep -E 'REFUSED|^    Error:|^  [0-9]+ (passed|failed)'"
sleep 1
