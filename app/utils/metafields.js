const METAFIELD_NAMESPACE = "custom_banner";
const METAFIELD_KEYS = {
  enabled: "enabled",
  text: "text",
  color: "color",
};

export async function getBannerSettings(admin) {
  const response = await admin.graphql(`
    query GetBannerMetafields {
      shop {
        metafields(first: 10, namespace: "${METAFIELD_NAMESPACE}") {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }
  `);

  const metafields = await response.json();
  const data = metafields.data?.shop?.metafields?.edges || [];

  const settings = {
    enabled: false,
    text: "привет я баннер",
    color: "#ffffff",
  };

  data.forEach(({ node }) => {
    if (node.key === METAFIELD_KEYS.enabled) {
      settings.enabled = node.value === "true";
    }
    if (node.key === METAFIELD_KEYS.text) {
      settings.text = node.value;
    }
    if (node.key === METAFIELD_KEYS.color) {
      settings.color = node.value;
    }
  });

  return settings;
}

export async function saveBannerSettings(admin, { enabled, text, color }) {
  const metafields = [
    {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.enabled,
      value: enabled ? "true" : "false",
      type: "boolean",
    },
    {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.text,
      value: text,
      type: "single_line_text_field",
    },
    {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEYS.color,
      value: color,
      type: "color",
    },
  ];

  // Сначала получаем реальный GID магазина
  const shopResponse = await admin.graphql(`
    query GetShopId {
      shop {
        id
      }
    }
  `);
  const shopData = await shopResponse.json();
  const shopId = shopData.data?.shop?.id;

  if (!shopId) {
    throw new Error("Could not fetch shop ID");
  }

  const response = await admin.graphql(`
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      metafields: metafields.map(m => ({
        ...m,
        ownerId: shopId,
      })),
    },
  });

  const result = await response.json();
  if (result.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Metafields error:", result.data.metafieldsSet.userErrors);
    throw new Error("Failed to save metafields");
  }

  return result.data.metafieldsSet.metafields;
}