#!/bin/bash
#
# Test runner wrapper for Perl tests against JS implementation
#
# Usage:
#   ./t/run-test.sh t/01-AuthDemo.t
#   ./t/run-test.sh t/*.t
#

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Path to Perl LemonLDAP-NG installation
LLNG_PERL="${LLNG_PERL:-$HOME/dev/lemonldap}"

# Check if LLNG Perl exists
if [ ! -d "$LLNG_PERL/lemonldap-ng-common" ]; then
    echo "Error: LemonLDAP-NG Perl installation not found at $LLNG_PERL"
    echo "Set LLNG_PERL environment variable to point to your installation"
    exit 1
fi

# Check if portal test-server exists
if [ ! -f "$PROJECT_DIR/packages/portal/scripts/test-server.js" ]; then
    echo "Error: Portal test server not found."
    echo "Expected: $PROJECT_DIR/packages/portal/scripts/test-server.js"
    exit 1
fi

# Set PERL5LIB to include LLNG modules
export PERL5LIB="$LLNG_PERL/lemonldap-ng-common/blib/lib:$LLNG_PERL/lemonldap-ng-portal/lib:$LLNG_PERL/lemonldap-ng-handler/lib${PERL5LIB:+:$PERL5LIB}:."

# Enable debug mode if requested
if [ -n "$DEBUG" ]; then
    export LLNG_LOGLEVEL=debug
fi

# Change to project directory
cd "$PROJECT_DIR"

# Run tests
if [ $# -eq 0 ]; then
    echo "Usage: $0 <test-file.t> [test-file2.t ...]"
    echo ""
    echo "Available tests:"
    ls -1 t/*.t 2>/dev/null || echo "  No tests found in t/"
    exit 1
fi

echo "Running tests with PERL5LIB=$PERL5LIB"
echo ""

# Run prove with verbose output
exec prove -v "$@"
