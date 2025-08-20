// 自动下载 GeoLite2 数据库并发布到 npm
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const { execSync } = require('child_process');

const EDITIONS = [
  'GeoLite2-ASN',
  'GeoLite2-City',
  'GeoLite2-Country',
];
const NPM_ORG = '@geo-mmd';

// npm 包名映射 (npm 包名必须是小写)
const NPM_PACKAGE_NAMES = {
  'GeoLite2-ASN': 'geolite2-asn',
  'GeoLite2-City': 'geolite2-city',
  'GeoLite2-Country': 'geolite2-country',
};
const TMP_DIR = path.join(__dirname, '../../geolite2_tmp');
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

const ACCOUNT_ID = process.env.MAXMIND_ACCOUNT_ID;
const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const NPM_TOKEN = process.env.NPM_TOKEN;

if (!ACCOUNT_ID || !LICENSE_KEY || !NPM_TOKEN) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

async function downloadAndExtract(edition) {
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${LICENSE_KEY}&suffix=tar.gz`;
  const outPath = path.join(TMP_DIR, `${edition}.tar.gz`);
  const extractPath = path.join(TMP_DIR, edition);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const writer = fs.createWriteStream(outPath);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  // 解压
  fs.mkdirSync(extractPath, { recursive: true });
  await tar.x({ file: outPath, cwd: extractPath });
  // 找到 mmdb 文件
  const files = fs.readdirSync(extractPath);
  let mmdbPath = null;
  for (const dir of files) {
    const fullDir = path.join(extractPath, dir);
    if (fs.statSync(fullDir).isDirectory()) {
      const mmdbs = fs.readdirSync(fullDir).filter(f => f.endsWith('.mmdb'));
      if (mmdbs.length > 0) {
        mmdbPath = path.join(fullDir, mmdbs[0]);
        break;
      }
    }
  }
  if (!mmdbPath) throw new Error('MMDB not found');
  return mmdbPath;
}

function createNpmPackage(edition, mmdbPath) {
  const pkgDir = path.join(TMP_DIR, `${edition}-npm`);
  fs.rmSync(pkgDir, { recursive: true, force: true });
  fs.mkdirSync(pkgDir, { recursive: true });
  // 写入 package.json
  const packageName = NPM_PACKAGE_NAMES[edition];
  const pkgJson = {
    name: `${NPM_ORG}/${packageName}`,
    version: TODAY,
    description: `MaxMind ${edition} database, updated weekly`,
    main: path.basename(mmdbPath),
    files: [path.basename(mmdbPath)],
    keywords: ['maxmind', 'geolite2', 'geoip', packageName],
    license: 'CC BY-SA 4.0',
    repository: 'https://github.com/lihongjie0209/geo-mmd',
  };
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
  // 拷贝 mmdb
  fs.copyFileSync(mmdbPath, path.join(pkgDir, path.basename(mmdbPath)));
  // 写入 .npmrc
  fs.writeFileSync(path.join(pkgDir, '.npmrc'), `//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n`);
  return pkgDir;
}

function publishNpm(pkgDir) {
  execSync('npm publish --access public', { cwd: pkgDir, stdio: 'inherit' });
}

(async () => {
  for (const edition of EDITIONS) {
    console.log(`Processing ${edition}...`);
    const mmdbPath = await downloadAndExtract(edition);
    const pkgDir = createNpmPackage(edition, mmdbPath);
    publishNpm(pkgDir);
  }
})();
