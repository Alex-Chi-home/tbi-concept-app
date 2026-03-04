import { useState, useEffect } from "react";
import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// ─── Types ───────────────────────────────────────────────────────────────────

type ShopLocale = {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImage: { url: string; altText: string } | null;
};

type TranslatableContent = {
  key: string;
  value: string;
  digest: string;
  locale: string;
};

type Translation = { key: string; value: string; locale: string };

type TranslatableResource = {
  resourceId: string;
  translatableContent: TranslatableContent[];
  translations: Translation[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DISPLAYED_KEYS = ["title", "body_html", "seo_title", "seo_description"] as const;
type DisplayedKey = (typeof DISPLAYED_KEYS)[number];

const KEY_LABELS: Record<DisplayedKey, string> = {
  title: "Заголовок",
  body_html: "Описание (HTML)",
  seo_title: "SEO-заголовок",
  seo_description: "SEO-описание",
};

const KEY_MULTILINE: Partial<Record<DisplayedKey, boolean>> = {
  body_html: true,
  seo_description: true,
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  DRAFT: "Черновик",
  ARCHIVED: "Архив",
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const query = url.searchParams.get("query") || "";

  const isPrev = before !== null;

  const [productsRes, localesRes] = await Promise.all([
    admin.graphql(
      `#graphql
      query GetProducts($first: Int, $last: Int, $after: String, $before: String, $query: String) {
        products(first: $first, last: $last, after: $after, before: $before, query: $query) {
          edges { node { id title handle status featuredImage { url altText } } cursor }
          pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        }
      }`,
      {
        variables: isPrev
          ? { last: 8, before, query }
          : { first: 8, after, query },
      },
    ),
    admin.graphql(`#graphql
      query { shopLocales { locale name primary published } }
    `),
  ]);

  const productsJson = await productsRes.json();
  const localesJson = await localesRes.json();

  const edges = productsJson.data!.products.edges as { node: Product; cursor: string }[];

  return {
    products: edges.map((e) => e.node),
    pageInfo: productsJson.data!.products.pageInfo as {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
      endCursor: string | null;
    },
    cursors: {
      start: edges[0]?.cursor ?? null,
      end: edges[edges.length - 1]?.cursor ?? null,
    },
    locales: localesJson.data!.shopLocales as ShopLocale[],
    currentQuery: query,
  };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "getTranslations") {
    const resourceId = formData.get("resourceId") as string;
    const locale = formData.get("locale") as string;

    const res = await admin.graphql(
      `#graphql
      query GetTranslations($resourceId: ID!, $locale: String!) {
        translatableResource(resourceId: $resourceId) {
          resourceId
          translatableContent { key value digest locale }
          translations(locale: $locale) { key value locale }
        }
      }`,
      { variables: { resourceId, locale } },
    );
    const json = await res.json();
    return { intent: "getTranslations", data: json.data!.translatableResource as TranslatableResource };
  }

  if (intent === "saveTranslations") {
    const resourceId = formData.get("resourceId") as string;
    const translations = JSON.parse(formData.get("translations") as string);

    const res = await admin.graphql(
      `#graphql
      mutation RegisterTranslations($resourceId: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $resourceId, translations: $translations) {
          translations { key value locale }
          userErrors { field message }
        }
      }`,
      { variables: { resourceId, translations } },
    );
    const json = await res.json();
    const result = json.data!.translationsRegister;

    if (result.userErrors?.length > 0) {
      return { intent: "saveTranslations", success: false, errors: result.userErrors };
    }
    return { intent: "saveTranslations", success: true };
  }

  return { error: "Unknown intent" };
};

// ─── Sub-component: TranslationEditor ────────────────────────────────────────

function TranslationEditor({
  productId,
  productTitle,
  locales,
}: {
  productId: string;
  productTitle: string;
  locales: ShopLocale[];
}) {
  const editableLocales = locales.filter((l) => !l.primary);
  const [activeLocale, setActiveLocale] = useState(editableLocales[0]?.locale ?? "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const loadFetcher = useFetcher<{ intent: string; data: TranslatableResource }>();
  const saveFetcher = useFetcher<{ intent: string; success?: boolean; errors?: { field: string; message: string }[] }>();

  const isLoading = loadFetcher.state !== "idle";
  const isSaving = saveFetcher.state !== "idle";

  // Load translations on product/locale change
  useEffect(() => {
    if (!productId || !activeLocale) return;
    loadFetcher.submit(
      { intent: "getTranslations", resourceId: productId, locale: activeLocale },
      { method: "POST" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, activeLocale]);

  // Sync field values when translations arrive
  useEffect(() => {
    if (loadFetcher.data?.intent === "getTranslations") {
      const { translatableContent, translations } = loadFetcher.data.data;
      const vals: Record<string, string> = {};
      translatableContent.forEach((tc) => {
        if ((DISPLAYED_KEYS as readonly string[]).includes(tc.key)) {
          const found = translations.find((t) => t.key === tc.key);
          vals[tc.key] = found?.value ?? "";
        }
      });
      setFieldValues(vals);
    }
  }, [loadFetcher.data]);

  // Reset field values on product change
  useEffect(() => {
    setFieldValues({});
  }, [productId]);

  const handleSave = () => {
    const content = loadFetcher.data?.data?.translatableContent ?? [];
    const translations = DISPLAYED_KEYS.filter((k) => fieldValues[k] !== undefined && fieldValues[k] !== "").map((key) => {
      const tc = content.find((c) => c.key === key);
      return { locale: activeLocale, key, value: fieldValues[key], translatableContentDigest: tc?.digest };
    });

    saveFetcher.submit(
      { intent: "saveTranslations", resourceId: productId, translations: JSON.stringify(translations) },
      { method: "POST" },
    );
  };

  const primaryLocale = locales.find((l) => l.primary);
  const primaryContent = loadFetcher.data?.data?.translatableContent ?? [];

  if (editableLocales.length === 0) {
    return (
      <s-section heading="Локализация">
        <s-banner tone="warning" heading="Нет дополнительных языков">
          <s-paragraph>
            В магазине настроен только один язык. Добавьте языки в настройках Shopify → Магазин → Языки.
          </s-paragraph>
        </s-banner>
      </s-section>
    );
  }

  return (
    <s-section heading={`Переводы: ${productTitle}`}>
      {saveFetcher.data?.intent === "saveTranslations" && saveFetcher.data.success && (
        <s-banner tone="success" heading="Сохранено">
          <s-paragraph>Переводы успешно сохранены.</s-paragraph>
        </s-banner>
      )}
      {saveFetcher.data?.intent === "saveTranslations" && !saveFetcher.data.success && (
        <s-banner tone="critical" heading="Ошибка сохранения">
          {saveFetcher.data.errors?.map((e, i) => (
            <s-paragraph key={i}>{e.message}</s-paragraph>
          ))}
        </s-banner>
      )}

      {/* Locale selector */}
      <s-select
        label="Язык перевода"
        value={activeLocale}
        onChange={(e: Event) => setActiveLocale((e.target as HTMLSelectElement).value)}
      >
        {editableLocales.map((loc) => (
          <option key={loc.locale} value={loc.locale}>
            {loc.name} ({loc.locale}){!loc.published ? " — не опубликован" : ""}
          </option>
        ))}
      </s-select>

      {isLoading ? (
        <s-stack direction="inline" alignItems="center" gap="base">
          <s-spinner />
          <s-text>Загрузка переводов…</s-text>
        </s-stack>
      ) : (
        <s-stack direction="block" gap="base">
          {DISPLAYED_KEYS.map((key) => {
            const original = primaryContent.find((c) => c.key === key);
            const isMultiline = KEY_MULTILINE[key];
            return isMultiline ? (
              <s-text-area
                key={key}
                label={KEY_LABELS[key]}
                details={original ? `Оригинал (${primaryLocale?.name ?? primaryLocale?.locale}): ${original.value}` : undefined}
                value={fieldValues[key] ?? ""}
                rows={4}
                onInput={(e: Event) =>
                  setFieldValues((prev) => ({ ...prev, [key]: (e.target as HTMLInputElement).value }))
                }
                autocomplete="off"
              />
            ) : (
              <s-text-field
                key={key}
                label={KEY_LABELS[key]}
                details={original ? `Оригинал (${primaryLocale?.name ?? primaryLocale?.locale}): ${original.value}` : undefined}
                value={fieldValues[key] ?? ""}
                onInput={(e: Event) =>
                  setFieldValues((prev) => ({ ...prev, [key]: (e.target as HTMLInputElement).value }))
                }
                autocomplete="off"
              />
            );
          })}

          <s-button
            variant="primary"
            onClick={handleSave}
            {...(isSaving ? { loading: true } : {})}
          >
            {isSaving ? "Сохранение…" : "Сохранить переводы"}
          </s-button>
        </s-stack>
      )}
    </s-section>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function ProductLocalizationPage() {
  const { products, pageInfo, cursors, locales, currentQuery } = useLoaderData<typeof loader>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [, setSearchParams] = useSearchParams();

  const handleSearch = (e: Event) => {
    const value = (e as CustomEvent).detail?.value ?? (e.target as HTMLInputElement).value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("query", value);
      next.delete("after");
      next.delete("before");
      return next;
    });
    setSelectedProduct(null);
  };

  const handleNextPage = () => {
    if (pageInfo.hasNextPage && cursors.end) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("after", cursors.end!);
        next.delete("before");
        return next;
      });
      setSelectedProduct(null);
    }
  };

  const handlePrevPage = () => {
    if (pageInfo.hasPreviousPage && cursors.start) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("before", cursors.start!);
        next.delete("after");
        return next;
      });
      setSelectedProduct(null);
    }
  };

  const editableLocalesCount = locales.filter((l) => !l.primary).length;

  return (
    <s-page heading="Локализация товаров">
      {/* ── Aside info ── */}
      <s-section slot="aside" heading="Доступные языки">
        {locales.map((loc) => (
          <s-paragraph key={loc.locale}>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>
                <strong>{loc.name}</strong> ({loc.locale})
              </s-text>
              {loc.primary && <s-badge tone="info">Основной</s-badge>}
              {!loc.published && !loc.primary && <s-badge tone="warning">Не опубликован</s-badge>}
              {loc.published && !loc.primary && <s-badge tone="success">Опубликован</s-badge>}
            </s-stack>
          </s-paragraph>
        ))}
        {editableLocalesCount === 0 && (
          <s-paragraph>
            <s-link href="https://help.shopify.com/ru/manual/markets/languages/add-languages" target="_blank">
              Добавить язык
            </s-link>
          </s-paragraph>
        )}
      </s-section>

      {/* ── Product list ── */}
      <s-section heading="Товары магазина">
        <s-text-field
          label="Поиск товаров"
          value={currentQuery}
          placeholder="Введите название товара…"
          autocomplete="off"
          onInput={handleSearch}
        />

        {products.length === 0 ? (
          <s-banner tone="info" heading="Нет товаров">
            <s-paragraph>По вашему запросу товары не найдены.</s-paragraph>
          </s-banner>
        ) : (
          <s-stack direction="block" gap="none">
            {products.map((product) => (
              <s-clickable
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                padding="base"
                background={selectedProduct?.id === product.id ? "strong" : "transparent"}
              >
                <s-stack direction="inline" alignItems="center" gap="base">
                  {product.featuredImage?.url && (
                    <s-thumbnail
                      src={product.featuredImage.url}
                      alt={product.featuredImage.altText ?? product.title}
                      size="base"
                    />
                  )}
                  <s-stack direction="block" gap="small-200">
                    <s-text>
                      <strong>{product.title}</strong>
                    </s-text>
                    <s-stack direction="inline" gap="small-200">
                      <s-badge
                        tone={
                          product.status === "ACTIVE"
                            ? "success"
                            : product.status === "DRAFT"
                              ? "caution"
                              : "neutral"
                        }
                      >
                        {STATUS_LABELS[product.status] ?? product.status}
                      </s-badge>
                      <s-text tone="neutral">{product.handle}</s-text>
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-clickable>
            ))}
          </s-stack>
        )}

        {/* Pagination */}
        {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
          <s-stack direction="inline" gap="base">
            {pageInfo.hasPreviousPage && (
              <s-button onClick={handlePrevPage}>← Назад</s-button>
            )}
            {pageInfo.hasNextPage && (
              <s-button onClick={handleNextPage}>Вперёд →</s-button>
            )}
          </s-stack>
        )}
      </s-section>

      {/* ── Translation editor ── */}
      {selectedProduct ? (
        <TranslationEditor
          productId={selectedProduct.id}
          productTitle={selectedProduct.title}
          locales={locales}
        />
      ) : (
        <s-section heading="Редактор переводов">
          <s-banner tone="info" heading="Выберите товар">
            <s-paragraph>
              Выберите товар из списка слева, чтобы редактировать его переводы на{" "}
              {editableLocalesCount > 0 ? `${editableLocalesCount} доступных языка(-ов)` : "доступные языки"}.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
