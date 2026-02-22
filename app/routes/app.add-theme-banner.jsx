import { useState } from "react";
import { Form, useLoaderData, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { getBannerSettings, saveBannerSettings } from "../utils/metafields";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const settings = await getBannerSettings(admin);
  return settings;
};

export const action = async ({ request }) => {

  const response = await fetch("https://jsonplaceholder.typicode.com/todos/1");
  const data = await response.json();
  console.log(data, 'DATA');

 
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const enabled = formData.get("enabled") === "true";
  const text = formData.get("text") || "привет я баннер";
  const color = formData.get("color") || "#ffffff";

  try {
    await saveBannerSettings(admin, { enabled, text, color });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function AddThemeBanner() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [enabled, setEnabled] = useState(loaderData.enabled ?? false);
  const [text, setText] = useState(loaderData.text ?? "привет я баннер");
  const [color, setColor] = useState(loaderData.color ?? "#ffffff");

  const isLoading = false

  return (
    <s-page heading="Custom Banner">
      <s-section heading="Предпросмотр">
        {enabled ? (
          <div
            style={{
              backgroundColor: color,
              padding: "16px",
              textAlign: "center",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "16px",
              border: "1px solid #ddd",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            {text}
          </div>
        ) : (
          <s-paragraph>Баннер отключён — включите его ниже чтобы увидеть предпросмотр.</s-paragraph>
        )}
      </s-section>

      <s-section heading="Настройки">
        {actionData?.success && (
          <s-banner tone="success" title="Готово">
            <s-paragraph>Настройки успешно сохранены!</s-paragraph>
          </s-banner>
        )}
        {actionData?.error && (
          <s-banner tone="critical" title="Ошибка">
            <s-paragraph>{actionData.error}</s-paragraph>
          </s-banner>
        )}

        <Form method="post">
          {/* Все значения через hidden inputs — web-компоненты не участвуют в нативной отправке формы */}
          <input type="hidden" name="enabled" value={String(enabled)} />
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="text" value={text} />

          <s-form-layout>
            <s-checkbox
              label="Включить баннер"
              checked={enabled || undefined}
              onChange={(e) => setEnabled(e.target.checked !== undefined ? e.target.checked : !!e.detail?.checked)}
            />

            <s-text-field
              label="Текст баннера"
              value={text}
              onInput={(e) => setText(e.target.value)}
              autoComplete="off"
            />

            <s-form-layout-item label="Цвет фона баннера">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: "60px", height: "36px", cursor: "pointer", border: "none", borderRadius: "4px" }}
              />
            </s-form-layout-item>

            <s-button
            type="submit"
          
            {...(isLoading ? { loading: true } : {})}
          >
            {isSaving ? "Сохранение..." : "Сохранить настройки"}
          </s-button>
          </s-form-layout>
        </Form>
      </s-section>
    </s-page>
  );
}