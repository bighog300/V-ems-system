import { fireEvent, render } from "@testing-library/react-native";
import { jest, describe, it, expect } from "@jest/globals";

import LocationPermissionNotice from "../src/components/LocationPermissionNotice.tsx";

describe("LocationPermissionNotice", () => {
  it("shows the rationale and an Enable button when permission is undetermined", async () => {
    const { getByTestId, queryByTestId } = await render(<LocationPermissionNotice status="undetermined" onEnable={jest.fn()} />);
    expect(getByTestId("location-permission-notice")).toBeTruthy();
    expect(getByTestId("enable-location")).toBeTruthy();
    expect(queryByTestId("location-permission-granted")).toBeNull();
  });

  it("shows the rationale and an Enable button when permission was denied", async () => {
    const { getByTestId } = await render(<LocationPermissionNotice status="denied" onEnable={jest.fn()} />);
    expect(getByTestId("location-permission-notice")).toBeTruthy();
    expect(getByTestId("enable-location")).toBeTruthy();
  });

  it("shows a confirmation, not the rationale, once granted", async () => {
    const { getByTestId, queryByTestId } = await render(<LocationPermissionNotice status="granted" onEnable={jest.fn()} />);
    expect(getByTestId("location-permission-granted")).toBeTruthy();
    expect(queryByTestId("location-permission-notice")).toBeNull();
  });

  it("calls onEnable when the button is pressed", async () => {
    const onEnable = jest.fn();
    const { getByTestId } = await render(<LocationPermissionNotice status="undetermined" onEnable={onEnable} />);
    await fireEvent.press(getByTestId("enable-location"));
    expect(onEnable).toHaveBeenCalledTimes(1);
  });
});
