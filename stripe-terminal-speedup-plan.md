# Stripe Terminal Activation Speed Optimization

## Context

This document describes 4 optimizations to reduce the time between clicking "CHARGE CARD" in the checkout modal and the physical Stripe Terminal reader activating for card tap/insert.

### Current flow (server-driven)

1. Client calls `newCheckoutProcessStripePayment()` in `newCheckoutFirebaseCalls.js`
2. Cloud function `newCheckoutInitiatePaymentIntentCallable` in `functions/firebase-index.js` runs:
   - Retrieves reader to validate it's online (`stripeClient.terminal.readers.retrieve`)
   - Creates PaymentIntent (`stripeClient.paymentIntents.create`)
   - Sends PI to reader (`stripeClient.terminal.readers.processPaymentIntent`)
3. Reader activates and prompts for card

Every step in that chain adds latency. The optimizations below target specific parts of it.

---

## Optimization 1: Pre-create the PaymentIntent

**Target:** Eliminate PI creation from the critical path (the click-to-reader-activation window).

**Current behavior:** The PaymentIntent is created inside the cloud function when the user clicks "CHARGE CARD". This is a full Stripe API round trip that happens before the reader can be activated.

**Proposed change:** Create the PaymentIntent earlier - when the payment amount is first known or when the checkout modal opens. Store the `paymentIntentID` and `clientSecret` in state. When the user clicks charge, the cloud function only needs to call `processPaymentIntent` on the reader using the existing PI.

**Key files:**
- `src/screens/screen_components/modal_screens/newCheckoutModalScreen/CardReaderPayment.js` - initiate early PI creation here
- `src/screens/screen_components/modal_screens/newCheckoutModalScreen/newCheckoutFirebaseCalls.js` - `newCheckoutProcessStripePayment()` already accepts an optional `paymentIntentID` param for reuse
- `functions/firebase-index.js` - `newCheckoutInitiatePaymentIntentCallable` already has a branch for reusing an existing PI (`if (paymentIntentID)`)
- `src/stores.js` - `useStripePaymentStore` already has `paymentIntentID` state

**Watch out for:** Amount changes after PI creation. If the user changes the payment amount, you need to update the existing PI via `stripeClient.paymentIntents.update()` or cancel and recreate.

---

## Optimization 2: Parallelize cloud function internals

**Target:** Run the reader status check and PI creation at the same time instead of sequentially.

**Current behavior:** The cloud function does these calls in sequence:
1. `stripeClient.terminal.readers.retrieve(readerID)` - check reader is online
2. `stripeClient.paymentIntents.create(...)` - create PI
3. `stripeClient.terminal.readers.processPaymentIntent(...)` - send to reader

Steps 1 and 2 are independent. Step 3 depends on both.

**Proposed change:** Run steps 1 and 2 in parallel with `Promise.all()`, then run step 3. This saves one full Stripe API round trip.

**Key file:** `functions/firebase-index.js` - `newCheckoutInitiatePaymentIntentCallable` (search for `terminal.readers.retrieve` and `paymentIntents.create` to find the sequential calls)

---

## Optimization 3: Eliminate the reader status pre-check

**Target:** Remove one Stripe API call from the payment flow entirely.

**Current behavior:** Before creating the PI or sending it to the reader, the cloud function calls `stripeClient.terminal.readers.retrieve(readerID)` to verify the reader is online and not busy. If the reader is offline, it returns an error early.

**Proposed change:** Skip the retrieve call. Let `processPaymentIntent` fail naturally if the reader is offline or busy - Stripe returns a clear error in that case. Handle that error on the client the same way the current offline check is handled.

**Trade-off:** Slightly worse error messaging (the error comes after PI creation instead of before), but saves a full API round trip on every single payment. If combined with Optimization 1 (pre-created PI), there is no wasted work since the PI already exists.

**Key file:** `functions/firebase-index.js` - `newCheckoutInitiatePaymentIntentCallable`

---

## Optimization 4: Keep Cloud Functions warm (minInstances)

**Target:** Eliminate cold start latency (1-3 seconds) on the payment cloud function.

**Current behavior:** If the cloud function hasn't been called recently, Firebase spins up a new instance (cold start) before executing. This adds significant latency to the first payment after an idle period.

**Proposed change:** Set `minInstances: 1` on the payment-related cloud functions so at least one instance is always warm and ready.

**Implementation:** In `functions/firebase-index.js`, update the function definition:
```js
exports.newCheckoutInitiatePaymentIntentCallable = onCall({ minInstances: 1 }, async (request) => {
```

**Trade-off:** Small ongoing cost for keeping an instance warm, but eliminates cold start latency entirely. Consider applying only to the most latency-sensitive functions (initiate payment, cancel payment).

---

## Recommended implementation order

1. **Optimization 2** (parallelize) - Smallest change, no client-side work, immediate improvement
2. **Optimization 3** (remove pre-check) - Small change, slight error handling update on client
3. **Optimization 4** (minInstances) - One-line config change, eliminates cold starts
4. **Optimization 1** (pre-create PI) - Biggest impact but most complex, requires state management for early PI creation and amount-change handling
