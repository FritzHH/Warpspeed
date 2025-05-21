const stripe = require("stripe")(
  "sk_test_51NMZWUAvPFWDtSFM1n5l9N83I1kXBmNjhA662c2SgY17fu5mBxHQDrezn2WaFiQUCLsdHNdpAoSymAi2WbT4QdTz00IQ2weB1S"
);

async function createStripeCustomer(firstName, lastName) {
  return await stripe.customers.create({
    name: "John Doe",
    address: {
      country: "US",
      city: "San Fransisco",
    },
    preferred_locales: ["EN", "FR"],
  });
}

async function createPaymentIntent(amount, currency) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      // Add any other required options
    });
    return paymentIntent;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function handlePayment() {
  const paymentIntent = await createPaymentIntent(1000, "usd"); // Example: $10.00
  if (paymentIntent) {
    // Send the client secret to the client
    return {
      clientSecret: paymentIntent.client_secret,
    };
  } else {
    // Handle error
    return { error: "Failed to create PaymentIntent" };
  }
}

async function stripePayment(firstName, lastName) {}

module.exports = stripePayment;
