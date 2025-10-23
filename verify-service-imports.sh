#!/bin/bash

# ========================================
# SERVICE IMPORT VERIFICATION SCRIPT
# Checks if all imports are correct after fix
# ========================================

echo "🔍 Verifying Service Import Paths..."
echo ""

cd Src/services

ERRORS_FOUND=0

# ========================================
# CHECK 1: No single-level ../models/ imports should exist
# ========================================
echo "✅ CHECK 1: Looking for incorrect ../models/ patterns..."
SINGLE_LEVEL=$(grep -r "require('../models/" . 2>/dev/null | wc -l)

if [ $SINGLE_LEVEL -gt 0 ]; then
    echo "❌ FOUND $SINGLE_LEVEL files with incorrect ../models/ imports:"
    grep -rn "require('../models/" . 2>/dev/null
    ERRORS_FOUND=$((ERRORS_FOUND + SINGLE_LEVEL))
    echo ""
else
    echo "✅ No incorrect ../models/ patterns found"
    echo ""
fi

# ========================================
# CHECK 2: All ../../models/ imports should include planet subdirectory
# (except User and Subscription)
# ========================================
echo "✅ CHECK 2: Checking for missing planet subdirectories..."
MISSING_PLANET=$(grep -r "require('../../models/[A-Z]" . 2>/dev/null | grep -v "User\|Subscription" | grep -v "earth/\|jupiter/\|mars/\|mercury/\|phoenix/\|saturn/\|venus/" | wc -l)

if [ $MISSING_PLANET -gt 0 ]; then
    echo "❌ FOUND $MISSING_PLANET imports missing planet subdirectory:"
    grep -rn "require('../../models/[A-Z]" . 2>/dev/null | grep -v "User\|Subscription" | grep -v "earth/\|jupiter/\|mars/\|mercury/\|phoenix/\|saturn/\|venus/"
    ERRORS_FOUND=$((ERRORS_FOUND + MISSING_PLANET))
    echo ""
else
    echo "✅ All model imports include correct planet subdirectories"
    echo ""
fi

# ========================================
# CHECK 3: List all service files and their imports
# ========================================
echo "✅ CHECK 3: Summary of all service files and imports..."
echo ""

for planet in earth jupiter mars mercury phoenix saturn venus; do
    if [ -d "$planet" ]; then
        echo "📁 $planet services:"
        for file in $planet/*.js; do
            if [ -f "$file" ]; then
                echo "   📄 $(basename $file)"
                grep "require(" "$file" | grep -E "models|services" | sed 's/^/      /'
            fi
        done
        echo ""
    fi
done

# ========================================
# FINAL RESULT
# ========================================
echo "========================================="
if [ $ERRORS_FOUND -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED!"
    echo "   Your service imports are correctly configured"
    echo "   for the subdirectory structure."
else
    echo "❌ FOUND $ERRORS_FOUND ISSUES"
    echo "   Review the errors above and run the fix script again"
fi
echo "========================================="
echo ""
