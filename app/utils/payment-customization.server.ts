type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlUserError = {
  code?: string | null;
  field?: string[] | null;
  message: string;
};

type PaymentCustomizationNode = {
  id: string;
  title: string;
  enabled: boolean;
  functionId: string;
};

type ShopifyFunctionNode = {
  id: string;
  title: string;
  apiType: string;
};

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

type LoadPaymentCustomizationsResponse = {
  paymentCustomizations: {
    nodes: PaymentCustomizationNode[];
  };
};

type LoadShopifyFunctionsResponse = {
  shopifyFunctions: {
    nodes: ShopifyFunctionNode[];
  };
};

type CreatePaymentCustomizationResponse = {
  paymentCustomizationCreate: {
    paymentCustomization: PaymentCustomizationNode | null;
    userErrors: GraphqlUserError[];
  };
};

type ActivatePaymentCustomizationResponse = {
  paymentCustomizationActivation: {
    ids: string[] | null;
    userErrors: GraphqlUserError[];
  };
};

export type PaymentCustomizationSetupResult = {
  ok: boolean;
  status:
    | "already_enabled"
    | "created_and_enabled"
    | "activated_existing"
    | "error";
  message: string;
  paymentCustomizationId: string | null;
  enabled: boolean;
  title: string;
  functionHandle: string;
};

const PAYMENT_CUSTOMIZATION_FUNCTION_HANDLE = "payment-customization";
const PAYMENT_CUSTOMIZATION_FUNCTION_NAME = "payment-customization";
const PAYMENT_CUSTOMIZATION_TITLE = "TBI Bank automatic payment customization";

async function adminRequest<TData>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const response = await admin.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const json = (await response.json()) as GraphqlResponse<TData>;

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  if (!json.data) {
    throw new Error("Shopify Admin API returned an empty response.");
  }

  return json.data;
}

function formatUserErrors(errors: GraphqlUserError[]) {
  return errors
    .map((error) => {
      const fieldPath = error.field?.length ? ` (${error.field.join(".")})` : "";
      return `${error.message}${fieldPath}`;
    })
    .join("; ");
}

function normalizeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Shopify error.";
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function selectMatchingFunction(nodes: ShopifyFunctionNode[]) {
  if (nodes.length === 1) {
    return nodes[0] ?? null;
  }

  const matchingByTitle = nodes.find(
    (node) => normalizeValue(node.title) === PAYMENT_CUSTOMIZATION_FUNCTION_NAME,
  );

  return matchingByTitle ?? nodes[0] ?? null;
}

function selectMatchingCustomization(
  nodes: PaymentCustomizationNode[],
  functionId: string,
) {
  const matchingNodes = nodes.filter(
    (node) => node.functionId === functionId,
  );

  return (
    matchingNodes.find((node) => node.enabled) ?? matchingNodes[0] ?? null
  );
}

async function resolvePaymentCustomizationFunction(admin: AdminGraphqlClient) {
  const data = await adminRequest<LoadShopifyFunctionsResponse>(
    admin,
    `#graphql
      query ResolvePaymentCustomizationFunctionId {
        shopifyFunctions(first: 25, apiType: "payment_customization") {
          nodes {
            id
            title
            apiType
          }
        }
      }
    `,
  );

  const paymentCustomizationFunction = selectMatchingFunction(
    data.shopifyFunctions.nodes,
  );

  if (!paymentCustomizationFunction) {
    throw new Error(
      "No payment customization Shopify Function is available for this app installation.",
    );
  }

  return paymentCustomizationFunction;
}

async function findExistingPaymentCustomization(
  admin: AdminGraphqlClient,
  functionId: string,
) {
  const data = await adminRequest<LoadPaymentCustomizationsResponse>(
    admin,
    `#graphql
      query LoadPaymentCustomizations {
        paymentCustomizations(first: 50) {
          nodes {
            id
            title
            enabled
            functionId
          }
        }
      }
    `,
  );

  return selectMatchingCustomization(data.paymentCustomizations.nodes, functionId);
}

