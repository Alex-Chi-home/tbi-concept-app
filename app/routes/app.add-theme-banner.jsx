import { Form, useLoaderData, useSubmit, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { getBannerSettings, saveBannerSettings } from "../utils/metafields";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const settings = await getBannerSettings(admin);
  return settings;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const enabled = formData.get("enabled") === "on";
  const text = formData.get("text") || "привет я баннер";
  const color = formData.get("color") || "#ffffff";

  try {
    await saveBannerSettings(admin, { enabled, text, color });
    return { success: true };
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};

export default function AddThemeBanner() {
  const { enabled, text, color } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    submit(formData, { method: "post" });
  };

  return (
    <s-page title="Add Theme Banner">
      <s-card>
        <s-stack gap="400">
          <s-heading level="2">Настройки баннера на странице продукта</s-heading>

          {actionData?.success && (
            <s-text tone="success">Настройки успешно сохранены!</s-text>
          )}
          {actionData?.error && (
            <s-text tone="critical">Ошибка: {actionData.error}</s-text>
          )}

          <Form onSubmit={handleSubmit}>
            <s-form-layout>
              <s-switch
                label="Включить баннер"
                name="enabled"
                checked={enabled}
              />

              <s-text-field
                label="Текст баннера"
                name="text"
                value={text}
                onInput={(e) => e.target.value} // для controlled — пока не обязательно
              />

              <s-color-picker
                label="Цвет баннера"
                value={color}
                onChange={(e) => {
                  // Можно обновить состояние если нужно controlled
                }}
              />

              <s-button type="submit" primary>
                Сохранить настройки
              </s-button>
            </s-form-layout>
          </Form>
        </s-stack>
      </s-card>
    </s-page>
  );
}