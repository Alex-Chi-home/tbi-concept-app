import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useAppMetafields} from '@shopify/ui-extensions/checkout/preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
    const metafields = useAppMetafields();
  const text_metafield = metafields.find( (m) => m.metafield.key === 'text' )?.metafield?.value;
  console.log(text_metafield, 'text metafield')
  return (
    <s-stack gap="base">
      <s-paragraph>
        Shop name: {shopify.shop.name}
        Text metafield: {text_metafield}
      </s-paragraph>
      <s-paragraph>
        cost:{' '}
        {shopify.cost.totalAmount.value.amount}
      </s-paragraph>
    </s-stack>
  );
}