async function createPaymentCustomization(admin: AdminGraphqlClient) {
  const data = await adminRequest<CreatePaymentCustomizationResponse>(
    admin,
    `#graphql
      mutation CreateAutomaticPaymentCustomization($paymentCustomization: PaymentCustomizationInput!) {
        paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
          paymentCustomization {
            id
            title
            enabled
            functionId
          }
          userErrors {
            code
            field
            message
          }
        }
      }
    `,
    {
      paymentCustomization: {
        functionHandle: PAYMENT_CUSTOMIZATION_FUNCTION_HANDLE,
        title: PAYMENT_CUSTOMIZATION_TITLE,
        enabled: true,
      },
    },
  );

  const { paymentCustomization, userErrors } = data.paymentCustomizationCreate;

  if (userErrors.length > 0) {
    throw new Error(formatUserErrors(userErrors));
  }

  if (!paymentCustomization) {
    throw new Error("Shopify did not return the created payment customization.");
  }

  return paymentCustomization;
}

async function activatePaymentCustomization(
  admin: AdminGraphqlClient,
  paymentCustomizationId: string,
) {
  const data = await adminRequest<ActivatePaymentCustomizationResponse>(
    admin,
    `#graphql
      mutation ActivateAutomaticPaymentCustomization($ids: [ID!]!, $enabled: Boolean!) {
        paymentCustomizationActivation(ids: $ids, enabled: $enabled) {
          ids
          userErrors {
            code
            field
            message
          }
        }
      }
    `,
    {
      ids: [paymentCustomizationId],
      enabled: true,
    },
  );

  const { ids, userErrors } = data.paymentCustomizationActivation;

  if (userErrors.length > 0) {
    throw new Error(formatUserErrors(userErrors));
  }

  if (!ids?.includes(paymentCustomizationId)) {
    throw new Error("Shopify did not confirm payment customization activation.");
  }
}

function buildSuccessResult(
  status:
    | "already_enabled"
    | "created_and_enabled"
    | "activated_existing",
  paymentCustomization: PaymentCustomizationNode,
  message: string,
): PaymentCustomizationSetupResult {
  return {
    ok: true,
    status,
    message,
    paymentCustomizationId: paymentCustomization.id,
    enabled: paymentCustomization.enabled,
    title: paymentCustomization.title,
    functionHandle: PAYMENT_CUSTOMIZATION_FUNCTION_HANDLE,
  };
}

function buildErrorResult(message: string): PaymentCustomizationSetupResult {
  return {
    ok: false,
    status: "error",
    message,
    paymentCustomizationId: null,
    enabled: false,
    title: PAYMENT_CUSTOMIZATION_TITLE,
    functionHandle: PAYMENT_CUSTOMIZATION_FUNCTION_HANDLE,
  };
}

export async function ensureAutomaticPaymentCustomization(
  admin: AdminGraphqlClient,
): Promise<PaymentCustomizationSetupResult> {
  try {
    const paymentCustomizationFunction =
      await resolvePaymentCustomizationFunction(admin);
    const existingPaymentCustomization = await findExistingPaymentCustomization(
      admin,
      paymentCustomizationFunction.id,
    );

    if (existingPaymentCustomization?.enabled) {
      return buildSuccessResult(
        "already_enabled",
        existingPaymentCustomization,
        "Automatic payment customization is already enabled.",
      );
    }

    if (existingPaymentCustomization) {
      await activatePaymentCustomization(admin, existingPaymentCustomization.id);

      return buildSuccessResult(
        "activated_existing",
        { ...existingPaymentCustomization, enabled: true },
        "Existing payment customization was found and enabled automatically.",
      );
    }

    try {
      const createdPaymentCustomization = await createPaymentCustomization(admin);

      return buildSuccessResult(
        "created_and_enabled",
        createdPaymentCustomization,
        "Payment customization was created and enabled automatically.",
      );
    } catch (createError) {
      const recoveredPaymentCustomization = await findExistingPaymentCustomization(
        admin,
        paymentCustomizationFunction.id,
      ).catch(() => null);

      if (recoveredPaymentCustomization) {
        if (!recoveredPaymentCustomization.enabled) {
          await activatePaymentCustomization(admin, recoveredPaymentCustomization.id);
        }

        return buildSuccessResult(
          recoveredPaymentCustomization.enabled
            ? "already_enabled"
            : "activated_existing",
          { ...recoveredPaymentCustomization, enabled: true },
          "Payment customization already existed and was recovered automatically.",
        );
      }

      throw createError;
    }
  } catch (error) {
    return buildErrorResult(normalizeErrorMessage(error));
  }
}