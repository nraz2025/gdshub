#!/bin/bash
# GDSHub full cleanup: dead-file removal + route renames to match sidebar labels.
# Run from the root of your local gdshub clone. Review 'git status' before committing.
set -e

echo "== Part 1: Removing dead/backup files =="

DEAD_FILES=(
  "types/index.ts.bak"
  "app/globals.css.bak"
  "components/shared/DataTable.tsx.bak"
  "components/shared/Modal.tsx.bak"
  "components/shared/Modal - Copy.tsx"
  "components/shared/IdleLogout.tsx.bak"
  "components/layout/Sidebar.tsx.bak"
  "components/layout/TopBar.tsx.bak"
  "app/(dashboard)/layout.tsx.bak"
  "app/(dashboard)/dashboard/page.tsx.bak"
  "app/(dashboard)/gds/page.tsx.bak"
  "app/(dashboard)/gds-functionality/page.tsx.bak"
  "app/(dashboard)/billing-cycles/page.tsx.bak"
  "app/(dashboard)/ota-clients/page.tsx.bak"
  "app/(dashboard)/ota-clients/page - Copy.tsx"
  "app/(dashboard)/pcc/page.tsx.bak"
  "app/(dashboard)/pcc/page1.tsx"
  "app/(dashboard)/amadeus-users/page.tsx.bak"
  "app/(dashboard)/amadeus-users/page - Copy.tsx"
  "app/(dashboard)/travelport-users/page.tsx.bak"
  "app/(dashboard)/travelport-users/page - Copy.tsx"
  "app/(dashboard)/resigned-users/page.tsx.bak"
  "app/(dashboard)/users/page.tsx.bak"
  "app/login/page.tsx.bak"
  "app/(dashboard)/client-group/page - Copy.tsx"
  "app/(dashboard)/gds-information/page - Copy.tsx"
  "app/(dashboard)/gds-information/gds information.tsx"
  # Routable but orphaned — zero links anywhere in the app, safe to remove
  "app/(dashboard)/client-group/page.tsx"
  "app/(dashboard)/gds-assigned-old/page.tsx"
  "app/(dashboard)/gds-information/page.tsx"
)

for f in "${DEAD_FILES[@]}"; do
  if [ -f "$f" ]; then
    git rm "$f"
    echo "Removed: $f"
  else
    echo "Skipped (not found): $f"
  fi
done

# Clean up now-empty folders
for d in "app/(dashboard)/client-group" "app/(dashboard)/gds-assigned-old" "app/(dashboard)/gds-information"; do
  rmdir "$d" 2>/dev/null && echo "Removed empty folder: $d" || true
done

echo ""
echo "== Part 2: Renaming routes to match sidebar labels =="

# nav label 'GDS Features' -> was /gds-functionality
git mv "app/(dashboard)/gds-functionality" "app/(dashboard)/gds-features"
echo "Renamed: gds-functionality -> gds-features"

# nav label 'PCC Group' -> was /ota-clients
git mv "app/(dashboard)/ota-clients" "app/(dashboard)/pcc-group"
echo "Renamed: ota-clients -> pcc-group"

# nav label 'GDS Info' -> was /pcc
git mv "app/(dashboard)/pcc" "app/(dashboard)/gds-info"
echo "Renamed: pcc -> gds-info"

# nav label 'Report' -> was /reporting
git mv "app/(dashboard)/reporting" "app/(dashboard)/report"
echo "Renamed: reporting -> report"

echo ""
echo "Done. Now:"
echo "1. Replace nav-items.tsx, dashboard/page.tsx, and login/page.tsx with the updated versions provided."
echo "2. Run 'git status' to review everything."
echo "3. git commit -m \"Clean up dead files and rename routes to match navigation\""
echo "4. git push"
