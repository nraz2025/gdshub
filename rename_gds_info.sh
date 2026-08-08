#!/bin/bash
# Rename GDS Info -> GDS Access Record. Run from your repo root.
set -e

git mv "app/(dashboard)/gds-info" "app/(dashboard)/gds-access-record"
echo "Renamed folder: gds-info -> gds-access-record"

echo ""
echo "Done. Now:"
echo "1. Replace nav-items.tsx, TopNav.tsx, dashboard/page.tsx, and the new"
echo "   app/(dashboard)/gds-access-record/page.tsx with the versions provided."
echo "2. Run 'git status' to review."
echo "3. git commit -m \"Rename GDS Info to GDS Access Record\""
echo "4. git push"
