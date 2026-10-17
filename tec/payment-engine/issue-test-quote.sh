#!/usr/bin/env bash
# TESTNET ONLY. Run inside the Ubuntu/proot shell where Sui CLI is configured.
set -euo pipefail
PKG="0x984ea1d9b89f899e326adc3f96eb9d5903ed43d06db339507ddbadacb2e93230"
CAP="0x135622b161a1b062ec0ac23290ba49b2f1b03675b8e7744247a66c7d5ff993d8"
TEC="0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC"
BUYER="${1:-0xf72dff105a6f7057febbaf37fa07a87376c5e49d3fa14da6ea7b8f94ada48d74}"
if [[ ! "$BUYER" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "Invalid buyer Sui address" >&2; exit 1
fi
sui client switch --env testnet >/dev/null
sui client switch --address tec-dev >/dev/null
if [[ "$(sui client active-env)" != "testnet" ]]; then
  echo "Not on TESTNET; stopped" >&2; exit 1
fi
REF="TEC-TEST-$(python3 -c 'import uuid;print(uuid.uuid4().hex[:12])')"
FILE="$(mktemp)"
trap 'rm -f "$FILE"' EXIT
echo "Creating ONE fresh 9 TEST TEC quote for $BUYER..."
sui client call --package "$PKG" --module checkout --function issue_quote \
  --type-args "$TEC" --args "$CAP" "$REF" "$BUYER" 9000000 0x6 \
  --gas-budget 10000000 --json > "$FILE"
python3 - "$FILE" <<'PY'
import json,sys
with open(sys.argv[1]) as f: d=json.load(f)
status=d.get("effects",{}).get("status",{})
if status.get("status")!="success":
    print("ISSUE QUOTE FAILED:",status);sys.exit(1)
print("TRANSACTION:",d.get("digest"))
for obj in d.get("objectChanges",[]):
    if "::checkout::Quote<" in obj.get("objectType","") and obj.get("type")=="created":
        print("NEW QUOTE ID:",obj["objectId"])
        print("ORDER:",obj.get("objectType",""))
        print("PASTE THE QUOTE ID INTO PHASE 8A RIGHT NOW: expires in 120 seconds.")
        break
else:
    print("No Quote object reported; inspect transaction manually.")
    sys.exit(2)
PY
