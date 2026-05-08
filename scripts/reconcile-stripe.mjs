import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

const products = await stripe.products.list({ limit: 20, active: true });
const prices = await stripe.prices.list({ limit: 50, active: true });

console.log(JSON.stringify({ products: products.data, prices: prices.data }, null, 2));
