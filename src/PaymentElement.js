import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { View } from "react-native-web";
import { PaymentElement } from "@stripe/react-stripe-js";
import { Button } from "./components";

const stripePromise = loadStripe(
  "pk_test_51RRLAyG8PZMnVdxFyWNM3on9DMqNo4tGT0haBl8fYnOpMrFgEplfYacqq7bAbcwgeWmIIokTNdybj6pVuUVBNcP300s7r5CIeM"
);

export function PaymentElementComponent({ amount }) {
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
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "blue",
          width: "100%",
          //   height: "100%",
        }}
      >
        <PaymentElement />
        <Button onPress={() => {}} text={"Submit"} />
      </View>
    </Elements>
  );
}
