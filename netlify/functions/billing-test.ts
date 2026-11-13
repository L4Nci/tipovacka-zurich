import { handleBillingTestRequest, type BillingTestAction, type BillingTestRequest } from '../../server/lib/billingTestHttp.ts';

const actions = new Set(['checkout', 'status', 'portal', 'webhook', 'reconcile']);
export const handler = async (event: BillingTestRequest & { path?: string }) => {
  const action = event.path?.split('/').filter(Boolean).at(-1) ?? '';
  if (!actions.has(action)) return { statusCode: 404, headers: { 'cache-control': 'no-store' }, body: '{}' };
  return handleBillingTestRequest(action as BillingTestAction, event);
};
