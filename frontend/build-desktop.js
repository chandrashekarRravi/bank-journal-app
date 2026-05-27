const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, 'package.json');
const pkgBackupPath = path.join(__dirname, 'package.backup.json');

try {
  console.log('📦 Starting Desktop App Build Pipeline...');

  // 1. Compile the production static web bundle first
  console.log('🚀 Step 1: Compiling Expo Web bundle...');
  execSync('npm run build:web', { stdio: 'inherit' });

  // 1.5. Fix absolute paths in the built index.html for Electron file:// protocol compatibility
  console.log('🔧 Step 1.5: Patching dist/index.html absolute paths for file:// protocol...');
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    // Replace src="/_expo/ or href="/_expo/ with ./_expo/
    html = html.replace(/(href|src)="\/_expo\//g, '$1="./_expo/');
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('   Successfully patched index.html paths!');
  } else {
    console.warn('   Warning: dist/index.html not found!');
  }

  // 1.6. Patch asset paths in Javascript bundles for file:// protocol
  console.log('🔧 Step 1.6: Patching JS bundles for absolute /assets/ paths...');
  const jsDir = path.join(__dirname, 'dist', '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir)) {
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
      const filePath = path.join(jsDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('"/assets/')) {
        content = content.replace(/"\/assets\//g, '"./assets/');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`   Patched /assets/ in ${file}`);
      }
    }
  }

  // 2. Backup package.json
  console.log('💾 Step 2: Creating package.json backup...');
  fs.copyFileSync(pkgPath, pkgBackupPath);

  // 3. Modify package.json to set "main" to "electron.js" for packaging
  console.log('🔧 Step 3: Modifying package.json for Electron...');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.main = 'electron.js';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

  // 4. Run electron-builder to generate the Windows EXE installer
  console.log('🔨 Step 4: Invoking electron-builder...');
  execSync('npx electron-builder --win nsis', { stdio: 'inherit' });

  console.log('✅ Desktop App built successfully!');
} catch (err) {
  console.error('❌ Build failed:', err);
  process.exit(1);
} finally {
  // 5. Restore package.json from backup
  if (fs.existsSync(pkgBackupPath)) {
    console.log('🔄 Step 5: Restoring package.json from backup...');
    fs.copyFileSync(pkgBackupPath, pkgPath);
    fs.unlinkSync(pkgBackupPath);
  }
}
