const NetInfo = {
  addEventListener: jest.fn(() => () => {}),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  refresh: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  configure: jest.fn()
};

export default NetInfo;
