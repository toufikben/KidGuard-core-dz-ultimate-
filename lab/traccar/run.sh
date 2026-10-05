#!/usr/bin/env bash
# Lab-only: run the pinned Traccar tree (needs Java >= 21 bytecode; PATH java here is 17, so LAB_JAVA_BIN defaults to JDK 25).
set -euo pipefail
LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TREE_DIR="${LAB_TRACCAR_DIR:-$LAB_ROOT/traccar/traccar-other-6.16.0}"
JAVA_BIN="${LAB_JAVA_BIN:-/c/Program Files/Java/jdk-25.0.2/bin/java.exe}"
cd "$TREE_DIR"
exec "$JAVA_BIN" -Xmx512m -XX:+ExitOnOutOfMemoryError \
  -jar tracker-server.jar "$LAB_ROOT/traccar/kidguard-lab.xml"
