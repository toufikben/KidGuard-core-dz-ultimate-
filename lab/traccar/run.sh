#!/usr/bin/env bash
# Lab-only: run the pinned Traccar tree against the generated config.
set -euo pipefail
LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TREE_DIR="${LAB_TRACCAR_DIR:-$LAB_ROOT/traccar/traccar-other-6.16.0}"
JAVA_BIN="${LAB_JAVA_BIN:-/c/Program Files/Java/jdk-21.0.7.6-hotspot/bin/java.exe}"
cd "$TREE_DIR"
exec "$JAVA_BIN" -Xmx512m -XX:+ExitOnOutOfMemoryError \
  -jar tracker-server.jar "$LAB_ROOT/traccar/kidguard-lab.xml"
