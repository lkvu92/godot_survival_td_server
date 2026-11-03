// Exact, whitelisted financial data only. No buyer address, token or receipt.
function money(value) {
  if (!value || !/^[A-Z]{3}$/.test(value.currencyCode || '')) throw Error('INVALID_MONEY');
  const units = String(value.units ?? '0'), nanos = value.nanos ?? 0;
  if (!/^\d{1,18}$/.test(units) || !Number.isInteger(nanos) || nanos < 0 || nanos > 999999999) throw Error('INVALID_MONEY');
  const atomic = BigInt(units) * 1000000000n + BigInt(nanos);
  return {currency: value.currencyCode, atomic, amount: decimal(atomic)};
}
function decimal(atomic) { return String(atomic / 1000000000n) + '.' + String(atomic % 1000000000n).padStart(9, '0'); }
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw Error('INVALID_TIME');
  return value;
}
export function normalizeGoogleOrder(order, expectedOrderId, expectedProductId) {
  if (!order || order.orderId !== expectedOrderId || !Array.isArray(order.lineItems) || !order.lineItems.some(i => i.productId === expectedProductId)) throw Error('ORDER_IDENTITY_MISMATCH');
  const paid = money(order.total), tax = order.tax ? money(order.tax) : null;
  if (tax && tax.currency !== paid.currency) throw Error('CURRENCY_MISMATCH');
  const events = [], history = order.orderHistory || {};
  let refunded = 0n;
  for (const event of history.partialRefundEvents || []) {
    const amount = money(event.refundDetails?.total);
    if (amount.currency !== paid.currency) throw Error('CURRENCY_MISMATCH');
    const state = String(event.state || 'STATE_UNSPECIFIED');
    if (state === 'PROCESSED_SUCCESSFULLY') refunded += amount.atomic;
    events.push({type:'partial_refund',time:timestamp(event.processTime || event.createTime),state,amount:amount.amount,currency:amount.currency});
  }
  if (history.refundEvent) {
    const event = history.refundEvent, amount = money(event.refundDetails?.total);
    if (amount.currency !== paid.currency) throw Error('CURRENCY_MISMATCH');
    // Full refund replaces cumulative partial total, never adds the original twice.
    refunded = paid.atomic;
    events.push({type:'full_refund',time:timestamp(event.eventTime),state:'PROCESSED_SUCCESSFULLY',amount:amount.amount,currency:amount.currency});
  }
  if (refunded > paid.atomic) throw Error('REFUND_EXCEEDS_ORIGINAL');
  events.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (events.length > 100) throw Error('REFUND_HISTORY_REVIEW_REQUIRED');
  return {schema_version:1,source:'google_orders_api',google_order_id:expectedOrderId,currency:paid.currency,paid_amount:paid.amount,tax_amount:tax?.amount ?? null,refunded_amount:decimal(refunded),provider_state:String(order.state || 'STATE_UNSPECIFIED'),provider_event_at:timestamp(order.lastEventTime || order.createTime),events};
}

export async function syncFinancialBatch({publisher,packageName,bridge}) {
  const batch = await bridge({action:'batch'});
  if (!batch.success || !batch.policy?.enabled) return {enabled:false,synced:0,failed:0,retry_seconds:batch.policy?.retry_seconds || 300};
  let synced=0,failed=0;
  for (const item of batch.orders || []) {
    try {
      if (!packageName) throw Error('PACKAGE_REQUIRED');
      const response = await publisher.orders.get({packageName,orderId:item.google_order_id});
      const financial = normalizeGoogleOrder(response.data,item.google_order_id,item.store_product_id);
      const result = await bridge({action:'record',purchase_order_id:item.purchase_order_id,financial});
      if (!result.success) throw Error('RECORD_REJECTED');
      synced++;
    } catch (_error) {
      failed++;
      // Generic failure class, never log token or provider payload.
      await bridge({action:'error',purchase_order_id:item.purchase_order_id}).catch(()=>{});
    }
  }
  return {enabled:true,synced,failed,retry_seconds:batch.policy.retry_seconds};
}
