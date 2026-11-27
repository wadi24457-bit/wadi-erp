#!/bin/bash
# WADI ERP backup: dumps every public table to JSON via the Supabase Management API.
# Usage: SUPABASE_PAT=<personal access token> ./scripts/backup.sh [outdir]
# Free-tier friendly (no pg_dump needed). Run daily via cron; keep 30 days.
set -e
PAT="${SUPABASE_PAT:?set SUPABASE_PAT}"
REF="bfwsjxrwvagwijlemkuf"
OUT="${1:-backup-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT"
TABLES="accounts advance_installments advances app_settings attachments attendance audit_log branches budgets cashboxes currencies customers employees expenses fx_rates invoice_lines invoices journal_lines journals leaves notifications payments products profiles role_permissions shipment_items shipments stock_moves suppliers supply_requests warehouses"
for t in $TABLES; do
  curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
    -d "{\"query\":\"select json_agg(row_to_json(t)) from (select * from public.$t) t;\"}" \
    | jq -r '.[0].json_agg // []' > "$OUT/$t.json"
  echo "  $t: $(jq length < "$OUT/$t.json") rows"
done
echo "Backup complete: $OUT"
