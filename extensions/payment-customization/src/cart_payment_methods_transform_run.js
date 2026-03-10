// @ts-check

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunInput} CartPaymentMethodsTransformRunInput
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 * @typedef {import("../generated/api").Operation} Operation
 */

/**
 * @type {CartPaymentMethodsTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

const MIN_ITEMS_TO_SHOW_MANUAL_METHOD = 3;
const MIN_ITEMS_TO_RENAME_METHODS = 5;
const TARGET_MANUAL_METHOD_NAME = "tbi bank test";
const NON_RENAMEABLE_NAME_PARTS = [
  "shop pay",
  "apple pay",
  "google pay",
  "gift card",
];

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
  return value.trim().toLowerCase();
}

/**
 * @param {{name: string}} paymentMethod
 * @returns {boolean}
 */
function isTargetManualMethod(paymentMethod) {
  const normalizedName = normalizeName(paymentMethod.name);

  return (
    normalizedName === TARGET_MANUAL_METHOD_NAME ||
    normalizedName.includes(TARGET_MANUAL_METHOD_NAME)
  );
}

/**
 * @param {{name: string}} paymentMethod
 * @returns {boolean}
 */
function canRenamePaymentMethod(paymentMethod) {
  const normalizedName = normalizeName(paymentMethod.name);

  return !NON_RENAMEABLE_NAME_PARTS.some((part) =>
    normalizedName.includes(part)
  );
}

/**
 * @param {CartPaymentMethodsTransformRunInput} input
 * @returns {CartPaymentMethodsTransformRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  const totalQuantity = (input.cart?.lines ?? []).reduce(
    (sum, line) => sum + line.quantity,
    0
  );
  const paymentMethods = input.paymentMethods ?? [];

  /** @type {Operation[]} */
  const operations = [];

  const targetManualMethod = paymentMethods.find(isTargetManualMethod);

  if (totalQuantity < MIN_ITEMS_TO_SHOW_MANUAL_METHOD && targetManualMethod) {
    operations.push({
      paymentMethodHide: {
        paymentMethodId: targetManualMethod.id,
      },
    });
  }

  if (totalQuantity >= MIN_ITEMS_TO_RENAME_METHODS) {
    for (const paymentMethod of paymentMethods) {
      if (!canRenamePaymentMethod(paymentMethod)) {
        continue;
      }

      operations.push({
        paymentMethodRename: {
          paymentMethodId: paymentMethod.id,
          name: `[TEST ${totalQuantity} items] ${paymentMethod.name}`,
        },
      });
    }
  }

  if (operations.length === 0) {
    return NO_CHANGES;
  }

  return { operations };
};