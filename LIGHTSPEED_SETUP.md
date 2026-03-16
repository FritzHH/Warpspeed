# Lightspeed Retail R-Series API — Setup Checklist

## Before Deploying

1. Set Firebase secrets:
   ```bash
   firebase functions:secrets:set lightspeedClientId
   firebase functions:secrets:set lightspeedClientSecret
   ```

2. Set redirect URI in Lightspeed app settings:
   ```
   https://us-central1-warpspeed-bonitabikes.cloudfunctions.net/lightspeedOAuthCallback
   ```

3. Deploy functions:
   ```bash
   firebase deploy --only functions
   ```

## Using the Import

1. Go to Dashboard Admin → Import tab
2. Click "Connect to Lightspeed" — completes OAuth in a new tab
3. Click "Check Connection" to verify
4. Click "Import from Lightspeed" — imports customers first, then workorders
5. Toggle "Clear existing data" checkbox to clear or merge
