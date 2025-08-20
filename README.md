# geo-mmd GeoLite2 数据库自动发布

本项目用于每周自动下载 MaxMind GeoLite2 数据库（ASN、City、Country），并以 npm 包的形式发布到 @geo-mmd 组织下，版本号为发布日期。

## 自动化流程
- 使用 GitHub Actions，每周日自动触发，也支持手动触发。
- 下载 GeoLite2-ASN、GeoLite2-City、GeoLite2-Country 数据库。
- 以 @geo-mmd/GeoLite2-ASN、@geo-mmd/GeoLite2-City、@geo-mmd/GeoLite2-Country 形式发布到 npm，版本号为日期（如 2025.08.20）。
- 自动在 GitHub 发布 Release。

## 使用方法
1. 配置 GitHub Secrets：
   - `NPM_TOKEN`：npm 发布令牌，需有 @geo-mmd 组织发布权限。
   - `MAXMIND_ACCOUNT_ID`、`MAXMIND_LICENSE_KEY`：MaxMind 账户信息。
2. 可在 Actions 页面手动触发，或等待每周自动执行。

## 相关文件
- `.github/workflows/publish-geolite.yml`：GitHub Actions 工作流配置。
- `.github/scripts/publish-geolite.js`：自动下载、打包并发布 npm 包的脚本。

## 免责声明
GeoLite2 数据库版权归 MaxMind 所有，仅供学习和研究使用。
