module.exports = function configureBabel(api) {
  const isTest = api.env("test");

  return {
    presets: ["babel-preset-expo"],
    plugins: isTest ? ["dynamic-import-node"] : [],
  };
};
