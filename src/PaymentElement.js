import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { View } from "react-native-web";
const stripePromise = loadStripe(
  "pk_test_51RRLAyG8PZMnVdxFyWNM3on9DMqNo4tGT0haBl8fYnOpMrFgEplfYacqq7bAbcwgeWmIIokTNdybj6pVuUVBNcP300s7r5CIeM"
);

export function PaymentElement({ amount }) {
  const options = {
    mode: "payment",
    amount: amount,
    currency: "usd",
    paymentMethodCreation: "manual",
    // Fully customizable with appearance API.
    appearance: {
      /*...*/
    },
  };
  return (
    <Elements stripe={stripePromise} options={options}>
      <View style={{ backgroundColor: "blue", flex: 1 }}></View>
    </Elements>
  );
}
