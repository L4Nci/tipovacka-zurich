type NetlifyEvent = {
  path?: string;
  rawUrl?: string;
};

export const handler = async (_event: NetlifyEvent) => ({
  statusCode: 404,
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({
    success: false,
    error: "API route not found"
  })
});
