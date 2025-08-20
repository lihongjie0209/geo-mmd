// 自动下载 GeoLite2 数据库并发布到 npm 和 Cloudflare R2
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
// 使用符合 semver 规范的版本号格式
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();
const hour = now.getHours();
const minute = now.getMinutes();
const second = now.getSeconds();
// 格式: YYYY.M.D-HHMMSS (符合 semver 规范)
const TODAY = `${year}.${month}.${day}-${hour.toString().padStart(2, '0')}${minute.toString().padStart(2, '0')}${second.toString().padStart(2, '0')}`;

const ACCOUNT_ID = process.env.MAXMIND_ACCOUNT_ID;
const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const NPM_TOKEN = process.env.NPM_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !LICENSE_KEY || !NPM_TOKEN) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

// Cloudflare R2 配置
const R2_BUCKET = 'geo-mmd';
const hasR2Config = CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN;

if (hasR2Config) {
  console.log('✅ Cloudflare R2 credentials found');
} else {
  console.log('⚠️  Cloudflare R2 credentials not found, skipping R2 upload');
}

async function downloadAndExtract(edition) {
  // 使用新的下载 URL 格式和基本认证
  const url = `https://download.maxmind.com/geoip/databases/${edition}/download?suffix=tar.gz`;
  const outPath = path.join(TMP_DIR, `${edition}.tar.gz`);
  const extractPath = path.join(TMP_DIR, edition);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  
  const writer = fs.createWriteStream(outPath);
  const auth = Buffer.from(`${ACCOUNT_ID}:${LICENSE_KEY}`).toString('base64');
  
  console.log(`Downloading ${edition} from ${url}...`);
  
  let response;
  try {
    response = await axios({ 
      url, 
      method: 'GET', 
      responseType: 'stream',
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'geo-mmd-downloader/1.0'
      },
      timeout: 60000, // 60秒超时
      maxRedirects: 5
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Content-Length: ${response.headers['content-length']}`);
    
  } catch (error) {
    console.error(`Download failed for ${edition}:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Headers:`, error.response.headers);
      console.error(`Data:`, error.response.data);
    }
    throw new Error(`Failed to download ${edition}: ${error.message}`);
  }
  
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  
  console.log(`Downloaded ${edition} successfully`);
  
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

async function uploadToR2(mmdbPath, edition) {
  if (!hasR2Config) {
    console.log('⚠️  Skipping R2 upload (credentials not configured)');
    return;
  }

  try {
    const fileName = path.basename(mmdbPath);
    const r2Key = `${edition}/${TODAY}/${fileName}`;
    const latestKey = `${edition}/latest/${fileName}`;
    
    const fileBuffer = fs.readFileSync(mmdbPath);
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${r2Key}`;
    const latestUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${latestKey}`;
    
    // 上传带版本的文件
    console.log(`Uploading to R2: ${r2Key}`);
    const response1 = await axios.put(url, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 300000, // 5分钟超时
    });
    
    if (response1.status === 200) {
      console.log(`✅ Successfully uploaded ${r2Key} to R2`);
    } else {
      throw new Error(`Upload failed with status ${response1.status}`);
    }
    
    // 上传到 latest 目录（覆盖旧版本）
    console.log(`Uploading to R2: ${latestKey}`);
    const response2 = await axios.put(latestUrl, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 300000, // 5分钟超时
    });
    
    if (response2.status === 200) {
      console.log(`✅ Successfully uploaded ${latestKey} to R2`);
    } else {
      throw new Error(`Upload failed with status ${response2.status}`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to upload ${edition} to R2:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
    }
    // 不抛出错误，让进程继续执行其他数据库的处理
  }
}

(async () => {
  console.log(`Starting GeoLite2 download and publish process at ${new Date().toISOString()}`);
  console.log(`Version: ${TODAY}`);
  
  for (const edition of EDITIONS) {
    try {
      console.log(`\n=== Processing ${edition} ===`);
      const mmdbPath = await downloadAndExtract(edition);
      
      // 发布到 npm
      const pkgDir = createNpmPackage(edition, mmdbPath);
      publishNpm(pkgDir);
      console.log(`✅ Successfully published ${NPM_PACKAGE_NAMES[edition]} to npm`);
      
      // 上传到 Cloudflare R2
      await uploadToR2(mmdbPath, edition);
      
    } catch (error) {
      console.error(`❌ Failed to process ${edition}:`, error.message);
      // 继续处理其他数据库，不要因为一个失败就停止
      continue;
    }
  }
  
  console.log(`\n🎉 Process completed at ${new Date().toISOString()}`);
})().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
