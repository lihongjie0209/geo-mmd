# geo-mmd GeoLite2 数据库自动发布

本项目用于每周自动下载 MaxMind GeoLite2 数据库（ASN、City、Country），并以 npm 包的形式发布到 @geo-mmd 组织下，同时上传到 Cloudflare R2 存储，版本号为发布日期。

## 自动化流程
- 使用 GitHub Actions，每周日自动触发，也支持手动触发。
- 下载 GeoLite2-ASN、GeoLite2-City、GeoLite2-Country 数据库。
- 以 @geo-mmd/geolite2-asn、@geo-mmd/geolite2-city、@geo-mmd/geolite2-country 形式发布到 npm，版本号为日期（如 2025.08.20）。
- 同时上传 .mmdb 文件到 Cloudflare R2 存储桶 `geo-mmd`，支持版本化存储和最新版本访问。

## R2 存储结构
```
geo-mmd/
├── GeoLite2-ASN/
│   ├── 2025.8.20-120000/
│   │   └── GeoLite2-ASN.mmdb
│   └── latest/
│       └── GeoLite2-ASN.mmdb
├── GeoLite2-City/
│   ├── 2025.8.20-120000/
│   │   └── GeoLite2-City.mmdb
│   └── latest/
│       └── GeoLite2-City.mmdb
└── GeoLite2-Country/
    ├── 2025.8.20-120000/
    │   └── GeoLite2-Country.mmdb
    └── latest/
        └── GeoLite2-Country.mmdb
```

## 使用方法
1. 配置 GitHub Secrets：
   - `NPM_TOKEN`：npm 发布令牌，需有 @geo-mmd 组织发布权限。
   - `MAXMIND_ACCOUNT_ID`、`MAXMIND_LICENSE_KEY`：MaxMind 账户信息。
   - `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`：Cloudflare R2 上传所需凭证。
2. 可在 Actions 页面手动触发，或等待每周自动执行。

## 相关文件
- `.github/workflows/publish-geolite.yml`：GitHub Actions 工作流配置。
- `.github/scripts/publish-geolite.js`：自动下载、打包并发布 npm 包的脚本。

## 免责声明
GeoLite2 数据库版权归 MaxMind 所有，仅供学习和研究使用。
