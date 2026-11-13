import express from 'express';
import { handleBillingTestRequest, handleBillingLiveRequest, type BillingTestAction } from './billingTestHttp.ts';

/** Must be mounted BEFORE the application's global express.json middleware. */
export function registerBillingTestRoutes(app: express.Express, handler: (
  action: BillingTestAction, request: Parameters<typeof handleBillingTestRequest>[1],
) => Promise<{ statusCode: number; headers: Record<string, string>; body: string }> = handleBillingTestRequest) {
  for (const action of ['checkout', 'status', 'portal', 'webhook', 'reconcile'] as const) {
    app.all(`/api/billing/test/${action}`, express.raw({ type: () => true, limit: '128kb', inflate: false }), async (req, res) => {
      const result = await handler(action as BillingTestAction, { httpMethod: req.method,
        headers: Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value])),
        body: req.body });
      res.set(result.headers).status(result.statusCode).send(result.body);
    });
  }
}

export function registerBillingLiveRoutes(app: express.Express) {
  for (const action of ['checkout', 'status', 'portal', 'webhook', 'reconcile', 'offer'] as const) {
    app.all(`/api/billing/live/${action}`, express.raw({ type: () => true, limit: '128kb', inflate: false }), async (req, res) => {
      const result = await handleBillingLiveRequest(action, { httpMethod: req.method,
        headers: Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value])),
        body: req.body });
      res.set(result.headers).status(result.statusCode).send(result.body);
    });
  }
}
