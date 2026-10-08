const { expo } = require('./app.json');

// Web-only deployment prefix; native builds and root previews keep their defaults.
module.exports = () => {
  const baseUrl = (process.env.PAGES_BASE_PATH || '').replace(/\/+$/, '');
  return baseUrl ? { ...expo, experiments: { ...expo.experiments, baseUrl } } : expo;
};
