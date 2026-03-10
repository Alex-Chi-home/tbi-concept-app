import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import {
  ensureAutomaticPaymentCustomization,
  type PaymentCustomizationSetupResult,
} from "../utils/payment-customization.server";

export type AppOutletContext = {
  paymentCustomizationSetup: PaymentCustomizationSetupResult;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const paymentCustomizationSetup =
    await ensureAutomaticPaymentCustomization(admin);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    paymentCustomizationSetup,
  };
};

export default function App() {
  const { apiKey, paymentCustomizationSetup } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
        <s-link href="/app/add-theme-banner">Custom Banner</s-link>
        <s-link href="/app/products-localization">Localization</s-link>
      </s-app-nav>
      {!paymentCustomizationSetup.ok && (
        <s-banner tone="critical" heading="Payment customization setup failed">
          <s-paragraph>{paymentCustomizationSetup.message}</s-paragraph>
        </s-banner>
      )}
      <Outlet context={{ paymentCustomizationSetup }} />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
