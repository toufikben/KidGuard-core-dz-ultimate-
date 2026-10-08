#!/usr/bin/env bash
# Lab-only: run the pinned Traccar tree. Java >= 21 bytecode is required and PATH java here is 17,
# so LAB_JAVA_BIN defaults to the JDK 25 installed on this machine — override it elsewhere.
set -euo pipefail
LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Measured 2026-10-06: traccar-other-6.16.0.zip is FLAT (templates/, lib/, conf/, schema/,
# web/, tracker-server.jar at the archive root), so the tree was unpacked straight into
# lab/traccar/ instead of a version-named folder.
TREE_DIR="${LAB_TRACCAR_DIR:-$LAB_ROOT/traccar}"
JAVA_BIN="${LAB_JAVA_BIN:-/c/Program Files/Java/jdk-25.0.2/bin/java.exe}"
# Checked before cd/exec: a stale or wrong LAB_JAVA_BIN used to fail as a cryptic exec error,
# and a tree unpacked into the wrong folder as a bare java usage dump.
if [ ! -x "$JAVA_BIN" ]; then
  echo "no executable java at: $JAVA_BIN (set LAB_JAVA_BIN to a Java 21+ install)" >&2
  exit 1
fi
if [ ! -f "$TREE_DIR/tracker-server.jar" ]; then
  echo "no tracker-server.jar in: $TREE_DIR (the pinned Traccar tree unpacks flat into lab/traccar)" >&2
  exit 1
fi
cd "$TREE_DIR"
exec "$JAVA_BIN" -Xmx512m -XX:+ExitOnOutOfMemoryError \
  -jar tracker-server.jar "$LAB_ROOT/traccar/kidguard-lab.xml"
