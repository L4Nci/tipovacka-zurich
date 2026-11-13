import { runScheduledBillingTestRecovery } from '../../server/lib/billingTestHttp.ts';

// Netlify scheduled functions aren't callable by public URL. The HTTP recovery
// route is separate and always requires its dedicated bearer secret.
export const handler = async () => {
  try { await runScheduledBillingTestRecovery(); return { statusCode: 200 }; }
  catch { return { statusCode: 503 }; }
};
