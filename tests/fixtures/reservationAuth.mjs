// Test doubles for the existing auth and request-client helpers, never app code.
export const authState = {
  user: null,
  client: null,
  clientCalls: 0,
  error: null,
};

export async function getCurrentUser() {
  if (authState.error) throw authState.error;
  return authState.user;
}

export async function getSupabaseServerClient() {
  authState.clientCalls += 1;
  if (!authState.client) throw new Error("Missing simulated request client");
  return authState.client;
}
