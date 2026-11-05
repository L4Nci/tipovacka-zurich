import { handleFootballDataSyncRequest } from '../../server/lib/footballDataSync.ts';
export const handler = (event: Parameters<typeof handleFootballDataSyncRequest>[0]) => handleFootballDataSyncRequest(event);
