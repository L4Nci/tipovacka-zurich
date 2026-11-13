import { runScheduledBillingLiveRecovery } from '../../server/lib/billingTestHttp.ts';
export const handler = async () => {
  try { await runScheduledBillingLiveRecovery(); return { statusCode: 200 }; }
  catch { return { statusCode: 503 }; }
};
