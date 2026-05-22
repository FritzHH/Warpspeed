export function getWorkorderDeleteGuard(workorder, activeSale) {
  if (!activeSale) return { canDelete: true, reason: null };

  const depositsApplied = activeSale.depositsApplied || [];
  const creditsApplied = activeSale.creditsApplied || [];

  const cashDepositTotal = depositsApplied
    .filter((d) => d.depositType !== "giftcard")
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const giftCardTotal = depositsApplied
    .filter((d) => d.depositType === "giftcard")
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const depositOnlyTotal = cashDepositTotal + giftCardTotal;

  const capturedBeyondDeposits = (activeSale.amountCaptured || 0) - depositOnlyTotal;
  if (capturedBeyondDeposits > 0) {
    return { canDelete: false, reason: "Card/cash payment captured" };
  }
  if (creditsApplied.some((c) => (c.amount || 0) > 0)) {
    return { canDelete: false, reason: "Credits applied" };
  }
  if (cashDepositTotal > 0) {
    return { canDelete: false, reason: "Deposit applied" };
  }
  if (giftCardTotal > 0) {
    return { canDelete: false, reason: "Gift card applied" };
  }
  return { canDelete: true, reason: null };
}
