import { fireEvent, render } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import { Linking } from "react-native";

import NavigateButton, { buildNavigateUrl } from "../src/components/NavigateButton.tsx";

describe("NavigateButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds a Google Maps search URL from the address", () => {
    expect(buildNavigateUrl("1400 Riverside Dr")).toBe("https://www.google.com/maps/search/?api=1&query=1400%20Riverside%20Dr");
  });

  it("opens the built URL when pressed", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);

    const { getByTestId } = await render(<NavigateButton address="1400 Riverside Dr" />);
    await fireEvent.press(getByTestId("navigate-button"));

    expect(openURL).toHaveBeenCalledWith(buildNavigateUrl("1400 Riverside Dr"));
  });

  it("renders nothing when there is no address", async () => {
    const { queryByTestId } = await render(<NavigateButton address={null} />);
    expect(queryByTestId("navigate-button")).toBeNull();
  });

  it("reports a failure to open the URL via onError instead of throwing", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no maps app"));
    const onError = jest.fn();

    const { getByTestId } = await render(<NavigateButton address="1400 Riverside Dr" onError={onError} />);
    await fireEvent.press(getByTestId("navigate-button"));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
