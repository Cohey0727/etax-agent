// Metro のモノレポ設定。
// ワークスペースルートを監視対象に含め、依存解決はこのパッケージと
// ルートの node_modules を見る。これにより @etax/shared のような
// ワークスペース内のパッケージをそのまま import できる。
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
