import request from "supertest";

export async function loginAs(email: string, password: string): Promise<string> {
  const { default: app } = await import("../../src/app");
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  if (response.status !== 200 || !response.body?.token) {
    throw new Error(`Failed to login as ${email}: ${response.status}`);
  }

  return response.body.token as string;
}

export function withBearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
