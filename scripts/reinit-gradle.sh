#!/usr/bin/env bash
set -e

echo "=== Re-initializing Gradle Wrapper (v8.10.2) ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"

if [ ! -d "$ANDROID_DIR" ]; then
  echo "Error: android directory not found at $ANDROID_DIR"
  exit 1
fi

cd "$ANDROID_DIR"

if ! command -v gradle >/dev/null 2>&1; then
  echo "Error: 'gradle' is not on PATH. This script relies on a Gradle install"
  echo "already being available (e.g. the gradle/actions/setup-gradle CI step)"
  echo "to regenerate the wrapper - it no longer hand-downloads wrapper files."
  exit 1
fi

echo "Regenerating the official Gradle 8.10.2 wrapper via 'gradle wrapper'..."

# Use Gradle's own wrapper task to (re)generate gradlew, gradlew.bat, and
# gradle/wrapper/gradle-wrapper.{jar,properties}. This is the only supported
# way to produce a correct wrapper - a previous version of this script curl'd
# gradlew and gradle-wrapper.jar from the gradle/gradle source repo itself,
# which are the files Gradle uses to build *itself*, not the generic wrapper
# bootstrap that consumer projects like this one ship.
gradle wrapper \
  --gradle-version 8.10.2 \
  --distribution-type all

chmod +x gradlew

echo "Gradle wrapper re-initialization completed successfully."
