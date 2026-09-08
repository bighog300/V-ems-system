import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import LoginScreen from "../src/screens/LoginScreen.tsx";

describe("LoginScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("keeps sign-in disabled until every field is filled", async () => {
    const { getByTestId } = await render(<LoginScreen onSignedIn={jest.fn()} />);

    expect(getByTestId("submit-sign-in").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test");
    await fireEvent.changeText(getByTestId("input-auth-token"), "token-123");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    expect(getByTestId("submit-sign-in").props.accessibilityState?.disabled).toBe(false);
  });

  it("calls onSignedIn with a trimmed session once the token verifies", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as unknown as typeof fetch;
    const onSignedIn = jest.fn();

    const { getByTestId } = await render(<LoginScreen onSignedIn={onSignedIn} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test/");
    await fireEvent.changeText(getByTestId("input-auth-token"), " token-123 ");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    await fireEvent.press(getByTestId("submit-sign-in"));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(onSignedIn).toHaveBeenCalledWith({
      apiBaseUrl: "https://api.example.test",
      authToken: "token-123",
      actorId: "crew-1",
      actorRole: "field_crew",
      deviceId: expect.any(String)
    });
  });

  it("shows an error and does not sign in when the token is rejected", async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 401 })
    ) as unknown as typeof fetch;
    const onSignedIn = jest.fn();

    const { getByTestId } = await render(<LoginScreen onSignedIn={onSignedIn} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test");
    await fireEvent.changeText(getByTestId("input-auth-token"), "bad-token");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    await fireEvent.press(getByTestId("submit-sign-in"));

    await waitFor(() => expect(getByTestId("login-error")).toBeTruthy());
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
